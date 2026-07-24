import React, { useState } from "react";
import { Palette, X } from "lucide-react";
import { NUMBER_COLORS } from "@/lib/numberStyle";

// Toolbar button + popover to style the point-number badges: size and color,
// applied either to all badges or only the selected ones. Selection happens by
// clicking badges on the map.
export default function NumberStyleControls({ style, scope, setScope, selectedCount, onApply, onClearSelection }) {
  const [open, setOpen] = useState(false);
  const disabledSelected = scope === "selected" && selectedCount === 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-center w-9 h-9 border-l border-border ${open ? "bg-blue-500 text-white hover:bg-blue-600" : "text-muted-foreground hover:bg-muted"}`}
        title="Number style (size & color)"
      >
        <Palette className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[1000]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[1001] w-64 bg-card border border-border rounded-xl shadow-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-foreground/90">Number Style</p>
              <button onClick={() => setOpen(false)} className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Scope */}
            <div className="grid grid-cols-2 gap-1 mb-3 p-0.5 bg-muted rounded-lg">
              <button
                onClick={() => setScope("all")}
                className={`text-[11px] font-medium py-1 rounded-md transition-colors ${scope === "all" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
              >
                All numbers
              </button>
              <button
                onClick={() => setScope("selected")}
                className={`text-[11px] font-medium py-1 rounded-md transition-colors ${scope === "selected" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
              >
                Selected ({selectedCount})
              </button>
            </div>

            {scope === "selected" && (
              <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
                {selectedCount === 0
                  ? "Click numbers on the map to select them, then change size or color."
                  : `${selectedCount} selected. `}
                {selectedCount > 0 && (
                  <button onClick={onClearSelection} className="text-blue-600 hover:underline">Clear</button>
                )}
              </p>
            )}

            {/* Size */}
            <div className={`mb-3 ${disabledSelected ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground">Size</span>
                <span className="text-[11px] font-medium text-foreground tabular-nums">{style.size}px</span>
              </div>
              <input
                type="range" min={10} max={32} step={1} value={style.size}
                onChange={(e) => onApply("size", parseInt(e.target.value, 10))}
                className="w-full accent-primary"
              />
            </div>

            {/* Colors */}
            <div className={disabledSelected ? "opacity-50 pointer-events-none" : ""}>
              <span className="text-[11px] text-muted-foreground">Color</span>
              <div className="grid grid-cols-8 gap-1.5 mt-1.5">
                {NUMBER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => onApply("color", c)}
                    className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 ${style.color === c ? "ring-2 ring-blue-500 ring-offset-1 ring-offset-card border-transparent" : "border-border"}`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
