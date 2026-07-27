import { parseDmaPolygons, distanceToPolygonMeters } from "@/lib/isolatedPoints";
import { pointInPolygon } from "@/lib/polygonUtils";

// Suggests which DMAs a main meter relates to, for the two fields on the meter
// editor. Nothing here selects anything — the caller only marks the suggestion
// as "(recommended)" so the choice stays with the user.

function withGeometry(meter, dmas) {
  // Guard the empty cases before Number(): Number(null) and Number("") are both
  // 0, which is finite, so an unlocated meter would be treated as sitting at
  // (0, 0) and get a confident recommendation from the Gulf of Guinea.
  const rawLat = meter?.latitude;
  const rawLng = meter?.longitude;
  if (rawLat == null || rawLng == null || rawLat === "" || rawLng === "") return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const parsed = parseDmaPolygons(dmas);
  if (parsed.length === 0) return null;
  return { lat, lng, parsed };
}

// The DMA this meter supplies. A main meter is normally inside the DMA it feeds
// or sitting right on its edge, so prefer containment and fall back to whichever
// boundary is closest.
export function recommendLinkedDmaId(meter, dmas) {
  const ctx = withGeometry(meter, dmas);
  if (!ctx) return null;
  const { lat, lng, parsed } = ctx;

  const containing = parsed.find((d) => pointInPolygon(lat, lng, d.poly));
  if (containing) return containing.id;

  let best = null;
  for (const d of parsed) {
    const dist = distanceToPolygonMeters(lat, lng, d.poly);
    if (!best || dist < best.dist) best = { id: d.id, dist };
  }
  return best?.id ?? null;
}

// The DMA this meter is a sub-meter of — the nearest one, excluding whatever is
// already chosen as the Linked DMA (a meter cannot supply and be metered by the
// same DMA).
export function recommendSubMeterDmaId(meter, dmas, excludeDmaId) {
  const ctx = withGeometry(meter, dmas);
  if (!ctx) return null;
  const { lat, lng, parsed } = ctx;

  let best = null;
  for (const d of parsed) {
    if (excludeDmaId && d.id === excludeDmaId) continue;
    const dist = distanceToPolygonMeters(lat, lng, d.poly);
    if (!best || dist < best.dist) best = { id: d.id, dist };
  }
  return best?.id ?? null;
}
