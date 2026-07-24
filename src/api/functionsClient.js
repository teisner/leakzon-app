import { supabase } from "@/api/supabaseClient";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// Drop-in replacement for base44.functions.invoke(name, payload) — same
// `{ data }` return shape and the same `err.response.data.error` shape on
// failure, so call sites didn't need to change their destructuring/error
// handling, only the import and the call itself.
export async function invokeFunction(name, payload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(payload || {}),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.response = { data, status: res.status };
    throw err;
  }
  return { data };
}
