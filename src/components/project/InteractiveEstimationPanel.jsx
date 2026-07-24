import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Check, SkipForward, MapPin, Users, Navigation, GripHorizontal } from "lucide-react";

function scoreColor(score) {
  if (score >= 80) return { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", bar: "bg-emerald-500", label: "High" };
  if (score >= 60) return { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", bar: "bg-amber-500", label: "Medium" };
  if (score >= 40) return { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", bar: "bg-orange-500", label: "Low" };
  return { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", bar: "bg-red-500", label: "Very Low" };
}

export default function InteractiveEstimationPanel({ target, index, total, onConfirm, onSkip, onClose }) {
  const [pos, setPos] = useState({ x: -1, y: -1 });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef(null);

  // Initialize position once (bottom-center of viewport)
  useEffect(() => {
    if (pos.x === -1 && panelRef.current) {
      const w = panelRef.current.offsetWidth;
      const h = panelRef.current.offsetHeight;
      setPos({
        x: Math.max(12, (window.innerWidth - w) / 2),
        y: Math.max(12, window.innerHeight - h - 24),
      });
    }
  }, [pos.x]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e) => {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y)),
      });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging]);

  const handleMouseDown = (e) => {
    setDragging(true);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  if (!target) return null;
  const { meter, proposed, similarMeters, confidence } = target;
  const progressPct = total > 0 ? Math.round(((index + 1) / total) * 100) : 0;
  const sc = confidence ? scoreColor(confidence) : null;

  const methodLabel = (method) => {
    const labels = {
      interpolated: "Interpolated between neighbors",
      extrapolated: "Extrapolated from street",
      centroid: "Centroid of street meters",
      nearest: "Nearest reference meter",
    };
    return labels[method] || method;
  };

  return (
    <div
      ref={panelRef}
      className="fixed z-[1100] w-[400px] max-w-[calc(100vw-24px)] bg-white/96 backdrop-blur rounded-xl shadow-2xl border border-slate-200"
      style={{ left: pos.x < 0 ? undefined : pos.x, top: pos.y < 0 ? undefined : pos.y }}
    >
      {/* Header — drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`flex items-center justify-between mb-2.5 px-4 pt-3 pb-2 border-b border-slate-100 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-3.5 h-3.5 text-slate-300" />
          <Navigation className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-slate-800">Interactive Estimation</span>
          <span className="text-xs text-slate-400">{index + 1} / {total}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Exit">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 pb-4">
        {/* Progress bar */}
        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden mb-3">
          <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Meter info */}
        <div className="bg-slate-50 rounded-lg p-2.5 mb-3">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-mono font-semibold text-slate-800">{meter.uid}</span>
            <span className="text-[10px] text-slate-400">{meter.is_main ? "Main" : "Sub"}</span>
          </div>
          <p className="text-xs text-slate-600 truncate">{meter.address || "No address"}</p>
          {meter.payer_name && <p className="text-xs text-slate-400 truncate">{meter.payer_name}</p>}
        </div>

        {/* Proposed + confidence + references */}
        {proposed ? (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-[10px] font-semibold text-amber-800">Proposed Location</span>
                </div>
                <p className="text-xs font-mono text-amber-900">{proposed.latitude.toFixed(5)}, {proposed.longitude.toFixed(5)}</p>
                <p className="text-[10px] text-amber-600 mt-0.5">{methodLabel(proposed.method)}</p>
                <p className="text-[10px] text-amber-500 mt-0.5">↔ drag marker to adjust</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-[10px] font-semibold text-blue-800">Reference Meters</span>
                </div>
                <p className="text-xs font-mono text-blue-900">{similarMeters.length} on same street</p>
                <p className="text-[10px] text-blue-600 mt-0.5">highlighted in blue</p>
              </div>
            </div>

            {/* Confidence score */}
            {sc && (
              <div className={`rounded-lg border p-2.5 mb-3 ${sc.bg} ${sc.border}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-slate-600">Location Accuracy Score</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-lg font-bold ${sc.text}`}>{confidence}</span>
                    <span className="text-[10px] text-slate-400">/100</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sc.bg} ${sc.text} border ${sc.border}`}>{sc.label}</span>
                  </div>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div className={`h-full transition-all duration-500 ${sc.bar}`} style={{ width: `${confidence}%` }} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3">
            <p className="text-xs text-red-700">No reference meters found on this street. Cannot estimate.</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button onClick={onConfirm} disabled={!proposed} className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700">
            <Check className="w-4 h-4" /> Confirm Location
          </Button>
          <Button onClick={onSkip} variant="outline" className="gap-1.5">
            <SkipForward className="w-4 h-4" /> Skip
          </Button>
        </div>
      </div>
    </div>
  );
}