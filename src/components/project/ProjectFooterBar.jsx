import React, { useState } from "react";
import { ArrowUpCircle } from "lucide-react";
import { APP_VERSION } from "@/lib/version";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import UpdateAvailableDialog from "@/components/UpdateAvailableDialog";

// The strip along the bottom of a project page, carrying the running version.
//
// bg-background, not bg-card: the side menu uses bg-background, and in dark mode
// those differ (7% vs 11% lightness), so bg-card made the strip visibly lighter
// than the menu sitting directly above it. In light mode both are white.
export default function ProjectFooterBar() {
  const { latestVersion } = useVersionCheck();
  const [showUpdate, setShowUpdate] = useState(false);

  return (
    <div className="h-7 shrink-0 bg-background flex items-center justify-start gap-1.5 px-3">
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
