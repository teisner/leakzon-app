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