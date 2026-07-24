import L from "leaflet";

// Ring of candidate pixel offsets to try, closest first, when a badge's
// default position (directly on the point) collides with an already-placed
// badge. The chosen offset is converted back to a leader line in the render
// layer so the number never overlaps the marker it labels.
const CANDIDATE_OFFSETS = [
  [0, 0],
  [16, -16], [-16, -16], [16, 16], [-16, 16],
  [26, 0], [-26, 0], [0, -26], [0, 26],
  [26, -26], [-26, -26], [26, 26], [-26, 26],
  [36, -10], [-36, -10], [36, 10], [-36, 10],
];

// Places number badges in screen (layer-point) space for the current zoom,
// nudging any that would sit within minSeparationPx of an already-placed
// badge outward along CANDIDATE_OFFSETS. Recompute on every zoomend/moveend —
// this only decides where the label sits, not the number itself (that's
// fixed by assignPointNumbers and never changes with the viewport).
export function placeBadges(map, numberedPoints, { minSeparationPx = 20 } = {}) {
  const placedPx = [];
  const results = [];

  for (const p of numberedPoints) {
    const basePx = map.latLngToLayerPoint([p.lat, p.lng]);
    let chosenPx = basePx;
    let needsLeader = false;

    for (const [dx, dy] of CANDIDATE_OFFSETS) {
      const candidate = L.point(basePx.x + dx, basePx.y + dy);
      const collides = placedPx.some((q) => candidate.distanceTo(q) < minSeparationPx);
      if (!collides) {
        chosenPx = candidate;
        needsLeader = dx !== 0 || dy !== 0;
        break;
      }
    }

    placedPx.push(chosenPx);
    results.push({ ...p, labelLatLng: map.layerPointToLatLng(chosenPx), needsLeader });
  }

  return results;
}
