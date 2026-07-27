import { supabase } from "@/api/supabaseClient";

// supabase-js restores the persisted session asynchronously after a page load.
// Any query fired before that finishes goes out with only the anon key, and RLS
// then returns zero rows — or, for `.single()`, a null row — with HTTP 200. That
// is indistinguishable from "this doesn't exist", which is why it surfaced once
// as an empty dashboard and again as "Project not found".
//
// Every mount-time loader must await this before its first query.
// 3s was too tight: getSession() can have a token refresh in flight, and on a
// slow connection that alone outlasts the timeout — which then reads as "signed
// out" for a perfectly healthy session.
export async function waitForSession({ timeoutMs = 15000 } = {}) {
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

// The Supabase session can end on its own — a refresh token expires, is rotated
// by another tab, or is invalidated server-side — and supabase-js just drops it.
// Nothing used to clear `loggedInUser` in that case, so the app went on
// believing you were signed in: the dashboard kept showing its cached projects
// while every RLS query returned nothing, and opening a project looked like the
// project had vanished. Clearing the local trace of the login makes the app
// agree with reality and show the sign-in screen.
export function clearStaleLogin() {
  try {
    const raw = localStorage.getItem("loggedInUser");
    const userId = raw ? JSON.parse(raw)?.id : null;
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("lastActivityTime");
    // Stale project cache belongs to that dead session — drop it too, or the
    // dashboard shows projects the signed-out user can no longer load.
    if (userId) localStorage.removeItem(`dashboardProjectsCache_${userId}`);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
