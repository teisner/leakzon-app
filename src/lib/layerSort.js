// Layer z-order helpers.
//
// Single source of truth: `sort_order`. Lower sort_order = higher up (top of
// the layers panel = top of the map). Dragging in the panel rewrites
// sort_order (see handleReorderLayers), so the panel order IS the z-order.
//
// These used to force data (meter) layers above all SHP layers, which silently
// overrode manual drag ordering — dragging an SHP layer above a meter layer had
// no visible effect, and the panel itself re-grouped after the drop. Ordering is
// now purely what the user arranged.
//
// DMA polygons are not part of this ordering: they always render beneath every
// layer, via a dedicated low-z-index Leaflet pane (see MapPanes in ProjectMap).

// Sort for map rendering: first in the array = bottom, later = on top.
// Descending sort_order so the lowest sort_order ends up last → on top.
export function mapRenderSort(a, b) {
  return (b.sort_order ?? 0) - (a.sort_order ?? 0);
}

// Sort for panel/legend display: first in the array = top of panel = top of map.
export function panelSort(a, b) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}
