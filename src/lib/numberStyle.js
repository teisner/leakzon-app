// Styling for point-number badges: a global size + color, plus optional
// per-point overrides (so the user can restyle selected numbers vs all).
// Persisted per project in localStorage so it survives reloads and shows the
// same in customer view.

export const NUMBER_COLORS = [
  "#1e293b", "#475569", "#ef4444", "#f97316",
  "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#06b6d4", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#ec4899", "#ffffff",
];

export const DEFAULT_NUMBER_STYLE = { size: 16, color: "#ef4444", overrides: {} };

// Previous default (dark slate). Saved styles still on this exact color — i.e.
// users who never explicitly picked a color — are migrated to the new red
// default so the "red with white text" default reaches them too.
const LEGACY_DEFAULT_COLOR = "#1e293b";

const key = (projectId) => `leakzon-number-style-${projectId}`;

export function loadNumberStyle(projectId) {
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return { ...DEFAULT_NUMBER_STYLE };
    const parsed = JSON.parse(raw);
    let color = parsed.color || DEFAULT_NUMBER_STYLE.color;
    if (!parsed.v && color === LEGACY_DEFAULT_COLOR) color = DEFAULT_NUMBER_STYLE.color;
    return {
      size: typeof parsed.size === "number" ? parsed.size : DEFAULT_NUMBER_STYLE.size,
      color,
      overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
    };
  } catch {
    return { ...DEFAULT_NUMBER_STYLE };
  }
}

export function saveNumberStyle(projectId, style) {
  try {
    // Stamp v:1 so the legacy-default → red migration only runs once.
    localStorage.setItem(key(projectId), JSON.stringify({ ...style, v: 1 }));
  } catch { /* ignore quota/serialization errors */ }
}

// Effective size/color for a given point id (per-point override wins).
export function effectiveStyle(style, id) {
  const ov = style?.overrides?.[id] || {};
  return {
    size: ov.size ?? style?.size ?? DEFAULT_NUMBER_STYLE.size,
    color: ov.color ?? style?.color ?? DEFAULT_NUMBER_STYLE.color,
  };
}

// Readable text color (dark or white) for a given background hex.
export function readableText(hex) {
  const c = String(hex || "").replace("#", "");
  if (c.length < 6) return "#ffffff";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 165 ? "#1e293b" : "#ffffff";
}

// Applies a style property ('size' | 'color') to either all badges (clearing
// that property's per-point overrides) or only the selected ids (as overrides).
export function applyStyleProp(style, prop, value, scope, selectedIds) {
  if (scope === "all") {
    const overrides = {};
    for (const [k, v] of Object.entries(style.overrides || {})) {
      const nv = { ...v };
      delete nv[prop];
      if (Object.keys(nv).length) overrides[k] = nv;
    }
    return { ...style, [prop]: value, overrides };
  }
  // selected scope
  if (!selectedIds || selectedIds.size === 0) return style;
  const overrides = { ...(style.overrides || {}) };
  selectedIds.forEach((id) => { overrides[id] = { ...overrides[id], [prop]: value }; });
  return { ...style, overrides };
}
