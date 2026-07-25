import React from "react";
import { resolvePointColors } from "@/lib/colorPalette";

const SHAPE_PATHS = {
  star: "M12 2 L14.9 8.6 L22 9.3 L16.5 14.1 L18.2 21 L12 17.3 L5.8 21 L7.5 14.1 L2 9.3 L9.1 8.6 Z",
  square: "M4 4 H20 V20 H4 Z",
  triangle: "M12 3 L21 20 H3 Z",
};

export default function LayerShapeIcon({ layer, size = 16 }) {
  const config = layer.point_config || {};
  const shape = config.shape || "circle";
  const isOutline = config.fill_style === "outline";
  // fill = shape color (or hollow), stroke = optional separate outline color
  const { fill, stroke } = resolvePointColors({ ...layer, color: layer.color || "#64748b" });
  const color = stroke;

  if (shape === "circle") {
    return (
      <span
        className="shrink-0 inline-block rounded-full"
        style={{
          width: size,
          height: size,
          backgroundColor: fill,
          border: isOutline ? `2px solid ${color}` : "none",
        }}
      />
    );
  }

  const path = SHAPE_PATHS[shape];
  if (!path) {
    return (
      <span
        className="shrink-0 inline-block rounded-full"
        style={{ width: size, height: size, backgroundColor: color }}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0"
      style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.2))" }}
    >
      <path
        d={path}
        fill={fill}
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}