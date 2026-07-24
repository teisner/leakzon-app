import { supabase } from "@/api/supabaseClient";

const BUCKET = "project-files";

// Drop-in replacement for base44.integrations.Core.UploadFile({ file }) —
// same { file_url } return shape, so call sites only need the import swapped.
export async function uploadFile({ file }) {
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const path = `${crypto.randomUUID()}${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { file_url: data.publicUrl };
}
