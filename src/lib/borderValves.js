import { pointInPolygon, nearestPointOnPolygon } from "@/lib/polygonUtils";
import { isValveLayer } from "@/lib/isolatedPoints";

const METERS_PER_DEGREE_LAT = 111320;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6378137;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// All valve points (lat/lng) from the project's valve layers' GeoJSON.
export function collectValvePoints(layers, geojsonCache) {
  const pts = [];
  for (const layer of (layers || []).filter(isValveLayer)) {
    const raw = geojsonCache?.[layer.id];
    if (!raw || raw.error) continue;
    const features = raw.features || (raw.type === "Feature" ? [raw] : []);
    for (const f of features) {
      const gt = f.geometry?.type;
      if (gt !== "Point" && gt !== "MultiPoint") continue;
      const list = gt === "Point" ? [f.geometry.coordinates] : (f.geometry.coordinates || []);
      for (const c of list) {
        const lng = c?.[0];
        const lat = c?.[1];
        if (lat != null && lng != null) pts.push({ lat, lng });
      }
    }
  }
  return pts;
}

// Finds valves that sit at a border between two DMAs — i.e. pairs of valves
// close to each other (within pairMeters) that belong to *different* DMAs (one
// on each side of the shared boundary). These are the candidate isolation
// valves. Returns the flagged valves as [{lat, lng}].
//
// dmaPolys: [{ id, poly }] where poly is [[lat,lng], …].
export function findBorderValves(valvePoints, dmaPolys, { pairMeters = 60, maxAssignMeters = 120 } = {}) {
  if (!valvePoints?.length || (dmaPolys?.length || 0) < 2) return [];

  // Assign each valve to a DMA: the one it's inside, else the nearest DMA whose
  // boundary is within maxAssignMeters (valves often sit just outside a zone).
  const assigned = valvePoints.map((v) => {
    let inside = null;
    for (const d of dmaPolys) {
      if (pointInPolygon(v.lat, v.lng, d.poly)) { inside = d.id; break; }
    }
    if (inside) return { ...v, dmaId: inside };
    let best = null;
    let bestDist = Infinity;
    for (const d of dmaPolys) {
      const np = nearestPointOnPolygon([v.lat, v.lng], d.poly);
      const dist = haversineMeters(v.lat, v.lng, np[0], np[1]);
      if (dist < bestDist) { bestDist = dist; best = d.id; }
    }
    return { ...v, dmaId: bestDist <= maxAssignMeters ? best : null };
  });

  // Sort by latitude so we only compare valves within a narrow lat band
  // (keeps this near-linear instead of O(n²) for spread-out networks).
  assigned.sort((a, b) => a.lat - b.lat);
  const bandDeg = pairMeters / METERS_PER_DEGREE_LAT;

  const flagged = new Set();
  for (let i = 0; i < assigned.length; i++) {
    for (let j = i + 1; j < assigned.length && assigned[j].lat - assigned[i].lat <= bandDeg; j++) {
      const a = assigned[i];
      const b = assigned[j];
      if (!a.dmaId || !b.dmaId || a.dmaId === b.dmaId) continue;
      if (haversineMeters(a.lat, a.lng, b.lat, b.lng) <= pairMeters) {
        flagged.add(i);
        flagged.add(j);
      }
    }
  }
  return [...flagged].map((idx) => ({ lat: assigned[idx].lat, lng: assigned[idx].lng }));
}
