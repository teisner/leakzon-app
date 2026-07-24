import React, { useEffect } from "react";
import { useMap, Polygon, Polyline, CircleMarker } from "react-leaflet";

// Handles click-to-add-point polygon drawing inside MapContainer.
// Renders a live preview (dashed polygon + vertex markers + mouse-follow line).
export default function DrawPolygonHandler({ active, points, setPoints, mousePos, setMousePos }) {
  const map = useMap();

  useEffect(() => {
    if (!active) {
      setPoints([]);
      setMousePos(null);
      return;
    }

    const onClick = (e) => {
      setPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
    };
    const onMouseMove = (e) => {
      setMousePos([e.latlng.lat, e.latlng.lng]);
    };

    map.on("click", onClick);
    map.on("mousemove", onMouseMove);
    map.getContainer().style.cursor = "crosshair";

    return () => {
      map.off("click", onClick);
      map.off("mousemove", onMouseMove);
      map.getContainer().style.cursor = "";
    };
  }, [active, map, setPoints, setMousePos]);

  if (!active) return null;

  const previewPoints =
    points.length > 0 && mousePos ? [...points, mousePos] : points;

  return (
    <>
      {previewPoints.length >= 3 && (
        <Polygon
          positions={previewPoints}
          pathOptions={{
            color: "#2563eb",
            fillColor: "#3b82f6",
            fillOpacity: 0.1,
            weight: 2,
            dashArray: "5,5",
          }}
        />
      )}
      {previewPoints.length >= 2 && previewPoints.length < 3 && (
        <Polyline
          positions={previewPoints}
          pathOptions={{ color: "#2563eb", weight: 2, dashArray: "5,5" }}
        />
      )}
      {points.map((p, i) => (
        <CircleMarker
          key={i}
          center={p}
          radius={5}
          pathOptions={{
            color: "#2563eb",
            fillColor: "#2563eb",
            fillOpacity: 1,
          }}
        />
      ))}
    </>
  );
}