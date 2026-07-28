import React from "react";
import { SHAPE_PATHS } from "@/lib/shapeIcons";
import { resolvePointColors } from "@/lib/colorPalette";

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