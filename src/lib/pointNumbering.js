// Assigns sequential numbers to map points in a stable top-to-bottom,
// left-to-right reading order. Ordering is done in geographic space (lat/lng),
// not screen pixels, so numbers stay fixed as the user pans/zooms — only the
// on-screen label position (handled separately, see pointBadgePlacement.js)
// reacts to the viewport.
//
// A pure latitude sort would misorder points that are visually in the same
// "row" but a few meters apart in latitude (a point slightly further south
// but clearly to the left would get numbered after one to its right). To
// approximate reading order, points within a "row band" of a row's topmost
// point are grouped into that row and then sorted left-to-right (ascending
// longitude — west first, i.e. left first for any non-antimeridian project).
//
// The row band is sized from the data itself rather than a fixed constant:
// a fixed value is either too tight (splits one real row into singletons on
// widely-spaced properties, which degenerates to a pure north-south sort
// that ignores left-to-right entirely) or too loose (merges separate rows
// on a dense cluster). We use a multiple of the median north-south gap
// between consecutive points, clamped to a sane range.
const FALLBACK_ROW_BAND_METERS = 15;
const MIN_ROW_BAND_METERS = 4;
const MAX_ROW_BAND_METERS = 60;
const METERS_PER_DEGREE_LAT = 111320;

function estimateRowBandMeters(sortedByLatDesc) {
  const gaps = [];
  for (let i = 1; i < sortedByLatDesc.length; i++) {
    const gap = (sortedByLatDesc[i - 1].lat - sortedByLatDesc[i].lat) * METERS_PER_DEGREE_LAT;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return FALLBACK_ROW_BAND_METERS;
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return Math.min(Math.max(median * 2.5, MIN_ROW_BAND_METERS), MAX_ROW_BAND_METERS);
}

export function assignPointNumbers(points) {
  const withCoords = points.filter((p) => p.lat != null && p.lng != null);
  if (withCoords.length === 0) return [];

  const sorted = [...withCoords].sort((a, b) => b.lat - a.lat);
  const bandDeg = estimateRowBandMeters(sorted) / METERS_PER_DEGREE_LAT;

  const rows = [];
  let currentRow = [];
  let rowTopLat = null;
  for (const p of sorted) {
    if (rowTopLat === null || rowTopLat - p.lat <= bandDeg) {
      if (rowTopLat === null) rowTopLat = p.lat;
      currentRow.push(p);
    } else {
      rows.push(currentRow);
      currentRow = [p];
      rowTopLat = p.lat;
    }
  }
  if (currentRow.length) rows.push(currentRow);

  const ordered = rows.flatMap((row) => [...row].sort((a, b) => a.lng - b.lng));
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

export function buildNumberablePoints({ meters, layers, isolatedPoints, geojsonCache }) {
  const mainMeters = (meters || [])
    .filter((m) => m.is_main && m.latitude != null && m.longitude != null)
    .filter((m) => isMeterLayerVisible(m, layers))
    .map((m) => ({ id: `meter-${m.id}`, category: "main", lat: m.latitude, lng: m.longitude }));

  const ultrasonic = extractUltrasonicPoints(layers, meters, geojsonCache);

  const isolated = (isolatedPoints || [])
    .filter((ip) => ip.latitude != null && ip.longitude != null)
    .map((ip) => ({ id: `isolated-${ip.id}`, category: "isolated", lat: ip.latitude, lng: ip.longitude }));

  return assignPointNumbers([...mainMeters, ...ultrasonic, ...isolated]);
}
