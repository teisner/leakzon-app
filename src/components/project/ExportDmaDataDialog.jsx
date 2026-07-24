import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download } from "lucide-react";
import { invokeFunction } from "@/api/functionsClient";
import { useLanguage } from "@/lib/i18n";
import { downloadDmaDataXLS } from "@/lib/dmaDataExport";

export default function ExportDmaDataDialog({ open, onOpenChange, projectId, projectName }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    if (!open) {
      setData(null);
      setError("");
      return;
    }
    setFileName(`${projectName || "project"}_dma_data`);
    setLoading(true);
    setError("");
    invokeFunction("exportDmaData", { project_id: projectId })
      .then((res) => {
        setData(res.data || res);
      })
      .catch((e) => setError(e?.message || "Failed to load DMA data"))
      .finally(() => setLoading(false));
  }, [open, projectId, projectName]);

  const dmas = data?.dmas || [];
  const totalMeters = dmas.reduce(
    (s, d) => s + (d.subMeters?.length || 0) + (d.mainMeters?.length || 0),
    0
  );
  const totalLayerObjs = dmas.reduce(
    (s, d) => s + (d.layerGroups || []).reduce((ss, g) => ss + g.features.length, 0),
    0
  );

  const handleExport = () => {
    if (!dmas.length) return;
    downloadDmaDataXLS(dmas, fileName);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("exportDmaData.title")}</DialogTitle>
          <DialogDescription>{t("exportDmaData.subtitle")}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("exportDmaData.loading")}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : (
          <div className="space-y-4 py-2">
            {dmas.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("exportDmaData.summary", {
                  dmas: dmas.length,
                  meters: totalMeters,
                  objects: totalLayerObjs,
                })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("exportDmaData.noDmas")}</p>
            )}
            <div>
              <Label className="text-xs">{t("exportDmaData.fileName")}</Label>
              <Input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("exportDmaData.cancel")}
          </Button>
          <Button onClick={handleExport} disabled={loading || !dmas.length}>
            <Download className="w-4 h-4" /> {t("exportDmaData.export")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}