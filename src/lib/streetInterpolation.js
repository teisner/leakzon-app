import { parseAddress, getStreetKey } from "./addressParser";

// Estimate the location of a meter without GIS by interpolating from
// other meters on the same street that DO have GIS coordinates.
//
// Returns { latitude, longitude, method } or null.
//   method: "interpolated" | "extrapolated" | "centroid" | "nearest"
export function estimateLocationFromStreet(meter, allMeters) {
  const parsed = parseAddress(meter.address);
  if (!parsed || !parsed.street) return null;

  const streetKey = parsed.street.toLowerCase().replace(/\s+/g, " ").trim();

  // Find meters on the same street with GIS coordinates
  const sameStreetMeters = (allMeters || []).filter((m) => {
    if (m.latitude == null || m.longitude == null) return false;
    if (m.id === meter.id) return false;
    const mKey = getStreetKey(m.address);
    return mKey === streetKey;
  });

  if (sameStreetMeters.length === 0) return null;

  // Parse house numbers and sort
  const withNumbers = sameStreetMeters
    .map((m) => ({ meter: m, houseNumber: parseAddress(m.address)?.number }))
    .filter((x) => x.houseNumber != null)
    .sort((a, b) => a.houseNumber - b.houseNumber);

  // No house numbers anywhere — use centroid of same-street meters
  if (withNumbers.length === 0) {
    const lat = sameStreetMeters.reduce((s, m) => s + m.latitude, 0) / sameStreetMeters.length;
    const lng = sameStreetMeters.reduce((s, m) => s + m.longitude, 0) / sameStreetMeters.length;
    return { latitude: lat, longitude: lng, method: "centroid" };
  }

  const unknownNumber = parsed.number;

  // If the meter has no house number, use centroid of numbered meters
  if (unknownNumber == null) {
    const lat = withNumbers.reduce((s, x) => s + x.meter.latitude, 0) / withNumbers.length;
    const lng = withNumbers.reduce((s, x) => s + x.meter.longitude, 0) / withNumbers.length;
    return { latitude: lat, longitude: lng, method: "centroid" };
  }

  // Find bracketing meters
  let lower = null;
  let upper = null;
  for (const x of withNumbers) {
    if (x.houseNumber <= unknownNumber) lower = x;
    if (x.houseNumber >= unknownNumber && !upper) upper = x;
  }

  // Exact match
  if (lower && upper && lower.houseNumber === upper.houseNumber) {
    return { latitude: lower.meter.latitude, longitude: lower.meter.longitude, method: "nearest" };
  }

  // Interpolate between lower and upper
  if (lower && upper) {
    const ratio = (unknownNumber - lower.houseNumber) / (upper.houseNumber - lower.houseNumber);
    const lat = lower.meter.latitude + ratio * (upper.meter.latitude - lower.meter.latitude);
    const lng = lower.meter.longitude + ratio * (upper.meter.longitude - lower.meter.longitude);
    return { latitude: lat, longitude: lng, method: "interpolated" };
  }

  // Beyond the highest number — extrapolate from last two
  if (lower && !upper && withNumbers.length >= 2) {
    const last = withNumbers[withNumbers.length - 1];
    const second = withNumbers[withNumbers.length - 2];
    const diff = last.houseNumber - second.houseNumber;
    if (diff > 0) {
      const ratio = (unknownNumber - last.houseNumber) / diff;
      const lat = last.meter.latitude + ratio * (last.meter.latitude - second.meter.latitude);
      const lng = last.meter.longitude + ratio * (last.meter.longitude - second.meter.longitude);
      // Clamp to reasonable distance
      if (Math.abs(ratio) <= 3) {
        return { latitude: lat, longitude: lng, method: "extrapolated" };
      }
    }
    return { latitude: lower.meter.latitude, longitude: lower.meter.longitude, method: "nearest" };
  }

  // Below the lowest number — extrapolate from first two
  if (upper && !lower && withNumbers.length >= 2) {
    const first = withNumbers[0];
    const second = withNumbers[1];
    const diff = second.houseNumber - first.houseNumber;
    if (diff > 0) {
      const ratio = (first.houseNumber - unknownNumber) / diff;
      const lat = first.meter.latitude - ratio * (second.meter.latitude - first.meter.latitude);
      const lng = first.meter.longitude - ratio * (second.meter.longitude - first.meter.longitude);
      if (Math.abs(ratio) <= 3) {
        return { latitude: lat, longitude: lng, method: "extrapolated" };
      }
    }
    return { latitude: upper.meter.latitude, longitude: upper.meter.longitude, method: "nearest" };
  }

  // Only one meter on the street
  const sole = withNumbers[0];
  return { latitude: sole.meter.latitude, longitude: sole.meter.longitude, method: "nearest" };
}