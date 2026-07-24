import React from "react";
import { MapPin, Loader2, Check, X, Building2, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";

// Floating panel shown after the user clicks a point on the map.
// Displays coordinates + reverse-geocoded address, with confirm/cancel actions.
// For insertion meters, also shows the nearest water line diameter (editable).
export default function PinpointPanel({ meter, coords, address, loading, diameter, onDiameterChange, onConfirm, onCancel }) {
  if (!coords) return null;
  const [lat, lng] = coords;
  const showDiameter = diameter !== null && diameter !== undefined;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] w-[420px] max-w-[calc(100%-2rem)] bg-white/95 backdrop-blur rounded-lg shadow-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-semibold text-slate-900">Pinpoint Location</span>
        <span className="text-xs text-slate-400 ml-auto">Meter: {meter?.uid}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <MapPin className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-mono">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
        </div>

        <div className="flex items-start gap-2 text-xs min-h-[20px]">
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0 mt-0.5" />
              <span className="text-slate-500">Resolving nearest address & pipe diameter…</span>
            </>
          ) : address ? (
            <>
              <Building2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span className="text-slate-700">{address}</span>
            </>
          ) : (
            <>
              <Building2 className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
              <span className="text-slate-400">No address found for this location</span>
            </>
          )}
        </div>

        {showDiameter && !loading && (
          <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
            <Ruler className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-slate-600 shrink-0">Nearest pipe ⌀:</span>
            <input
              type="text"
              value={diameter || ""}
              onChange={(e) => onDiameterChange?.(e.target.value)}
              className="w-24 px-2 py-0.5 border border-amber-200 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
              placeholder="e.g. 100"
            />
            <span className="text-slate-400 text-[10px]">editable</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
        <Button
          size="sm"
          className="flex-1 gap-1.5"
          onClick={onConfirm}
          disabled={loading}
        >
          <Check className="w-3.5 h-3.5" /> Save Location
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={onCancel}
          disabled={loading}
        >
          <X className="w-3.5 h-3.5" /> Cancel
        </Button>
      </div>
    </div>
  );
}