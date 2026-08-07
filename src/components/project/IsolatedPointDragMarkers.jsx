import React from "react";
import { Marker } from "react-leaflet";
import L from "leaflet";

// Draggable overlay for isolated valve points, sized/colored to sit exactly
// over the same coordinate's GeoJSON-styled circle (see ProjectMap's
// `isFeatureIsolated` styling) so it reads as one marker, not two. Dragging
// is a delete gesture only — drop on the trash bin to remove the point,
// anywhere else snaps it back to its saved position.
function dragIcon(color) {
  return L.divIcon({
    className: "isolated-drag-marker",
    html: `<span class="isolated-drag-marker-dot" style="background:${color}"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// Whether the marker's current screen position overlaps the trash bin element
function overlapsBin(marker, binEl) {
  const el = marker?.getElement?.();
  if (!binEl || !el) return false;
  const b = binEl.getBoundingClientRect();
  const m = el.getBoundingClientRect();
  const cx = m.left + m.width / 2;
  const cy = m.top + m.height / 2;
  return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
}

export default function IsolatedPointDragMarkers({ isolatedPoints, dmas, onDelete, trashBinRef }) {
  const getColor = (ip) => ip.color || (dmas || []).find((d) => d.id === ip.dma1_id)?.color || "#92c141";

  return (
    <>
      {(isolatedPoints || [])
        .filter((ip) => ip.latitude != null && ip.longitude != null)
        .map((ip) => (
          <Marker
            key={ip.id}
            position={[ip.latitude, ip.longitude]}
            icon={dragIcon(getColor(ip))}
            draggable
            eventHandlers={{
              dragstart: () => {
                trashBinRef?.current?.classList.add("trash-bin-dropzone--armed");
              },
              drag: (e) => {
                const hover = overlapsBin(e.target, trashBinRef?.current);
                trashBinRef?.current?.classList.toggle("trash-bin-dropzone--hover", hover);
              },
              dragend: (e) => {
                trashBinRef?.current?.classList.remove("trash-bin-dropzone--armed", "trash-bin-dropzone--hover");
                if (overlapsBin(e.target, trashBinRef?.current)) {
                  onDelete?.(ip.id);
                } else {
                  // Not a reposition gesture — snap back to the saved point.
                  e.target.setLatLng([ip.latitude, ip.longitude]);
                }
              },
            }}
          />
        ))}
    </>
  );
}
