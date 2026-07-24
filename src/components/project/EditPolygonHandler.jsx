import React, { useState, useEffect } from "react";
import { Polygon, Marker } from "react-leaflet";
import L from "leaflet";

const vertexIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5);cursor:move"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const midpointIcon = L.divIcon({
  className: "",
  html: '<div style="width:10px;height:10px;border-radius:50%;background:white;border:2px solid #2563eb;opacity:0.8;cursor:pointer"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

// Editable polygon: drag vertices to move, click midpoint markers to insert new points.
export default function EditPolygonHandler({ points, onChange }) {
  const [localPoints, setLocalPoints] = useState(points);

  useEffect(() => {
    setLocalPoints(points);
  }, [points]);

  const midpoints = localPoints.map((p, i) => {
    const next = localPoints[(i + 1) % localPoints.length];
    return [(p[0] + next[0]) / 2, (p[1] + next[1]) / 2];
  });

  const updatePoint = (index, newPos) => {
    const updated = [...localPoints];
    updated[index] = newPos;
    setLocalPoints(updated);
    onChange(updated);
  };

  const insertPoint = (afterIndex) => {
    const updated = [...localPoints];
    updated.splice(afterIndex + 1, 0, midpoints[afterIndex]);
    setLocalPoints(updated);
    onChange(updated);
  };

  return (
    <>
      <Polygon
        positions={localPoints}
        pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.15, weight: 2 }}
      />
      {localPoints.map((p, i) => (
        <Marker
          key={`v-${i}`}
          position={p}
          icon={vertexIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const latlng = e.target.getLatLng();
              updatePoint(i, [latlng.lat, latlng.lng]);
            },
          }}
        />
      ))}
      {midpoints.map((mp, i) => (
        <Marker
          key={`m-${i}`}
          position={mp}
          icon={midpointIcon}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              insertPoint(i);
            },
          }}
        />
      ))}
    </>
  );
}