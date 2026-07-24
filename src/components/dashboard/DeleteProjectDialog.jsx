import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { invokeFunction } from "@/api/functionsClient";
import { useLanguage } from "@/lib/i18n";

const STEPS = [
  { key: "consumption_readings", labelKey: "deleteProject.steps.consumptionReadings" },
  { key: "meters", labelKey: "deleteProject.steps.meters" },
  { key: "layers", labelKey: "deleteProject.steps.layers" },
  { key: "import_logs", labelKey: "deleteProject.steps.importLogs" },
  { key: "project", labelKey: "deleteProject.steps.project" },
];

export default function DeleteProjectDialog({ open, onOpenChange, project, onDeleted }) {
  const { t } = useLanguage();
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(100);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(-1);

  useEffect(() => {
    if (open) {
      setConfirmName("");
      setDeleting(false);
      setProgress(100);
      setCompletedSteps([]);
      setCurrentStepIdx(-1);
    }
  }, [open]);

  const canDelete = confirmName === project?.name;

  const handleDelete = async () => {
    setDeleting(true);
    setProgress(100);
    setCompletedSteps([]);

    for (let i = 0; i < STEPS.length; i++) {
      setCurrentStepIdx(i);
      try {
        await invokeFunction("deleteProject", { project_id: project.id, step: STEPS[i].key });
      } catch {
        // Continue even if a step fails — delete as much as possible
      }
      setCompletedSteps((prev) => [...prev, STEPS[i].key]);
      setProgress(100 - ((i + 1) / STEPS.length) * 100);
    }

    await new Promise((r) => setTimeout(r, 600));

    setCurrentStepIdx(-1);
    onDeleted?.(project.id);
    onOpenChange(false);
  };

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !deleting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => deleting && e.preventDefault()} onEscapeKeyDown={(e) => deleting && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="w-5 h-5" /> {t('deleteProject.title')}
          </DialogTitle>
        </DialogHeader>

        {deleting ? (
          <div className="space-y-4 py-2">
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700 mb-3">{t('deleteProject.deleting')}</p>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-red-100">
                <div
                  className="h-full bg-red-500 transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">{t('deleteProject.remaining', { percent: Math.round(progress) })}</p>
            </div>

            <div className="space-y-1.5">
              {STEPS.map((step, i) => {
                const isCompleted = completedSteps.includes(step.key);
                const isCurrent = i === currentStepIdx;
                return (
                  <div key={step.key} className="flex items-center gap-2 text-sm">
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-red-500 shrink-0 animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" />
                    )}
                    <span className={
                       isCompleted ? "text-slate-400 line-through"
                         : isCurrent ? "text-slate-900 font-medium"
                           : "text-slate-400"
                     }>
                      {t(step.labelKey)}
                     </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  {t('deleteProject.warning', { name: project.name })}
                </p>
              </div>

              <div>
                <Label>
                  {t('deleteProject.confirmName', { name: '' })} <span className="font-semibold text-slate-900">{project.name}</span>
                </Label>
                <Input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={project.name}
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('deleteProject.cancel')}</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={!canDelete}>
                {t('deleteProject.deleteProject')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}