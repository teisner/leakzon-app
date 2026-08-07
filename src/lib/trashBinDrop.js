// Shared drag-to-delete helpers for map markers dropped onto a trash-bin
// drop zone (see IsolatedPointDragMarkers and ManualPointHandler).

// Whether a Leaflet marker's current screen position overlaps the bin element.
export function overlapsTrashBin(marker, binEl) {
  const el = marker?.getElement?.();
  if (!binEl || !el) return false;
  const b = binEl.getBoundingClientRect();
  const m = el.getBoundingClientRect();
  const cx = m.left + m.width / 2;
  const cy = m.top + m.height / 2;
  return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
}

export function armTrashBin(binRef) {
  binRef?.current?.classList.add("trash-bin-dropzone--armed");
}

export function disarmTrashBin(binRef) {
  binRef?.current?.classList.remove("trash-bin-dropzone--armed", "trash-bin-dropzone--hover");
}

export function setTrashBinHover(binRef, hover) {
  binRef?.current?.classList.toggle("trash-bin-dropzone--hover", hover);
}
