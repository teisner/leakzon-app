import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Loader2, User, Clock } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { computeProgress } from "@/lib/progressTracker";

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export default function ProgressDialog({ open, onOpenChange, project }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !project) return;
    setLoading(true);
    supabase
      .from('project_progress')
      .select('*, system_user(full_name)')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setEntries(data || []))
      .finally(() => setLoading(false));
  }, [open, project]);

  const progress = computeProgress(entries);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-blue-600" />
            Project Progress — {project?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{progress.completed} of {progress.total} milestones completed</span>
            <span className="font-semibold text-slate-700">{progress.pct}%</span>
          </div>
          <Progress value={progress.pct} className="h-2" />
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {progress.completedList.map((e) => (
              <div key={e.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{e.title}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {e.system_user?.full_name || "System"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatDate(e.created_at)}
                    </span>
                  </div>
                  {e.description && (
                    <p className="text-[11px] text-slate-400 mt-0.5">{e.description}</p>
                  )}
                </div>
              </div>
            ))}
            {progress.remaining.map((m) => (
              <div key={m.activity_type} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                <Circle className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-400">{m.title}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Pending</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}