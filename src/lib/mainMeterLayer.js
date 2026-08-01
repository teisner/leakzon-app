import { supabase } from "@/api/supabaseClient";
import { meterLayerKind } from "@/lib/meterLayerDetection";

const MAIN_LAYER_NAMES = ["Main Meters", "ראשיים", "ראשי"];
const SUB_LAYER_NAMES = ["Sub Meters", "Sub-Meters", "מוני משנה", "משנה"];

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

/**
 * Finds or creates the "Sub Meters" data layer for a project — the counterpart
 * to ensureMainMetersLayer, for a meter added by hand that is not a main.
 *
 * A meter has to belong to a layer: the layers panel, the map's z-order and the
 * layer delete all key off it, and a meter with no layer is invisible on the map
 * however good its coordinates are.
 */
export async function ensureSubMetersLayer(projectId) {
  const { data: projectLayers } = await supabase.from('project_layer').select('*').eq('project_id', projectId);

  // 1. By name, in either language.
  const byName = (projectLayers || []).find((l) =>
    SUB_LAYER_NAMES.some((n) => l.name?.toLowerCase() === n.toLowerCase())
  );
  if (byName) return byName.id;

  // 2. Otherwise the data layer the project's sub meters already live in — the
  //    same "where do these belong" question the import answers by category.
  const dataLayers = (projectLayers || []).filter((l) => l.layer_type === "data");
  const bySub = dataLayers.find((l) => meterLayerKind(l.name, l.category) === "sub");
  if (bySub) return bySub.id;

  const { data: subMeters } = await supabase
    .from('meter')
    .select('layer_id')
    .eq('project_id', projectId)
    .eq('is_main', false)
    .not('layer_id', 'is', null)
    .limit(500);
  const counts = {};
  for (const m of subMeters || []) counts[m.layer_id] = (counts[m.layer_id] || 0) + 1;
  const busiest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (busiest && dataLayers.some((l) => l.id === busiest[0])) return busiest[0];

  // 3. Nothing to attach to — make one.
  const { data: newLayer, error } = await supabase
    .from('project_layer')
    .insert({
      project_id: projectId,
      name: "Sub Meters",
      layer_type: "data",
      file_url: "",
      color: "#16a34a",
      visible: true,
      feature_count: 0,
      geometry_types: ["Point"],
      properties: [],
      bounds: null,
    })
    .select()
    .single();
  if (error) throw new Error(`Could not create the Sub Meters layer: ${error.message}`);
  return newLayer.id;
}
