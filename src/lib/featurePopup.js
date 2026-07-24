// Builds an HTML string for a Leaflet popup describing a GeoJSON feature.

function getFeatureCoords(feature) {
  const geom = feature.geometry;
  if (!geom) return null;
  const { type, coordinates } = geom;
  switch (type) {
    case "Point":
      return { lat: coordinates[1], lng: coordinates[0] };
    case "MultiPoint":
    case "LineString":
      return coordinates.length
        ? { lat: coordinates[0][1], lng: coordinates[0][0] }
        : null;
    case "MultiLineString":
    case "Polygon":
      return coordinates.length && coordinates[0].length
        ? { lat: coordinates[0][0][1], lng: coordinates[0][0][0] }
        : null;
    case "MultiPolygon":
      return coordinates.length && coordinates[0].length && coordinates[0][0].length
        ? { lat: coordinates[0][0][0][1], lng: coordinates[0][0][0][0] }
        : null;
    default:
      return null;
  }
}

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function calcLength(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversine(coords[i - 1], coords[i]);
  }
  return total;
}

function getFeatureZ(feature) {
  const g = feature.geometry;
  if (!g || !g.coordinates) return null;
  const c = g.coordinates;
  switch (g.type) {
    case "Point":
      return typeof c[2] === "number" ? c[2] : null;
    case "MultiPoint":
    case "LineString":
      return c.length && typeof c[0]?.[2] === "number" ? c[0][2] : null;
    case "MultiLineString":
    case "Polygon":
      return c.length && c[0].length && typeof c[0][0]?.[2] === "number" ? c[0][0][2] : null;
    default:
      return null;
  }
}

function getFeatureLength(feature) {
  const g = feature.geometry;
  if (!g) return null;
  if (g.type === "LineString") return calcLength(g.coordinates);
  if (g.type === "MultiLineString")
    return g.coordinates.reduce((s, c) => s + calcLength(c), 0);
  return null;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildFeaturePopup(feature, layer) {
  const props = feature.properties || {};
  const coords = getFeatureCoords(feature);
  const length = getFeatureLength(feature);
  const id = props.id ?? props.ID ?? props.Id ?? feature.id ?? null;

  const rows = [];

  if (layer?.category) rows.push(["Layer Type", escapeHtml(layer.category)]);
  if (id !== null) rows.push(["ID", escapeHtml(id)]);
  if (coords) {
    rows.push(["Latitude", coords.lat.toFixed(6)]);
    rows.push(["Longitude", coords.lng.toFixed(6)]);
  }

  // Prominently display altitude if the layer has altitude config
  const altField = layer?.altitude_field;
  const altUnit = layer?.altitude_unit || (altField && /ft|feet|foot/i.test(altField) ? "ft" : null);
  if (altField && altField !== "z" && props[altField] != null && props[altField] !== "") {
    const altVal = props[altField];
    const unitLabel = altUnit ? ` ${altUnit}` : "";
    rows.push(["Altitude", `${altVal}${unitLabel}`]);
  } else if (layer?.altitude_source === "z_coordinate" || altField === "z") {
    // Extract Z from geometry coordinates
    const z = getFeatureZ(feature);
    if (z !== null) rows.push(["Altitude", `${z}${altUnit ? ` ${altUnit}` : ""}`]);
  }

  if (length !== null) {
    const display =
      length >= 1000
        ? `${(length / 1000).toFixed(2)} km`
        : `${length.toFixed(1)} m`;
    rows.push(["Length", display]);
  }

  // Show other interesting properties (skip the altitude field — already shown above)
  const skipKeys = new Set(["id", "ID", "Id", altField].filter(Boolean));
  Object.keys(props).forEach((key) => {
    if (skipKeys.has(key)) return;
    const val = props[key];
    if (val === null || val === undefined || val === "") return;
    rows.push([escapeHtml(key), escapeHtml(val)]);
  });

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td class="popup-key">${k}</td><td class="popup-val">${v}</td></tr>`
    )
    .join("");

  return `<div class="feature-popup"><table>${rowsHtml}</table></div>`;
}