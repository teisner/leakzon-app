import React from "react";
import { Loader2, CheckCircle2, Layers, Gauge, FileBarChart, Hexagon, Network, MapPin, Shield, ImageIcon, TrendingUp, FileText, FolderPlus } from "lucide-react";

const STEPS = [
  { icon: FolderPlus, label: "Creating new project…", detail: "Setting up project settings and preferences" },
  { icon: Layers, label: "Importing GIS layers…", detail: "Copying shapefiles, GeoJSON, and layer configurations" },
  { icon: Gauge, label: "Importing meters…", detail: "Copying meter records with locations and attributes" },
  { icon: FileBarChart, label: "Importing consumption data…", detail: "Copying consumption readings and matching to meters" },
  { icon: Hexagon, label: "Importing DMAs…", detail: "Copying district metered area polygons and settings" },
  { icon: Network, label: "Importing network design…", detail: "Copying network nodes, links, and connections" },
  { icon: Shield, label: "Importing isolation points…", detail: "Copying DMA boundary isolation valves" },
  { icon: MapPin, label: "Importing map annotations…", detail: "Copying map notes and directional arrows" },
  { icon: ImageIcon, label: "Importing image overlays…", detail: "Copying georeferenced image overlays" },
  { icon: TrendingUp, label: "Importing project history…", detail: "Copying onboarding milestones and progress entries" },
  { icon: FileText, label: "Importing import logs…", detail: "Copying data import history and error logs" },
  { icon: CheckCircle2, label: "Finalizing…", detail: "Completing project duplication" },
];

export default function DuplicationProgress({ projectName, currentStep = 0, readingsImported = 0, isImportingReadings = false }) {
  return (
    <div className="flex flex-col items-center gap-5 py-4">
      {/* Progress bar */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">
            Step {currentStep + 1} of {STEPS.length}
          </span>
          <span className="text-xs text-muted-foreground">
            {isImportingReadings
              ? `${readingsImported.toLocaleString()} readings imported`
              : `${Math.round(((currentStep + 1) / STEPS.length) * 100)}%`}
          </span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
            style={{
              width: isImportingReadings
                ? "100%"
                : `${((currentStep + 1) / STEPS.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Current step indicator */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Loader2 className="w-7 h-7 text-primary animate-spin" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{STEPS[currentStep].label}</p>
          <p className="text-xs text-muted-foreground">
            {isImportingReadings
              ? `${readingsImported.toLocaleString()} consumption records copied so far…`
              : STEPS[currentStep].detail}
          </p>
        </div>
      </div>

      {/* Completed steps */}
      <div className="w-full space-y-1.5">
        {STEPS.slice(0, currentStep).map((step, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="line-through opacity-70">{step.label}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Duplicating <span className="font-medium text-foreground">{projectName}</span> — this may take a few minutes for large projects
      </p>
    </div>
  );
}