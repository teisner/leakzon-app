// Utilities for filtering GeoJSON features to those within a boundary polygon

function pointInPolygon(point, polygon) {
  // point: [lng, lat], polygon: array of rings, each ring is array of [lng, lat]
  const [x, y] = point;
  let inside = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
  }
  return inside;
}

function extractPolygons(geometry) {
  // Returns array of polygons; each polygon is array of rings
  if (!geometry) return [];
  const { type, coordinates } = geometry;
  if (type === "Polygon") return [coordinates];
  if (type === "MultiPolygon") return coordinates;
  return [];
}

function getAllPolygons(geojson) {
  const polygons = [];
  if (!geojson) return polygons;
  if (geojson.type === "FeatureCollection") {
    for (const feature of geojson.features || []) {
      polygons.push(...extractPolygons(feature.geometry));
    }
  } else if (geojson.type === "Feature") {
    polygons.push(...extractPolygons(geojson.geometry));
  } else if (geojson.type === "Polygon") {
    polygons.push(...extractPolygons(geojson));
  } else if (geojson.type === "MultiPolygon") {
    polygons.push(...extractPolygons(geojson));
  }
  return polygons;
}

function isPointInPolygons(lng, lat, polygons) {
  return polygons.some((poly) => pointInPolygon([lng, lat], poly));
}

function geometryCoordinatesInBounds(geometry, polygons) {
  if (!geometry) return false;
  const { type, coordinates } = geometry;

  switch (type) {
    case "Point":
      return isPointInPolygons(coordinates[0], coordinates[1], polygons);
    case "MultiPoint":
      return coordinates.some(([lng, lat]) => isPointInPolygons(lng, lat, polygons));
    case "LineString":
      return coordinates.some(([lng, lat]) => isPointInPolygons(lng, lat, polygons));
    case "MultiLineString":
      return coordinates.some((line) => line.some(([lng, lat]) => isPointInPolygons(lng, lat, polygons)));
    case "Polygon":
      return coordinates.some((ring) => ring.some(([lng, lat]) => isPointInPolygons(lng, lat, polygons)));
    case "MultiPolygon":
      return coordinates.some((poly) => poly.some((ring) => ring.some(([lng, lat]) => isPointInPolygons(lng, lat, polygons))));
    default:
      return true; // Don't filter unknown geometry types
  }
}

export function filterFeaturesByBoundary(geojson, boundaryGeojson) {
  if (!geojson || !boundaryGeojson) return geojson;

  const polygons = getAllPolygons(boundaryGeojson);
  if (polygons.length === 0) return geojson;

  if (geojson.type === "FeatureCollection") {
    const filtered = (geojson.features || []).filter((feature) =>
      geometryCoordinatesInBounds(feature.geometry, polygons)
    );
    return { ...geojson, features: filtered };
  }

  if (geojson.type === "Feature") {
    if (geometryCoordinatesInBounds(geojson.geometry, polygons)) return geojson;
    return { ...geojson, features: [] };
  }

  // Geometry object — check directly
  if (geometryCoordinatesInBounds(geojson, polygons)) return geojson;
  return null;
}