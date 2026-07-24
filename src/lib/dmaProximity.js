// Proximity-based filtering for DMA focus mode.
// Shows features inside the DMA OR within a radius (default 30ft ≈ 9.144m).
// Water lines that touch the DMA are shown in their entirety (no clipping).

import { pointInPolygon } from "@/lib/polygonUtils";

const FEET_TO_METERS = 0.3048;
export const DEFAULT_PROXIMITY_FEET = 60;
export const DEFAULT_PROXIMITY_METERS = DEFAULT_PROXIMITY_FEET * FEET_TO_METERS;
export const feetToMeters = (feet) => feet * FEET_TO_METERS;

// Haversine distance between two [lat, lng] points, in meters
function haversineMeters(p1, p2) {
  const R = 6378137;
  const toRad = (d) => (d * Math.PI) / 180;
  const [lat1, lng1] = p1;
  const [lat2, lng2] = p2;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Nearest point on a segment [a,b] to point p — all [lat, lng]
function nearestPointOnSegment(p, a, b) {
  const [plat, plng] = p;
  const [alat, alng] = a;
  const [blat, blng] = b;
  const dx = blat - alat;
  const dy = blng - alng;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return [alat, alng];
  let t = ((plat - alat) * dx + (plng - alng) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return [alat + t * dx, alng + t * dy];
}

// Minimum distance (meters) from a point to a polygon boundary.
// Returns 0 if inside the polygon.
export function distancePointToPolygonMeters(lat, lng, polygon) {
  if (pointInPolygon(lat, lng, polygon)) return 0;
  let minDist = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const np = nearestPointOnSegment([lat, lng], a, b);
    const d = haversineMeters([lat, lng], np);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// True if the point is inside any DMA polygon OR within radiusMeters of any boundary
export function isPointInOrNearDma(lat, lng, dmaPolygons, radiusMeters = DEFAULT_PROXIMITY_METERS) {
  if (!dmaPolygons || dmaPolygons.length === 0) return false;
  for (const poly of dmaPolygons) {
    if (pointInPolygon(lat, lng, poly)) return true;
  }
  for (const poly of dmaPolygons) {
    const dist = distancePointToPolygonMeters(lat, lng, poly);
    if (dist <= radiusMeters) return true;
  }
  return false;
}

// Extract all coordinate pairs [lat, lng] from a GeoJSON geometry
function extractCoordsLatLng(geometry) {
  if (!geometry) return [];
  const { type, coordinates } = geometry;
  switch (type) {
    case "Point":
      return [[coordinates[1], coordinates[0]]];
    case "MultiPoint":
    case "LineString":
      return coordinates.map(([lng, lat]) => [lat, lng]);
    case "MultiLineString":
      return coordinates.flat().map(([lng, lat]) => [lat, lng]);
    case "Polygon":
      return coordinates.flat().map(([lng, lat]) => [lat, lng]);
    case "MultiPolygon":
      return coordinates.flat(2).map(([lng, lat]) => [lat, lng]);
    default:
      return [];
  }
}

// True if any part of the feature geometry is inside or near the DMA.
// For lines, if any vertex is inside/near → show the entire line.
export function isFeatureInOrNearDma(geometry, dmaPolygons, radiusMeters = DEFAULT_PROXIMITY_METERS) {
  if (!geometry || !dmaPolygons || dmaPolygons.length === 0) return false;
  const coords = extractCoordsLatLng(geometry);
  for (const [lat, lng] of coords) {
    if (isPointInOrNearDma(lat, lng, dmaPolygons, radiusMeters)) return true;
  }
  return false;
}

// Filter a GeoJSON FeatureCollection, keeping only features inside or near the DMA.
// Features are shown in their entirety (no clipping).
export function filterFeaturesByDmaProximity(geojson, dmaPolygons, radiusMeters = DEFAULT_PROXIMITY_METERS) {
  if (!geojson || !dmaPolygons || dmaPolygons.length === 0) return geojson;

  if (geojson.type === "FeatureCollection") {
    const filtered = (geojson.features || []).filter((f) =>
      isFeatureInOrNearDma(f.geometry, dmaPolygons, radiusMeters)
    );
    return { ...geojson, features: filtered };
  }

  if (geojson.type === "Feature") {
    return isFeatureInOrNearDma(geojson.geometry, dmaPolygons, radiusMeters) ? geojson : null;
  }

  // Raw geometry
  return isFeatureInOrNearDma(geojson, dmaPolygons, radiusMeters) ? geojson : null;
}