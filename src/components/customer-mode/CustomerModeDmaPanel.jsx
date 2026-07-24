import React, { useState, useMemo } from "react";
import { ChevronDown, Crosshair } from "lucide-react";
import { calculatePolygonAreaSqm, countMetersInPolygon } from "@/lib/polygonUtils";

function formatArea(areaSqm, distanceUnit) {
  if (distanceUnit === "Miles") {
    const mi2 = areaSqm / 2589988.11;
    return `${mi2.toFixed(2)} mi²`;
  }
  const km2 = areaSqm / 1000000;
  return `${km2.toFixed(2)} km²`;
}

export default function CustomerModeDmaPanel({ dmas, meters, distanceUnit, onFocusDma }) {
  const [minimized, setMinimized] = useState(false);

  const dmaData = useMemo(() => {
    return (dmas || []).map((dma) => {
      let poly;
      try {
        poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
      } catch {
        poly = [];
      }
      const area = calculatePolygonAreaSqm(poly);
      const meterCount = countMetersInPolygon(meters, poly, null);
      return { ...dma, area, meterCount, polygon: poly };
    });
  }, [dmas, meters]);

  return (
    <div className="absolute top-3 right-3 z-[1000]">
      <div className="bg-zinc-700/95 backdrop-blur rounded-xl shadow-lg border border-border p-3 w-[230px]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-foreground/90">DMAs</p>
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
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {dmaData.length === 0 && (
              <p className="text-xs text-muted-foreground/70 py-2">No DMAs defined</p>
            )}
            {dmaData.map((dma) => (
              <div key={dma.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className="w-3 h-3 rounded-sm shrink-0 border"
                  style={{ borderColor: dma.color || "#3b82f6", backgroundColor: dma.color || "#3b82f6" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-foreground">{dma.name}</p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {formatArea(dma.area, distanceUnit)} · {dma.meterCount} meters
                  </p>
                </div>
                <button
                  onClick={() => onFocusDma?.(dma.polygon)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="Focus on map"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}