import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Undo2, AlertTriangle, Layers, Gauge, BarChart3, FileWarning } from "lucide-react";
import { invokeFunction } from "@/api/functionsClient";

export default function UndoImportDialog({ open, onOpenChange, projectId, onUndone }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(null);
      setPreview(null);
      invokeFunction("undoLastImport", { project_id: projectId, preview: true })
        .then((res) => setPreview(res.data))
        .catch((err) => setError(err.response?.data?.error || "No imports found to undo."))
        .finally(() => setLoading(false));
    }
  }, [open, projectId]);

  const handleUndo = async () => {
    setUndoing(true);
    try {
      await invokeFunction("undoLastImport", { project_id: projectId });
      onUndone?.();
      onOpenChange(false);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to undo import.");
    } finally {
      setUndoing(false);
    }
  };

  const hasData = preview && (preview.layerCount > 0 || preview.meterCount > 0 || preview.readingCount > 0 || preview.logCount > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-red-600" /> Undo Last Import
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                This will permanently delete all data from the last import. This action cannot be undone.
              </p>
            </div>

            {preview.layerNames?.length > 0 && (
              <p className="text-xs text-slate-500">
                Import: <span className="font-medium text-slate-700">{preview.layerNames.join(", ")}</span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <SummaryCard icon={Layers} label="Layers" count={preview.layerCount} color="text-blue-600 bg-blue-50" />
              <SummaryCard icon={Gauge} label="Meters" count={preview.meterCount} color="text-emerald-600 bg-emerald-50" />
              <SummaryCard icon={BarChart3} label="Readings" count={preview.readingCount} color="text-purple-600 bg-purple-50" />
              <SummaryCard icon={FileWarning} label="Import Logs" count={preview.logCount} color="text-amber-600 bg-amber-50" />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={undoing}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleUndo}
            disabled={loading || undoing || !hasData}
            className="gap-1.5"
          >
            {undoing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Undoing...
              </>
            ) : (
              <>
                <Undo2 className="w-4 h-4" /> Undo Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ icon: Icon, label, count, color }) {
  return (
    <div className={`rounded-lg p-3 ${color}`}>
      <Icon className="w-4 h-4 mb-1.5" />
      <p className="text-xl font-bold">{count.toLocaleString()}</p>
      <p className="text-[11px] opacity-80">{label}</p>
    </div>
  );
}