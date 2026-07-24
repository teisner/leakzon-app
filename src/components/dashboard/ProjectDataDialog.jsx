import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Upload, Copy, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { recordProgress } from "@/lib/progressTracker";
import { useLanguage } from "@/lib/i18n";
import { uploadFile } from "@/api/storageClient";
import { invokeFunction } from "@/api/functionsClient";
import DuplicationProgress from "@/components/dashboard/DuplicationProgress";

export default function ProjectDataDialog({ open, onOpenChange, mode, project, onCompleted }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [file, setFile] = useState(null);
  const [newName, setNewName] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setLoading(false);
      setDone(false);
      setFile(null);
      setDuplicating(false);
      setNewName(project ? `${project.name} (Copy)` : "");
    }
  }, [open, project]);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await invokeFunction("exportProjectData", { project_id: project.id });
      const data = res.data;
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(project.name || "project").replace(/[^a-zA-Z0-9]/g, "_")}_export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      recordProgress(project.id, "data_exported");
      setDone(true);
      toast({ title: t('dataDialog.exportComplete'), description: t('dataDialog.exportCompleteDesc', { meters: data.stats?.meters ?? 0, layers: data.stats?.layers ?? 0, dmas: data.stats?.dmas ?? 0 }) });
    } catch (err) {
      toast({ title: t('dataDialog.exportFailed'), description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const { file_url } = await uploadFile({ file });
      const res = await invokeFunction("importProjectData", {
        file_url,
        mode: "overwrite",
        target_project_id: project.id,
      });
      setDone(true);
      toast({ title: t('dataDialog.importComplete'), description: t('dataDialog.importCompleteDesc', { meters: res.data?.stats?.meters ?? 0, layers: res.data?.stats?.layers ?? 0 }) });
      onCompleted?.();
    } catch (err) {
      toast({ title: t('dataDialog.importFailed'), description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const [progressStep, setProgressStep] = useState(0);
  const [readingsImported, setReadingsImported] = useState(0);
  const [isImportingReadings, setIsImportingReadings] = useState(false);

  const handleDuplicate = async () => {
    setLoading(true);
    setDuplicating(true);
    setProgressStep(0);
    setReadingsImported(0);
    setIsImportingReadings(false);
    try {
      const name = newName || `${project.name} (Copy)`;

      // Phase 1: Create project + all non-reading entities + first readings chunk
      setProgressStep(3); // jumps through steps 0-3 since backend does them in one call
      const res = await invokeFunction("importProjectData", {
        source_project_id: project.id,
        mode: "new",
        new_name: name,
      });

      const targetProjectId = res.data?.target_project_id;
      const meterIdMap = res.data?.meter_id_map || {};
      const meterUidMap = res.data?.meter_uid_map || {};
      let totalReadings = res.data?.stats?.readings || 0;
      let hasMore = res.data?.has_more_readings;
      const skipped = res.data?.skipped || {};

      // Phase 2: Loop reading chunks until all are imported
      if (hasMore && targetProjectId) {
        setIsImportingReadings(true);
        let offset = 5000;
        while (hasMore) {
          setReadingsImported(totalReadings);
          const chunkRes = await invokeFunction("importProjectData", {
            source_project_id: project.id,
            mode: "new",
            target_project_id: targetProjectId,
            readings_offset: offset,
            meter_id_map: meterIdMap,
            meter_uid_map: meterUidMap,
          });
          totalReadings += chunkRes.data?.readings_imported || 0;
          skipped.readings = (skipped.readings || 0) + (chunkRes.data?.readings_skipped || 0);
          hasMore = chunkRes.data?.has_more;
          offset += 5000;
        }
        setReadingsImported(totalReadings);
      }

      setIsImportingReadings(false);
      setProgressStep(11);
      setDuplicating(false);
      setDone(true);

      const stats = res.data?.stats;
      stats.readings = totalReadings;
      let desc = t('dataDialog.dupCompleteDesc', { name, meters: stats?.meters ?? 0 });
      if (skipped && (skipped.readings > 0 || skipped.network_links > 0 || skipped.isolated_points > 0)) {
        const parts = [];
        if (skipped.readings > 0) parts.push(`${skipped.readings} readings`);
        if (skipped.network_links > 0) parts.push(`${skipped.network_links} links`);
        if (skipped.isolated_points > 0) parts.push(`${skipped.isolated_points} isolation points`);
        desc += ` (Skipped unmapped: ${parts.join(", ")})`;
      }
      toast({ title: t('dataDialog.dupComplete'), description: desc });
      onCompleted?.();
    } catch (err) {
      setDuplicating(false);
      setIsImportingReadings(false);
      toast({ title: t('dataDialog.dupFailed'), description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const titles = {
    export: t('dataDialog.export'),
    import: t('dataDialog.import'),
    duplicate: t('dataDialog.duplicate'),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "export" && <Download className="w-5 h-5 text-blue-600" />}
            {mode === "import" && <Upload className="w-5 h-5 text-blue-600" />}
            {mode === "duplicate" && <Copy className="w-5 h-5 text-blue-600" />}
            {titles[mode] || t('dataDialog.projectData')}
          </DialogTitle>
          <DialogDescription>
            {mode === "export" && t('dataDialog.exportDesc', { name: project?.name })}
            {mode === "import" && t('dataDialog.importDesc', { name: project?.name })}
            {mode === "duplicate" && t('dataDialog.duplicateDesc', { name: project?.name })}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <p className="text-sm font-medium text-slate-700">
              {mode === "export" ? t('dataDialog.fileDownloaded') : mode === "import" ? t('dataDialog.dataImported') : t('dataDialog.projectDuplicated')}
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('dataDialog.close')}</Button>
          </div>
        ) : mode === "export" ? (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 space-y-1">
              <p className="font-medium">{t('dataDialog.exportWill')}</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>{t('dataDialog.exportSettings')}</li>
                <li>{t('dataDialog.exportLayers')}</li>
                <li>{t('dataDialog.exportMeters')}</li>
                <li>{t('dataDialog.exportConsumption')}</li>
                <li>{t('dataDialog.exportDmas')}</li>
                <li>{t('dataDialog.exportLogs')}</li>
              </ul>
            </div>
            <Button onClick={handleExport} disabled={loading} className="w-full gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {loading ? t('dataDialog.exporting') : t('dataDialog.exportData')}
            </Button>
          </div>
        ) : mode === "import" ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t('dataDialog.importWarning')}</span>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">{t('dataDialog.exportFile')}</Label>
              <input
                type="file"
                accept=".json"
                onChange={(e) => setFile(e.target.files[0])}
                className="w-full text-sm border border-input rounded-md p-2 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>
            <Button onClick={handleImport} disabled={loading || !file} className="w-full gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {loading ? t('dataDialog.importing') : t('dataDialog.overwriteData')}
            </Button>
          </div>
        ) : mode === "duplicate" ? (
          duplicating ? (
            <DuplicationProgress
              projectName={newName || project?.name}
              currentStep={progressStep}
              readingsImported={readingsImported}
              isImportingReadings={isImportingReadings}
            />
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-xs mb-1.5 block">{t('dataDialog.newProjectName')}</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('dataDialog.projectNamePlaceholder')} />
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
                {t('dataDialog.duplicateInfo')}
              </div>
              <Button onClick={handleDuplicate} disabled={loading} className="w-full gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                {loading ? t('dataDialog.duplicating') : t('dataDialog.duplicateProject')}
              </Button>
            </div>
          )
        ) : null}

        {!done && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>{t('dataDialog.cancel')}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}