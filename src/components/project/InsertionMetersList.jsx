import React, { useState, useEffect, useRef } from "react";
import { Gauge, MapPin, Loader2, Navigation, ChevronDown, ChevronRight } from "lucide-react";
import { reverseGeocode } from "@/lib/reverseGeocode";
import { pointInPolygon } from "@/lib/polygonUtils";

const parsePolygon = (dma) => {
  try {
    const poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
    return Array.isArray(poly) && poly.length >= 3 ? poly : null;
  } catch {
    return null;
  }
};

export default function InsertionMetersList({ insertionMeters, dmas, onZoomTo, expanded: expandedProp, onExpandedChange, refreshTrigger }) {
  const [addresses, setAddresses] = useState({});
  const [loadingAddr, setLoadingAddr] = useState({});
  const [expandedLocal, setExpandedLocal] = useState(true);
  const expanded = onExpandedChange ? expandedProp : expandedLocal;
  const setExpanded = onExpandedChange || setExpandedLocal;
  const geocodedRef = useRef(new Set());

  const dmaPolygons = (dmas || []).map(parsePolygon).filter(Boolean);

  const getDmaName = (meter) => {
    // A main meter can be linked to more than one DMA — show all of them.
    const linked = (dmas || []).filter((d) => d.main_meter_id === meter.id).map((d) => d.name);
    if (linked.length > 0) return linked.join(", ");
    // Then check point-in-polygon
    if (!meter?.latitude || !meter?.longitude) return "—";
    for (let i = 0; i < (dmas || []).length; i++) {
      const poly = parsePolygon(dmas[i]);
      if (poly && pointInPolygon(meter.latitude, meter.longitude, poly)) {
        return dmas[i].name;
      }
    }
    return "—";
  };

  useEffect(() => {
    if (!insertionMeters || insertionMeters.length === 0) return;
    if (refreshTrigger > 0) {
      geocodedRef.current.clear();
      setAddresses({});
    }
    let cancelled = false;
    (async () => {
      for (const m of insertionMeters) {
        if (cancelled) return;
        if (geocodedRef.current.has(m.id)) continue;
        geocodedRef.current.add(m.id);
        if (m.latitude == null || m.longitude == null) continue;
        setLoadingAddr((prev) => ({ ...prev, [m.id]: true }));
        try {
          const addr = await reverseGeocode(m.latitude, m.longitude);
          if (!cancelled) {
            setAddresses((prev) => ({ ...prev, [m.id]: addr || "Address unavailable" }));
          }
        } catch {
          if (!cancelled) {
            setAddresses((prev) => ({ ...prev, [m.id]: "Address unavailable" }));
          }
        } finally {
          if (!cancelled) {
            setLoadingAddr((prev) => ({ ...prev, [m.id]: false }));
          }
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    })();
    return () => { cancelled = true; };
  }, [insertionMeters, refreshTrigger]);

  if (!insertionMeters || insertionMeters.length === 0) return null;

  return (
    <div className="space-y-2 mt-3 pt-3 border-t border-border">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
        )}
        <Gauge className="w-4 h-4 text-blue-500" />
        <p className="text-sm font-semibold text-foreground">Insertion Meters</p>
        <span className="text-xs text-muted-foreground">({insertionMeters.length})</span>
      </button>
      {expanded && insertionMeters.map((m) => (
        <div key={m.id} className="flex flex-col p-3 bg-card border border-border rounded-lg">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full shrink-0 border-2 border-blue-500 bg-blue-500/20 flex items-center justify-center">
              <Gauge className="w-3 h-3 text-blue-500" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {m.uid || "Unnamed"}
              </p>
            </div>
            {onZoomTo && m.latitude != null && (
              <button
                onClick={() => onZoomTo(m)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Zoom to meter"
              >
                <Navigation className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="mt-2 space-y-1.5 text-xs">
            {m.latitude != null && m.longitude != null && (
              <div className="flex items-start gap-1.5">
                <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-muted-foreground font-mono">
                  {m.latitude?.toFixed(5)}, {m.longitude?.toFixed(5)}
                </span>
              </div>
            )}
            {m.latitude != null && (
              <div className="flex items-start gap-1.5">
                {loadingAddr[m.id] ? (
                  <Loader2 className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5 animate-spin" />
                ) : (
                  <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <span className="text-muted-foreground">
                  {addresses[m.id] || "Loading address..."}
                </span>
              </div>
            )}
            <div className="flex items-start gap-1.5">
              <Gauge className="w-3 h-3 text-blue-500 shrink-0 mt-0.5" />
              <span className="text-muted-foreground">
                DMA: <span className="font-medium text-foreground">{getDmaName(m)}</span>
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}