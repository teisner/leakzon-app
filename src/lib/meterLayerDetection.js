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

// True for layers whose point features represent main/insertion/ultrasonic
// meters — i.e. layers that should also produce is_main=true rows in the
// `meter` table (so they show in the meter table, network inventory, DMA
// main-meter linking, and point numbering). Used when importing a shapefile/
// GeoJSON layer, which otherwise only creates a display layer with no meters.
export function isMainMeterLayerName(name, category) {
  return (
    /insertion|ultrasonic|main[\s_-]?meter/i.test(name || "") ||
    ["Main Meters", "Insertion Meters", "Ultrasonic Meters"].includes(category || "")
  );
}
