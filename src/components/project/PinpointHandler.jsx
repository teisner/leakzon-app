import React, { useEffect } from "react";
import { useMap, Marker } from "react-leaflet";
import L from "leaflet";

// When active, captures a single map click and calls onPlaced(lat, lng).
// Renders a marker at the captured position if `coords` is provided.
export default function PinpointHandler({ active, coords, onPlaced }) {
  const map = useMap();

  useEffect(() => {
    if (!active) return;
    map.getContainer().style.cursor = "crosshair";

    const handleClick = (e) => {
      onPlaced?.(e.latlng.lat, e.latlng.lng);
    };

    map.on("click", handleClick);
    return () => {
      map.getContainer().style.cursor = "";
      map.off("click", handleClick);
    };
  }, [active, map, onPlaced]);

  if (!coords) return null;
  const [lat, lng] = coords;

  const icon = L.divIcon({
    className: "pinpoint-marker",
    html: `<div style="width:24px;height:24px;border-radius:50% 50% 50% 0;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;"><div style="width:6px;height:6px;border-radius:50%;background:#fff;transform:rotate(45deg);"></div></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  });

  return <Marker position={[lat, lng]} icon={icon} />;
}