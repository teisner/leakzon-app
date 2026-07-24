import React, { useEffect, useRef, useState } from "react";
import { Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { placeBadges } from "@/lib/pointBadgePlacement";

function badgeIcon(number) {
  return L.divIcon({
    className: "point-number-badge",
    html: `<span class="point-number-badge-text">${number}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// Renders number badges for a pre-numbered point list (see
// buildNumberablePoints/assignPointNumbers in pointNumbering.js), nudging
// any that would visually collide to an offset position with a leader line
// back to the true point — never covering the original marker/icon.
export default function PointNumberBadges({ points }) {
  const map = useMap();
  const [placed, setPlaced] = useState([]);
  const rafRef = useRef(null);

  const recompute = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setPlaced(points.length ? placeBadges(map, points) : []);
    });
  };

  useMapEvents({
    zoomend: recompute,
    moveend: recompute,
  });

  useEffect(() => {
    recompute();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, map]);

  if (placed.length === 0) return null;

  return (
    <>
      {placed.map((p) => (
        <React.Fragment key={`num-${p.id}`}>
          {p.needsLeader && (
            <Polyline
              positions={[[p.lat, p.lng], p.labelLatLng]}
              pathOptions={{ color: "#1e293b", weight: 1.5, dashArray: "2,3", interactive: false }}
              interactive={false}
            />
          )}
          <Marker position={p.labelLatLng} interactive={false} keyboard={false} icon={badgeIcon(p.number)} />
        </React.Fragment>
      ))}
    </>
  );
}
