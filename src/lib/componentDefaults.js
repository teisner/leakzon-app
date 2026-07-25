// Default point shape / size / color per component type, set from the
// dashboard Settings and applied to new layers when they're created (import
// or manual). Persisted in localStorage (per browser).

// Component keys are the layer `category` values the app already uses; the
// label is what's shown in Settings.
export const COMPONENTS = [
  { key: "Main Meters", label: "Main" },
  { key: "Sub Meters", label: "Sub Main" },
  { key: "Insertion Meters", label: "Insertion Meters" },
  { key: "Ultrasonic Meters", label: "Ultrasonic Meter" },
  { key: "Valves", label: "Valves" },
];

export const SHAPE_CHOICES = ["circle", "star", "square", "triangle"];

export const DEFAULT_COMPONENT_STYLES = {
  "Main Meters": { shape: "star", size: 12, color: "#1f2937", fill_style: "filled" },
  "Sub Meters": { shape: "circle", size: 6, color: "#2563eb", fill_style: "filled" },
  "Insertion Meters": { shape: "star", size: 12, color: "#111827", fill_style: "filled" },
  "Ultrasonic Meters": { shape: "triangle", size: 10, color: "#0ea5e9", fill_style: "filled" },
  "Valves": { shape: "square", size: 7, color: "#f59e0b", fill_style: "filled" },
};

const KEY = "leakzon-component-defaults";

export function loadComponentDefaults() {
  const merged = {};
  for (const { key } of COMPONENTS) merged[key] = { ...DEFAULT_COMPONENT_STYLES[key] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      for (const { key } of COMPONENTS) {
        if (saved[key] && typeof saved[key] === "object") merged[key] = { ...merged[key], ...saved[key] };
      }
    }
  } catch { /* fall back to defaults */ }
  return merged;
}

export function saveComponentDefaults(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch { /* ignore */ }
}

// Resolve which component a layer is, from its category and/or name.
export function matchComponentKey(name, category) {
  const keys = COMPONENTS.map((c) => c.key);
  if (category && keys.includes(category)) return category;
  const n = (name || "").toLowerCase();
  if (/insertion/.test(n)) return "Insertion Meters";
  if (/ultrasonic/.test(n)) return "Ultrasonic Meters";
  if (/sub[\s_-]?(main|meter)/.test(n)) return "Sub Meters";
  if (/main[\s_-]?meter/.test(n)) return "Main Meters";
  if (/valve/.test(n)) return "Valves";
  return null;
}

// point_config object for a matched component, or null if not a tracked type.
export function componentPointConfig(name, category) {
  const key = matchComponentKey(name, category);
  if (!key) return null;
  const s = loadComponentDefaults()[key];
  return { shape: s.shape, radius: s.size, fill_style: s.fill_style };
}

// Default color for a matched component, or null.
export function componentColor(name, category) {
  const key = matchComponentKey(name, category);
  if (!key) return null;
  return loadComponentDefaults()[key].color;
}
