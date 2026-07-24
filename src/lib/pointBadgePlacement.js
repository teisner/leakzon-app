import L from "leaflet";

// Ring of candidate pixel offsets to try, closest first. The badge is ALWAYS
// nudged away from the point itself — no (0,0) candidate — so the number
// never sits directly on top of (and hides) the marker/icon it labels. Later
// entries are only used when an earlier one collides with an already-placed
// badge.
const CANDIDATE_OFFSETS = [
  [14, -14], [-14, -14], [14, 14], [-14, 14],
  [22, 0], [-22, 0], [0, -22], [0, 22],
  [22, -22], [-22, -22], [22, 22], [-22, 22],
  [32, -10], [-32, -10], [32, 10], [-32, 10],
];

// Places number badges in screen (layer-point) space for the current zoom,
// nudging any that would sit within minSeparationPx of an already-placed
// badge to the next ring position. Recompute on every zoomend/moveend — this
// only decides where the label sits, not the number itself (that's fixed by
// assignPointNumbers and never changes with the viewport). Every result
// carries a leader line back to the true point plus the screen-space angle
// (degrees, CSS/SVG rotation convention) pointing from the badge to the
// point, so the render layer can draw a small arrowhead there.
export function placeBadges(map, numberedPoints, { minSeparationPx = 20 } = {}) {
  const placedPx = [];
  const results = [];

  for (const p of numberedPoints) {
    const basePx = map.latLngToLayerPoint([p.lat, p.lng]);
    let chosenPx = L.point(basePx.x + CANDIDATE_OFFSETS[0][0], basePx.y + CANDIDATE_OFFSETS[0][1]);

    for (const [dx, dy] of CANDIDATE_OFFSETS) {
      const candidate = L.point(basePx.x + dx, basePx.y + dy);
      const collides = placedPx.some((q) => candidate.distanceTo(q) < minSeparationPx);
      if (!collides) {
        chosenPx = candidate;
        break;
      }
    }

    placedPx.push(chosenPx);
    results.push({ ...p, labelLatLng: map.layerPointToLatLng(chosenPx) });
  }

  return results;
}
