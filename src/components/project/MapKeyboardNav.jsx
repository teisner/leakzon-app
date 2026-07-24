import React, { useEffect } from "react";
import { useMap } from "react-leaflet";

// Enables keyboard navigation on any Leaflet map:
//   + / =  → zoom in
//   - / _   → zoom out
//   arrows  → pan
// Listens at window level so it works even when the map container
// doesn't have focus. Ignores keypresses inside inputs, textareas,
// selects, and contentEditable elements.
export default function MapKeyboardNav() {
  const map = useMap();

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.target?.isContentEditable) return;

      const key = e.key;
      if (key === "+" || key === "=") {
        e.preventDefault();
        map.zoomIn();
      } else if (key === "-" || key === "_") {
        e.preventDefault();
        map.zoomOut();
      } else if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
        e.preventDefault();
        const center = map.getCenter();
        const offsetLat = 0.004;
        const offsetLng = 0.004;
        let lat = center.lat;
        let lng = center.lng;
        if (key === "ArrowUp") lat += offsetLat;
        if (key === "ArrowDown") lat -= offsetLat;
        if (key === "ArrowLeft") lng -= offsetLng;
        if (key === "ArrowRight") lng += offsetLng;
        map.panTo([lat, lng], { animate: true });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [map]);

  return null;
}