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

  // The gateway in front of Edge Functions rejects a request with no
  // Authorization header before it reaches the function — UNAUTHORIZED_NO_AUTH_
  // HEADER, 401. So the header is always sent, falling back to the anon key
  // when nobody is signed in. That is the case for every anonymous surface: the
  // mobile locator opened from an email and the shared customer view both have
  // no session, and both were failing at the gateway with their share token
  // never being looked at.
  //
  // The anon key is public by design and grants nothing on its own — each
  // function still resolves the caller itself, and falls back to validating the
  // share token when there is no real user.
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${session?.access_token || anonKey}`,
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
