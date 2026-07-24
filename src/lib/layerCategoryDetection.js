// Auto-detects a layer category from a shapefile/filename.
// Returns a category string (e.g. "Valves", "Water Lines") or "" if unknown.

const CATEGORY_PATTERNS = [
  { category: "Valves", patterns: ["valve"] },
  { category: "Hydrant", patterns: ["hydrant", "fire.?hydr"] },
  { category: "Pump Stations", patterns: ["pump"] },
  { category: "Reservoir Water", patterns: ["reservoir", "tank"] },
  { category: "Water Tower", patterns: ["tower"] },
  // Main/Sub Meters — checked before Water Lines so "main_meter" doesn't match "main"
  { category: "Main Meters", patterns: ["main.?meter"] },
  { category: "Sub Meters", patterns: ["sub.?meter"] },
  { category: "Insertion Meters", patterns: ["insertion"] },
  // Water Lines — checked before "Meters" so "main" doesn't match "meter"
  { category: "Water Lines", patterns: ["main", "line", "pipe", "water.?line", "network", "conduct"] },
  { category: "Meters", patterns: ["meter", "connection", "service"] },
  { category: "Water Source", patterns: ["source", "well", "spring"] },
];

export function detectLayerCategory(filename) {
  const name = (filename || "").toLowerCase();
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    for (const p of patterns) {
      if (new RegExp(p, "i").test(name)) return category;
    }
  }
  return "";
}