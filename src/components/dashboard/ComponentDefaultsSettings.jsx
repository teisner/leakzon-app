import React, { useState } from "react";
import { Settings2, RotateCcw } from "lucide-react";
import { COMPONENTS, SHAPE_CHOICES, DEFAULT_COMPONENT_STYLES, loadComponentDefaults, saveComponentDefaults } from "@/lib/componentDefaults";
import { NUMBER_COLORS } from "@/lib/numberStyle";

function ShapeGlyph({ shape, color, fill }) {
  const stroke = color;
  const fillColor = fill === "outline" ? "none" : color;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={fillColor} stroke={stroke} strokeWidth="2">
      {shape === "circle" && <circle cx="12" cy="12" r="9" />}
      {shape === "square" && <rect x="3" y="3" width="18" height="18" rx="2" />}
      {shape === "triangle" && <polygon points="12,3 22,21 2,21" />}
      {shape === "star" && <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />}
    </svg>
  );
}

export default function ComponentDefaultsSettings() {
  const [styles, setStyles] = useState(() => loadComponentDefaults());

  const update = (key, patch) => {
    setStyles((prev) => {
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      saveComponentDefaults(next);
      return next;
    });
  };

  const resetOne = (key) => update(key, { ...DEFAULT_COMPONENT_STYLES[key] });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-primary" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Default shape, size and color for each component type. Applied automatically to new
          layers when you import or create them (manually or automatically).
        </p>
        <p className="text-[11px] text-muted-foreground/70 mt-1">
          Saved in this browser. Existing layers are not changed — edit those from the layer panel.
        </p>
      </div>

      <div className="space-y-3">
        {COMPONENTS.map(({ key, label }) => {
          const s = styles[key];
          return (
            <div key={key} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShapeGlyph shape={s.shape} color={s.color} fill={s.fill_style} />
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                </div>
                <button
                  onClick={() => resetOne(key)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  title="Reset to default"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {/* Shape */}
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1.5">Shape</label>
                  <div className="flex gap-1.5">
                    {SHAPE_CHOICES.map((shape) => (
                      <button
                        key={shape}
                        onClick={() => update(key, { shape })}
                        className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
                          s.shape === shape ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                        }`}
                        title={shape}
                      >
                        <ShapeGlyph shape={shape} color={s.color} fill={s.fill_style} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Size */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] text-muted-foreground">Size</label>
                    <span className="text-[11px] font-medium text-foreground tabular-nums">{s.size}px</span>
                  </div>
                  <input
                    type="range" min={3} max={16} step={1} value={s.size}
                    onChange={(e) => update(key, { size: parseInt(e.target.value, 10) })}
                    className="w-full accent-primary"
                  />
                  {/* Fill style */}
                  <div className="grid grid-cols-2 gap-1 mt-2 p-0.5 bg-muted rounded-lg">
                    {["filled", "outline"].map((f) => (
                      <button
                        key={f}
                        onClick={() => update(key, { fill_style: f })}
                        className={`text-[11px] font-medium py-1 rounded-md capitalize transition-colors ${
                          s.fill_style === f ? "bg-card shadow text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Color */}
              <div className="mt-3">
                <label className="text-[11px] text-muted-foreground block mb-1.5">Color</label>
                <div className="flex flex-wrap gap-1.5">
                  {NUMBER_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => update(key, { color: c })}
                      className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 ${
                        s.color === c ? "ring-2 ring-primary ring-offset-1 ring-offset-card border-transparent" : "border-border"
                      }`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
