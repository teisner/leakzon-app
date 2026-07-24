import React from "react";
import { Marker } from "react-leaflet";
import L from "leaflet";

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

function extractMidpoints(geometry) {
  const points = [];
  const type = geometry?.type;
  if (!type) return points;
  if (type === "LineString") {
    const c = geometry.coordinates || [];
    if (c.length >= 2) points.push(lineMidpoint(c));
  } else if (type === "MultiLineString") {
    for (const line of geometry.coordinates || []) {
      if (line.length >= 2) points.push(lineMidpoint(line));
    }
  }
  return points;
}

export default function PipeDiameterLabels({ data, pipeConfig }) {
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
    const label = diam?.label || (isNaN(parseFloat(rawVal)) ? String(rawVal) : `${rawVal}mm`);
    const mids = extractMidpoints(f.geometry);
    mids.forEach((mid, mi) => {
      const [lng, lat] = mid;
      markers.push(
        <Marker
          key={`dlbl-${fi}-${mi}`}
          position={[lat, lng]}
          interactive={false}
          keyboard={false}
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