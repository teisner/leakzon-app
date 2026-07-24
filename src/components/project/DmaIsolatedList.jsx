import React, { useState, useEffect, useRef } from "react";
import { Hexagon, ChevronDown, ChevronRight, MapPin, Loader2, Navigation } from "lucide-react";
import { reverseGeocode } from "@/lib/reverseGeocode";

const ID_FIELDS = [
  "OBJECTID", "FID", "id", "ID", "Id", "valve_id", "VALVE_ID",
  "V_ID", "v_id", "gid", "GID", "ref", "REF", "serial", "SERIAL",
];

function extractPointId(featureProperties, counter) {
  if (!featureProperties) return `#${counter}`;
  try {
    const props = typeof featureProperties === "string"
      ? JSON.parse(featureProperties)
      : featureProperties;
    if (props && typeof props === "object") {
      for (const field of ID_FIELDS) {
        if (props[field] != null && String(props[field]).trim()) {
          return String(props[field]).trim();
        }
      }
      for (const key of Object.keys(props)) {
        if (/(^id|valve|ref|serial|num|fid|gid)/i.test(key) && props[key] != null && String(props[key]).trim()) {
          return String(props[key]).trim();
        }
      }
    }
  } catch {}
  return `#${counter}`;
}

function formatCoord(val) {
  return val != null ? Number(val).toFixed(6) : "—";
}

export default function DmaIsolatedList({ dmas, isolatedPoints }) {
  const [expanded, setExpanded] = useState(false);
  const [addresses, setAddresses] = useState({});
  const [loadingAddr, setLoadingAddr] = useState(false);
  const geocodedRef = useRef(new Set());
  const cancelRef = useRef(false);

  const points = isolatedPoints || [];
  const dmaName = (dmaId) => (dmas || []).find((d) => d.id === dmaId)?.name || "—";

  useEffect(() => {
    if (!expanded || points.length === 0) return;
    cancelRef.current = false;

    const geocodeAll = async () => {
      setLoadingAddr(true);
      for (const pt of points) {
        if (cancelRef.current) break;
        if (geocodedRef.current.has(pt.id)) continue;
        geocodedRef.current.add(pt.id);
        try {
          const addr = await reverseGeocode(pt.latitude, pt.longitude);
          if (!cancelRef.current) {
            setAddresses((prev) => ({ ...prev, [pt.id]: addr || "N/A" }));
          }
        } catch {
          if (!cancelRef.current) {
            setAddresses((prev) => ({ ...prev, [pt.id]: "N/A" }));
          }
        }
        await new Promise((r) => setTimeout(r, 1100));
      }
      if (!cancelRef.current) setLoadingAddr(false);
    };
    geocodeAll();

    return () => { cancelRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  if (!dmas || dmas.length === 0) return null;

  return (
    <div className="rounded-xl bg-muted">
      {/* DMA Layer Header */}
      <div className="flex items-center gap-2 p-3">
        <Hexagon className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">DMA</p>
          <p className="text-xs text-muted-foreground/70">
            {dmas.length} DMA · {points.length} isolated point{points.length !== 1 ? "s" : ""}
          </p>
        </div>
        {points.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-0.5 hover:bg-background rounded"
          >
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
        )}
      </div>

      {/* Isolated Points List */}
      {expanded && points.length > 0 && (
        <div className="ml-6 mb-2 mr-2 space-y-2 border-l-2 border-border pl-3">
          {loadingAddr && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 py-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Resolving nearest addresses…
            </div>
          )}
          {points.map((pt, idx) => {
            const id = extractPointId(pt.feature_properties, idx + 1);
            return (
              <div key={pt.id} className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-primary shrink-0" />
                  <span className="text-xs font-medium text-foreground">{id}</span>
                </div>
                <p className="text-[10px] text-muted-foreground pl-4">
                  {formatCoord(pt.latitude)}, {formatCoord(pt.longitude)}
                </p>
                <p className="text-[10px] text-muted-foreground pl-4">
                  Between{" "}
                  <span className="text-foreground/80 font-medium">{dmaName(pt.dma1_id)}</span>
                  {" "}and{" "}
                  <span className="text-foreground/80 font-medium">{dmaName(pt.dma2_id)}</span>
                </p>
                <p className="text-[10px] text-muted-foreground/70 pl-4 flex items-start gap-1">
                  <Navigation className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                  {addresses[pt.id] || "Resolving…"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}