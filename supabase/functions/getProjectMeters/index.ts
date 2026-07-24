// Replaces base44/functions/getProjectMeters/entry.ts. The heaviest-traffic
// function (backs the Meter Data table, DMA/network filtering, map/export/
// estimation "full" fetches). Point-in-polygon logic ported verbatim (plain
// math) — see the accepted gap noted in memory: DMA membership here is
// still JS-side point-in-polygon against polygon_json, not PostGIS, matching
// the project's existing behavior rather than expanding scope.
import { admin, getCallerUser, hasProjectAccess, json, CORS_HEADERS } from '../_shared/authz.ts';

const PAGE = 10000; // matches this project's PostgREST max_rows

function pointInPolygon(lat: number, lng: number, polygon: [number, number][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lati, lngi] = polygon[i];
    const [latj, lngj] = polygon[j];
    const intersect =
      lati > lat !== latj > lat && lng < ((lngj - lngi) * (lat - lati)) / (latj - lati) + lngi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function getPoly(dma: any): [number, number][] | null {
  const raw = dma.polygon_json ?? dma.polygon;
  const poly = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Array.isArray(poly) && poly.length >= 3 ? poly : null;
}

function escapeLike(s: string) {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

async function fetchAllMeters(projectId: string, extra?: (q: any) => any) {
  const all: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    let q = admin.from('meter').select('*').eq('project_id', projectId).order('id').range(from, from + PAGE - 1);
    if (extra) q = extra(q);
    const { data: batch } = await q;
    all.push(...(batch || []));
    hasMore = (batch?.length || 0) === PAGE;
    from += PAGE;
  }
  return all;
}

async function addReadingCounts(meters: any[]) {
  if (meters.length === 0) return meters;
  const { data } = await admin.rpc('get_meter_reading_counts', { meter_ids: meters.map((m) => m.id) });
  const counts: Record<string, number> = {};
  for (const row of data || []) counts[row.meter_id] = Number(row.reading_count);
  return meters.map((m) => ({ ...m, reading_count: counts[m.id] || 0 }));
}

function applySearch(query: any, search: string) {
  const esc = escapeLike(search);
  return query.or(`uid.ilike.%${esc}%,payer_name.ilike.%${esc}%,address.ilike.%${esc}%,provider.ilike.%${esc}%`);
}

function applyMeterType(query: any, meterType: string | undefined, insertionLayerIds: string[] | undefined) {
  if (meterType === 'main') {
    query = query.eq('is_main', true);
    if (insertionLayerIds?.length) query = query.not('layer_id', 'in', `(${insertionLayerIds.join(',')})`);
  } else if (meterType === 'main_ins') {
    if (insertionLayerIds?.length) query = query.in('layer_id', insertionLayerIds);
  } else if (meterType === 'sub') {
    query = query.eq('is_main', false);
  }
  return query;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const body = await req.json();
    const { project_id, page, pageSize, search, meterType, sortKey, sortDir, countsOnly, dmaFilter, insertionLayerIds } = body;
    if (!project_id) return json({ error: 'project_id is required' }, 400);

    const user = await getCallerUser(req);
    if (!(await hasProjectAccess(user, project_id))) return json({ error: 'Unauthorized' }, 403);

    // ── DMA filter mode ──
    if (dmaFilter) {
      const dmaPolys: { poly: [number, number][] | null; main_meter_id: string | null }[] = [];
      if (dmaFilter.type === 'dma' && dmaFilter.dmaId) {
        const { data: d } = await admin.from('dma').select('*').eq('project_id', project_id).eq('id', dmaFilter.dmaId).maybeSingle();
        if (d) dmaPolys.push({ poly: getPoly(d), main_meter_id: d.main_meter_id });
      } else if (dmaFilter.type === 'orphans') {
        const { data: allDmas } = await admin.from('dma').select('*').eq('project_id', project_id);
        for (const d of allDmas || []) dmaPolys.push({ poly: getPoly(d), main_meter_id: d.main_meter_id });
      }

      let allMeters = await fetchAllMeters(project_id, (q) => applyMeterType(q, meterType, insertionLayerIds));
      if (meterType === 'main_ins' && !insertionLayerIds?.length) {
        return json({ meters: [], hasMore: false, total: 0, mainCount: 0, mainInsCount: 0, subCount: 0, unlocatedCount: 0 });
      }

      let filtered: any[];
      if (dmaFilter.type === 'dma') {
        const dma = dmaPolys[0];
        filtered = !dma
          ? []
          : allMeters.filter((m) => {
              if (dma.main_meter_id && dma.main_meter_id === m.id) return true;
              if (dma.poly && m.latitude != null && m.longitude != null) return pointInPolygon(m.latitude, m.longitude, dma.poly);
              return false;
            });
      } else {
        filtered = allMeters.filter((m) => {
          for (const dma of dmaPolys) {
            if (dma.main_meter_id && dma.main_meter_id === m.id) return false;
            if (dma.poly && m.latitude != null && m.longitude != null && pointInPolygon(m.latitude, m.longitude, dma.poly)) return false;
          }
          return true;
        });
      }

      if (search) {
        const lower = search.toLowerCase();
        filtered = filtered.filter(
          (m) =>
            (m.uid && m.uid.toLowerCase().includes(lower)) ||
            (m.payer_name && m.payer_name.toLowerCase().includes(lower)) ||
            (m.address && m.address.toLowerCase().includes(lower)) ||
            (m.provider && m.provider.toLowerCase().includes(lower))
        );
      }

      if (sortKey) {
        const sortMap: Record<string, string> = { uid: 'uid', payer_name: 'payer_name', address: 'address', type: 'is_main', status: 'is_active' };
        const field = sortMap[sortKey];
        if (field) {
          filtered.sort((a, b) => {
            const av = a[field], bv = b[field];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'boolean') return av === bv ? 0 : av ? 1 : -1;
            return String(av).localeCompare(String(bv));
          });
          if (sortDir === 'desc') filtered.reverse();
        }
      } else {
        const isIns = (m: any) => insertionLayerIds?.length && insertionLayerIds.includes(m.layer_id);
        const priority = (m: any) => (isIns(m) ? 1 : m.is_main ? 0 : 2);
        filtered.sort((a, b) => priority(a) - priority(b));
      }

      const total = filtered.length;
      const mainCount = filtered.filter((m) => m.is_main && !(insertionLayerIds?.length && insertionLayerIds.includes(m.layer_id))).length;
      const mainInsCount = filtered.filter((m) => insertionLayerIds?.length && insertionLayerIds.includes(m.layer_id)).length;
      const unlocatedCount = filtered.filter((m) => m.latitude == null || m.longitude == null).length;

      if (countsOnly) {
        return json({ total, mainCount, mainInsCount, subCount: total - mainCount - mainInsCount, unlocatedCount });
      }

      const p = page || 1;
      const ps = pageSize || 500;
      const start = (p - 1) * ps;
      const paged = filtered.slice(start, start + ps);
      const hasMorePages = start + ps < total;
      const pagedWithCounts = await addReadingCounts(paged);
      return json({ meters: pagedWithCounts, hasMore: hasMorePages, page: p, pageSize: ps });
    }

    // ── countsOnly mode ──
    if (countsOnly) {
      let q = admin.from('meter').select('*').eq('project_id', project_id);
      if (search) q = applySearch(q, search);

      const { data: allDmas } = await admin.from('dma').select('*').eq('project_id', project_id);
      const dmaPolys = (allDmas || []).map(getPoly).filter((p): p is [number, number][] => !!p);

      const allMeters = await fetchAllMeters(project_id, (qq) => (search ? applySearch(qq, search) : qq));
      let total = 0, mainCount = 0, mainInsCount = 0, unlocatedCount = 0, assignedCount = 0;
      total = allMeters.length;
      mainCount = allMeters.filter((m) => m.is_main && !(insertionLayerIds?.length && insertionLayerIds.includes(m.layer_id))).length;
      mainInsCount = allMeters.filter((m) => insertionLayerIds?.length && insertionLayerIds.includes(m.layer_id)).length;
      unlocatedCount = allMeters.filter((m) => m.latitude == null || m.longitude == null).length;
      for (const m of allMeters) {
        if (m.is_main) continue;
        if (m.latitude == null || m.longitude == null) continue;
        if (dmaPolys.length === 0) continue;
        for (const poly of dmaPolys) {
          if (pointInPolygon(m.latitude, m.longitude, poly)) {
            assignedCount++;
            break;
          }
        }
      }
      return json({
        total,
        mainCount,
        mainInsCount,
        subCount: total - mainCount - mainInsCount,
        unlocatedCount,
        assignedCount,
        dmaCount: (allDmas || []).length,
      });
    }

    // ── Paginated mode ──
    if (page && pageSize) {
      if (meterType === 'main_ins' && !insertionLayerIds?.length) {
        return json({ meters: [], hasMore: false, page, pageSize });
      }

      // Default grouped sort (no explicit sortKey/meterType): Mains (non-ins) -> Mains (Ins) -> Sub
      if (!sortKey && !meterType) {
        const skipCount = (page - 1) * pageSize;
        const groups: Array<(q: any) => any> = [
          (q) => {
            let qq = q.eq('is_main', true);
            if (insertionLayerIds?.length) qq = qq.not('layer_id', 'in', `(${insertionLayerIds.join(',')})`);
            return qq;
          },
          ...(insertionLayerIds?.length ? [(q: any) => q.in('layer_id', insertionLayerIds)] : []),
          (q: any) => q.eq('is_main', false),
        ];

        let remainingSkip = skipCount;
        let remainingLimit = pageSize;
        const resultMeters: any[] = [];

        for (const applyGroup of groups) {
          if (remainingLimit <= 0) break;
          const fetchCount = remainingSkip + remainingLimit;
          let gq = admin.from('meter').select('*').eq('project_id', project_id).order('id').limit(fetchCount);
          if (search) gq = applySearch(gq, search);
          gq = applyGroup(gq);
          const { data: groupMeters } = await gq;
          const groupCount = groupMeters?.length || 0;
          if (remainingSkip >= groupCount) {
            remainingSkip -= groupCount;
            continue;
          }
          const start = remainingSkip;
          const take = Math.min(remainingLimit, groupCount - start);
          resultMeters.push(...(groupMeters || []).slice(start, start + take));
          remainingSkip = 0;
          remainingLimit -= take;
        }

        const hasMore = remainingLimit <= 0;
        const metersWithCounts = await addReadingCounts(resultMeters);
        return json({ meters: metersWithCounts, hasMore, page, pageSize });
      }

      let sortCol = 'id';
      if (sortKey) {
        const sortMap: Record<string, string> = { uid: 'uid', payer_name: 'payer_name', address: 'address', type: 'is_main', status: 'is_active' };
        sortCol = sortMap[sortKey] || 'id';
      }

      const skip = (page - 1) * pageSize;
      let q = admin.from('meter').select('*').eq('project_id', project_id);
      q = applyMeterType(q, meterType, insertionLayerIds);
      if (search) q = applySearch(q, search);
      q = q.order(sortCol, { ascending: sortDir !== 'desc' }).range(skip, skip + pageSize - 1);
      const { data: meters } = await q;
      const hasMore = (meters?.length || 0) === pageSize;
      const metersWithCounts = await addReadingCounts(meters || []);
      return json({ meters: metersWithCounts, hasMore, page, pageSize });
    }

    // ── Full mode (export, map, estimation) ──
    const allMeters = await fetchAllMeters(project_id);
    const { data: allDmas } = await admin.from('dma').select('*').eq('project_id', project_id);
    const dmaInfo = (allDmas || []).map((d) => ({ name: d.name, poly: getPoly(d), main_meter_id: d.main_meter_id }));

    const metersWithDma = allMeters.map((m) => {
      let resolvedName: string | null = null;
      for (const dma of dmaInfo) {
        if (dma.main_meter_id && dma.main_meter_id === m.id) {
          resolvedName = dma.name;
          break;
        }
        if (dma.poly && m.latitude != null && m.longitude != null && pointInPolygon(m.latitude, m.longitude, dma.poly)) {
          resolvedName = dma.name;
          break;
        }
      }
      return { ...m, dma_name: resolvedName || '' };
    });

    return json({ meters: metersWithDma, count: metersWithDma.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
