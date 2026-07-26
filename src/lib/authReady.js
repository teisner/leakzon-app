import { supabase } from "@/api/supabaseClient";

// supabase-js restores the persisted session asynchronously after a page load.
// Any query fired before that finishes goes out with only the anon key, and RLS
// then returns zero rows — or, for `.single()`, a null row — with HTTP 200. That
// is indistinguishable from "this doesn't exist", which is why it surfaced once
// as an empty dashboard and again as "Project not found".
//
// Every mount-time loader must await this before its first query.
export async function waitForSession({ timeoutMs = 3000 } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  // getSession can resolve null while hydration is still in flight, so give the
  // definitive INITIAL_SESSION event a moment before concluding "logged out".
  return new Promise((resolve) => {
    let settled = false;
    let sub;
    const finish = (s) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sub?.subscription?.unsubscribe();
      resolve(s);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    ({ data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) finish(s);
    }));
  });
}
