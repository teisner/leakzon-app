// Reverse geocodes a [lat, lng] to a human-readable address using Google Maps Geocoding API
// via a backend function. Returns a formatted address string, or null if no result was found.
// For junctions/intersections, returns "Street A, corner with Street B".

import { invokeFunction } from "@/api/functionsClient";

export async function reverseGeocode(lat, lng) {
  try {
    const res = await invokeFunction("reverseGeocodeAddress", { lat, lng });
    return res.data?.address || null;
  } catch {
    return null;
  }
}