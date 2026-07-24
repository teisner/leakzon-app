import React from "react";
import { Lock, Unlock } from "lucide-react";

/**
 * Sidebar lock toggle:
 *  - "closed": locked (icons only) — shows closed lock icon
 *  - "open":   unlocked (expanded)  — shows open lock icon
 */
export default function SidebarLockControl({ mode, onChange, expanded, labels }) {
  const isLocked = mode === "closed";
  const Icon = isLocked ? Lock : Unlock;

  return (
    <button
      onClick={() => onChange(isLocked ? "open" : "closed")}
      title={isLocked ? labels.open : labels.closed}
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
        "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      } ${expanded ? "justify-start" : "justify-center"}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {expanded && <span className="whitespace-nowrap">{isLocked ? "Unlock" : "Lock"}</span>}
    </button>
  );
}