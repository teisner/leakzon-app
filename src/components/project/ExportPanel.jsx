import React, { useState } from "react";
import { Download, FileDown, Database, Loader2, Hexagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportDmasJson, exportDmasShp } from "@/lib/dmaExport";
import ExportMetersDialog from "./ExportMetersDialog";
import ExportDmaDataDialog from "./ExportDmaDataDialog";
import { useLanguage } from "@/lib/i18n";

export default function ExportPanel({ project, dmas, projectId, onAnomalyExported }) {
  const { t } = useLanguage();
  const [shpExporting, setShpExporting] = useState(false);
  const [showMetersExport, setShowMetersExport] = useState(false);
  const [showDmaDataExport, setShowDmaDataExport] = useState(false);

  const hasDmas = dmas && dmas.length > 0;

  const handleExportShp = async () => {
    setShpExporting(true);
    try {
      await exportDmasShp(dmas, project);
    } catch (err) {
      // Previously this had no catch, so any Edge Function error was a silent
      // unhandled rejection — the button just spun and "did nothing".
      console.error("SHP export failed:", err);
      alert(`Could not export shapefile: ${err?.message || "unknown error"}`);
    } finally {
      setShpExporting(false);
    }
  };

  const exports = [
    {
      icon: Download,
      title: t('dma.exportJson'),
      desc: t('exportPanel.jsonDesc'),
      onClick: () => exportDmasJson(dmas, project),
      disabled: !hasDmas,
    },
    {
      icon: FileDown,
      title: t('dma.exportShp'),
      desc: t('exportPanel.shpDesc'),
      onClick: handleExportShp,
      disabled: !hasDmas || shpExporting,
      loading: shpExporting,
    },
    {
      icon: Database,
      title: t('exportMeters.title'),
      desc: t('exportPanel.dataDesc'),
      onClick: () => setShowMetersExport(true),
      disabled: false,
    },
    {
      icon: Hexagon,
      title: t('exportDmaData.title'),
      desc: t('exportPanel.dmaDataDesc'),
      onClick: () => setShowDmaDataExport(true),
      disabled: !hasDmas,
    },
  ];

  return (
    <div className="space-y-3">
      {exports.map((exp, i) => (
        <button
          key={i}
          onClick={exp.onClick}
          disabled={exp.disabled}
          className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-colors text-left ${
            exp.disabled
              ? "border-border bg-muted text-muted-foreground/50 cursor-not-allowed"
              : "border-border bg-card text-foreground hover:bg-muted"
          }`}
        >
          {exp.loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground shrink-0" />
          ) : (
            <exp.icon className="w-5 h-5 text-muted-foreground shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{exp.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{exp.desc}</p>
          </div>
        </button>
      ))}
      <ExportMetersDialog
        open={showMetersExport}
        onOpenChange={setShowMetersExport}
        projectId={projectId}
        dmas={dmas}
        defaultName={`${project?.name || "meters"}_meters`}
        onAnomalyExported={onAnomalyExported}
      />
      <ExportDmaDataDialog
        open={showDmaDataExport}
        onOpenChange={setShowDmaDataExport}
        projectId={projectId}
        projectName={project?.name}
      />
    </div>
  );
}