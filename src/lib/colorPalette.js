// The single color palette used everywhere layer/component styling is chosen:
// the project-layer settings (LayerColorPicker) and the dashboard component
// defaults (Settings). Includes white and black so shapes can be drawn light or
// dark — pair those with an outline color so they stay visible on any basemap.
export const PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#facc15", "#fde047", "#84cc16", "#a3e635",
  "#22c55e", "#4ade80", "#10b981", "#34d399",
  "#14b8a6", "#2dd4bf", "#06b6d4", "#22d3ee",
  "#0ea5e9", "#38bdf8", "#3b82f6", "#60a5fa",
  "#6366f1", "#818cf8", "#8b5cf6", "#a78bfa",
  "#a855f7", "#c084fc", "#d946ef", "#e879f9",
  "#ec4899", "#f472b6", "#6b7280", "#1f2937",
  "#ffffff", "#000000",
];

// Resolves the fill and stroke (outline) colors for a point layer.
//
// `layer.color` is the shape color; `point_config.stroke_color` is an optional
// separate outline color. When it isn't set the outline uses the shape color —
// which is exactly the old single-color behavior, so existing layers are
// unchanged. `fill_style: "outline"` keeps the shape hollow.
export function resolvePointColors(layer) {
  const shapeColor = layer?.color || "#2563eb";
  const pc = layer?.point_config || {};
  const stroke = pc.stroke_color || shapeColor;
  const fill = pc.fill_style === "outline" ? "transparent" : shapeColor;
  return { fill, stroke, shapeColor };
}
