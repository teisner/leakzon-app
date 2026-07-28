// Picks the pipe the flood easter egg bursts out of.
//
// The biggest main is the one worth blowing up: it is the most visible line on
// the map and the one a real burst would empty a street with. So: among the
// visible pipe layers, take the largest diameter that actually has features
// drawn, then the longest single segment at that diameter, and burst from its
// midpoint.

import { isPipeLayer, detectDiameterField } from "@/lib/pipeStyling";

const M_PER_DEG_LAT = 111320;

function featuresOf(geojson) {
  if (!geojson || geojson.error) return [];
  if (Array.isArray(geojson.features)) return geojson.features;
  if (geojson.type === "Feature") return [geojson];
  return [];
}

// Every line in a feature, as arrays of [lng, lat].
function linesOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates || []];
  if (geometry.type === "MultiLineString") return geometry.coordinates || [];
  return [];
}

// Rough planar length in metres — only used to compare segments with each
// other, so the local flat approximation is more than enough.
function lineLength(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) continue;
    const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat1 * Math.PI) / 180);
    total += Math.hypot((lng2 - lng1) * mPerDegLng, (lat2 - lat1) * M_PER_DEG_LAT);
  }
  return total;
}

// Point halfway along the line by distance, not the middle array index — a
// segment with dense vertices at one end would otherwise burst off-centre.
function midpointOf(coords) {
  const half = lineLength(coords) / 2;
  let walked = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat1 * Math.PI) / 180);
    const seg = Math.hypot((lng2 - lng1) * mPerDegLng, (lat2 - lat1) * M_PER_DEG_LAT);
    if (seg === 0) continue;
    if (walked + seg >= half) {
      const t = (half - walked) / seg;
      return { lat: lat1 + (lat2 - lat1) * t, lng: lng1 + (lng2 - lng1) * t };
    }
    walked += seg;
  }
  const [lng, lat] = coords[Math.floor(coords.length / 2)] || [];
  return Number.isFinite(lat) ? { lat, lng } : null;
}

// Returns { lat, lng, diameter, layerName } for the thickest visible pipe, or
// null when the project has no pipe layer loaded — the flood then just rises.
export function findThickestPipe(layers, geojsonCache) {
  let best = null;

  for (const layer of layers || []) {
    if (!layer.visible) continue;
    const geojson = geojsonCache?.[layer.id];
    if (!geojson || geojson.error) continue;

    // A pipe layer normally has a config by the time it is drawn, but the
    // config is written asynchronously after first load — fall back to the
    // same detection the styling uses so a freshly imported layer still works.
    const field = layer.pipe_config?.diameter_field
      || (isPipeLayer(layer) ? detectDiameterField(layer.properties) : null);
    if (!field) continue;

    // Diameters the user has switched off aren't on screen, so they can't burst.
    const hidden = new Set(
      (layer.pipe_config?.diameters || [])
        .filter((d) => d.visible === false)
        .map((d) => String(d.value))
    );

    for (const feature of featuresOf(geojson)) {
      const raw = feature.properties?.[field];
      if (raw === null || raw === undefined || raw === "") continue;
      if (hidden.has(String(raw))) continue;
      const diameter = parseFloat(raw);
      if (!Number.isFinite(diameter)) continue;

      for (const coords of linesOf(feature.geometry)) {
        if (coords.length < 2) continue;
        const length = lineLength(coords);
        // Thickest wins; among equals, the longest run of it.
        if (best && (diameter < best.diameter
          || (diameter === best.diameter && length <= best.length))) continue;
        const mid = midpointOf(coords);
        if (!mid) continue;
        best = { ...mid, diameter, length, layerName: layer.name, raw: String(raw) };
      }
    }
  }

  return best;
}
