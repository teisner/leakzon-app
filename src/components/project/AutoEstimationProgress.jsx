import React from "react";
import { Sparkles, Loader2, CheckCircle2, MousePointerClick } from "lucide-react";

export default function AutoEstimationProgress({ current, total, manualCount, threshold }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const isDone = current >= total;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[420px] max-w-[calc(100vw-24px)] bg-white/95 backdrop-blur rounded-xl shadow-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          {isDone ? (
            <CheckCircle2 className="w-5 h-5 text-blue-600" />
          ) : (
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900">
            {isDone ? "Auto-assignment complete" : "Auto-assigning locations"}
          </h3>
          <p className="text-xs text-slate-500">
            {isDone
              ? `${total} meter${total !== 1 ? "s" : ""} placed automatically`
              : `Placing high-confidence meters (score ≥ ${threshold})`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-2xl font-bold text-slate-900">{current}</span>
          <span className="text-sm text-slate-400">/{total}</span>
        </div>
      </div>

      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      {isDone && manualCount > 0 && (
        <div className="mt-4 flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3">
          <MousePointerClick className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-slate-600">
            <span className="font-semibold">{manualCount}</span> meter{manualCount !== 1 ? "s" : ""} need manual review — starting now…
          </p>
        </div>
      )}
      {isDone && manualCount === 0 && (
        <div className="mt-4 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-xs text-slate-600">All meters placed automatically — no manual review needed.</p>
        </div>
      )}
    </div>
  );
}