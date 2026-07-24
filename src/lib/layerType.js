import { supabase } from "@/api/supabaseClient";

// ProjectLayer.category was free text in Base44; the new schema replaces it
// with layer_type_id, a real FK to the layer_type lookup table. This
// resolves a category name to its id, creating the lookup row on first use
// so the existing free-form category pickers across the app keep working
// without redesigning that UX.
let cache = null;

export async function resolveLayerTypeId(categoryName) {
  if (!categoryName) return null;
  if (!cache) {
    const { data } = await supabase.from('layer_type').select('id, name');
    cache = new Map((data || []).map((r) => [r.name, r.id]));
  }
  if (cache.has(categoryName)) return cache.get(categoryName);

  const { data: created, error } = await supabase
    .from('layer_type')
    .insert({ name: categoryName, is_default: false })
    .select('id')
    .single();
  if (error) return null;
  cache.set(categoryName, created.id);
  return created.id;
}
