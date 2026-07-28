// 3-tier color scheme: brown = thickest, orange = mid, blue = thinnest
const PIPE_COLOR_TIERS = ["#1d4ed8", "#ea580c", "#92400e"]; // blue (thinnest), orange (mid), brown (thickest)

const DIAMETER_FIELD_RE = /diameter|dn|dia|size|pipe_?size/i;

export function detectDiameterField(properties) {
  if (!properties || properties.length === 0) return null;
  return properties.find((p) => DIAMETER_FIELD_RE.test(p)) || null;
}

export function isPipeLayer(layer) {
  const hasLine = layer.geometry_types?.some(
    (t) => t === "LineString" || t === "MultiLineString"
  );
  if (!hasLine) return false;
  return !!detectDiameterField(layer.properties);
}

function normalizeFeatures(geojson) {
  if (Array.isArray(geojson.features)) return geojson.features;
  if (geojson.type === "Feature") return [geojson];
  if (geojson.type && geojson.coordinates)
    return [{ type: "Feature", geometry: geojson, properties: {} }];
  return [];
}

export function extractDiameters(geojson, field) {
  const values = new Set();
  normalizeFeatures(geojson).forEach((f) => {
    const val = f.properties?.[field];
    if (val !== null && val !== undefined && val !== "")
      values.add(String(val));
  });
  const arr = [...values];
  arr.sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  return arr;
}

export function countDiameters(geojson, field) {
  const counts = {};
  normalizeFeatures(geojson).forEach((f) => {
    const val = f.properties?.[field];
    if (val !== null && val !== undefined && val !== "") {
      const key = String(val);
      counts[key] = (counts[key] || 0) + 1;
    }
  });
  return counts;
}

export function buildPipeConfig(geojson, field) {
  const diameters = extractDiameters(geojson, field);
  const counts = countDiameters(geojson, field);
  const total = diameters.length;
  return {
    diameter_field: field,
    diameters: diameters.map((value, idx) => {
      const na = parseFloat(value);
      // Assign 3-tier color: blue (thinnest), orange (mid), brown (thickest)
      let color;
      if (total <= 1) {
        color = PIPE_COLOR_TIERS[0];
      } else if (total === 2) {
        color = idx === 0 ? PIPE_COLOR_TIERS[0] : PIPE_COLOR_TIERS[2];
      } else {
        const tier = Math.min(Math.floor((idx / total) * 3), 2);
        color = PIPE_COLOR_TIERS[tier];
      }
      // Weight scales with thickness: thinnest=3, thickest=8
      const weight = total <= 1 ? 5 : Math.round(3 + (idx / (total - 1)) * 5);
      return {
        value,
        label: isNaN(na) ? value : `${value}mm`,
        color,
        weight,
        visible: true,
        count: counts[value] || 0,
      };
    }),
  };
}

export function ensureDiameterCounts(geojson, pipeConfig) {
  if (!pipeConfig || !pipeConfig.diameter_field) return pipeConfig;
  if (pipeConfig.diameters?.every((d) => d.count !== undefined)) return pipeConfig;
  const counts = countDiameters(geojson, pipeConfig.diameter_field);
  return {
    ...pipeConfig,
    diameters: pipeConfig.diameters.map((d) => ({
      ...d,
      count: counts[d.value] || 0,
    })),
  };
}

export function getPipeStyle(feature, pipeConfig) {
  if (!pipeConfig || !pipeConfig.diameter_field) return null;
  const val = feature.properties?.[pipeConfig.diameter_field];
  const diam = pipeConfig.diameters.find(
    (d) => String(d.value) === String(val)
  );
  if (!diam) return { color: "#94a3b8", weight: 2, opacity: 0.4 };
  if (!diam.visible) return { opacity: 0, fillOpacity: 0, weight: 0 };
  return { color: diam.color, weight: diam.weight, opacity: 1 };
}

export { PIPE_COLOR_TIERS as PIPE_COLOR_PALETTE };
// A pipe diameter is stored exactly as the source file wrote it, and different
// utilities write it differently: a metric project carries plain millimetres
// ("110", "225") while a US project carries inches already marked up ("12\"",
// "6\""). The label was hardcoded to append "mm", which produced "12\"mm" on an
// imperial project and simply the wrong unit on any of them.
//
// So: never convert — the number is whatever the utility surveyed. Only supply
// the unit, and only when the value doesn't already carry one.
const HAS_UNIT_RE = /["'′″”]|mm|inch|\bin\b|מ"מ/i;

export function diameterUnit(distanceUnit) {
  // Project unit is a distance setting (Miles vs Km); imperial projects quote
  // pipe bores in inches.
  return distanceUnit === "Miles" ? '"' : "mm";
}

export function formatDiameter(value, distanceUnit) {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) return "";
  if (HAS_UNIT_RE.test(raw)) return raw;      // already says what it is
  if (isNaN(parseFloat(raw))) return raw;     // free text like "unknown"
  return `${raw}${diameterUnit(distanceUnit)}`;
}
