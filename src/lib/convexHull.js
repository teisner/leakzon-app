/**
 * Computes the convex hull of a set of 2D points using Andrew's monotone chain algorithm.
 * @param {Array<[number, number]>} points - Array of [lat, lng] pairs
 * @returns {Array<[number, number]>} Convex hull vertices (open polygon, not closed)
 */
export function convexHull(points) {
  if (!points || points.length < 3) return points || [];

  // Deduplicate points
  const unique = [];
  const seen = new Set();
  for (const p of points) {
    const key = `${p[0]},${p[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  if (unique.length < 3) return unique;

  // Sort points lexicographically (by lat, then lng)
  const sorted = [...unique].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  const cross = (O, A, B) => (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);

  // Build lower hull
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Concatenate (last point of each is first point of the other)
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
// Pushes a hull outward by a fixed distance so the points it was built from sit
// safely inside it.
//
// A convex hull passes exactly *through* its outermost points, and
// point-in-polygon by ray casting treats a point on an edge as outside. So
// every meter that defined the boundary came back unassigned — 26 of them on
// "Obion Oren (test)", all at distance 0 from the polygon.
//
// Each vertex moves along the centroid→vertex direction, by a real distance in
// metres rather than a percentage, so the margin is the same on a small DMA and
// a large one. The polygon stays convex and still contains every original point.
export function expandHull(hull, marginMeters = 25) {
  if (!hull || hull.length < 3 || marginMeters <= 0) return hull || [];

  const cLat = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cLng = hull.reduce((s, p) => s + p[1], 0) / hull.length;

  // Degrees per metre: latitude is constant, longitude shrinks with latitude.
  const latPerM = 1 / 111320;
  const cosLat = Math.cos((cLat * Math.PI) / 180);
  const lngPerM = 1 / (111320 * (Math.abs(cosLat) < 1e-6 ? 1e-6 : cosLat));

  return hull.map(([lat, lng]) => {
    // Work in metres so the offset is uniform in both axes.
    const dLatM = (lat - cLat) / latPerM;
    const dLngM = (lng - cLng) / lngPerM;
    const len = Math.hypot(dLatM, dLngM);
    if (len < 1e-9) return [lat, lng]; // vertex sits on the centroid
    return [
      lat + (dLatM / len) * marginMeters * latPerM,
      lng + (dLngM / len) * marginMeters * lngPerM,
    ];
  });
}
