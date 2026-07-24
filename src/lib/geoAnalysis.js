// Analyzes a parsed GeoJSON object and returns high-level summary info.
// Also handles reprojection from EPSG:3857 (Web Mercator) to EPSG:4326 (WGS84)
// so that Leaflet (which expects WGS84 lat/lng) can render the data correctly.

const WEB_MERCATOR_RADIUS = 20037508.34;

/**
 * Detects the CRS from a GeoJSON object.
 * Returns the EPSG code as a number, or 4326 if unspecified (GeoJSON default).
 */
function detectCRS(geojson) {
  const crsName = geojson?.crs?.properties?.name || "";
  const match = crsName.match(/EPSG::?(\d+)/i);
  if (match) return parseInt(match[1], 10);
  return 4326;
}

/**
 * Converts a single [x, y] coordinate from Web Mercator (EPSG:3857) to WGS84 (EPSG:4326).
 */
function webMercatorToWGS84([x, y, z]) {
  const lng = (x / WEB_MERCATOR_RADIUS) * 180;
  let lat = (y / WEB_MERCATOR_RADIUS) * 180;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
  // Preserve Z (altitude) coordinate if present
  return z !== undefined ? [lng, lat, z] : [lng, lat];
}

/**
 * Recursively reprojects a coordinates array of arbitrary depth.
 */
function reprojectCoords(coords) {
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    return webMercatorToWGS84(coords);
  }
  return coords.map(reprojectCoords);
}

/**
 * If the GeoJSON declares a non-WGS84 CRS (e.g. EPSG:3857),
 * returns a deep-cloned copy with all coordinates reprojected to WGS84.
 * If already WGS84 or unprojected, returns the original object unchanged.
 */
export function reprojectToWGS84(geojson) {
  if (!geojson) return geojson;
  const epsg = detectCRS(geojson);
  if (epsg === 4326) return geojson;

  // Deep clone so we don't mutate the caller's object
  const cloned = JSON.parse(JSON.stringify(geojson));
  delete cloned.crs; // remove the projected CRS marker — data is now WGS84

  const features = Array.isArray(cloned.features)
    ? cloned.features
    : cloned.type === "Feature"
    ? [cloned]
    : [];

  features.forEach((f) => {
    if (f.geometry?.coordinates) {
      f.geometry.coordinates = reprojectCoords(f.geometry.coordinates);
    }
  });

  // Handle bare geometry at root
  if (cloned.type && cloned.coordinates) {
    cloned.coordinates = reprojectCoords(cloned.coordinates);
  }

  return cloned;
}

const ALTITUDE_EXACT_RE = /^(elev|elevation|altitude|alt|height|גובה)$/i;
const ALTITUDE_PREFIX_RE = /^(elev|elevation|altitude|alt\b|height|גובה)/i;
const ALTITUDE_CONTAINS_RE = /(elev|elevation|altitude|height|גובה)/i;
const FT_UNIT_RE = /(ft|feet|foot)/i;
const M_UNIT_RE = /(_m\b|m\b|meter|metre)/i;

function detectAltitudeField(propNames) {
  const names = Array.from(propNames);
  // Try exact matches first
  for (const name of names) {
    if (ALTITUDE_EXACT_RE.test(name)) return name;
  }
  // Then prefix matches
  for (const name of names) {
    if (ALTITUDE_PREFIX_RE.test(name)) return name;
  }
  // Then "contains" matches (e.g. GPSElevati, NearElevFt, TopElevati)
  for (const name of names) {
    if (ALTITUDE_CONTAINS_RE.test(name)) return name;
  }
  return null;
}

function detectAltitudeUnit(fieldName) {
  if (!fieldName) return null;
  if (FT_UNIT_RE.test(fieldName)) return "ft";
  if (M_UNIT_RE.test(fieldName)) return "m";
  return null;
}

export function analyzeGeoJSON(rawGeojson) {
  // Always reproject before analysis so bounds are in WGS84
  const geojson = reprojectToWGS84(rawGeojson);

  let features = [];
  if (Array.isArray(geojson.features)) {
    features = geojson.features;
  } else if (geojson.type === "Feature") {
    features = [geojson];
  } else if (geojson.type && geojson.coordinates) {
    // Bare geometry — wrap as a single feature
    features = [{ type: "Feature", geometry: geojson, properties: {} }];
  }

  const geometryTypes = new Set();
  const propNames = new Set();
  const bounds = { north: -90, south: 90, east: -180, west: 180 };
  let hasCoords = false;
  let hasZ = false;

  function processCoords(coords) {
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      hasCoords = true;
      bounds.west = Math.min(bounds.west, coords[0]);
      bounds.east = Math.max(bounds.east, coords[0]);
      bounds.south = Math.min(bounds.south, coords[1]);
      bounds.north = Math.max(bounds.north, coords[1]);
      if (typeof coords[2] === "number") hasZ = true;
    } else if (Array.isArray(coords)) {
      coords.forEach(processCoords);
    }
  }

  features.forEach((f) => {
    if (f.geometry) {
      geometryTypes.add(f.geometry.type);
      if (f.geometry.coordinates) processCoords(f.geometry.coordinates);
    }
    if (f.properties) {
      Object.keys(f.properties).forEach((k) => propNames.add(k));
    }
  });

  const altitudeField = detectAltitudeField(propNames);
  const altitudeUnit = detectAltitudeUnit(altitudeField);
  const altitudeSource = altitudeField ? "property" : hasZ ? "z_coordinate" : null;

  return {
    featureCount: features.length,
    geometryTypes: Array.from(geometryTypes),
    propertyNames: Array.from(propNames),
    bounds: hasCoords ? bounds : null,
    reprojected: geojson !== rawGeojson,
    altitude_field: altitudeField,
    altitude_source: altitudeSource,
    altitude_unit: altitudeUnit,
    has_z_coordinates: hasZ,
  };
}