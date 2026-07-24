import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const lati = polygon[i][0], lngi = polygon[i][1];
    const latj = polygon[j][0], lngj = polygon[j][1];
    const intersect = ((lati > lat) !== (latj > lat)) &&
      (lng < (lngj - lngi) * (lat - lati) / (latj - lati) + lngi);
    if (intersect) inside = !inside;
  }
  return inside;
}

async function addReadingCounts(base44, projectId, meters) {
  if (meters.length === 0) return meters;
  const meterIds = meters.map((m) => m.id);
  const counts = {};
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    const readings = await base44.asServiceRole.entities.ConsumptionReading.filter(
      { project_id: projectId, meter_id: { $in: meterIds } },
      'id',
      5000,
      skip
    );
    for (const r of readings) {
      counts[r.meter_id] = (counts[r.meter_id] || 0) + 1;
    }
    hasMore = readings.length === 5000;
    skip += readings.length;
  }
  return meters.map((m) => ({ ...m, reading_count: counts[m.id] || 0 }));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { project_id, page, pageSize, search, meterType, sortKey, sortDir, countsOnly, dmaFilter, insertionLayerIds } = body;

    if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });

    // DMA filter mode: fetch all meters and filter by polygon membership
    if (dmaFilter) {
      const dmaPolys = [];
      if (dmaFilter.type === 'dma' && dmaFilter.dmaId) {
        const targetDmas = await base44.asServiceRole.entities.Dma.filter({ project_id, id: dmaFilter.dmaId });
        if (targetDmas.length > 0) {
          const d = targetDmas[0];
          let poly;
          try { poly = JSON.parse(d.polygon); } catch { poly = null; }
          dmaPolys.push({ poly, main_meter_id: d.main_meter_id });
        }
      } else if (dmaFilter.type === 'orphans') {
        const allDmas = await base44.asServiceRole.entities.Dma.filter({ project_id });
        for (const d of allDmas) {
          let poly;
          try { poly = JSON.parse(d.polygon); } catch { poly = null; }
          dmaPolys.push({ poly, main_meter_id: d.main_meter_id });
        }
      }

      const allMeters = [];
      let skip = 0;
      let hasMore = true;
      const query = { project_id };
      if (meterType === 'main') {
        query.is_main = true;
        if (insertionLayerIds?.length) query.layer_id = { $nin: insertionLayerIds };
      } else if (meterType === 'main_ins') {
        if (insertionLayerIds?.length) {
          query.layer_id = { $in: insertionLayerIds };
        } else {
          return Response.json({ meters: [], hasMore: false, total: 0, mainCount: 0, mainInsCount: 0, subCount: 0, unlocatedCount: 0 });
        }
      } else if (meterType === 'sub') {
        query.is_main = { $ne: true };
      }
      while (hasMore) {
        const batch = await base44.asServiceRole.entities.Meter.filter(query, 'id', 5000, skip);
        allMeters.push(...batch);
        hasMore = batch.length === 5000;
        skip += batch.length;
      }

      let filtered;
      if (dmaFilter.type === 'dma') {
        const dma = dmaPolys[0];
        if (!dma) {
          filtered = [];
        } else {
          filtered = allMeters.filter((m) => {
            if (dma.main_meter_id && dma.main_meter_id === m.id) return true;
            if (dma.poly && dma.poly.length >= 3 && m.latitude != null && m.longitude != null) {
              return pointInPolygon(m.latitude, m.longitude, dma.poly);
            }
            return false;
          });
        }
      } else {
        filtered = allMeters.filter((m) => {
          for (const dma of dmaPolys) {
            if (dma.main_meter_id && dma.main_meter_id === m.id) return false;
            if (dma.poly && dma.poly.length >= 3 && m.latitude != null && m.longitude != null) {
              if (pointInPolygon(m.latitude, m.longitude, dma.poly)) return false;
            }
          }
          return true;
        });
      }

      if (search) {
        const lower = search.toLowerCase();
        filtered = filtered.filter((m) =>
          (m.uid && m.uid.toLowerCase().includes(lower)) ||
          (m.payer_name && m.payer_name.toLowerCase().includes(lower)) ||
          (m.address && m.address.toLowerCase().includes(lower)) ||
          (m.provider && m.provider.toLowerCase().includes(lower))
        );
      }

      if (sortKey) {
        const sortMap = { uid: 'uid', payer_name: 'payer_name', address: 'address', type: 'is_main', status: 'is_active' };
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
        // Default sort: Mains (non-ins) → Mains (Ins) → Sub meters
        const isIns = (m) => insertionLayerIds?.length && insertionLayerIds.includes(m.layer_id);
        const priority = (m) => isIns(m) ? 1 : (m.is_main ? 0 : 2);
        filtered.sort((a, b) => priority(a) - priority(b));
      }

      const total = filtered.length;
      const mainCount = filtered.filter((m) => m.is_main && !(insertionLayerIds?.length && insertionLayerIds.includes(m.layer_id))).length;
      const mainInsCount = filtered.filter((m) => insertionLayerIds?.length && insertionLayerIds.includes(m.layer_id)).length;
      const unlocatedCount = filtered.filter((m) => m.latitude == null || m.longitude == null).length;

      if (countsOnly) {
        return Response.json({ total, mainCount, mainInsCount, subCount: total - mainCount - mainInsCount, unlocatedCount });
      }

      const p = page || 1;
      const ps = pageSize || 500;
      const start = (p - 1) * ps;
      const paged = filtered.slice(start, start + ps);
      const hasMorePages = start + ps < total;
      const pagedWithCounts = await addReadingCounts(base44, project_id, paged);

      return Response.json({ meters: pagedWithCounts, hasMore: hasMorePages, page: p, pageSize: ps });
    }

    // countsOnly mode: return just total/main/sub counts (fetched in background)
    if (countsOnly) {
      const query = { project_id };
      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$or = [
          { uid: { $regex: escaped, $options: 'i' } },
          { payer_name: { $regex: escaped, $options: 'i' } },
          { address: { $regex: escaped, $options: 'i' } },
          { provider: { $regex: escaped, $options: 'i' } },
        ];
      }

      // Fetch DMA polygons for live assigned-count computation
      const allDmas = await base44.asServiceRole.entities.Dma.filter({ project_id });
      const dmaPolys = [];
      for (const d of allDmas) {
        let poly;
        try { poly = typeof d.polygon === 'string' ? JSON.parse(d.polygon) : d.polygon; } catch { poly = null; }
        if (Array.isArray(poly) && poly.length >= 3) dmaPolys.push(poly);
      }

      let total = 0;
      let mainCount = 0;
      let mainInsCount = 0;
      let unlocatedCount = 0;
      let assignedCount = 0;
      let skip = 0;
      let hasMore = true;
      while (hasMore) {
        const batch = await base44.asServiceRole.entities.Meter.filter(query, 'id', 5000, skip);
        total += batch.length;
        mainCount += batch.filter((m) => m.is_main && !(insertionLayerIds?.length && insertionLayerIds.includes(m.layer_id))).length;
        mainInsCount += batch.filter((m) => insertionLayerIds?.length && insertionLayerIds.includes(m.layer_id)).length;
        unlocatedCount += batch.filter((m) => m.latitude == null || m.longitude == null).length;
        // Assigned = sub-meters (non-main) with coordinates inside any DMA polygon
        for (const m of batch) {
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
        hasMore = batch.length === 5000;
        skip += batch.length;
      }
      return Response.json({ total, mainCount, mainInsCount, subCount: total - mainCount - mainInsCount, unlocatedCount, assignedCount, dmaCount: allDmas.length });
    }

    // Build query for paginated mode
    if (page && pageSize) {
      const query = { project_id };
      if (meterType === 'main') {
        query.is_main = true;
        if (insertionLayerIds?.length) query.layer_id = { $nin: insertionLayerIds };
      } else if (meterType === 'main_ins') {
        if (insertionLayerIds?.length) {
          query.layer_id = { $in: insertionLayerIds };
        } else {
          return Response.json({ meters: [], hasMore: false, page, pageSize });
        }
      } else if (meterType === 'sub') {
        query.is_main = { $ne: true };
      }

      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$or = [
          { uid: { $regex: escaped, $options: 'i' } },
          { payer_name: { $regex: escaped, $options: 'i' } },
          { address: { $regex: escaped, $options: 'i' } },
          { provider: { $regex: escaped, $options: 'i' } },
        ];
      }

      // Default sort: Mains (non-ins) → Mains (Ins) → Sub meters
      if (!sortKey && !meterType) {
        const skipCount = (page - 1) * pageSize;
        const limit = pageSize;

        const groupQueries = [
          { ...query, is_main: true, ...(insertionLayerIds?.length ? { layer_id: { $nin: insertionLayerIds } } : {}) },
          ...(insertionLayerIds?.length ? [{ ...query, layer_id: { $in: insertionLayerIds } }] : []),
          { ...query, is_main: { $ne: true } },
        ];

        let remainingSkip = skipCount;
        let remainingLimit = limit;
        const resultMeters = [];

        for (const gq of groupQueries) {
          if (remainingLimit <= 0) break;
          const fetchCount = remainingSkip + remainingLimit;
          const groupMeters = await base44.asServiceRole.entities.Meter.filter(gq, 'id', fetchCount, 0);
          const groupCount = groupMeters.length;
          if (remainingSkip >= groupCount) {
            remainingSkip -= groupCount;
            continue;
          }
          const start = remainingSkip;
          const take = Math.min(remainingLimit, groupCount - start);
          resultMeters.push(...groupMeters.slice(start, start + take));
          remainingSkip = 0;
          remainingLimit -= take;
        }

        const hasMore = remainingLimit <= 0;
        const metersWithCounts = await addReadingCounts(base44, project_id, resultMeters);
        return Response.json({ meters: metersWithCounts, hasMore, page, pageSize });
      }

      let sort = 'id';
      if (sortKey) {
        const sortMap = { uid: 'uid', payer_name: 'payer_name', address: 'address', type: 'is_main', status: 'is_active' };
        sort = sortMap[sortKey] || 'id';
      }
      if (sortDir === 'desc') sort = `-${sort}`;

      const skip = (page - 1) * pageSize;
      const meters = await base44.asServiceRole.entities.Meter.filter(query, sort, pageSize, skip);
      const hasMore = meters.length === pageSize;
      const metersWithCounts = await addReadingCounts(base44, project_id, meters);

      return Response.json({ meters: metersWithCounts, hasMore, page, pageSize });
    }

    // Full mode (no pagination) — for export, map, estimation
    const allMeters = [];
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.Meter.filter({ project_id }, 'id', 5000, skip);
      allMeters.push(...batch);
      hasMore = batch.length === 5000;
      skip += batch.length;
    }

    // Resolve DMA name for each meter via main_meter_id or polygon membership
    const allDmas = await base44.asServiceRole.entities.Dma.filter({ project_id });
    const dmaPolys = [];
    for (const d of allDmas) {
      let poly;
      try { poly = typeof d.polygon === 'string' ? JSON.parse(d.polygon) : d.polygon; } catch { poly = null; }
      if (!Array.isArray(poly) || poly.length < 3) poly = null;
      dmaPolys.push({ name: d.name, poly, main_meter_id: d.main_meter_id });
    }
    const metersWithDma = allMeters.map((m) => {
      let resolvedName = null;
      for (const dma of dmaPolys) {
        if (dma.main_meter_id && dma.main_meter_id === m.id) { resolvedName = dma.name; break; }
        if (dma.poly && m.latitude != null && m.longitude != null && pointInPolygon(m.latitude, m.longitude, dma.poly)) { resolvedName = dma.name; break; }
      }
      return { ...m, dma_name: m.dma_name || resolvedName || "" };
    });

    return Response.json({ meters: metersWithDma, count: metersWithDma.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});