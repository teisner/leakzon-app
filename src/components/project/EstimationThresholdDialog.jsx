import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Navigation, Zap, Hand } from "lucide-react";

export default function EstimationThresholdDialog({ open, onOpenChange, onStart, queueLength }) {
  const [threshold, setThreshold] = useState(70);

  useEffect(() => {
    if (open) setThreshold(70);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-amber-500" />
            Interactive GIS Estimation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-600">
            Choose a confidence threshold. Meters with a score <span className="font-semibold text-slate-900">at or above</span> this number will be placed automatically; meters below it will require your manual confirmation.
          </p>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-500">Confidence Threshold</span>
              <span className="text-2xl font-bold text-slate-900 tabular-nums">{threshold}</span>
            </div>
            <Slider
              value={[threshold]}
              onValueChange={([v]) => setThreshold(v)}
              min={1}
              max={100}
              step={1}
              className="w-full"
            />
            <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400">
              <span>1</span>
              <span>100</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <Zap className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-emerald-800">Score ≥ {threshold}</p>
                <p className="text-[10px] text-emerald-600 mt-0.5">Auto-placed</p>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <Hand className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Score &lt; {threshold}</p>
                <p className="text-[10px] text-amber-600 mt-0.5">Manual confirmation</p>
              </div>
            </div>
          </div>

          {queueLength > 0 && (
            <p className="text-xs text-slate-400 text-center">
              {queueLength} meter{queueLength !== 1 ? "s" : ""} ready for estimation
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => onStart(threshold)}
            disabled={queueLength === 0}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            Start Estimation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}