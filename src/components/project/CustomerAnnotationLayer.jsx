import React from "react";
import { Polyline, Marker } from "react-leaflet";
import L from "leaflet";

function calculateBearing(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function createCommentIcon(color, text) {
  const display = text || "Comment";
  return L.divIcon({
    className: "cm-comment-marker",
    html: `
      <div style="position:relative; transform:translate(-50%, -100%); display:flex; flex-direction:column; align-items:center; cursor:pointer;">
        <div style="background:${color}; color:white; padding:4px 10px; border-radius:8px; font-size:11px; font-weight:600; max-width:220px; overflow:hidden; text-overflow:ellipsis; box-shadow:0 2px 6px rgba(0,0,0,0.5); white-space:nowrap;">${display}</div>
        <div style="width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-top:7px solid ${color}; margin-top:-1px;"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function createArrowIcon(color, width, bearing) {
  const size = Math.max(16, width * 4);
  const rotation = (bearing + 270) % 360;
  return L.divIcon({
    className: "cm-arrow-head",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" style="display:block; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4)); transform:rotate(${rotation}deg);"><path d="M2 2 L14 8 L2 14 L5 8 Z" fill="${color}" stroke="rgba(0,0,0,0.5)" stroke-width="0.5"/></svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function CustomerAnnotationLayer({ annotations }) {
  if (!annotations || annotations.length === 0) return null;

  const parsed = annotations
    .map((a) => {
      let data = {};
      try {
        data = typeof a.data === "string" ? JSON.parse(a.data) : a.data;
      } catch {
        return null;
      }
      return { ...a, parsed: data };
    })
    .filter(Boolean);

  return (
    <>
      {/* Comments */}
      {parsed
        .filter((a) => a.annotation_type === "comment")
        .map((a) => (
          <Marker
            key={`ca-c-${a.id}`}
            position={[a.parsed.lat, a.parsed.lng]}
            icon={createCommentIcon(a.parsed.color || "#ef4444", a.parsed.text)}
            interactive={true}
          />
        ))}

      {/* Arrows */}
      {parsed
        .filter((a) => a.annotation_type === "arrow")
        .map((a) => {
          const bearing = calculateBearing(
            a.parsed.start_lat, a.parsed.start_lng,
            a.parsed.end_lat, a.parsed.end_lng
          );
          return (
            <React.Fragment key={`ca-a-${a.id}`}>
              <Polyline
                positions={[[a.parsed.start_lat, a.parsed.start_lng], [a.parsed.end_lat, a.parsed.end_lng]]}
                pathOptions={{ color: a.parsed.color || "#ef4444", weight: a.parsed.width || 3, opacity: 0.9 }}
              />
              <Marker
                position={[a.parsed.end_lat, a.parsed.end_lng]}
                icon={createArrowIcon(a.parsed.color || "#ef4444", a.parsed.width || 3, bearing)}
                interactive={false}
              />
            </React.Fragment>
          );
        })}

      {/* Drawings */}
      {parsed
        .filter((a) => a.annotation_type === "drawing" && a.parsed.points?.length >= 2)
        .map((a) => (
          <Polyline
            key={`ca-d-${a.id}`}
            positions={a.parsed.points}
            pathOptions={{ color: a.parsed.color || "#ef4444", weight: a.parsed.width || 3, opacity: 0.9 }}
          />
        ))}
    </>
  );
}