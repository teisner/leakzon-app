import React, { useState } from "react";
import { Input } from "@/components/ui/input";

// 32-color palette spanning the spectrum for layer differentiation
export const LAYER_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#facc15", "#fde047", "#84cc16", "#a3e635",
  "#22c55e", "#4ade80", "#10b981", "#34d399",
  "#14b8a6", "#2dd4bf", "#06b6d4", "#22d3ee",
  "#0ea5e9", "#38bdf8", "#3b82f6", "#60a5fa",
  "#6366f1", "#818cf8", "#8b5cf6", "#a78bfa",
  "#a855f7", "#c084fc", "#d946ef", "#e879f9",
  "#ec4899", "#f472b6", "#6b7280", "#1f2937",
];

function normalizeHex(value) {
  let v = value.trim();
  if (!v) return "";
  if (!v.startsWith("#")) v = "#" + v;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v.toLowerCase() : "";
}

// Reusable color picker: 32-swatch palette + manual HEX input.
export default function LayerColorPicker({ value, onChange }) {
  const [hexInput, setHexInput] = useState("");

  const isPreset = LAYER_COLORS.includes(value?.toLowerCase());

  // Keep the HEX input in sync when a preset is selected externally
  const displayHex = isPreset ? (value || "").toUpperCase() : hexInput || (value || "").toUpperCase();

  const handleHexChange = (e) => {
    const raw = e.target.value;
    setHexInput(raw);
    const normalized = normalizeHex(raw);
    if (normalized) onChange(normalized);
  };

  const handleHexBlur = () => {
    const normalized = normalizeHex(hexInput);
    if (normalized) {
      onChange(normalized);
      setHexInput(normalized.toUpperCase());
    } else if (!isPreset) {
      setHexInput("");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 items-center">
        {LAYER_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => { onChange(c); setHexInput(c.toUpperCase()); }}
            className={`w-6 h-6 rounded-full transition-transform shrink-0 border border-white/50 ${
              value?.toLowerCase() === c ? "ring-2 ring-offset-1 ring-slate-900 scale-110 dark:ring-white dark:ring-offset-background" : ""
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-md border border-border shrink-0"
          style={{ backgroundColor: value }}
        />
        <Input
          value={displayHex}
          onChange={handleHexChange}
          onBlur={handleHexBlur}
          placeholder="#3B82F6"
          className="h-7 text-xs w-28 font-mono uppercase"
        />
      </div>
    </div>
  );
}