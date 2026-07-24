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
