import { supabase } from "@/api/supabaseClient";
import { runBatchesInParallel } from "@/lib/parallelBatch";

// Property keys, in priority order, to use as a meter's uid when turning a
// GeoJSON point feature into a meter row.
const UID_KEYS = ["name", "uid", "UID", "id", "ID", "meter_id", "MeterID", "label", "NAME"];

// A property that says whether each meter is a main. Deliberately stricter than
// the CSV importer's detectMainColumn (which also accepts a bare "main"):
// shapefile attribute tables are full of unrelated "MAIN_ID" / "MAIN SIZE"
// columns, and treating one of those as the main flag would silently mislabel
// every meter in the layer.
const IS_MAIN_KEY_PATTERN = /^(is[\s_-]?main|main[\s_-]?meter|ismain)$/i;

// Finds the "is main" property key used by a GeoJSON's features, or "" when the
// file has no such field.
export function findIsMainKey(features) {
  for (const f of features || []) {
    for (const k of Object.keys(f?.properties || {})) {
      if (IS_MAIN_KEY_PATTERN.test(k.trim())) return k;
    }
  }
  return "";
}

// Reads one feature's main flag. Mirrors the CSV importer's parseMainValue so
// both import paths agree on what counts as "main".
function parseIsMain(value) {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  const v = String(value).toLowerCase().trim();
  return ["main", "yes", "true", "1", "y", "primary", "master"].includes(v);
}

// Builds meter rows from a GeoJSON's point features. Used when a shapefile/
// GeoJSON layer represents meters (see meterLayerKind) so those points
// land in the `meter` table, not just as a display layer.
// `isMain` is only a FALLBACK, used when the file itself has no "is main"
// field. When the file does have one, it wins per feature — the file is the
// authority on which meters are mains.
export function buildMetersFromGeoJSON(geojson, { projectId, layerId, fileUrl, isMain = false }) {
  const features = geojson?.features || (geojson?.type === "Feature" ? [geojson] : []);
  const records = [];
  const usedUids = new Set();
  const isMainKey = findIsMainKey(features);

  features.forEach((f, idx) => {
    const gt = f?.geometry?.type;
    if (gt !== "Point" && gt !== "MultiPoint") return;
    const coordsList = gt === "Point" ? [f.geometry.coordinates] : (f.geometry.coordinates || []);
    coordsList.forEach((c) => {
      const lng = c?.[0];
      const lat = c?.[1];
      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;

      const props = f.properties || {};
      let uid = "";
      for (const k of UID_KEYS) {
        if (props[k] != null && String(props[k]).trim()) { uid = String(props[k]).trim(); break; }
      }
      if (!uid) uid = `METER-${idx + 1}`;
      while (usedUids.has(uid)) uid = `${uid}-${records.length + 1}`;
      usedUids.add(uid);

      records.push({
        project_id: projectId,
        uid,
        is_main: isMainKey ? parseIsMain(props[isMainKey]) : isMain,
        latitude: lat,
        longitude: lng,
        layer_id: layerId,
        source_file_url: fileUrl,
      });
    });
  });

  return records;
}

// Fetches a layer's stored GeoJSON and inserts a meter row per point feature.
// Returns the number of meters created.
export async function createMetersFromGeoJSONUrl(url, { projectId, layerId, isMain = false }) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch layer geojson (${res.status})`);
  const geojson = await res.json();
  const records = buildMetersFromGeoJSON(geojson, { projectId, layerId, fileUrl: url, isMain });
  if (records.length === 0) return 0;
  await runBatchesInParallel(records, 500, 4, (batch) => supabase.from("meter").insert(batch), null);
  return records.length;
}
