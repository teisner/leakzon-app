import React from "react";
import { UserCog, LogOut } from "lucide-react";
import { supabase } from "@/api/supabaseClient";

/**
 * Always-visible marker for an admin support login ("signed in as" another
 * user). Without it an admin can forget whose session they're in and take
 * actions — locking a project, deleting a layer — that look like the user did
 * them.
 */
export default function ImpersonationBanner() {
  let info = null;
  try {
    const saved = JSON.parse(localStorage.getItem("loggedInUser") || "null");
    if (saved?.impersonated_by) info = saved;
  } catch { /* ignore malformed cache */ }

  if (!info) return null;

  const endSession = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("loggedInUser");
    window.location.href = "/";
  };

  return (
    <div className="shrink-0 bg-amber-500 text-amber-950 px-4 py-1.5 flex items-center gap-2 text-xs font-semibold">
      <UserCog className="w-4 h-4 shrink-0" />
      <span className="min-w-0 truncate">
        Support login — viewing as {info.full_name || info.email}
        {info.impersonated_by?.full_name ? ` (signed in by ${info.impersonated_by.full_name})` : ""}
      </span>
      <button
        onClick={endSession}
        className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-md bg-amber-950/15 hover:bg-amber-950/25 px-2 py-0.5"
      >
        <LogOut className="w-3 h-3" /> End
      </button>
    </div>
  );
}
