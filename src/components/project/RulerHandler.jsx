import React, { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

// Haversine distance in meters between two [lat,lng] points
function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters, distanceUnit) {
  if (distanceUnit === "Miles") {
    const feet = meters * 3.28084;
    if (feet < 1000) return `${Math.round(feet)} ft`;
    if (feet < 5280) return `${(feet / 3).toFixed(0)} yd`;
    return `${(feet / 5280).toFixed(2)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export default function RulerHandler({ active, points, setPoints, onDistanceChange, distanceUnit }) {
  const map = useMap();
  const layerRef = useRef(null);
  const markersRef = useRef([]);
  const labelsRef = useRef([]);

  // Rebuild visual layers whenever points change
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.remove();
      layerRef.current = null;
    }
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    labelsRef.current.forEach((m) => m.remove());
    labelsRef.current = [];

    if (points.length === 0) {
      onDistanceChange?.(0);
      return;
    }

    // Polyline connecting all points
    if (points.length >= 2) {
      layerRef.current = L.polyline(points, {
        color: "#2563eb",
        weight: 3,
        dashArray: "6,4",
      }).addTo(map);
    }

    // Vertex markers
    points.forEach((p) => {
      const m = L.circleMarker(p, {
        radius: 5,
        color: "#2563eb",
        weight: 2,
        fillColor: "#ffffff",
        fillOpacity: 1,
      }).addTo(map);
      markersRef.current.push(m);
    });

    // Cumulative distance labels at each vertex
    let cumulative = 0;
    points.forEach((p, i) => {
      if (i > 0) cumulative += haversine(points[i - 1], p);
      const label = L.marker(p, {
        icon: L.divIcon({
          className: "ruler-label",
          html: `<div style="background:#1e293b;color:#fff;font-size:11px;font-weight:600;padding:2px 6px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);transform:translateY(-18px);">${formatDistance(cumulative, distanceUnit)}</div>`,
          iconSize: [0, 0],
        }),
        interactive: false,
      }).addTo(map);
      labelsRef.current.push(label);
    });

    onDistanceChange?.(cumulative);
  }, [points, distanceUnit]);

  // Handle map clicks while ruler is active
  useEffect(() => {
    if (!active) return;

    const onClick = (e) => {
      setPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
    };

    const onMouseMove = (e) => {
      if (points.length === 0) return;
      // Live preview line from last point to cursor
      if (layerRef.current && points.length >= 2) {
        // keep the committed polyline; preview is a separate temp layer
      }
      let preview = map._rulerPreview;
      if (!preview) {
        preview = L.polyline([], {
          color: "#2563eb",
          weight: 2,
          opacity: 0.5,
          dashArray: "4,4",
        }).addTo(map);
        map._rulerPreview = preview;
      }
      preview.setLatLngs([points[points.length - 1], [e.latlng.lat, e.latlng.lng]]);
    };

    map.getContainer().style.cursor = "crosshair";
    map.on("click", onClick);
    map.on("mousemove", onMouseMove);

    return () => {
      map.getContainer().style.cursor = "";
      map.off("click", onClick);
      map.off("mousemove", onMouseMove);
      if (map._rulerPreview) {
        map._rulerPreview.remove();
        map._rulerPreview = null;
      }
    };
  }, [active, points]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (layerRef.current) layerRef.current.remove();
      markersRef.current.forEach((m) => m.remove());
      labelsRef.current.forEach((m) => m.remove());
      if (map._rulerPreview) {
        map._rulerPreview.remove();
        map._rulerPreview = null;
      }
    };
  }, []);

  return null;
}