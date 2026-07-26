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
  // An explicit "meter" in the name wins over the pipe words below, so
  // "Water_Mains_Meters" isn't read as a Water Lines layer.
  { category: "Meters", patterns: ["meter"] },
  { category: "Water Lines", patterns: ["main", "line", "pipe", "water.?line", "network", "conduct"] },
  // Weaker meter synonyms — after Water Lines, since "service line" and
  // "connection main" are pipes, not meters.
  { category: "Meters", patterns: ["connection", "service"] },
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