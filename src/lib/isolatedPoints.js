import { pointInPolygon, nearestPointOnPolygon } from "@/lib/polygonUtils";

// Haversine distance between two lat/lng points in meters
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6378137;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Distance from a [lat,lng] point to a polygon boundary in meters
export function distanceToPolygonMeters(lat, lng, polygon) {
  const np = nearestPointOnPolygon([lat, lng], polygon);
  return haversineMeters(lat, lng, np[0], np[1]);
}

// Check if a point is near any DMA boundary but NOT inside any DMA
export function isNearDmaBoundary(lat, lng, dmaPolygons, thresholdMeters = 200) {
  if (!dmaPolygons || dmaPolygons.length === 0) return false;
  // dmaPolygons items are { id, name, color, poly } from parseDmaPolygons
  // Must not be inside any DMA
  if (dmaPolygons.some((d) => pointInPolygon(lat, lng, d.poly))) return false;
  // Must be near at least one DMA boundary
  return dmaPolygons.some(
    (d) => distanceToPolygonMeters(lat, lng, d.poly) <= thresholdMeters
  );
}

// Parse DMA objects into { id, name, color, poly } for geometry operations
export function parseDmaPolygons(dmas) {
  return (dmas || [])
    .map((dma) => {
      let poly;
      try {
        poly =
          typeof dma.polygon === "string"
            ? JSON.parse(dma.polygon)
            : dma.polygon;
      } catch {
        return null;
      }
      if (!Array.isArray(poly) || poly.length < 3) return null;
      return { id: dma.id, name: dma.name, color: dma.color, poly };
    })
    .filter(Boolean);
}

// Find the N nearest DMAs to a point, sorted by distance
export function findNearestDmas(lat, lng, dmas, n = 2) {
  const parsed = parseDmaPolygons(dmas);
  const withDist = parsed.map((d) => ({
    id: d.id,
    name: d.name,
    color: d.color,
    dist: distanceToPolygonMeters(lat, lng, d.poly),
  }));
  withDist.sort((a, b) => a.dist - b.dist);
  return withDist.slice(0, n);
}

// Check if a layer is a valve layer
export function isValveLayer(layer) {
  return (
    layer?.category === "Valves" || /valve/i.test(layer?.name || "")
  );
}

// Check if a layer should be visible in isolated-points mode:
// only Water Lines, Valves, and Water Sources
export function isIsolatedModeLayer(layer) {
  if (!layer) return false;
  const cat = layer.category || "";
  const name = (layer.name || "").toLowerCase();
  if (cat === "Valves" || /valve/i.test(name)) return true;
  if (cat === "Water Lines" || /main|line|pipe|water.?line|network|conduct/i.test(name)) return true;
  if (cat === "Water Source" || /source|well|spring/i.test(name)) return true;
  return false;
}

// Filter a GeoJSON FeatureCollection to only point features near DMA boundaries
export function filterNearBoundaryValves(geojson, dmaPolygons, thresholdMeters = 200) {
  if (!geojson || !dmaPolygons || dmaPolygons.length === 0) return null;
  const features = (geojson.features || []).filter((f) => {
    if (!f.geometry) return false;
    const isPoint =
      f.geometry.type === "Point" || f.geometry.type === "MultiPoint";
    if (!isPoint) return false;
    const coords = f.geometry.coordinates;
    if (!Array.isArray(coords)) return false;
    const lng = coords[0];
    const lat = coords[1];
    if (lat == null || lng == null) return false;
    return isNearDmaBoundary(lat, lng, dmaPolygons, thresholdMeters);
  });
  if (features.length === 0) return null;
  return { ...geojson, features };
}

// Build a GeoJSON FeatureCollection from isolated point records.
// Used to create/update the "Isolated Valves" project layer.
export function buildIsolatedLayerGeoJSON(isolatedPoints) {
  const features = (isolatedPoints || [])
    .filter((ip) => ip.latitude != null && ip.longitude != null)
    .map((ip) => {
      let properties = {};
      try {
        properties =
          typeof ip.feature_properties === "string"
            ? JSON.parse(ip.feature_properties)
            : ip.feature_properties || {};
      } catch {}
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [ip.longitude, ip.latitude] },
        properties: {
          ...properties,
          _isolated_point_id: ip.id,
          _dma1_id: ip.dma1_id,
          _dma2_id: ip.dma2_id,
        },
      };
    });
  return { type: "FeatureCollection", features };
}

// Find the isolated point record matching a GeoJSON feature's location.
// Uses haversine distance to handle minor coordinate precision differences
// between the stored IsolatedPoint record and the GeoJSON feature.
// Returns the closest match within tolerance, or null.
export function findIsolatedForFeature(feature, isolatedPoints, toleranceMeters = 2) {
  if (!isolatedPoints || isolatedPoints.length === 0) return null;
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords)) return null;
  const lat = coords[1];
  const lng = coords[0];
  if (lat == null || lng == null) return null;
  let best = null;
  let bestDist = Infinity;
  for (const ip of isolatedPoints) {
    if (ip.latitude == null || ip.longitude == null) continue;
    const d = haversineMeters(lat, lng, ip.latitude, ip.longitude);
    if (d <= toleranceMeters && d < bestDist) {
      best = ip;
      bestDist = d;
    }
  }
  return best;
}

// Check if a GeoJSON point feature sits at an assigned isolated point.
export function isFeatureIsolated(feature, isolatedPoints, toleranceMeters = 2) {
  return findIsolatedForFeature(feature, isolatedPoints, toleranceMeters) != null;
}