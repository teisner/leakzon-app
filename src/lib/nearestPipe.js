import { reprojectToWGS84 } from "@/lib/geoAnalysis";

// Haversine distance in meters between two lat/lng points
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6378137;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Nearest point on segment [a,b] to point p — all [lat,lng]
function nearestPointOnSegment(p, a, b) {
  const [plat, plng] = p;
  const [alat, alng] = a;
  const [blat, blng] = b;
  const dx = blat - alat;
  const dy = blng - alng;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return [alat, alng];
  let t = ((plat - alat) * dx + (plng - alng) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return [alat + t * dx, alng + t * dy];
}

const DIAMETER_FIELD_RE = /diameter|dn|dia|size|pipe_?size/i;

// Finds the nearest water line pipe diameter to a [lat, lng] point.
// Searches all SHP layers with LineString geometry (excluding valves/boundary).
// Returns { diameter: string|null, distance: number, layerName: string|null }
export async function findNearestPipeDiameter(lat, lng, layers) {
  const waterLineLayers = (layers || []).filter(
    (l) =>
      l.layer_type === "shp" &&
      l.file_url &&
      !/boundary|valve/i.test(l.name) &&
      l.geometry_types?.some((t) => t === "LineString" || t === "MultiLineString")
  );

  if (waterLineLayers.length === 0) {
    return { diameter: null, distance: Infinity, layerName: null };
  }

  const results = await Promise.all(
    waterLineLayers.map(async (layer) => {
      try {
        const res = await fetch(layer.file_url);
        if (!res.ok) return null;
        const raw = await res.json();
        const data = reprojectToWGS84(raw);

        let diameterField = (layer.properties || []).find((p) =>
          DIAMETER_FIELD_RE.test(p)
        );

        const features = (data.features || []).filter(
          (f) => f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString"
        );

        // Fallback: detect diameter field from feature properties
        if (!diameterField && features.length > 0) {
          const sampleProps = features[0].properties || {};
          diameterField = Object.keys(sampleProps).find((k) =>
            DIAMETER_FIELD_RE.test(k)
          );
        }

        if (!diameterField) return null;

        let layerBest = { diameter: null, distance: Infinity, layerName: layer.name };

        for (const f of features) {
          const diameter = f.properties?.[diameterField];
          if (diameter == null || diameter === "") continue;

          const lines =
            f.geometry.type === "LineString"
              ? [f.geometry.coordinates]
              : f.geometry.coordinates;

          for (const coords of lines) {
            for (let i = 0; i < coords.length - 1; i++) {
              const a = coords[i]; // [lng, lat]
              const b = coords[i + 1];
              const np = nearestPointOnSegment(
                [lat, lng],
                [a[1], a[0]],
                [b[1], b[0]]
              );
              const dist = haversineMeters(lat, lng, np[0], np[1]);
              if (dist < layerBest.distance) {
                layerBest = {
                  diameter: String(diameter),
                  distance: dist,
                  layerName: layer.name,
                };
              }
            }
          }
        }

        return layerBest;
      } catch {
        return null;
      }
    })
  );

  let best = { diameter: null, distance: Infinity, layerName: null };
  for (const r of results) {
    if (r && r.distance < best.distance) {
      best = r;
    }
  }

  return best;
}