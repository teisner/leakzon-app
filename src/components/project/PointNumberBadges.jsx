import React, { useEffect, useRef, useState } from "react";
import { Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { placeBadges } from "@/lib/pointBadgePlacement";

const ARROWHEAD_ID = "point-number-arrowhead";

function badgeIcon(number) {
  return L.divIcon({
    className: "point-number-badge",
    html: `<span class="point-number-badge-text">${number}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// A leader line from the (possibly nudged) badge back to the true point,
// with a real SVG arrowhead at the point end — added directly to the
// polyline's own <path> via a one-time <marker> def in its parent <svg>,
// since Leaflet/react-leaflet don't expose arrowheads as a path option.
function LeaderLine({ from, to }) {
  const pathRef = useRef(null);

  useEffect(() => {
    const layer = pathRef.current;
    const path = layer?.getElement ? layer.getElement() : layer?._path;
    const svg = path?.ownerSVGElement;
    if (!path || !svg) return;

    let defs = svg.querySelector("defs.point-number-arrow-defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      defs.setAttribute("class", "point-number-arrow-defs");
      svg.insertBefore(defs, svg.firstChild);
    }
    if (!defs.querySelector(`#${ARROWHEAD_ID}`)) {
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
      marker.setAttribute("id", ARROWHEAD_ID);
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "8");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "5");
      marker.setAttribute("markerHeight", "5");
      marker.setAttribute("orient", "auto");
      const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      arrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      arrowPath.setAttribute("fill", "#1e293b");
      marker.appendChild(arrowPath);
      defs.appendChild(marker);
    }
    path.setAttribute("marker-end", `url(#${ARROWHEAD_ID})`);
  }, [from, to]);

  return (
    <Polyline
      ref={pathRef}
      positions={[from, to]}
      pathOptions={{ color: "#1e293b", weight: 1.5, dashArray: "2,3", interactive: false }}
      interactive={false}
    />
  );
}

// Renders number badges for a pre-numbered point list (see
// buildNumberablePoints/assignPointNumbers in pointNumbering.js). Every
// badge is nudged off the true point (see pointBadgePlacement.js) so it
// never covers the marker/icon it labels, with a leader line + arrowhead
// pointing back at the true location.
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
          <LeaderLine from={p.labelLatLng} to={[p.lat, p.lng]} />
          <Marker position={p.labelLatLng} interactive={false} keyboard={false} icon={badgeIcon(p.number)} />
        </React.Fragment>
      ))}
    </>
  );
}
