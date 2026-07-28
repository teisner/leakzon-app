import React, { useState } from "react";
import { ArrowUpCircle } from "lucide-react";
import { APP_VERSION } from "@/lib/version";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import UpdateAvailableDialog from "@/components/UpdateAvailableDialog";

// The strip along the bottom of a project page, carrying the running version.
//
// Height matches what the version block used to occupy at the foot of the side
// menu — from its divider to the bottom edge: pt-2 (8px) + the 16px row + the
// nav's pb-4 (16px) = 40px. Same background as the header (bg-card), so the
// page is bracketed by matching bars.
export default function ProjectFooterBar() {
  const { latestVersion } = useVersionCheck();
  const [showUpdate, setShowUpdate] = useState(false);

  return (
    <div className="h-10 shrink-0 bg-card border-t border-border flex items-center justify-center gap-1.5">
      <p className="text-[10px] text-green-600 dark:text-green-400 tabular-nums">
        Ver {APP_VERSION}
      </p>
      {latestVersion && (
        <button
          onClick={() => setShowUpdate(true)}
          title={`Version ${latestVersion} is available`}
          className="relative flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white shrink-0 hover:bg-amber-600 transition-colors"
        >
          <ArrowUpCircle className="w-3 h-3" />
          <span className="absolute inset-0 rounded-full bg-amber-500 animate-ping opacity-60" />
        </button>
      )}
      <UpdateAvailableDialog
        open={showUpdate}
        onOpenChange={setShowUpdate}
        latestVersion={latestVersion}
      />
    </div>
  );
}
