import { supabase } from "@/api/supabaseClient";
import { runBatchesInParallel } from "@/lib/parallelBatch";

// Property keys, in priority order, to use as a meter's uid when turning a
// GeoJSON point feature into a meter row.
const UID_KEYS = ["name", "uid", "UID", "id", "ID", "meter_id", "MeterID", "label", "NAME"];

// Builds meter rows from a GeoJSON's point features. Used when a shapefile/
// GeoJSON layer represents meters (see meterLayerKind) so those points
// land in the `meter` table, not just as a display layer.
export function buildMetersFromGeoJSON(geojson, { projectId, layerId, fileUrl, isMain = true }) {
  const features = geojson?.features || (geojson?.type === "Feature" ? [geojson] : []);
  const records = [];
  const usedUids = new Set();

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
        is_main: isMain,
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
export async function createMetersFromGeoJSONUrl(url, { projectId, layerId, isMain = true }) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch layer geojson (${res.status})`);
  const geojson = await res.json();
  const records = buildMetersFromGeoJSON(geojson, { projectId, layerId, fileUrl: url, isMain });
  if (records.length === 0) return 0;
  await runBatchesInParallel(records, 500, 4, (batch) => supabase.from("meter").insert(batch), null);
  return records.length;
}
