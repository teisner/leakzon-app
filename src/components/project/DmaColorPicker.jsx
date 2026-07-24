import React, { useState } from "react";
import { Input } from "@/components/ui/input";

// 32-color palette spanning the spectrum for DMA differentiation
export const DMA_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#dc2626", "#b91c1c", "#7f1d1d", "#15803d", "#166534", "#854d0e", "#a16207",
  "#1e40af", "#1e3a8a", "#5b21b6", "#6b21a8", "#9d174d", "#831843", "#0f766e", "#115e59",
];

function normalizeHex(value) {
  let v = value.trim();
  if (!v) return "";
  if (!v.startsWith("#")) v = "#" + v;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v.toLowerCase() : "";
}

// Reusable color picker: 32-swatch palette + manual HEX input.
// `value` is the current color hex (or "auto"). `auto` handling is left to the parent.
export default function DmaColorPicker({ value, onChange, showAuto = false, autoLabel = "Auto", t }) {
  const [hexInput, setHexInput] = useState("");

  const isAuto = value === "auto";
  const isPreset = DMA_COLORS.includes(value?.toLowerCase());

  // Keep the HEX input in sync when a preset is selected externally
  const displayHex = isAuto ? "" : (isPreset ? (value || "").toUpperCase() : hexInput || (value || "").toUpperCase());

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
    } else if (!isPreset && !isAuto) {
      // Invalid input that's not a preset — reset to show current value
      setHexInput("");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 items-center">
        {showAuto && (
          <button
            type="button"
            onClick={() => { onChange("auto"); setHexInput(""); }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
              isAuto
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {autoLabel}
          </button>
        )}
        {DMA_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => { onChange(c); setHexInput(c.toUpperCase()); }}
            className={`w-5 h-5 rounded-full transition-transform shrink-0 ${
              value?.toLowerCase() === c ? "ring-2 ring-offset-1 ring-foreground scale-110" : ""
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-md border border-border shrink-0"
          style={{ backgroundColor: isAuto ? "#cbd5e1" : value }}
        />
        <Input
          value={displayHex}
          onChange={handleHexChange}
          onBlur={handleHexBlur}
          placeholder="#3B82F6"
          disabled={isAuto}
          className="h-7 text-xs w-28 font-mono uppercase"
        />
      </div>
    </div>
  );
}