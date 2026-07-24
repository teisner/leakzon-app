import React, { useEffect, useRef, useState } from "react";
import { Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { placeBadges } from "@/lib/pointBadgePlacement";
import { effectiveStyle, readableText, DEFAULT_NUMBER_STYLE } from "@/lib/numberStyle";

const ARROWHEAD_ID = "point-number-arrowhead";

function badgeIcon(number, size, color, selected) {
  const dim = Math.round(size + 6);
  const text = readableText(color);
  const ring = selected
    ? "box-shadow:0 0 0 2px #ffffff,0 0 0 4px #2563eb;"
    : "box-shadow:0 1px 3px rgba(0,0,0,0.45);";
  return L.divIcon({
    className: "point-number-badge",
    html:
      `<span style="display:inline-flex;align-items:center;justify-content:center;` +
      `transform:translate(-50%,-50%);min-width:${dim}px;height:${dim}px;padding:0 3px;` +
      `font-size:${Math.round(size * 0.72)}px;font-weight:700;color:${text};background:${color};` +
      `border:1.5px solid #ffffff;border-radius:999px;${ring}line-height:1;cursor:pointer;` +
      `pointer-events:auto;">${number}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// Leader line from the (nudged) badge back to the true point, with an SVG
// arrowhead at the point end. Line color follows the badge color.
function LeaderLine({ from, to, color }) {
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
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      p.setAttribute("fill", "#64748b");
      marker.appendChild(p);
      defs.appendChild(marker);
    }
    path.setAttribute("marker-end", `url(#${ARROWHEAD_ID})`);
  }, [from, to]);

  return (
    <Polyline
      ref={pathRef}
      positions={[from, to]}
      pathOptions={{ color, weight: 1.5, dashArray: "2,3", interactive: false }}
      interactive={false}
    />
  );
}

// Renders numbered badges (see buildNumberablePoints/assignPointNumbers).
// `style` is the { size, color, overrides } config; when `onToggleSelect` is
// provided the badges are clickable to select them (for restyling just those).
export default function PointNumberBadges({ points, style = DEFAULT_NUMBER_STYLE, selectedIds, onToggleSelect }) {
  const map = useMap();
  const [placed, setPlaced] = useState([]);
  const rafRef = useRef(null);

  const recompute = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const minSep = Math.max(20, (style?.size ?? 16) + 8);
      setPlaced(points.length ? placeBadges(map, points, { minSeparationPx: minSep }) : []);
    });
  };

  useMapEvents({ zoomend: recompute, moveend: recompute });

  useEffect(() => {
    recompute();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, map, style]);

  if (placed.length === 0) return null;

  const editable = typeof onToggleSelect === "function";

  return (
    <>
      {placed.map((p) => {
        const { size, color } = effectiveStyle(style, p.id);
        const selected = !!selectedIds && selectedIds.has(p.id);
        return (
          <React.Fragment key={`num-${p.id}`}>
            <LeaderLine from={p.labelLatLng} to={[p.lat, p.lng]} color={color} />
            <Marker
              position={p.labelLatLng}
              interactive={editable}
              keyboard={false}
              icon={badgeIcon(p.number, size, color, selected)}
              eventHandlers={editable ? { click: (e) => { L.DomEvent.stopPropagation(e); onToggleSelect(p.id); } } : undefined}
            />
          </React.Fragment>
        );
      })}
    </>
  );
}
