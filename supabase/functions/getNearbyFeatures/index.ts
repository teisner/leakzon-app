// What is around the technician, so a meter with no coordinates can be found by
// looking at the network rather than guessing from an address.
//
// Returns the located meters and the shapefile-layer features within a radius of
// a point: valves, hydrants, blow-off points, water lines, plant, anything the
// project carries. Filtered on the server on purpose — a project's layers run to
// hundreds of features each and this is a phone on cell data at the roadside.
import { admin, getCallerUser, hasProjectAccess, json, CORS_HEADERS } from '../_shared/authz.ts';
import { validateCustomerToken } from '../_shared/customerToken.ts';

const DEFAULT_RADIUS_M = 250;
const MAX_RADIUS_M = 2000;
// Enough to orient by, few enough to draw on a phone without stalling it.
const MAX_FEATURES_PER_LAYER = 60;
const MAX_METERS = 120;

const M_PER_DEG_LAT = 111320;

function metresPerDegLng(lat: number) {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = (lat2 - lat1) * M_PER_DEG_LAT;
  const dLng = (lng2 - lng1) * metresPerDegLng((lat1 + lat2) / 2);
  return Math.hypot(dLat, dLng);
}

// The distance from the point to the closest vertex of a geometry. Walks the
// coordinate nesting rather than switching on the geometry type, so a Point,
// LineString, Polygon and their Multi- variants all work the same way.
function closestVertexDistance(coords: any, lat: number, lng: number): number {
  if (!Array.isArray(coords)) return Infinity;
  // GeoJSON positions are [lng, lat].
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return distanceM(lat, lng, coords[1], coords[0]);
  }
  let best = Infinity;
  for (const child of coords) {
    const d = closestVertexDistance(child, lat, lng);
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best;
}

// A feature counts as nearby when any of its vertices is inside the radius — a
// water main is relevant when it passes the technician, not only when its
// midpoint happens to be close.
function nearestVertexDistance(geometry: any, lat: number, lng: number) {
  return closestVertexDistance(geometry?.coordinates, lat, lng);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { project_id, token, latitude, longitude, radius, exclude_meter_id } = await req.json();
    if (!project_id) return json({ error: 'project_id is required' }, 400);
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json({ error: 'latitude and longitude are required' }, 400);
    }
    const radiusM = Math.min(Number(radius) || DEFAULT_RADIUS_M, MAX_RADIUS_M);

    const user = await getCallerUser(req);
    const allowed = (await hasProjectAccess(user, project_id))
      || (await validateCustomerToken(project_id, token)).valid;
    if (!allowed) return json({ error: 'Unauthorized' }, 403);

    // Meters first, straight from the table with a bounding box so Postgres does
    // the work. The box is a little generous; the exact radius is applied after.
    const dLat = radiusM / M_PER_DEG_LAT;
    const dLng = radiusM / metresPerDegLng(lat);
    const { data: nearMeters } = await admin
      .from('meter')
      .select('id, uid, latitude, longitude, is_main, address')
      .eq('project_id', project_id)
      .gte('latitude', lat - dLat).lte('latitude', lat + dLat)
      .gte('longitude', lng - dLng).lte('longitude', lng + dLng)
      .limit(MAX_METERS * 3);

    const meters = (nearMeters || [])
      .filter((m: any) => m.id !== exclude_meter_id)
      .map((m: any) => ({
        id: m.id, uid: m.uid, latitude: m.latitude, longitude: m.longitude,
        is_main: !!m.is_main, address: m.address || null,
        distance: Math.round(distanceM(lat, lng, m.latitude, m.longitude)),
      }))
      .filter((m: any) => m.distance <= radiusM)
      .sort((a: any, b: any) => a.distance - b.distance)
      .slice(0, MAX_METERS);

    // Then the map layers. Only visible ones — if the office has hidden a layer
    // it is not something the technician should be navigating by.
    const { data: layers } = await admin
      .from('project_layer')
      .select('id, name, color, layer_type, visible, file_url, point_config')
      .eq('project_id', project_id)
      .eq('layer_type', 'shp')
      .eq('visible', true);

    const layerResults: any[] = [];
    for (const layer of layers || []) {
      if (!layer.file_url) continue;
      let geojson: any;
      try {
        const res = await fetch(layer.file_url);
        if (!res.ok) continue;
        geojson = await res.json();
      } catch {
        continue;
      }
      const features: any[] = [];
      for (const f of geojson.features || []) {
        if (!f?.geometry) continue;
        const d = nearestVertexDistance(f.geometry, lat, lng);
        if (d > radiusM) continue;
        features.push({
          geometry: f.geometry,
          distance: Math.round(d),
          // One label, chosen from whatever the source file happened to call it.
          label: f.properties?.name || f.properties?.Name || f.properties?.NAME
            || f.properties?.FtrID || f.properties?.id || '',
        });
        if (features.length >= MAX_FEATURES_PER_LAYER * 2) break;
      }
      if (features.length === 0) continue;
      features.sort((a, b) => a.distance - b.distance);
      layerResults.push({
        id: layer.id,
        name: layer.name,
        color: layer.color || '#2563eb',
        shape: layer.point_config?.shape || 'circle',
        features: features.slice(0, MAX_FEATURES_PER_LAYER),
      });
    }

    return json({
      centre: { latitude: lat, longitude: lng },
      radius: radiusM,
      meters,
      layers: layerResults,
      counts: {
        meters: meters.length,
        features: layerResults.reduce((sum, l) => sum + l.features.length, 0),
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
