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

// Finds valves that sit at a border between two DMAs — the candidate isolation
// valves. Two independent rules, unioned:
//
//   A. A valve close to another valve that belongs to a *different* DMA — a
//      pair straddling the shared boundary.
//   B. A single valve within range of the boundaries of two *different* DMAs —
//      i.e. sitting on the shared border itself.
//
// Rule B matters because a shared border is very often isolated by ONE valve,
// not a pair. With only rule A those DMAs returned nothing at all even though
// the boundary valve was right there.
//
// dmaPolys: [{ id, poly }] where poly is [[lat, lng], …].
// excludePoints: valves already marked as isolation points — they're dropped
// from the result (nothing left to mark) but kept in the pairing computation,
// so a neighbour across the border is still detected by rule A.
export function findBorderValves(
  valvePoints,
  dmaPolys,
  { pairMeters = 60, maxAssignMeters = 120, excludePoints = [], excludeToleranceMeters = 2 } = {}
) {
  if (!valvePoints?.length || (dmaPolys?.length || 0) < 2) return [];

  // Distance from every valve to every DMA boundary — used by both rules.
  const boundaryDist = valvePoints.map((v) =>
    dmaPolys.map((d) => {
      const np = nearestPointOnPolygon([v.lat, v.lng], d.poly);
      return haversineMeters(v.lat, v.lng, np[0], np[1]);
    })
  );

  // Assign each valve to a DMA: the one it's inside, else the nearest DMA whose
  // boundary is within maxAssignMeters (valves often sit just outside a zone).
  const assigned = valvePoints.map((v, i) => {
    let inside = null;
    for (let k = 0; k < dmaPolys.length; k++) {
      if (pointInPolygon(v.lat, v.lng, dmaPolys[k].poly)) { inside = dmaPolys[k].id; break; }
    }
    if (inside) return { ...v, dmaId: inside };
    let best = null;
    let bestDist = Infinity;
    for (let k = 0; k < dmaPolys.length; k++) {
      if (boundaryDist[i][k] < bestDist) { bestDist = boundaryDist[i][k]; best = dmaPolys[k].id; }
    }
    return { ...v, dmaId: bestDist <= maxAssignMeters ? best : null };
  });

  const flagged = new Set();

  // Rule B — on a shared border: within range of two different DMA boundaries.
  for (let i = 0; i < valvePoints.length; i++) {
    let near = 0;
    for (let k = 0; k < dmaPolys.length; k++) {
      if (boundaryDist[i][k] <= pairMeters) near++;
      if (near >= 2) { flagged.add(i); break; }
    }
  }

  // Rule A — a close pair of valves belonging to different DMAs. Scanned in
  // latitude order so only valves within a narrow band are compared (keeps this
  // near-linear rather than O(n²) on networks with thousands of valves).
  const order = assigned
    .map((a, i) => ({ i, lat: a.lat }))
    .sort((x, y) => x.lat - y.lat);
  const bandDeg = pairMeters / METERS_PER_DEGREE_LAT;
  for (let x = 0; x < order.length; x++) {
    for (let y = x + 1; y < order.length && order[y].lat - order[x].lat <= bandDeg; y++) {
      const a = assigned[order[x].i];
      const b = assigned[order[y].i];
      if (!a.dmaId || !b.dmaId || a.dmaId === b.dmaId) continue;
      if (haversineMeters(a.lat, a.lng, b.lat, b.lng) <= pairMeters) {
        flagged.add(order[x].i);
        flagged.add(order[y].i);
      }
    }
  }

  const alreadyMarked = (v) =>
    (excludePoints || []).some(
      (p) =>
        p?.lat != null &&
        p?.lng != null &&
        haversineMeters(v.lat, v.lng, p.lat, p.lng) <= excludeToleranceMeters
    );

  return [...flagged]
    .map((idx) => ({ lat: valvePoints[idx].lat, lng: valvePoints[idx].lng }))
    .filter((v) => !alreadyMarked(v));
}
