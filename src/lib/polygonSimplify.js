// Reduces the number of points in a DMA polygon without moving its boundary
// meaningfully.
//
// Hand-drawn and imported DMA outlines carry points that add nothing — several
// nearly-collinear clicks along one street, or a dense trace from a source file.
// They make the shape awkward to edit and slow every point-in-polygon test the
// app runs (DMA membership, unassigned meters, the export).
//
// Ramer–Douglas–Peucker: keep the points that define the shape, drop the ones
// that sit on a line between their neighbours. Distances are computed in metres
// so a tolerance means the same thing anywhere on earth, rather than in degrees
// where a given value would mean different distances by latitude.

const M_PER_DEG_LAT = 111320;

// Local flat projection, accurate over the size of a DMA.
function toMeters(points) {
  if (points.length === 0) return { pts: [], origin: [0, 0], mPerDegLng: M_PER_DEG_LAT };
  const lat0 = points.reduce((s, p) => s + p[0], 0) / points.length;
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  return {
    pts: points.map(([lat, lng]) => [lng * mPerDegLng, lat * M_PER_DEG_LAT]),
    mPerDegLng,
  };
}

function perpendicularDistance(p, a, b) {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  // Distance to the segment, not the infinite line — an endpoint-heavy polygon
  // would otherwise keep points that are actually redundant.
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function rdp(pts, tolerance) {
  if (pts.length < 3) return pts;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDistance(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist <= tolerance) return [pts[0], pts[pts.length - 1]];
  const left = rdp(pts.slice(0, index + 1), tolerance);
  const right = rdp(pts.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

// Shoelace area, in square metres, for comparing before and after.
function areaSqM(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(a / 2);
}

// Simplifies a closed ring of [lat, lng] points at the given tolerance.
export function simplifyPolygon(points, toleranceMeters) {
  if (!Array.isArray(points) || points.length < 4) return points || [];
  const { pts, mPerDegLng } = toMeters(points);
  // A polygon is a loop, so run the line simplification on it twice from
  // different starting points; simplifying the open list once would always pin
  // the first and last vertex regardless of whether they matter.
  const rotated = [...pts.slice(1), pts[0]];
  const a = rdp([...pts, pts[0]], toleranceMeters).slice(0, -1);
  const b = rdp([...rotated, rotated[0]], toleranceMeters).slice(0, -1);
  const best = a.length <= b.length ? a : b;
  if (best.length < 3) return points;
  return best.map(([x, y]) => [y / M_PER_DEG_LAT, x / mPerDegLng]);
}

// Tolerances tried, smallest first, in metres. Beyond ~25 m a DMA boundary
// starts visibly cutting corners.
const TOLERANCES = [2, 5, 10, 15, 25];

// Picks the largest tolerance that still traces essentially the same area, and
// reports what it would do. Returns canReduce:false when there is nothing
// worthwhile to remove, so the UI can say so rather than offering a no-op.
export function suggestSimplification(points, { maxAreaChangePct = 1, minReductionPct = 10 } = {}) {
  const original = Array.isArray(points) ? points.length : 0;
  if (original < 6) {
    return { canReduce: false, original, simplified: original, reason: "too_few" };
  }
  const { pts } = toMeters(points);
  const baseArea = areaSqM(pts);

  let best = null;
  for (const tolerance of TOLERANCES) {
    const simplified = simplifyPolygon(points, tolerance);
    if (simplified.length < 3 || simplified.length >= original) continue;
    const areaChangePct = baseArea > 0
      ? Math.abs(areaSqM(toMeters(simplified).pts) - baseArea) / baseArea * 100
      : 0;
    if (areaChangePct > maxAreaChangePct) break; // coarser will only be worse
    best = { tolerance, simplified, areaChangePct };
  }

  if (!best) return { canReduce: false, original, simplified: original, reason: "already_minimal" };

  const removed = original - best.simplified.length;
  if ((removed / original) * 100 < minReductionPct) {
    return { canReduce: false, original, simplified: original, reason: "already_minimal" };
  }

  return {
    canReduce: true,
    original,
    simplified: best.simplified.length,
    removed,
    toleranceMeters: best.tolerance,
    areaChangePct: best.areaChangePct,
    points: best.simplified,
  };
}
