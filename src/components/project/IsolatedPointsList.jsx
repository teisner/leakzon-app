import React, { useState, useEffect, useRef } from "react";
import { Shield, MapPin, Trash2, Loader2, Navigation, ChevronDown, ChevronRight } from "lucide-react";
import { reverseGeocode } from "@/lib/reverseGeocode";

// Extract a valve ID from feature properties.
// Tries common ID field names, then falls back to the first ID-like property.
function extractValveId(featureProperties) {
  if (!featureProperties) return "—";
  let props = featureProperties;
  if (typeof props === "string") {
    try { props = JSON.parse(props); } catch { return "—"; }
  }
  const entries = Object.entries(props).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return "—";
  const idKeys = ["id", "fid", "objectid", "gid", "valve_id", "valveid", "v_id", "uid", "ref", "name"];
  for (const key of idKeys) {
    const found = entries.find(([k]) => k.toLowerCase() === key);
    if (found) return String(found[1]);
  }
  const idLike = entries.find(([k]) => /id|num|ref|name/i.test(k));
  if (idLike) return String(idLike[1]);
  return String(entries[0][1]);
}

export default function IsolatedPointsList({ isolatedPoints, dmas, onDeleteIsolatedPoint, onZoomTo, expanded: expandedProp, onExpandedChange, refreshTrigger }) {
  const [addresses, setAddresses] = useState({});
  const [loadingAddr, setLoadingAddr] = useState({});
  const [expandedLocal, setExpandedLocal] = useState(true);
  const expanded = onExpandedChange ? expandedProp : expandedLocal;
  const setExpanded = onExpandedChange || setExpandedLocal;
  const geocodedRef = useRef(new Set());

  const getDmaName = (id) => (dmas || []).find((d) => d.id === id)?.name || "—";

  useEffect(() => {
    if (!isolatedPoints || isolatedPoints.length === 0) return;
    if (refreshTrigger > 0) {
      geocodedRef.current.clear();
      setAddresses({});
    }
    let cancelled = false;
    (async () => {
      for (const ip of isolatedPoints) {
        if (cancelled) return;
        if (geocodedRef.current.has(ip.id)) continue;
        geocodedRef.current.add(ip.id);
        setLoadingAddr((prev) => ({ ...prev, [ip.id]: true }));
        try {
          const addr = await reverseGeocode(ip.latitude, ip.longitude);
          if (!cancelled) {
            setAddresses((prev) => ({ ...prev, [ip.id]: addr || "Address unavailable" }));
          }
        } catch {
          if (!cancelled) {
            setAddresses((prev) => ({ ...prev, [ip.id]: "Address unavailable" }));
          }
        } finally {
          if (!cancelled) {
            setLoadingAddr((prev) => ({ ...prev, [ip.id]: false }));
          }
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    })();
    return () => { cancelled = true; };
  }, [isolatedPoints, refreshTrigger]);

  if (!isolatedPoints || isolatedPoints.length === 0) return null;

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
        <Shield className="w-4 h-4 text-amber-500" />
        <p className="text-sm font-semibold text-foreground">Isolated Points</p>
        <span className="text-xs text-muted-foreground">({isolatedPoints.length})</span>
      </button>
      {expanded && isolatedPoints.map((ip) => {
        const valveId = extractValveId(ip.feature_properties);
        return (
          <div key={ip.id} className="flex flex-col p-3 bg-card border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full shrink-0 border-2 border-black"
                style={{ backgroundColor: ip.color || "#92c141" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  Valve {valveId}
                </p>
              </div>
              {onZoomTo && (
                <button
                  onClick={() => onZoomTo(ip)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Zoom to point"
                >
                  <Navigation className="w-3.5 h-3.5" />
                </button>
              )}
              {onDeleteIsolatedPoint && (
                <button
                  onClick={() => onDeleteIsolatedPoint(ip.id)}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  title="Remove isolated point"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="mt-2 space-y-1.5 text-xs">
              <div className="flex items-start gap-1.5">
                <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-muted-foreground font-mono">
                  {ip.latitude?.toFixed(5)}, {ip.longitude?.toFixed(5)}
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                {loadingAddr[ip.id] ? (
                  <Loader2 className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5 animate-spin" />
                ) : (
                  <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <span className="text-muted-foreground">
                  {addresses[ip.id] || "Loading address..."}
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <Shield className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                <span className="text-muted-foreground">
                  Between <span className="font-medium text-foreground">{getDmaName(ip.dma1_id)}</span> &amp; <span className="font-medium text-foreground">{getDmaName(ip.dma2_id)}</span>
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}