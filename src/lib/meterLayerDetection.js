// A project_layer's `category` is computed at fetch time by joining to the
// layer_type lookup table (see ProjectDetail.jsx's loadLayers), but manual
// layers (created via the "Create Manual Layer" flow) never get a
// layer_type_id set — so category is always null for them, regardless of
// what the layer is actually named ("Insertion Meters", "Ultrasonic Meter").
// Detect meter-backed manual layers from the name instead, matching the
// real layer names in use.
export function isMeterManualLayer(layer) {
  return /insertion|ultrasonic/i.test(layer?.name || "");
}

// Narrower check for logic specific to insertion meters docking into a water
// line (e.g. nearest-pipe-diameter lookup) — deliberately excludes
// Ultrasonic Meter layers rather than assuming the same behavior applies.
export function isInsertionManualLayer(layer) {
  return /insertion/i.test(layer?.name || "");
}

// Categories whose layers carry meters, split by whether those meters are
// mains (is_main=true — network inventory, DMA main-meter linking) or
// customer/sub meters (is_main=false).
const MAIN_METER_CATEGORIES = ["Main Meters", "Insertion Meters", "Ultrasonic Meters"];
// "Meters" is retired (too easily confused with "Main Meters" / "Sub Meters")
// and is no longer offered in the category picker, but layers already saved
// under it must keep behaving as sub meters.
const SUB_METER_CATEGORIES = ["Sub Meters", "Meters"];
// Categories that are definitely not meters, so a stray "meter" in the layer
// name (e.g. "meter_valves") doesn't get misread as a meter layer.
const NON_METER_CATEGORIES = [
  "Water Lines", "Valves", "Hydrant", "Water Tower",
  "Pump Stations", "Reservoir Water", "Water Source",
];

// Classifies a layer's point features as meters: "main", "sub", or null for
// "not a meter layer". Layers that come back "main"/"sub" must also produce
// rows in the `meter` table when imported — otherwise they exist only as a
// display layer and the points are missing from the meter table, network
// inventory, DMA linking and point numbering.
export function meterLayerKind(name, category) {
  const n = name || "";
  const c = category || "";
  if (/insertion|ultrasonic|main[\s_-]?meter/i.test(n) || MAIN_METER_CATEGORIES.includes(c)) {
    return "main";
  }
  if (NON_METER_CATEGORIES.includes(c)) return null;
  // A generic "meter"/"connection"/"service" name (or an explicit sub-meter
  // category) means customer meters — the common case for a big meters
  // shapefile that landed under a category like "Other".
  if (SUB_METER_CATEGORIES.includes(c) || /meter|connection|service/i.test(n)) return "sub";
  return null;
}
