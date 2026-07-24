// Replaces base44/functions/exportDmaData/entry.ts. Point-in-polygon feature
// classification ported verbatim — plain geometry math, not Base44-specific.
import { admin, getCallerUser, hasProjectAccess, json, CORS_HEADERS } from '../_shared/authz.ts';

function pointInPolygon(lat: number, lng: number, polygon: [number, number][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lati, lngi] = polygon[i];
    const [latj, lngj] = polygon[j];
    const intersect = lati > lat !== latj > lat && lng < ((lngj - lngi) * (lat - lati)) / (latj - lati) + lngi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function featureInPolygon(geometry: any, polygon: [number, number][]) {
  if (!geometry || !polygon || polygon.length < 3) return false;
  const t = geometry.type;
  const c = geometry.coordinates;
  if (!c) return false;

  if (t === 'Point') return pointInPolygon(c[1], c[0], polygon);
  if (t === 'MultiPoint') return c.some(([lng, lat]: number[]) => pointInPolygon(lat, lng, polygon));
  if (t === 'LineString') return c.some(([lng, lat]: number[]) => pointInPolygon(lat, lng, polygon));
  if (t === 'MultiLineString') return c.some((line: number[][]) => line.some(([lng, lat]) => pointInPolygon(lat, lng, polygon)));
  if (t === 'Polygon') {
    const ring = c[0];
    if (ring.some(([lng, lat]: number[]) => pointInPolygon(lat, lng, polygon))) return true;
    const cen = ring.reduce((a: number[], [lng, lat]: number[]) => [a[0] + lat, a[1] + lng], [0, 0]).map((v: number) => v / ring.length);
    return pointInPolygon(cen[0], cen[1], polygon);
  }
  if (t === 'MultiPolygon') {
    return c.some((poly: number[][][]) => {
      const ring = poly[0];
      if (ring.some(([lng, lat]) => pointInPolygon(lat, lng, polygon))) return true;
      const cen = ring.reduce((a: number[], [lng, lat]) => [a[0] + lat, a[1] + lng], [0, 0]).map((v: number) => v / ring.length);
      return pointInPolygon(cen[0], cen[1], polygon);
    });
  }
  return false;
}

function meterFields(m: any) {
  return {
    uid: m.uid || '',
    payer_name: m.payer_name || '',
    address: m.address || '',
    city: m.city || '',
    provider: m.provider || '',
    communication_type: m.communication_type || '',
    diameter: m.diameter ?? '',
    is_active: m.is_active,
    endpoint_id: m.endpoint_id || '',
    latitude: m.latitude,
    longitude: m.longitude,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { project_id } = await req.json();
    if (!project_id) return json({ error: 'project_id is required' }, 400);

    const user = await getCallerUser(req);
    if (!(await hasProjectAccess(user, project_id))) return json({ error: 'Unauthorized' }, 403);

    const { data: project } = await admin.from('project').select('*').eq('id', project_id).single();
    if (!project) return json({ error: 'Project not found' }, 404);

    const { data: dmas } = await admin.from('dma').select('*').eq('project_id', project_id).order('sort_order').limit(500);

    const dmaPolys = (dmas || [])
      .map((d) => {
        const raw = d.polygon_json ?? d.polygon;
        let poly: any;
        try {
          poly = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          poly = null;
        }
        return { dma: d, poly: Array.isArray(poly) && poly.length >= 3 ? poly : null };
      })
      .filter((x) => x.poly);

    if (!dmaPolys.length) return json({ projectName: project.name, dmas: [] });

    const meters: any[] = [];
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: batch } = await admin
        .from('meter')
        .select('*')
        .eq('project_id', project_id)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('uid')
        .range(skip, skip + 4999);
      meters.push(...(batch || []));
      hasMore = (batch?.length || 0) === 5000;
      skip += 5000;
    }
    const meterById = new Map(meters.map((m) => [m.id, m]));

    // layer_type_ref aliased — project_layer already has its own flat
    // `layer_type` column (shp/data), so embedding under the matching table
    // name would silently overwrite it in the response.
    const { data: layers } = await admin
      .from('project_layer')
      .select('*, layer_type_ref:layer_type(name)')
      .eq('project_id', project_id)
      .eq('layer_type', 'shp')
      .order('sort_order')
      .limit(500);

    const layerData: any[] = [];
    for (const layer of layers || []) {
      if (/boundary/i.test(layer.name)) continue;
      if (!layer.file_url) continue;

      let geo;
      try {
        const res = await fetch(layer.file_url);
        geo = await res.json();
      } catch {
        continue;
      }
      if (!geo) continue;

      const features = geo.features || (geo.type === 'Feature' ? [geo] : []);
      if (!features.length) continue;

      const ld = {
        layerId: layer.id,
        name: layer.name,
        category: layer.layer_type_ref?.name || 'Other',
        geometryTypes: layer.geometry_types || [],
        featuresByDma: {} as Record<string, any[]>,
      };

      for (const f of features) {
        const geom = f.geometry;
        const props = f.properties || {};
        for (const { dma, poly } of dmaPolys) {
          if (featureInPolygon(geom, poly)) {
            if (!ld.featuresByDma[dma.id]) ld.featuresByDma[dma.id] = [];
            ld.featuresByDma[dma.id].push({ ...props, _geometry_type: geom ? geom.type : '' });
          }
        }
      }

      if (Object.values(ld.featuresByDma).some((arr) => arr.length > 0)) layerData.push(ld);
    }

    const result = dmaPolys.map(({ dma, poly }) => {
      const subMeters: any[] = [];
      const mainMeters: any[] = [];
      for (const m of meters) {
        if (m.latitude == null || m.longitude == null) continue;
        if (!pointInPolygon(m.latitude, m.longitude, poly)) continue;
        if (m.is_main) mainMeters.push(meterFields(m));
        else subMeters.push(meterFields(m));
      }

      if (dma.main_meter_id) {
        const linked = meterById.get(dma.main_meter_id);
        if (linked && !mainMeters.some((mm) => mm.uid === linked.uid)) mainMeters.push(meterFields(linked));
      }

      const layerGroups = layerData
        .filter((ld) => ld.featuresByDma[dma.id]?.length)
        .map((ld) => ({ layerName: ld.name, category: ld.category, geometryTypes: ld.geometryTypes, features: ld.featuresByDma[dma.id] }));

      return { id: dma.id, name: dma.name, color: dma.color, subMeters, mainMeters, layerGroups };
    });

    return json({ projectName: project.name, dmas: result });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
