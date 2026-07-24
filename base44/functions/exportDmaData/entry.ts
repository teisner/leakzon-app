import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Point-in-polygon ray casting — polygon is [[lat, lng], ...]
function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lati, lngi] = polygon[i];
    const [latj, lngj] = polygon[j];
    const intersect =
      (lati > lat) !== (latj > lat) &&
      lng < ((lngj - lngi) * (lat - lati)) / (latj - lati) + lngi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Check if a GeoJSON geometry (coords in [lng, lat]) intersects/contains within a DMA polygon ([lat,lng])
function featureInPolygon(geometry, polygon) {
  if (!geometry || !polygon || polygon.length < 3) return false;
  const t = geometry.type;
  const c = geometry.coordinates;
  if (!c) return false;

  if (t === 'Point') return pointInPolygon(c[1], c[0], polygon);
  if (t === 'MultiPoint') return c.some(([lng, lat]) => pointInPolygon(lat, lng, polygon));
  if (t === 'LineString') return c.some(([lng, lat]) => pointInPolygon(lat, lng, polygon));
  if (t === 'MultiLineString') return c.some((line) => line.some(([lng, lat]) => pointInPolygon(lat, lng, polygon)));
  if (t === 'Polygon') {
    const ring = c[0];
    if (ring.some(([lng, lat]) => pointInPolygon(lat, lng, polygon))) return true;
    const cen = ring.reduce((a, [lng, lat]) => [a[0] + lat, a[1] + lng], [0, 0]).map((v) => v / ring.length);
    return pointInPolygon(cen[0], cen[1], polygon);
  }
  if (t === 'MultiPolygon') {
    return c.some((poly) => {
      const ring = poly[0];
      if (ring.some(([lng, lat]) => pointInPolygon(lat, lng, polygon))) return true;
      const cen = ring.reduce((a, [lng, lat]) => [a[0] + lat, a[1] + lng], [0, 0]).map((v) => v / ring.length);
      return pointInPolygon(cen[0], cen[1], polygon);
    });
  }
  return false;
}

function meterFields(m) {
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
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { project_id } = body;

    if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });

    const project = await base44.asServiceRole.entities.Project.get(project_id);

    // Fetch DMAs
    const dmas = await base44.asServiceRole.entities.Dma.filter(
      { project_id },
      'sort_order',
      500,
      0
    );

    // Parse DMA polygons into [lat,lng] rings
    const dmaPolys = dmas
      .map((d) => {
        let poly;
        try {
          poly = typeof d.polygon === 'string' ? JSON.parse(d.polygon) : d.polygon;
        } catch {
          poly = null;
        }
        return { dma: d, poly: Array.isArray(poly) && poly.length >= 3 ? poly : null };
      })
      .filter((x) => x.poly);

    if (!dmaPolys.length) {
      return Response.json({ projectName: project.name, dmas: [] });
    }

    // Fetch all located meters (paginate)
    const meters = [];
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.Meter.filter(
        { project_id, latitude: { $ne: null }, longitude: { $ne: null } },
        'uid',
        5000,
        skip
      );
      meters.push(...batch);
      hasMore = batch.length === 5000;
      skip += batch.length;
    }

    const meterById = new Map(meters.map((m) => [m.id, m]));

    // Fetch shp layers (exclude boundary layer)
    const layers = await base44.asServiceRole.entities.ProjectLayer.filter(
      { project_id, layer_type: 'shp' },
      'sort_order',
      500,
      0
    );

    // For each layer, fetch GeoJSON and classify features per DMA
    const layerData = [];
    for (const layer of layers) {
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
        category: layer.category || 'Other',
        geometryTypes: layer.geometry_types || [],
        featuresByDma: {},
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

      if (Object.values(ld.featuresByDma).some((arr) => arr.length > 0)) {
        layerData.push(ld);
      }
    }

    // Build per-DMA result
    const result = dmaPolys.map(({ dma, poly }) => {
      const subMeters = [];
      const mainMeters = [];
      for (const m of meters) {
        if (m.latitude == null || m.longitude == null) continue;
        if (!pointInPolygon(m.latitude, m.longitude, poly)) continue;
        if (m.is_main) mainMeters.push(meterFields(m));
        else subMeters.push(meterFields(m));
      }

      // Include the DMA's linked main meter if located and not already included
      if (dma.main_meter_id) {
        const linked = meterById.get(dma.main_meter_id);
        if (linked && !mainMeters.some((mm) => mm.uid === linked.uid)) {
          mainMeters.push(meterFields(linked));
        }
      }

      const layerGroups = layerData
        .filter((ld) => ld.featuresByDma[dma.id]?.length)
        .map((ld) => ({
          layerName: ld.name,
          category: ld.category,
          geometryTypes: ld.geometryTypes,
          features: ld.featuresByDma[dma.id],
        }));

      return {
        id: dma.id,
        name: dma.name,
        color: dma.color,
        subMeters,
        mainMeters,
        layerGroups,
      };
    });

    return Response.json({ projectName: project.name, dmas: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});