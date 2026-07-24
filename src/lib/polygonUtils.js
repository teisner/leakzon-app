// Point-in-polygon ray casting — all coordinates in [lat, lng]
export function pointInPolygon(lat, lng, polygon) {
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

// Extract boundary polygons from GeoJSON, converting [lng,lat] → [lat,lng]
export function getBoundaryPolygonsLatLng(boundaryGeoJSON) {
  if (!boundaryGeoJSON || boundaryGeoJSON.error) return [];
  const polygons = [];

  const extractRings = (geometry) => {
    if (!geometry) return;
    if (geometry.type === "Polygon") {
      const ring = geometry.coordinates[0];
      polygons.push(ring.map(([lng, lat]) => [lat, lng]));
    } else if (geometry.type === "MultiPolygon") {
      for (const poly of geometry.coordinates) {
        const ring = poly[0];
        polygons.push(ring.map(([lng, lat]) => [lat, lng]));
      }
    }
  };

  if (boundaryGeoJSON.type === "FeatureCollection") {
    for (const f of boundaryGeoJSON.features || []) extractRings(f.geometry);
  } else if (boundaryGeoJSON.type === "Feature") {
    extractRings(boundaryGeoJSON.geometry);
  } else {
    extractRings(boundaryGeoJSON);
  }

  return polygons;
}

// Count non-main meters inside polygon, ignoring meters outside city boundary
export function countMetersInPolygon(meters, polygon, boundaryPolygons) {
  if (!polygon || polygon.length < 3) return 0;
  let count = 0;
  for (const meter of meters || []) {
    if (meter.is_main) continue;
    if (meter.latitude == null || meter.longitude == null) continue;

    // Ignore meters outside city boundary
    if (boundaryPolygons && boundaryPolygons.length > 0) {
      const inBoundary = boundaryPolygons.some((bp) =>
        pointInPolygon(meter.latitude, meter.longitude, bp)
      );
      if (!inBoundary) continue;
    }

    if (pointInPolygon(meter.latitude, meter.longitude, polygon)) {
      count++;
    }
  }
  return count;
}

// Check if any vertex of the polygon is outside the boundary
export function isPolygonOutsideBoundary(polygon, boundaryPolygons) {
  if (!boundaryPolygons || boundaryPolygons.length === 0) return false;
  return polygon.some(
    ([lat, lng]) => !boundaryPolygons.some((bp) => pointInPolygon(lat, lng, bp))
  );
}

// Convert DMA polygon(s) to a GeoJSON FeatureCollection with [lng,lat] coordinates
// for use with filterFeaturesByBoundary. dmas: array of DMA objects with polygon field.
export function dmaPolygonsToGeoJSON(dmas) {
  const features = [];
  for (const dma of dmas || []) {
    let poly;
    try {
      poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
    } catch { continue; }
    if (!Array.isArray(poly) || poly.length < 3) continue;
    const ring = poly.map(([lat, lng]) => [lng, lat]);
    // Close the ring
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push(ring[0]);
    }
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: { name: dma.name, id: dma.id },
    });
  }
  return { type: "FeatureCollection", features };
}

// Spherical polygon area (square meters) — polygon is [[lat,lng],...]
export function calculatePolygonAreaSqm(polygon) {
  if (!polygon || polygon.length < 3) return 0;
  const R = 6378137; // Earth radius (m)
  let total = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const [lat1, lng1] = polygon[i];
    const [lat2, lng2] = polygon[(i + 1) % n];
    total += ((lng2 - lng1) * Math.PI / 180) *
      (2 + Math.sin(lat1 * Math.PI / 180) + Math.sin(lat2 * Math.PI / 180));
  }
  return Math.abs((total * R * R) / 2);
}

// Format polygon area based on project distance unit
export function formatPolygonArea(polygon, distanceUnit) {
  const areaSqm = calculatePolygonAreaSqm(polygon);
  if (areaSqm === 0) return null;
  if (distanceUnit === "Miles") {
    const sqft = areaSqm * 10.7639;
    if (sqft >= 43560) {
      return `${(sqft / 43560).toLocaleString(undefined, { maximumFractionDigits: 2 })} acres`;
    }
    return `${sqft.toLocaleString(undefined, { maximumFractionDigits: 0 })} sq ft`;
  }
  return `${areaSqm.toLocaleString(undefined, { maximumFractionDigits: 0 })} sq m`;
}

// Check if a [lat,lng] point is inside any of the given DMA polygons ([[lat,lng],...])
export function pointInDmaPolygons(lat, lng, dmaPolygons) {
  return dmaPolygons.some((poly) => pointInPolygon(lat, lng, poly));
}

// Find nearest point on a line segment to a point — all [lat, lng]
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

// Find nearest point on polygon boundary — polygon is [[lat,lng],...]
export function nearestPointOnPolygon(p, polygon) {
  let nearest = null;
  let minDist = Infinity;

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const np = nearestPointOnSegment(p, a, b);
    const dist = (np[0] - p[0]) ** 2 + (np[1] - p[1]) ** 2;
    if (dist < minDist) {
      minDist = dist;
      nearest = np;
    }
  }

  return nearest;
}

// Align polygon to boundary by moving outside vertices to nearest boundary point
export function alignPolygonToBoundary(polygon, boundaryPolygons) {
  return polygon.map(([lat, lng]) => {
    const inside = boundaryPolygons.some((bp) => pointInPolygon(lat, lng, bp));
    if (inside) return [lat, lng];

    let nearest = null;
    let minDist = Infinity;
    for (const bp of boundaryPolygons) {
      const np = nearestPointOnPolygon([lat, lng], bp);
      const dist = (np[0] - lat) ** 2 + (np[1] - lng) ** 2;
      if (dist < minDist) {
        minDist = dist;
        nearest = np;
      }
    }
    return nearest || [lat, lng];
  });
}