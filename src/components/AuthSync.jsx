import { useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { clearStaleLogin } from "@/lib/authReady";

// Keeps the app's idea of "signed in" tied to the actual Supabase session.
//
// Without this, a session that ends on its own (expired or rotated refresh
// token) leaves `loggedInUser` behind in localStorage. The app then renders as
// signed in while every RLS-protected query quietly returns nothing — which has
// surfaced as an empty dashboard, as "Project not found", and as being bounced
// back to the dashboard when opening a project.
export default function AuthSync() {
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION with no session fires on every cold load for a
      // genuinely signed-out visitor, which is not a state change worth acting
      // on. Only react to the session actually going away.
      if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) {
        if (localStorage.getItem("loggedInUser")) {
          console.warn("[auth] Supabase session ended — clearing stored login.");
          clearStaleLogin();
          window.location.replace("/");
        }
      }
    });
    return () => data?.subscription?.unsubscribe();
  }, []);

  return null;
}
