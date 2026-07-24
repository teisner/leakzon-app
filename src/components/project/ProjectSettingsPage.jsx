import React from "react";
import { Settings, Droplets, Ruler, Calendar, Footprints, Check, Wand2, Lock, Unlock } from "lucide-react";
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

  const handleToggleLock = () => {
    if (locked) {
      onUpdate({ locked: false, locked_by_name: null, locked_date: null });
    } else {
      onUpdate({
        locked: true,
        locked_by_name: currentUser?.full_name || "Unknown",
        locked_date: new Date().toISOString(),
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
                  ? `Locked by ${project.locked_by_name || "Unknown"} — all editing is disabled`
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
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={project.boundary_deviation_feet ?? 60}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 0) handleUpdate("boundary_deviation_feet", val);
                  }}
                  className="w-24 px-3 py-1.5 text-sm font-semibold text-center border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-sm text-muted-foreground font-medium">ft</span>
              </div>
            </SettingRow>
          </div>
        </div>

        {/* Data Completion card */}
        <div className="mt-4">
          <h2 className="text-sm font-bold text-foreground mb-1 px-1">Data Completion</h2>
          <div className={`bg-card border border-border rounded-xl px-5 ${locked ? "pointer-events-none opacity-60" : ""}`}>
            <SettingRow
              icon={Wand2}
              title="Nearby Meter Radius"
              description="Radius (in yards) used to find nearby meters for consumption completion averages"
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={50}
                  max={5000}
                  value={project.completion_radius_yards ?? 500}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 0) handleUpdate("completion_radius_yards", val);
                  }}
                  className="w-24 px-3 py-1.5 text-sm font-semibold text-center border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-sm text-muted-foreground font-medium">yd</span>
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