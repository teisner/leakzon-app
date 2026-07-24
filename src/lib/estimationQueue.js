import { estimateLocationFromStreet } from "./streetInterpolation";
import { parseAddress, getStreetKey } from "./addressParser";

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
      const streetKey = parsed.street.toLowerCase().replace(/\s+/g, " ").trim();
      return list.some(
        (other) =>
          other.id !== m.id &&
          other.latitude != null &&
          getStreetKey(other.address) === streetKey
      );
    })
    .map((m) => m.id);
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
  const streetKey = parsed?.street?.toLowerCase().replace(/\s+/g, " ").trim();
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