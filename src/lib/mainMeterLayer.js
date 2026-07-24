import { supabase } from "@/api/supabaseClient";

const MAIN_LAYER_NAMES = ["Main Meters", "ראשיים", "ראשי"];

/**
 * Finds or creates the "Main Meters" data layer for a project.
 * Searches by common names (EN/HE), then falls back to finding a data layer
 * that contains only main meters. Returns the layer ID.
 */
export async function ensureMainMetersLayer(projectId) {
  // 1. Search by known names
  const { data: projectLayers } = await supabase.from('project_layer').select('*').eq('project_id', projectId);
  const byName = (projectLayers || []).find((l) =>
    MAIN_LAYER_NAMES.some((n) => l.name?.toLowerCase() === n.toLowerCase())
  );
  if (byName) return byName.id;

  // 2. Find a data layer where all assigned meters are main meters
  const { data: mainMeters } = await supabase
    .from('meter')
    .select('layer_id')
    .eq('project_id', projectId)
    .eq('is_main', true);
  const layerIdCounts = {};
  for (const m of mainMeters || []) {
    if (m.layer_id) layerIdCounts[m.layer_id] = (layerIdCounts[m.layer_id] || 0) + 1;
  }
  for (const [lid] of Object.entries(layerIdCounts)) {
    const { data: layerMeters } = await supabase
      .from('meter')
      .select('is_main')
      .eq('project_id', projectId)
      .eq('layer_id', lid)
      .limit(200);
    const allMain = (layerMeters || []).every((m) => m.is_main);
    if (allMain && (layerMeters || []).length > 0) {
      const layer = (projectLayers || []).find((l) => l.id === lid);
      if (layer && layer.layer_type === "data") return lid;
    }
  }

  // 3. Create a new one
  const { data: newLayer } = await supabase
    .from('project_layer')
    .insert({
      project_id: projectId,
      name: "Main Meters",
      layer_type: "data",
      file_url: "",
      color: "#2563eb",
      visible: true,
      feature_count: 0,
      geometry_types: ["Point"],
      properties: [],
      bounds: null,
    })
    .select()
    .single();
  return newLayer.id;
}