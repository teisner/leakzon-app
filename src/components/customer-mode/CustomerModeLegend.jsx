import React, { useState } from "react";
import { Eye, EyeOff, ChevronDown, MapPin, ListOrdered } from "lucide-react";
import { resolvePointColors } from "@/lib/colorPalette";

// Renders a legend symbol that visually matches the layer's map appearance
function LayerSymbol({ layer }) {
  const boundary = /boundary/i.test(layer.name);
  if (boundary) {
    return (
      <span
        className="w-4 h-0 border-t-2 border-dashed shrink-0 inline-block"
        style={{ borderColor: "#dc2626" }}
      />
    );
  }

  const pipe = layer.pipe_config;
  if (pipe) {
    const color = pipe.uniform
      ? layer.color
      : pipe.diameters?.[0]?.color || layer.color;
    return (
      <span
        className="w-4 h-0 border-t-2 shrink-0 inline-block"
        style={{ borderColor: color, borderTopWidth: 3 }}
      />
    );
  }

  if (layer.icon_url) {
    return <img src={layer.icon_url} className="w-4 h-4 object-contain shrink-0" alt="" />;
  }

  // Point layer — render the actual shape with fill/outline
  const pc = layer.point_config || {};
  const shape = pc.shape || "circle";
  const { fill: rawFill, stroke } = resolvePointColors(layer);
  const fill = rawFill === "transparent" ? "none" : rawFill;

  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="2" className="shrink-0">
      {shape === "circle" && <circle cx="12" cy="12" r="10" />}
      {shape === "square" && <rect x="3" y="3" width="18" height="18" rx="2" />}
      {shape === "triangle" && <polygon points="12,2 22,22 2,22" />}
      {shape === "star" && (
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
      )}
    </svg>
  );
}

export default function CustomerModeLegend({ layers, dmas, visibleLayers, onToggleLayer, showDmas, onToggleDmas, showDmaNames, onToggleDmaNames, showPointNumbers, onTogglePointNumbers }) {
  const [minimized, setMinimized] = useState(false);

  const shpLayers = layers.filter((l) => l.layer_type === "shp");
  const dataLayers = layers.filter((l) => l.layer_type === "data");
  const allLayers = [...shpLayers, ...dataLayers];

  const isLayerVisible = (layer) =>
    visibleLayers[layer.id] !== undefined ? visibleLayers[layer.id] : (layer.visible ?? true);

  return (
    <div className="absolute top-3 left-3 z-[1000]">
      <div className="bg-zinc-700/95 backdrop-blur rounded-xl shadow-lg border border-border p-3 w-[230px]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-foreground/90">Map Layers</p>
          <button
            onClick={() => setMinimized((v) => !v)}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={minimized ? "Expand" : "Minimize"}
          >
            <ChevronDown
              className="w-3.5 h-3.5 transition-transform duration-300"
              style={{ transform: minimized ? "rotate(-90deg)" : "rotate(0deg)" }}
            />
          </button>
        </div>

        {!minimized && (
          <>
            {dmas.length > 0 && (
              <button
                onClick={onToggleDmas}
                className={`w-full flex items-center justify-between gap-2 mb-2 pb-2 border-b border-border px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  showDmas ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-sm border shrink-0"
                    style={{ borderColor: dmas[0]?.color || "#3b82f6", backgroundColor: dmas[0]?.color || "#3b82f6" }}
                  />
                  DMAs
                </span>
                <span className={`relative inline-flex h-3.5 w-6 rounded-full transition-colors ${showDmas ? "bg-primary" : "bg-muted-foreground/40"}`}>
                  <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-card transition-transform ${showDmas ? "translate-x-3" : "translate-x-0.5"}`} />
                </span>
              </button>
            )}

            {dmas.length > 0 && (
              <button
                onClick={onToggleDmaNames}
                className={`w-full flex items-center justify-between gap-2 mb-2 pb-2 border-b border-border px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  showDmaNames ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" /> DMA Names
                </span>
                <span className={`relative inline-flex h-3.5 w-6 rounded-full transition-colors ${showDmaNames ? "bg-primary" : "bg-muted-foreground/40"}`}>
                  <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-card transition-transform ${showDmaNames ? "translate-x-3" : "translate-x-0.5"}`} />
                </span>
              </button>
            )}

            <button
              onClick={onTogglePointNumbers}
              className={`w-full flex items-center justify-between gap-2 mb-2 pb-2 border-b border-border px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                showPointNumbers ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:bg-muted"
              }`}
              title="Number main/insertion meters, Ultrasonic Meters, and isolated valves/points"
            >
              <span className="flex items-center gap-1.5">
                <ListOrdered className="w-3 h-3" /> Point Numbers
              </span>
              <span className={`relative inline-flex h-3.5 w-6 rounded-full transition-colors ${showPointNumbers ? "bg-primary" : "bg-muted-foreground/40"}`}>
                <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-card transition-transform ${showPointNumbers ? "translate-x-3" : "translate-x-0.5"}`} />
              </span>
            </button>

            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {allLayers.map((layer) => {
                const isHidden = !isLayerVisible(layer);
                return (
                  <div key={layer.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <LayerSymbol layer={layer} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-foreground">{layer.name}</p>
                      <p className="text-[10px] text-muted-foreground/70">{layer.feature_count || 0} records</p>
                    </div>
                    <button
                      onClick={() => onToggleLayer(layer.id)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                      title={isHidden ? "Show layer" : "Hide layer"}
                    >
                      {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}