import React, { useState, useMemo } from "react";
import { CheckCircle2, Circle, Lock, PartyPopper } from "lucide-react";
import { buildEstimationQueue } from "@/lib/estimationQueue";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/lib/i18n";

export default function ProjectStatusSection({ project, meters, layers, dmas, estimationInProgress, onCompleteOnboarding }) {
  const { t } = useLanguage();
  const [showConfirm, setShowConfirm] = useState(false);

  const estimationQueue = useMemo(() => buildEstimationQueue(meters || []), [meters]);

  const tasks = [
    { label: t('status.projectCreated'), done: true },
    { label: t('status.metersUploaded'), done: (meters || []).length > 0 },
    { label: t('status.layersUploaded'), done: (layers || []).length > 0 },
    {
      label: t('status.completeGis'),
      done: (meters || []).length > 0 && !estimationInProgress && estimationQueue.length === 0,
    },
    { label: t('status.exportAnomalies'), done: !!project?.anomaly_reports_exported },
    { label: t('status.dmaCreation'), done: (dmas || []).length > 0 },
    { label: t('status.assignMainMeter'), done: (dmas || []).some((d) => d.main_meter_id) },
  ];

  const completedCount = tasks.filter((t) => t.done).length;
  const allDone = tasks.every((t) => t.done);
  const isLocked = !!project?.onboarding_complete;

  const handleConfirm = async () => {
    setShowConfirm(false);
    await onCompleteOnboarding?.();
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('status.title')}</h4>
        {isLocked ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            <Lock className="w-3 h-3" /> {t('status.locked')}
          </span>
        ) : (
          <span className="text-[10px] font-medium text-slate-400">{completedCount}/{tasks.length}</span>
        )}
      </div>

      <div className="space-y-1.5 mb-4">
        {tasks.map((task, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm">
            {task.done ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-slate-300 shrink-0" />
            )}
            <span className={task.done ? "text-slate-700" : "text-slate-400"}>{task.label}</span>
          </div>
        ))}
      </div>

      {isLocked ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
          <p className="text-sm font-semibold text-emerald-700">{t('status.onboardingCompleted')}</p>
          <p className="text-[11px] text-emerald-600 mt-0.5">{t('status.dataLocked')}</p>
        </div>
      ) : (
        <>
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={!allDone}
            className="w-full h-11 text-sm font-bold gap-2 rounded-xl"
          >
            <PartyPopper className="w-4 h-4" />
            {t('status.completeBtn')}
            </Button>
            {!allDone && (
            <p className="text-[11px] text-slate-400 text-center mt-1.5">
              {t('status.completeAllTasks')}
            </p>
          )}
        </>
      )}

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('status.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('status.confirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('status.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-emerald-600 hover:bg-emerald-700">
              {t('status.yesComplete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}