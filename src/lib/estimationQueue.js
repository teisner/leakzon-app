import { estimateLocationFromStreet } from "./streetInterpolation";
import { parseAddress, getStreetKey, normalizeStreetKey } from "./addressParser";

// Build a queue of meter IDs that can be estimated:
// - No existing coordinates
// - Has a parseable street address
// - At least one same-street meter WITH coordinates (reference)
export function buildEstimationQueue(meters) {
  const list = meters || [];
  return list
    .filter((m) => {
      if (m.latitude != null || m.longitude != null) return false;
      const parsed = parseAddress(m.address);
      if (!parsed || !parsed.street) return false;
      const streetKey = normalizeStreetKey(parsed.street);
      return list.some(
        (other) =>
          other.id !== m.id &&
          other.latitude != null &&
          getStreetKey(other.address) === streetKey
      );
    })
    .map((m) => m.id);
}

// Why a meter without coordinates can or cannot be estimated. Street
// interpolation places a meter between its located neighbours on the same
// street, so a street with no located meter on it gives it nothing to work
// from — and the operator needs telling that, rather than the tool opening and
// closing with no explanation.
export function explainEstimationQueue(meters) {
  const list = meters || [];
  const located = new Map();
  for (const m of list) {
    if (m.latitude == null || m.longitude == null) continue;
    const key = getStreetKey(m.address);
    if (key) located.set(key, (located.get(key) || 0) + 1);
  }

  const result = { noLocation: 0, estimable: 0, noAddress: 0, noStreetReference: 0 };
  for (const m of list) {
    if (m.latitude != null && m.longitude != null) continue;
    result.noLocation++;
    const key = getStreetKey(m.address);
    if (!key) { result.noAddress++; continue; }
    if (located.has(key)) result.estimable++;
    else result.noStreetReference++;
  }
  return result;
}

// Compute a confidence score (1-100) for the estimated location.
// Factors: estimation method, number of reference meters, house-number presence.
export function computeConfidence(meter, proposed, similarMeters) {
  if (!proposed) return 0;

  const parsed = parseAddress(meter.address);
  const hasHouseNumber = parsed?.number != null;
  const refCount = similarMeters.length;

  const baseScores = {
    interpolated: 72,
    nearest: 58,
    centroid: 42,
    extrapolated: 32,
  };

  let score = baseScores[proposed.method] || 30;

  // More references = more confidence (diminishing returns)
  if (refCount >= 5) score += 12;
  else if (refCount >= 3) score += 8;
  else if (refCount >= 2) score += 5;
  else score += 2;

  // House number present improves interpolation quality
  if (hasHouseNumber && (proposed.method === "interpolated" || proposed.method === "nearest")) {
    score += 6;
  }

  // Centroid with many references is slightly more reliable
  if (proposed.method === "centroid" && refCount >= 5) {
    score += 5;
  }

  return Math.max(1, Math.min(100, Math.round(score)));
}

// Compute the proposed location + reference meters for a given meter
export function computeEstimationTarget(meter, allMeters) {
  const proposed = estimateLocationFromStreet(meter, allMeters);
  const parsed = parseAddress(meter.address);
  const streetKey = normalizeStreetKey(parsed?.street);
  const similarMeters = (allMeters || []).filter(
    (m) =>
      m.id !== meter.id &&
      m.latitude != null &&
      m.longitude != null &&
      getStreetKey(m.address) === streetKey
  );
  const confidence = computeConfidence(meter, proposed, similarMeters);
  return { meter, proposed, similarMeters, confidence };
}