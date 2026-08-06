import React, { useEffect, useRef, useState } from "react";
import { Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { formatDiameter } from "@/lib/pipeStyling";

// Interpolated midpoint at 50% of total line length (GeoJSON [lng,lat] coords)
function lineMidpoint(coords) {
  if (coords.length === 1) return coords[0];
  let total = 0;
  const segs = [];
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = coords[i - 1];
    const [x2, y2] = coords[i];
    const d = Math.hypot(x2 - x1, y2 - y1);
    segs.push(d);
    total += d;
  }
  if (total === 0) return coords[0];
  const target = total / 2;
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = coords[i - 1];
    const [x2, y2] = coords[i];
    const d = segs[i - 1];
    if (acc + d >= target) {
      const t = d > 0 ? (target - acc) / d : 0;
      return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    }
    acc += d;
  }
  return coords[Math.floor(coords.length / 2)];
}

// Liang-Barsky clip of segment (x0,y0)-(x1,y1) against an axis-aligned box.
// Returns the clipped sub-segment, or null if it doesn't touch the box.
function clipSegment(x0, y0, x1, y1, xmin, xmax, ymin, ymax) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - xmin, xmax - x0, y0 - ymin, ymax - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

// Midpoint of the portion of the line that currently falls inside `bounds`,
// so a label is visible wherever the user has zoomed in on a long pipe run —
// not just at the line's own global midpoint, which can sit far outside the
// current view. Falls back to null when none of the line is in view.
function visibleMidpoint(coords, bounds) {
  if (coords.length < 2) return null;
  const xmin = bounds.getWest(), xmax = bounds.getEast();
  const ymin = bounds.getSouth(), ymax = bounds.getNorth();
  const pieces = []; // flattened [x0,y0,x1,y1] clipped segments, in line order
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    const clipped = clipSegment(x0, y0, x1, y1, xmin, xmax, ymin, ymax);
    if (clipped) pieces.push(clipped);
  }
  if (pieces.length === 0) return null;
  let total = 0;
  const lens = pieces.map(([x0, y0, x1, y1]) => {
    const d = Math.hypot(x1 - x0, y1 - y0);
    total += d;
    return d;
  });
  if (total === 0) return pieces[0].slice(0, 2);
  const target = total / 2;
  let acc = 0;
  for (let i = 0; i < pieces.length; i++) {
    const [x0, y0, x1, y1] = pieces[i];
    const d = lens[i];
    if (acc + d >= target) {
      const t = d > 0 ? (target - acc) / d : 0;
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
    acc += d;
  }
  const last = pieces[pieces.length - 1];
  return [last[2], last[3]];
}

function extractLines(geometry) {
  const type = geometry?.type;
  if (!type) return [];
  if (type === "LineString") return [geometry.coordinates || []];
  if (type === "MultiLineString") return geometry.coordinates || [];
  return [];
}

export default function PipeDiameterLabels({ data, pipeConfig, pane, distanceUnit }) {
  const map = useMap();
  const [bounds, setBounds] = useState(() => map.getBounds());
  const rafRef = useRef(null);

  const recompute = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setBounds(map.getBounds()));
  };

  useMapEvents({ zoomend: recompute, moveend: recompute });
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  if (!data || !pipeConfig?.diameter_field) return null;
  const field = pipeConfig.diameter_field;
  const diameters = pipeConfig.diameters || [];
  const features = data.features || (data.type === "Feature" ? [data] : []);

  const markers = [];
  features.forEach((f, fi) => {
    const rawVal = f.properties?.[field];
    if (rawVal === null || rawVal === undefined || rawVal === "") return;
    const diam = diameters.find((d) => String(d.value) === String(rawVal));
    // Skip hidden diameters in per-diameter mode
    if (!pipeConfig.uniform && diam && !diam.visible) return;
    // Formatted from the raw value rather than diam.label: the stored label was
    // written as "<value>mm" when the layer was imported, so it is wrong on any
    // imperial project and cannot be corrected without re-importing.
    const label = formatDiameter(rawVal, distanceUnit);
    const lines = extractLines(f.geometry);
    lines.forEach((coords, li) => {
      const mid = visibleMidpoint(coords, bounds) || lineMidpoint(coords);
      if (!mid) return;
      const [lng, lat] = mid;
      markers.push(
        <Marker
          key={`dlbl-${fi}-${li}`}
          position={[lat, lng]}
          interactive={false}
          keyboard={false}
          {...(pane ? { pane } : {})}
          icon={L.divIcon({
            className: "pipe-diameter-label",
            html: `<span class="pipe-diameter-label-text">${label}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          })}
        />
      );
    });
  });

  return markers.length > 0 ? <>{markers}</> : null;
}