import React from "react";
import { Settings, Droplets, Ruler, Calendar, Footprints, Check, Lock, Unlock, Shield, Radio } from "lucide-react";
import { isolationDistanceDisplay, displayToMeters } from "@/lib/isolationDistance";
import { DEFAULT_PROXIMITY_FEET } from "@/lib/dmaProximity";
import { Switch } from "@/components/ui/switch";

function SegmentedToggle({ value, options, onChange }) {
  return (
    <div className="flex items-center bg-muted rounded-md p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
            value === opt.value
              ? "bg-blue-500 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SettingRow({ icon: Icon, title, description, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-border last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 shrink-0 w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function ProjectSettingsPage({ project, onUpdate, locked, currentUser }) {
  const handleUpdate = (field, value) => {
    onUpdate({ [field]: value });
  };

  // Shown in the project's own distance unit (m for metric, ft for imperial);
  // stored canonically in metres.
  const { value: isolationValue, unit: isolationUnit } = isolationDistanceDisplay(project);
  const boundaryFeet = project.boundary_deviation_feet ?? DEFAULT_PROXIMITY_FEET;

  const handleToggleLock = () => {
    if (locked) {
      // locked_by_id/date are the real DB columns; locked_by_name is a
      // display-only field the parent keeps in local state (and resolves via a
      // join on load) — it is not a column, so writing it would fail the update.
      // Unlocking also withdraws a customer approval — same single action the
      // operator already knows, per the approval spec.
      onUpdate({
        locked: false,
        locked_by_id: null,
        locked_date: null,
        locked_by_name: null,
        customer_approved_by: null,
        customer_approved_at: null,
        approval_requested: false,
      });
    } else {
      onUpdate({
        locked: true,
        locked_by_id: currentUser?.id || null,
        locked_date: new Date().toISOString(),
        locked_by_name: currentUser?.full_name || null,
      });
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Project Settings</h1>
            <p className="text-sm text-muted-foreground">Configure measurement units, date formats, and DMA proximity</p>
          </div>
        </div>

        {/* Project Lock card */}
        <div className="mb-4">
          <h2 className="text-sm font-bold text-foreground mb-1 px-1">Project Lock</h2>
          <div className="bg-card border border-border rounded-xl px-5">
            <SettingRow
              icon={locked ? Lock : Unlock}
              title={locked ? "Project is Locked" : "Project is Unlocked"}
              description={
                locked
                  ? project.customer_approved_by
                    ? `Approved and locked by ${project.customer_approved_by} (customer) — unlocking withdraws the approval`
                    : `Locked${project.locked_by_name ? ` by ${project.locked_by_name}` : ""} — all editing is disabled`
                  : "Lock the project to make it read-only and prevent any changes"
              }
            >
              <Switch checked={!!locked} onCheckedChange={handleToggleLock} />
            </SettingRow>
          </div>
        </div>

        {/* Settings card */}
        <div className={`bg-card border border-border rounded-xl px-5 ${locked ? "pointer-events-none opacity-60" : ""}`}>
          {/* Water unit */}
          <SettingRow
            icon={Droplets}
            title="Water Measurement Unit"
            description="Unit used for consumption and volume values"
          >
            <SegmentedToggle
              value={project.water_unit || "m3"}
              options={[
                { value: "m3", label: "m³" },
                { value: "Gallons", label: "Gallons" },
              ]}
              onChange={(v) => handleUpdate("water_unit", v)}
            />
          </SettingRow>

          {/* Sub-meter communication — written into the LeakZon export. Mains are
              always AMI; this covers everything else, which varies by utility. */}
          <SettingRow
            icon={Radio}
            title="Sub-meter communication"
            description="Written as the Communication value for sub-meters in the LeakZon export. Main meters always export as AMI."
          >
            <input
              type="text"
              defaultValue={project.sub_meter_communication || ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (project.sub_meter_communication || "")) handleUpdate("sub_meter_communication", v || null);
              }}
              placeholder="e.g. AMR"
              className="w-40 h-9 px-2.5 rounded-md border border-border bg-background text-sm text-foreground"
            />
          </SettingRow>

          {/* Distance unit */}
          <SettingRow
            icon={Ruler}
            title="Distance Unit"
            description="Unit used for distances and lengths"
          >
            <SegmentedToggle
              value={project.distance_unit || "Km"}
              options={[
                { value: "Km", label: "Km" },
                { value: "Miles", label: "Miles" },
              ]}
              onChange={(v) => handleUpdate("distance_unit", v)}
            />
          </SettingRow>

          {/* Date format */}
          <SettingRow
            icon={Calendar}
            title="Date Format"
            description="Display format for dates throughout the project"
          >
            <SegmentedToggle
              value={project.date_format || "EU"}
              options={[
                { value: "EU", label: "EU (DD/MM/YYYY)" },
                { value: "US", label: "US (MM/DD/YYYY)" },
              ]}
              onChange={(v) => handleUpdate("date_format", v)}
            />
          </SettingRow>

        </div>

        {/* DMA Focus card */}
        <div className="mt-4">
          <h2 className="text-sm font-bold text-foreground mb-1 px-1">DMA Focus</h2>
          <div className={`bg-card border border-border rounded-xl px-5 ${locked ? "pointer-events-none opacity-60" : ""}`}>
            {/* Boundary deviation */}
            <SettingRow
              icon={Footprints}
              title="Boundary Deviation Distance"
              description="Proximity radius (in feet) used when focusing on a DMA on the map"
            >
              <div className="flex items-center gap-3 w-56">
                <input
                  type="range"
                  min={0}
                  max={500}
                  step={5}
                  value={boundaryFeet}
                  onChange={(e) => handleUpdate("boundary_deviation_feet", parseInt(e.target.value, 10))}
                  className="flex-1 accent-primary cursor-pointer"
                />
                <span className="text-sm font-semibold text-foreground tabular-nums w-16 text-right shrink-0">
                  {boundaryFeet} ft
                </span>
              </div>
            </SettingRow>
          </div>
        </div>

        {/* Isolation Points card */}
        <div className="mt-4">
          <h2 className="text-sm font-bold text-foreground mb-1 px-1">Isolation Points</h2>
          <div className={`bg-card border border-border rounded-xl px-5 ${locked ? "pointer-events-none opacity-60" : ""}`}>
            <SettingRow
              icon={Shield}
              title="Isolation Valve Distance"
              description={`How close two valves on opposite sides of a DMA boundary must be to count as a candidate isolation point — used by "Find border valves"`}
            >
              <div className="flex items-center gap-3 w-56">
                <input
                  type="range"
                  min={0}
                  max={isolationUnit === "ft" ? 500 : 150}
                  step={isolationUnit === "ft" ? 5 : 1}
                  value={isolationValue}
                  onChange={(e) =>
                    handleUpdate("isolation_distance_meters", displayToMeters(project, parseFloat(e.target.value)))
                  }
                  className="flex-1 accent-primary cursor-pointer"
                />
                <span className="text-sm font-semibold text-foreground tabular-nums w-16 text-right shrink-0">
                  {isolationValue} {isolationUnit}
                </span>
              </div>
            </SettingRow>
          </div>
        </div>

        {/* Summary badge */}
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Check className="w-3.5 h-3.5 text-primary" />
          Changes are saved automatically
        </div>
      </div>
    </div>
  );
}