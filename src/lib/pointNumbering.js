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

  // Plain loop, not Math.max(...lats): spreading a large array as arguments
  // overflows the call stack (a GeoJSON-backed layer can contribute a lot of
  // points), which would blank the map.
  let north = -Infinity;
  let south = Infinity;
  for (const p of withCoords) {
    if (p.lat > north) north = p.lat;
    if (p.lat < south) south = p.lat;
  }
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

// Builds the flat, numberable point list for the point-numbering toggle,
// scoped exactly to the three categories the feature covers: main/insertion
// meters (is_main === true — same concept, two names, per product decision),
// points belonging to an "Ultrasonic Meters" project layer, and isolated
// valves/points. Regular sub-meters and other layer types are intentionally
// excluded.
export function isUltrasonicLayer(layer) {
  return layer?.category === "Ultrasonic Meters" || /ultrasonic/i.test(layer?.name || "");
}

// Resolves the project_layer a meter belongs to, using the same fallback
// join ProjectMap/CustomerModeMap use when rendering (layer_id FK, falling
// back to a source_file_url match for meters imported before that FK
// existed). Meters whose owning layer is currently hidden must not be
// numbered — there's nothing on the map for that badge to point at.
function isMeterLayerVisible(meter, layers) {
  const layer = (layers || []).find((l) =>
    meter.layer_id ? l.id === meter.layer_id : meter.source_file_url && l.file_url === meter.source_file_url
  );
  return layer ? layer.visible !== false : true;
}

// Extracts numberable points from "Ultrasonic Meters" layers. If the layer is
// backed by real meter rows (layer_id FK), use those (live lat/lng); otherwise
// fall back to the raw GeoJSON Point features already loaded into the map's
// geojsonCache (keyed by layer.id), same source ProjectMap/CustomerModeMap
// use for rendering.
export function extractUltrasonicPoints(layers, meters, geojsonCache) {
  const points = [];
  for (const layer of (layers || []).filter((l) => isUltrasonicLayer(l) && l.visible !== false)) {
    const layerMeters = (meters || []).filter((m) => m.layer_id === layer.id);
    if (layerMeters.length > 0) {
      for (const m of layerMeters) {
        points.push({ id: `meter-${m.id}`, category: "ultrasonic", lat: m.latitude, lng: m.longitude });
      }
      continue;
    }
    const raw = geojsonCache?.[layer.id];
    if (!raw || raw.error) continue;
    const features = raw.features || (raw.type === "Feature" ? [raw] : []);
    features.forEach((f, i) => {
      const geomType = f.geometry?.type;
      if (geomType !== "Point" && geomType !== "MultiPoint") return;
      const coords = geomType === "Point" ? [f.geometry.coordinates] : f.geometry.coordinates;
      (coords || []).forEach(([lng, lat], j) => {
        if (lat == null || lng == null) return;
        points.push({ id: `layer-${layer.id}-${i}-${j}`, category: "ultrasonic", lat, lng });
      });
    });
  }
  return points;
}

// A single meter row can legitimately satisfy more than one category filter
// — e.g. a meter flagged is_main=true that also lives in a layer named
// "Ultrasonic Insertion Meters" (a real, common meter-type name, not an edge
// case) matches both the main-meter filter and the ultrasonic-layer regex.
// Without de-duping, that one physical meter gets two numbers at the exact
// same coordinate (reported as "number 1 & 2 should be one point"). Each
// meter/isolated-point id is only ever assigned once; main/insertion takes
// priority over ultrasonic since is_main is the more fundamental attribute.
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
