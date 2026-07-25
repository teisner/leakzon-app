// Assigns sequential numbers to map points in a stable top-to-bottom,
// left-to-right reading order. Ordering is done in geographic space (lat/lng),
// not screen pixels, so numbers stay fixed as the user pans/zooms — only the
// on-screen label position (handled separately, see pointBadgePlacement.js)
// reacts to the viewport.
//
// Reading order is produced with fixed horizontal stripes ("rows"): the
// latitude span is divided into equal-height bands, each point is assigned to
// the band it falls in, and points are then ordered by band (north first) and
// left-to-right within a band (ascending longitude — west is left for any
// non-antimeridian project).
//
// This replaced a "group while the gap to the previous point is small" approach
// that had two failure modes: with a small band every point became its own row,
// so the order collapsed to pure north-south and ignored left-to-right entirely
// (what made numbering look right-to-left on real, kilometre-wide projects);
// with a large band all points chained into one row, ignoring top-to-bottom.
// Fixed stripes can do neither.
//
// Band count ~sqrt(n) gives roughly sqrt(n) points per row for a scattered
// layout — and degrades correctly for degenerate layouts: points along one
// horizontal line have ~zero latitude span so they all land in one band (pure
// left-to-right), while a vertical line puts ~one point per band (pure
// top-to-bottom).
function rowBandCount(n) {
  return Math.max(1, Math.round(Math.sqrt(n)));
}

export function assignPointNumbers(points) {
  const withCoords = points.filter((p) => p.lat != null && p.lng != null);
  if (withCoords.length === 0) return [];

  const lats = withCoords.map((p) => p.lat);
  const north = Math.max(...lats);
  const south = Math.min(...lats);
  const span = north - south;
  const bands = rowBandCount(withCoords.length);
  const bandHeight = span / bands;

  // Band 0 = northernmost stripe. With no latitude spread, everything is band 0.
  const bandOf = (lat) => {
    if (bandHeight <= 0) return 0;
    const idx = Math.floor((north - lat) / bandHeight);
    return Math.min(idx, bands - 1); // the southernmost point lands exactly on the edge
  };

  const ordered = [...withCoords].sort((a, b) => {
    const bandDiff = bandOf(a.lat) - bandOf(b.lat);
    if (bandDiff !== 0) return bandDiff;      // northern stripe first
    if (a.lng !== b.lng) return a.lng - b.lng; // then left to right
    return b.lat - a.lat;                      // stable tie-break
  });

  return ordered.map((p, i) => ({ ...p, number: i + 1 }));
}

export function buildNumberablePoints({ meters, layers, isolatedPoints, geojsonCache }) {
  const seenIds = new Set();
  const dedupe = (list) => {
    const out = [];
    for (const item of list) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      out.push(item);
    }
    return out;
  };

  const mainMeters = dedupe(
    (meters || [])
      .filter((m) => m.is_main && m.latitude != null && m.longitude != null)
      .filter((m) => isMeterLayerVisible(m, layers))
      .map((m) => ({ id: `meter-${m.id}`, category: "main", lat: m.latitude, lng: m.longitude }))
  );

  const ultrasonic = dedupe(extractUltrasonicPoints(layers, meters, geojsonCache));

  const isolated = dedupe(
    (isolatedPoints || [])
      .filter((ip) => ip.latitude != null && ip.longitude != null)
      .map((ip) => ({ id: `isolated-${ip.id}`, category: "isolated", lat: ip.latitude, lng: ip.longitude }))
  );

  return assignPointNumbers([...mainMeters, ...ultrasonic, ...isolated]);
}
