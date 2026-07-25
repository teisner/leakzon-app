import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { PALETTE } from "@/lib/colorPalette";

// Shared palette (includes white and black) — see lib/colorPalette.js.
// Re-exported under the original name for existing importers.
export const LAYER_COLORS = PALETTE;

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
            className={`w-6 h-6 rounded-full transition-transform shrink-0 border border-border ${
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