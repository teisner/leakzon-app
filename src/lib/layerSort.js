// Layer z-order helpers.
// Meter data layers always render on top of SHP layers by default.
// sort_order is respected within each type group, so manual reordering
// via the layers panel still works.

// Sort for map rendering: later in the array = rendered on top.
// Data layers come after SHP layers (on top). Within a type, lower
// sort_order renders later (on top), matching the panel order.
export function mapRenderSort(a, b) {
  const aData = a.layer_type === "data" ? 1 : 0;
  const bData = b.layer_type === "data" ? 1 : 0;
  if (aData !== bData) return aData - bData;
  return (b.sort_order ?? 0) - (a.sort_order ?? 0);
}

// Sort for panel/legend display: first in the array = top of panel = top of map.
// Data layers appear before SHP layers. Within a type, lower sort_order first.
export function panelSort(a, b) {
  const aData = a.layer_type === "data" ? 0 : 1;
  const bData = b.layer_type === "data" ? 0 : 1;
  if (aData !== bData) return aData - bData;
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}