import React, { useState, useEffect, useRef } from "react";
import { useMap, Polyline, CircleMarker, Marker } from "react-leaflet";
import L from "leaflet";

// Initial compass bearing (degrees, 0-360) from point 1 → point 2, using true lat/lng
function bearing(lat1, lng1, lat2, lng2) {
  const toRad = Math.PI / 180;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  const Δλ = (lng2 - lng1) * toRad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360;
}

export default function ManualLineHandler({ active, paused, currentPoints, setCurrentPoints, lines, color, onFinishLine }) {
  const map = useMap();
  const [mousePos, setMousePos] = useState(null);
  const currentPointsRef = useRef(currentPoints);

  useEffect(() => {
    currentPointsRef.current = currentPoints;
  }, [currentPoints]);

  useEffect(() => {
    if (!active) return;
    map.getContainer().style.cursor = "crosshair";

    const handleClick = (e) => {
      if (paused) return;
      const target = e.originalEvent?.target;
      if (target && (target.closest(".leaflet-popup") || target.closest(".leaflet-marker-icon"))) {
        return;
      }
      setCurrentPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
    };

    const handleMouseMove = (e) => {
      if (paused) return;
      setMousePos([e.latlng.lat, e.latlng.lng]);
    };

    const handleKeyDown = (e) => {
      if (paused) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Enter") {
        e.preventDefault();
        const pts = currentPointsRef.current;
        if (pts.length >= 2) {
          onFinishLine?.(pts);
        }
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        setCurrentPoints((prev) => prev.slice(0, -1));
      }
    };

    map.on("click", handleClick);
    map.on("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      map.off("click", handleClick);
      map.off("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
      map.getContainer().style.cursor = "";
    };
  }, [active, paused, map, setCurrentPoints, onFinishLine]);

  if (!active) return null;

  const previewLine = currentPoints.length > 0 && mousePos
    ? [...currentPoints, mousePos]
    : null;

  // Live angle label for the segment from the last placed point → mouse cursor
  let angleLabel = null;
  if (currentPoints.length > 0 && mousePos) {
    const last = currentPoints[currentPoints.length - 1];
    const angle = Math.round(bearing(last[0], last[1], mousePos[0], mousePos[1]));
    const midLat = (last[0] + mousePos[0]) / 2;
    const midLng = (last[1] + mousePos[1]) / 2;
    angleLabel = (
      <Marker
        position={[midLat, midLng]}
        interactive={false}
        keyboard={false}
        icon={L.divIcon({
          className: "line-angle-label",
          html: `<span class="line-angle-label-text">${angle}°</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        })}
      />
    );
  }

  return (
    <>
      {lines.map((line, idx) => (
        <Polyline
          key={`committed-${idx}`}
          positions={line.points}
          pathOptions={{ color, weight: 4, opacity: 0.8 }}
        />
      ))}
      {currentPoints.length > 1 && (
        <Polyline
          positions={currentPoints}
          pathOptions={{ color, weight: 4, opacity: 0.9 }}
        />
      )}
      {previewLine && (
        <Polyline
          positions={previewLine}
          pathOptions={{ color, weight: 2, opacity: 0.5, dashArray: "6,4" }}
        />
      )}
      {currentPoints.map((pt, idx) => (
        <CircleMarker
          key={`vertex-${idx}`}
          center={pt}
          pathOptions={{ color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }}
          radius={4}
        />
      ))}
      {angleLabel}
    </>
  );
}