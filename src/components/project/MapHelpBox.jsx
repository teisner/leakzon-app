import React, { useState, useEffect } from "react";
import { X, Info } from "lucide-react";

const HELP_CONTENT = {
  draw_dma: {
    title: "Draw DMA",
    instructions: [
      { text: "Click on the map to add polygon vertices", keys: [] },
      { text: "Finish drawing (min 3 points)", keys: ["Enter"] },
      { text: "Undo last point", keys: ["U"] },
      { text: "Zoom in / out", keys: ["+", "-"] },
      { text: "Pan the map", keys: ["↑", "↓", "←", "→"] },
      { text: "Switch to Satellite / Terrain", keys: ["S", "T"] },
    ],
  },
  insertion_meters: {
    title: "Add Insertion Meters",
    instructions: [
      { text: "Click on the map to place a meter", keys: [] },
      { text: "Click a marker to edit name or delete", keys: [] },
      { text: "Drag markers to reposition", keys: [] },
      { text: "Zoom in / out", keys: ["+", "-"] },
      { text: "Pan the map", keys: ["↑", "↓", "←", "→"] },
    ],
  },
  water_lines: {
    title: "Add Water Lines",
    instructions: [
      { text: "Click on the map to add line vertices", keys: [] },
      { text: "Finish current line", keys: ["Enter"] },
      { text: "Undo last vertex", keys: ["U"] },
      { text: "Zoom in / out", keys: ["+", "-"] },
      { text: "Pan the map", keys: ["↑", "↓", "←", "→"] },
    ],
  },
  isolated_points: {
    title: "Isolated Points Mode",
    instructions: [
      { text: "Click a valve to assign it between two DMAs", keys: [] },
      { text: "Zoom in / out", keys: ["+", "-"] },
      { text: "Pan the map", keys: ["↑", "↓", "←", "→"] },
    ],
  },
};

export default function MapHelpBox({ mode }) {
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state whenever the mode changes
  useEffect(() => {
    setDismissed(false);
  }, [mode]);

  if (!mode || dismissed) return null;

  const content = HELP_CONTENT[mode];
  if (!content) return null;

  return (
    <div className="absolute bottom-3 right-3 z-[999] w-[290px] bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Info className="w-4 h-4 text-primary" />
        </div>
        <span className="text-sm font-semibold text-foreground">{content.title}</span>
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          title="Close help"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-1.5">
        {content.instructions.map((inst, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="flex-1 text-muted-foreground">{inst.text}</span>
            {inst.keys.length > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                {inst.keys.map((key, j) => (
                  <kbd
                    key={j}
                    className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-muted border border-border rounded text-foreground min-w-[20px] text-center"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}