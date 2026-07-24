import React, { useMemo, useEffect } from "react";
import { CircleMarker, useMap } from "react-leaflet";
import { pointInPolygon, getBoundaryPolygonsLatLng } from "@/lib/polygonUtils";

// Computes the centroid [lng, lat] of a GeoJSON geometry.
function featureCentroid(geometry) {
  let coords = [];
  if (!geometry) return null;
  const t = geometry.type;
  if (t === "Point") return geometry.coordinates;
  if (t === "MultiPoint" || t === "LineString") coords = geometry.coordinates;
  else if (t === "MultiLineString") coords = geometry.coordinates.flat();
  else if (t === "Polygon") coords = geometry.coordinates[0] || [];
  else if (t === "MultiPolygon") coords = (geometry.coordinates || []).map((p) => p[0] || []).flat();
  else return null;
  if (!coords.length) return null;
  const [sumLng, sumLat] = coords.reduce(
    ([sl, slt], [lng, lat]) => [sl + lng, slt + lat],
    [0, 0]
  );
  return [sumLng / coords.length, sumLat / coords.length];
}

// When active, collects every meter and SHP feature that falls outside the
// city boundary and renders big blinking red markers at those locations
// for 2 seconds.
export default function OutBoundaryHighlighter({
  active,
  boundaryGeoJSON,
  layers,
  meters,
  geojsonCache,
  onComplete,
}) {
  const map = useMap();

  const outPoints = useMemo(() => {
    if (!active || !boundaryGeoJSON || boundaryGeoJSON.error) return [];
    const boundaryPolys = getBoundaryPolygonsLatLng(boundaryGeoJSON);
    if (boundaryPolys.length === 0) return [];

    const isOutside = (lat, lng) =>
      !boundaryPolys.some((bp) => pointInPolygon(lat, lng, bp));

    const points = [];

    // 1. Meters with coordinates outside the boundary
    for (const m of meters || []) {
      if (m.latitude == null || m.longitude == null) continue;
      if (isOutside(m.latitude, m.longitude)) {
        points.push([m.latitude, m.longitude]);
      }
    }

    // 2. SHP / GeoJSON layer features outside the boundary
    for (const layer of layers || []) {
      if (layer.layer_type !== "shp" || !layer.visible) continue;
      if (/boundary/i.test(layer.name)) continue;
      const data = geojsonCache[layer.id];
      if (!data || data.error) continue;

      for (const feature of data.features || []) {
        const geom = feature.geometry;
        if (!geom) continue;

        if (geom.type === "Point") {
          const [lng, lat] = geom.coordinates;
          if (isOutside(lat, lng)) points.push([lat, lng]);
        } else if (geom.type === "MultiPoint") {
          for (const [lng, lat] of geom.coordinates) {
            if (isOutside(lat, lng)) points.push([lat, lng]);
          }
        } else {
          // Lines & polygons — check centroid
          const centroid = featureCentroid(geom);
          if (centroid) {
            const [lng, lat] = centroid;
            if (isOutside(lat, lng)) points.push([lat, lng]);
          }
        }
      }
    }

    return points;
  }, [active, boundaryGeoJSON, layers, meters, geojsonCache]);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => onComplete?.(), 2000);
    return () => clearTimeout(timer);
  }, [active, onComplete]);

  // Fit map to show all highlighted points
  useEffect(() => {
    if (!active || outPoints.length === 0 || !map) return;
    const lats = outPoints.map((p) => p[0]);
    const lngs = outPoints.map((p) => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    // Only fit if points are spread out enough to warrant it
    if (maxLat - minLat > 0.001 || maxLng - minLng > 0.001) {
      map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [60, 60], maxZoom: 15 });
    }
  }, [active, outPoints, map]);

  if (!active || outPoints.length === 0) return null;

  return (
    <>
      {outPoints.map((pt, i) => (
        <CircleMarker
          key={i}
          center={pt}
          radius={15}
          pathOptions={{
            color: "#ef4444",
            fillColor: "#ef4444",
            fillOpacity: 0.3,
            weight: 3,
            className: "out-boundary-highlight",
          }}
          interactive={false}
        />
      ))}
    </>
  );
}