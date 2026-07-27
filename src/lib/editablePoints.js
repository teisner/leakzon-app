// Which layers can have their points dragged around on the map.
//
// This started as manual-layers-only (layer.is_manual). Imported point layers —
// valves above all — need the same thing: a surveyed valve is often a few metres
// off, and correcting it by hand is the whole point of reviewing the network.
//
// Line layers are excluded: the editor rebuilds a line layer's features from
// drawn segments and keeps only `diameter`, so putting an imported pipe layer
// through it would discard its other attributes. Points round-trip losslessly
// (see the `_props` handling in ProjectMap's loader and handleSaveManualLayer).
export function isPointEditableLayer(layer) {
  if (!layer) return false;
  if (layer.is_manual) return true;
  // Boundary layers have their own dedicated editor.
  if (/boundary/i.test(layer.name || "")) return false;
  const types = layer.geometry_types || [];
  const isPointOnly =
    types.length > 0 && types.every((t) => t === "Point" || t === "MultiPoint");
  return isPointOnly && !!layer.file_url;
}

// Turns an edited point back into a GeoJSON feature. Original attributes are
// spread first so an imported layer keeps every column it arrived with — only
// the coordinates changed. Hand-placed points carry no `_props` and fall back
// to the named fields.
export function pointToFeature(p) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    properties: {
      ...(p._props || {}),
      name: p.name || p._props?.name || "Unnamed",
      id: p.id,
      endpoint_id: p.endpoint_id || p._props?.endpoint_id || "",
      account_name: p.account_name || p._props?.account_name || "",
      address: p.address || p._props?.address || "",
      location_source: "manual",
    },
  };
}
