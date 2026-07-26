import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Map as MapIcon, Check, AlertCircle, Loader2, ChevronRight, Gauge, Info, Undo2, Download, FileSpreadsheet } from "lucide-react";
import { downloadMeterTemplate } from "@/lib/meterTemplate";
import { uploadFile } from "@/api/storageClient";
import { invokeFunction } from "@/api/functionsClient";
import { supabase } from "@/api/supabaseClient";
import { resolveLayerTypeId } from "@/lib/layerType";
import { analyzeGeoJSON } from "@/lib/geoAnalysis";
import { detectLayerCategory } from "@/lib/layerCategoryDetection";
import { meterLayerKind } from "@/lib/meterLayerDetection";
import { createMetersFromGeoJSONUrl } from "@/lib/geojsonMeters";
import { componentPointConfig, componentColor } from "@/lib/componentDefaults";
import ZipLayerReview from "@/components/project/ZipLayerReview";
import ZipImportStats from "@/components/project/ZipImportStats";
import { analyzeMeterData, extractMeterRecords, detectMainColumn, toMeterInsertRows } from "@/lib/meterAnalysis";
import { runBatchesInParallel } from "@/lib/parallelBatch";
import MeterConfigStep from "@/components/project/MeterConfigStep";
import ConsumptionUploadStep from "@/components/project/ConsumptionUploadStep";
import ExportPanel from "@/components/project/ExportPanel";
import { useLanguage } from "@/lib/i18n";
import LayerColorPicker, { LAYER_COLORS } from "@/components/project/LayerColorPicker";

export default function UploadLayerDialog({ open, onOpenChange, projectId, dateFormat, onUploaded, nextSortOrder, existingLayers, meterCount, onConsumptionUploaded, onUndoImport, hasMeters, dmas, project, onAnomalyExported }) {
  const { t } = useLanguage();
  const [layerType, setLayerType] = useState("shp");
  const [phase, setPhase] = useState("idle");
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [meterAnalysis, setMeterAnalysis] = useState(null);
  const [meterMappings, setMeterMappings] = useState(null);
  const [isMain, setIsMain] = useState(false);
  const [mainColumn, setMainColumn] = useState("");
  const [splitMainSub, setSplitMainSub] = useState(false);
  const [extraIdColumns, setExtraIdColumns] = useState(null);
  const [error, setError] = useState(null);
  const [layerName, setLayerName] = useState("");
  const [layerColor, setLayerColor] = useState(LAYER_COLORS[0]);
  const [layerCategory, setLayerCategory] = useState("");
  const [layerTypes, setLayerTypes] = useState([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [localMeterCount, setLocalMeterCount] = useState(0);
  const [consumptionDone, setConsumptionDone] = useState(false);
  const [mode, setMode] = useState("import");
  const [zipLayers, setZipLayers] = useState([]);
  const [importStats, setImportStats] = useState(null);
  const intervalRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setLayerType("shp");
      setPhase("idle");
      setFile(null);
      setFileUrl(null);
      setAnalysis(null);
      setMeterAnalysis(null);
      setMeterMappings(null);
      setIsMain(false);
      setMainColumn("");
      setSplitMainSub(false);
      setExtraIdColumns(null);
      setError(null);
      setLayerName("");
      setLayerCategory("");
      setShowNewCategory(false);
      setNewCategoryName("");
      setConsumptionDone(false);
      setMode("import");
      setZipLayers([]);
      setImportStats(null);
      supabase.from('layer_type').select('*').order('name').then(({ data }) => setLayerTypes(data || []));
      const usedColors = (existingLayers || []).filter((l) => !l.pipe_config).map((l) => l.color).filter(Boolean);
      const avail = LAYER_COLORS.filter((c) => !usedColors.includes(c));
      setLayerColor(avail[0] || LAYER_COLORS[0]);
      setProgress(0);
      setProgressLabel("");
      setLocalMeterCount(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open, existingLayers]);

  const handleFileSelect = async (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setError(null);

    // Validate file type — JSON, GeoJSON, CSV, SHP, and ZIP are allowed
    const ext = selected.name.split(".").pop()?.toLowerCase();
    if (!ext || !["json", "geojson", "csv", "shp", "zip"].includes(ext)) {
      setError(t('upload.unsupported'));
      e.target.value = "";
      return;
    }

    setFile(selected);
    const nameWithoutExt = selected.name.replace(/\.[^/.]+$/, "");
    setLayerName(nameWithoutExt);
    setLayerCategory(detectLayerCategory(nameWithoutExt));

    if (layerType === "shp") {
      try {
        setPhase("reading");
        setProgressLabel(t('upload.reading'));

        if (ext === "shp" || ext === "zip") {
          setProgressLabel(t('upload.uploadingShapefile'));
          const { file_url: uploadedUrl } = await uploadFile({ file: selected });
          setProgressLabel(t('upload.parsingShapefile'));
          const response = await invokeFunction('parseShapefile', { file_url: uploadedUrl });

          if (response.data?.error) {
            setError(response.data.error);
            setPhase("idle");
            return;
          }

          const layers = response.data?.layers || [];

          if (layers.length === 0) {
            setError(t('upload.zipNoShp'));
            setPhase("idle");
            return;
          }

          if (layers.length === 1) {
            // Single shapefile — existing review flow
            const geojson = layers[0].geojson;
            const layerName = layers[0].name || nameWithoutExt;
            setLayerName(layerName);
            // Same auto-detect the multi-layer ZIP branch below does. Without
            // it a single-shapefile upload defaulted to "Other", which also
            // stopped meter layers from creating any meter rows.
            setLayerCategory(detectLayerCategory(layerName));
            setProgressLabel(t('upload.storingGeojson'));
            const geojsonBlob = new Blob([JSON.stringify(geojson)], { type: "application/json" });
            const geojsonFile = new File([geojsonBlob], `${layerName}.geojson`, { type: "application/json" });
            const { file_url: geojsonUrl } = await uploadFile({ file: geojsonFile });
            setFileUrl(geojsonUrl);

            setProgressLabel(t('upload.analyzingFeatures'));
            const result = analyzeGeoJSON(geojson);
            if (result.featureCount === 0) {
              setError(t('upload.noFeatures'));
              setPhase("idle");
              return;
            }
            setAnalysis(result);
            setPhase("review");
          } else {
            // Multiple shapefiles in ZIP — multi-layer review
            const analyzedLayers = [];
            for (let i = 0; i < layers.length; i++) {
              const layer = layers[i];
              setProgressLabel(t('upload.analyzingLayer', { name: layer.name, current: i + 1, total: layers.length }));
              const result = analyzeGeoJSON(layer.geojson);
              if (result.featureCount === 0) continue;

              const geojsonBlob = new Blob([JSON.stringify(layer.geojson)], { type: "application/json" });
              const geojsonFile = new File([geojsonBlob], `${layer.name}.geojson`, { type: "application/json" });
              const { file_url: layerFileUrl } = await uploadFile({ file: geojsonFile });

              analyzedLayers.push({
                name: layer.name,
                fileUrl: layerFileUrl,
                analysis: result,
                category: detectLayerCategory(layer.name),
                color: LAYER_COLORS[analyzedLayers.length % LAYER_COLORS.length],
                selected: true,
              });
            }

            if (analyzedLayers.length === 0) {
              setError(t('upload.noFeatures'));
              setPhase("idle");
              return;
            }

            setZipLayers(analyzedLayers);
            setPhase("zip_review");
          }
        } else {
          setProgressLabel(t('upload.parsingGeojson'));
          const text = await selected.text();
          const geojson = JSON.parse(text);

          setProgressLabel(t('upload.analyzingFeatures'));
          const result = analyzeGeoJSON(geojson);

          if (result.featureCount === 0) {
            setError(t('upload.noFeatures'));
            setPhase("idle");
            return;
          }

          setAnalysis(result);
          setPhase("review");
        }
      } catch (err) {
        setError(err?.response?.data?.error || err?.message || t('upload.parseFailed'));
        setPhase("idle");
      }
    } else {
      // Data file (meter data) flow
      try {
        setPhase("analyzing");
        setProgressLabel(t('upload.uploadingFile'));
        const { file_url } = await uploadFile({ file: selected });
        setFileUrl(file_url);

        setProgressLabel(t('upload.analyzingMeters'));
        const result = await analyzeMeterData(selected, file_url);

        if (result.columns.length === 0) {
          setError(t('upload.noColumns'));
          setPhase("idle");
          return;
        }

        setMeterAnalysis(result);
        setMeterMappings(result.suggestions);
        setExtraIdColumns(result.suggestions?.uid ? [result.suggestions.uid] : []);
        const detectedMain = detectMainColumn(result.columns || []);
        setMainColumn(detectedMain);
        setSplitMainSub(false);
        setIsMain(false);
        setPhase(detectedMain ? "main_prompt" : "meter_config");
      } catch (err) {
        setError(err.message || "Failed to analyze file.");
        setPhase("idle");
      }
    }
  };

  const handleConfirm = async () => {
    try {
      if (layerType === "shp") {
        setPhase("uploading");
        setProgress(5);
        setProgressLabel(t('upload.uploading'));

        intervalRef.current = setInterval(() => {
          setProgress((p) => Math.min(p + Math.random() * 10, 55));
        }, 300);

        let file_url = fileUrl;
        if (!file_url) {
          file_url = (await uploadFile({ file })).file_url;
        }
        clearInterval(intervalRef.current);

        setProgress(65);
        setProgressLabel(t('upload.savingLayer'));
        setPhase("saving");

        const { data: insertedLayer } = await supabase.from('project_layer').insert({
          project_id: projectId,
          name: layerName,
          layer_type_id: await resolveLayerTypeId(layerCategory || "Other"),
          layer_type: layerType,
          file_url,
          color: componentColor(layerName, layerCategory) || layerColor,
          visible: true,
          sort_order: nextSortOrder ?? 0,
          feature_count: analysis?.featureCount || 0,
          geometry_types: analysis?.geometryTypes || [],
          properties: analysis?.propertyNames || [],
          bounds: analysis?.bounds || null,
          point_config: componentPointConfig(layerName, layerCategory) || undefined,
          altitude_field: analysis?.altitude_field || (analysis?.has_z_coordinates ? "z" : null),
          altitude_source: analysis?.altitude_source || null,
          altitude_unit: analysis?.altitude_unit || null,
        }).select('id').single();

        // Meter-type layers (Main/Insertion/Ultrasonic Meters) also need
        // is_main meter rows so they appear in the meter table, network
        // inventory, DMA main-meter linking, and point numbering — a plain
        // shapefile import otherwise only creates a display layer.
        const meterKind = meterLayerKind(layerName, layerCategory);
        if (insertedLayer?.id && meterKind) {
          setProgressLabel(t('upload.savingLayer'));
          try {
            await createMetersFromGeoJSONUrl(file_url, { projectId, layerId: insertedLayer.id, isMain: meterKind === "main" });
          } catch (e) {
            console.error("Failed to create meter rows for meter layer:", e);
          }
        }

        setProgress(100);
        setProgressLabel(t('upload.uploadComplete'));
        setPhase("done");

        setTimeout(() => {
          onUploaded("shp");
          onOpenChange(false);
        }, 900);
      } else {
        // Data (meter) flow
        setPhase("extracting");
        setProgress(10);
        setProgressLabel(t('upload.extracting'));

        const records = await extractMeterRecords(meterAnalysis, fileUrl, file?.name, meterMappings, isMain, extraIdColumns, splitMainSub ? mainColumn : null);

        if (records.length === 0) {
          setError(t('upload.noValidRecords'));
          setPhase("meter_config");
          return;
        }

        // Build layer sets — split into Main/Sub layers if applicable
        let layerSets;
        if (splitMainSub) {
          const mainRecs = records.filter((r) => r.is_main);
          const subRecs = records.filter((r) => !r.is_main);
          const subColorIdx = (LAYER_COLORS.indexOf(layerColor) + 1) % LAYER_COLORS.length;
          layerSets = [
            { name: `${layerName} - Main`, records: mainRecs, color: layerColor },
            { name: `${layerName} - Sub`, records: subRecs, color: LAYER_COLORS[subColorIdx] },
          ];
        } else {
          layerSets = [{ name: layerName, records, color: layerColor }];
        }

        setPhase("saving");

        const BATCH_SIZE = 1000;
        const CONCURRENCY = 4;
        const totalRecords = records.length;
        let totalCreated = 0;
        let sortOffset = nextSortOrder ?? 0;

        for (let s = 0; s < layerSets.length; s++) {
          const set = layerSets[s];
          if (set.records.length === 0) continue;

          setProgressLabel(t('upload.savingLayerName', { name: set.name }));

          const { data: layer, error: layerError } = await supabase
            .from('project_layer')
            .insert({
              project_id: projectId,
              name: set.name,
              layer_type: layerType,
              file_url: fileUrl,
              color: set.color,
              visible: true,
              sort_order: sortOffset + s,
              feature_count: set.records.length,
              geometry_types: ["Point"],
              properties: Object.values(meterMappings).filter(Boolean),
              bounds: null,
            })
            .select()
            .single();
          if (layerError || !layer) throw layerError || new Error("Failed to create the layer");

          const taggedRecords = toMeterInsertRows(set.records, dmas).map((r) => ({
            ...r,
            project_id: projectId,
            source_file_url: fileUrl,
            layer_id: layer.id,
          }));

          const result = await runBatchesInParallel(
            taggedRecords,
            BATCH_SIZE,
            CONCURRENCY,
            (batch) => supabase.from('meter').insert(batch),
            (completedBatches, totalBatches, processed) => {
              totalCreated = processed;
              setProgress(40 + Math.round((processed / totalRecords) * 50));
              setProgressLabel(t('upload.importingBatch', { name: set.name, current: completedBatches, total: totalBatches, processed, count: totalRecords }));
            }
          );
          totalCreated = result.processed;
        }

        setLocalMeterCount(totalCreated);
        setProgress(100);
        setProgressLabel(t('upload.createdMeters', { count: totalCreated }));
        setPhase("done");

        setTimeout(() => {
          onUploaded("data");
          onOpenChange(false);
        }, 1200);
      }
    } catch (err) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setError(err.message || t('upload.parseFailed'));
      setPhase(layerType === "shp" ? "review" : "meter_config");
    }
  };

  const handleZipConfirm = async () => {
    try {
      setPhase("zip_importing");
      setProgress(0);
      setProgressLabel(t('upload.uploading'));

      let sortOffset = nextSortOrder ?? 0;
      const stats = {
        layersImported: 0,
        totalFeatures: 0,
        byCategory: {},
        layers: [],
      };

      const selectedLayers = zipLayers.filter((l) => l.selected);
      for (let i = 0; i < selectedLayers.length; i++) {
        const layer = selectedLayers[i];
        setProgressLabel(t('upload.savingLayerName', { name: layer.name }));
        setProgress(Math.round((i / selectedLayers.length) * 90));

        const { data: insertedZipLayer } = await supabase.from('project_layer').insert({
          project_id: projectId,
          name: layer.name,
          layer_type_id: await resolveLayerTypeId(layer.category || "Other"),
          layer_type: "shp",
          file_url: layer.fileUrl,
          color: componentColor(layer.name, layer.category) || layer.color,
          visible: true,
          sort_order: sortOffset + i,
          feature_count: layer.analysis?.featureCount || 0,
          geometry_types: layer.analysis?.geometryTypes || [],
          properties: layer.analysis?.propertyNames || [],
          bounds: layer.analysis?.bounds || null,
          point_config: componentPointConfig(layer.name, layer.category) || undefined,
          altitude_field: layer.analysis?.altitude_field || (layer.analysis?.has_z_coordinates ? "z" : null),
          altitude_source: layer.analysis?.altitude_source || null,
          altitude_unit: layer.analysis?.altitude_unit || null,
        }).select('id').single();

        // Also create is_main meter rows for meter-type layers (see the
        // single-layer path above for why).
        const zipMeterKind = meterLayerKind(layer.name, layer.category);
        if (insertedZipLayer?.id && zipMeterKind) {
          try {
            await createMetersFromGeoJSONUrl(layer.fileUrl, { projectId, layerId: insertedZipLayer.id, isMain: zipMeterKind === "main" });
          } catch (e) {
            console.error("Failed to create meter rows for meter layer:", e);
          }
        }

        stats.layersImported++;
        stats.totalFeatures += layer.analysis?.featureCount || 0;
        const cat = layer.category || "Other";
        stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
        stats.layers.push({ name: layer.name, category: cat, features: layer.analysis?.featureCount || 0 });
      }

      setProgress(100);
      setProgressLabel(t('upload.uploadComplete'));
      setImportStats(stats);
      setPhase("zip_stats");
      onUploaded("shp");
    } catch (err) {
      setError(err.message || t('upload.parseFailed'));
      setPhase("zip_review");
    }
  };

  const acceptAttr = layerType === "shp" ? ".json,.geojson,.shp,.zip" : ".csv,.json";
  const isMeterConfig = phase === "meter_config" || phase === "main_prompt";
  const isProcessing = phase === "uploading" || phase === "extracting" || phase === "saving" || phase === "done" || phase === "zip_importing";
  const isLoading = phase === "reading" || phase === "analyzing";
  const isFormPhase = phase === "idle" || phase === "review" || phase === "meter_config" || phase === "main_prompt" || phase === "zip_review";
  const isZipStats = phase === "zip_stats";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isMeterConfig || phase === "zip_review" || isZipStats ? "sm:max-w-4xl" : "sm:max-w-lg"} max-h-[78vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            {t('upload.title')}
          </DialogTitle>
        </DialogHeader>

        {/* Import / Export toggle */}
        {phase === "idle" && (
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            <button
              onClick={() => setMode("import")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === "import" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Upload className="w-4 h-4" /> {t('upload.importTab')}
            </button>
            <button
              onClick={() => setMode("export")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === "export" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Download className="w-4 h-4" /> {t('upload.exportTab')}
            </button>
          </div>
        )}

        {/* Export mode */}
        {phase === "idle" && mode === "export" && (
          <>
            <ExportPanel project={project} dmas={dmas} projectId={projectId} onAnomalyExported={onAnomalyExported} />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('upload.cancel')}</Button>
            </DialogFooter>
          </>
        )}

        {/* Processing / done */}
        {isProcessing && (
          <div className="py-6 space-y-4">
            <div className="flex items-center gap-3">
              {phase === "done" ? (
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Check className="w-5 h-5 text-emerald-600" />
                </div>
              ) : (
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              )}
              <div>
                <p className="text-sm font-medium text-slate-900">{progressLabel}</p>
                <p className="text-xs text-slate-500">{file?.name}</p>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-slate-400">
              <span>
                {layerType === "shp" && analysis ? `${analysis.featureCount} features` : ""}
                {layerType === "data" && phase === "done" ? `${localMeterCount} meters created` : ""}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        )}

        {/* Loading (reading / analyzing) */}
        {isLoading && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-sm text-slate-600">{progressLabel}</p>
          </div>
        )}

        {/* Form phases */}
        {isFormPhase && mode === "import" && (
          <div className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Undo import action */}
            {phase === "idle" && hasMeters && (
              <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
                <span className="text-xs text-slate-500">{t('upload.undoImportPrompt')}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => { onOpenChange(false); onUndoImport?.(); }}
                >
                  <Undo2 className="w-3.5 h-3.5" /> {t('upload.undoImport')}
                </Button>
              </div>
            )}

            {/* Layer type selector */}
            {phase === "idle" && (
              <div>
                <Label className="mb-2 block">{t('upload.dataType')}</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => { setLayerType("shp"); setPhase("idle"); setFile(null); setAnalysis(null); }}
                    className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-colors ${
                      layerType === "shp" ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <MapIcon className={`w-5 h-5 ${layerType === "shp" ? "text-blue-600" : "text-slate-400"}`} />
                    <span className="text-xs font-medium text-slate-700">{t('upload.shapefilePoi')}</span>
                  </button>
                  <button
                    onClick={() => { setLayerType("data"); setPhase("idle"); setFile(null); setAnalysis(null); }}
                    className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-colors ${
                      layerType === "data" ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <FileText className={`w-5 h-5 ${layerType === "data" ? "text-blue-600" : "text-slate-400"}`} />
                    <span className="text-xs font-medium text-slate-700">{t('upload.meterData')}</span>
                  </button>
                  <button
                    onClick={() => { setLayerType("consumption"); setPhase("idle"); setFile(null); setAnalysis(null); setError(null); }}
                    className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-colors ${
                      layerType === "consumption" ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <Gauge className={`w-5 h-5 ${layerType === "consumption" ? "text-blue-600" : "text-slate-400"}`} />
                    <span className="text-xs font-medium text-slate-700">{t('upload.consumption')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* File picker */}
            {phase === "idle" && !file && layerType !== "consumption" && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
              >
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600 font-medium">{t('upload.clickToSelect')}</p>
                <p className="text-xs text-slate-400 mt-1">
                   {layerType === "shp" ? t('upload.shpFiles') : t('upload.dataFiles')}
                 </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptAttr}
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            )}

            {/* Download template — meter data only */}
            {phase === "idle" && !file && layerType === "data" && (
              <div className="flex justify-center">
                <button
                  onClick={downloadMeterTemplate}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  {t('upload.downloadTemplate')}
                </button>
              </div>
            )}

            {/* Consumption upload step */}
            {phase === "idle" && layerType === "consumption" && (
              <ConsumptionUploadStep
                projectId={projectId}
                dateFormat={dateFormat}
                meterCount={meterCount ?? localMeterCount}
                onUploaded={(result) => {
                  setConsumptionDone(true);
                  setPhase("done");
                  setProgress(100);
                  setProgressLabel(t('upload.done', { readings: result?.readings || 0, errors: result?.errors || 0 }));
                  onConsumptionUploaded?.(result);
                  setTimeout(() => {
                    onOpenChange(false);
                  }, 1500);
                }}
              />
            )}

            {/* SHP review phase */}
            {file && phase === "review" && (
              <>
                <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-3">
                  <MapIcon className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700 truncate flex-1">{file.name}</span>
                  <button
                    onClick={() => { setFile(null); setAnalysis(null); setFileUrl(null); setPhase("idle"); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {t('upload.change')}
                    </button>
                    </div>

                    {analysis && (
                    <div className="space-y-3 bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('upload.fileAnalysis')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-2xl font-bold text-slate-900">{analysis.featureCount}</p>
                        <p className="text-xs text-slate-500">{t('upload.features')}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700 mb-1">{t('upload.geometry')}</p>
                        <div className="flex flex-wrap gap-1">
                          {analysis.geometryTypes.map((gt) => (
                            <Badge key={gt} variant="outline" className="text-[10px]">{gt}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    {analysis.propertyNames.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">{t('upload.properties', { count: analysis.propertyNames.length })}</p>
                        <div className="flex flex-wrap gap-1">
                          {analysis.propertyNames.slice(0, 12).map((p) => (
                            <span key={p} className="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">{p}</span>
                          ))}
                          {analysis.propertyNames.length > 12 && (
                            <span className="text-[10px] text-slate-400">{t('upload.more', { count: analysis.propertyNames.length - 12 })}</span>
                          )}
                        </div>
                      </div>
                    )}
                    {analysis.bounds && (
                      <p className="text-[10px] text-slate-400">
                        Bounds: {analysis.bounds.south.toFixed(3)}, {analysis.bounds.west.toFixed(3)} → {analysis.bounds.north.toFixed(3)}, {analysis.bounds.east.toFixed(3)}
                      </p>
                    )}
                    {(analysis.altitude_field || analysis.has_z_coordinates) && (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">
                        <Check className="w-3 h-3" />
                        Altitude data detected: {analysis.altitude_field ? `field "${analysis.altitude_field}"` : "3D Z coordinates"}{analysis.altitude_unit ? ` (${analysis.altitude_unit})` : ""}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <Label>{t('upload.layerName')}</Label>
                  <Input value={layerName} onChange={(e) => setLayerName(e.target.value)} placeholder={t('upload.layerNamePlaceholder')} />
                  </div>

                  <div>
                  <Label className="mb-1.5 block">{t('upload.layerCategory')}</Label>
                  {!showNewCategory ? (
                    <div className="flex gap-2">
                      <select
                        value={layerCategory}
                        onChange={(e) => setLayerCategory(e.target.value)}
                        className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">{t('upload.selectCategory')}</option>
                        {layerTypes.map((lt) => (
                          <option key={lt.id} value={lt.name}>{lt.name}</option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setShowNewCategory(true); setLayerCategory(""); }}
                        className="shrink-0"
                      >
                        {t('upload.newCategory')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder={t('upload.enterNewCategory')}
                        autoFocus
                      />
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        disabled={!newCategoryName.trim()}
                        onClick={async () => {
                          const name = newCategoryName.trim();
                          const { data: created } = await supabase
                            .from('layer_type')
                            .insert({ name, is_default: false })
                            .select()
                            .single();
                          setLayerTypes((prev) =>
                            [...prev, created || { id: name, name }].sort((a, b) => a.name.localeCompare(b.name))
                          );
                          setLayerCategory(name);
                          setShowNewCategory(false);
                          setNewCategoryName("");
                        }}
                        className="shrink-0"
                      >
                        {t('upload.add')}
                        </Button>
                        <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => { setShowNewCategory(false); setNewCategoryName(""); }}
                        className="shrink-0"
                        >
                        {t('upload.cancel')}
                      </Button>
                    </div>
                  )}
                </div>

                {layerCategory === "Water Lines" ? (
                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-800">
                      {t('upload.waterLinesInfo')}
                    </p>
                  </div>
                ) : (
                  <div>
                    <Label className="mb-2 block">{t('upload.layerColor')}</Label>
                    <LayerColorPicker value={layerColor} onChange={setLayerColor} />
                  </div>
                )}
              </>
            )}

            {/* Main/Sub prompt phase */}
            {file && phase === "main_prompt" && meterAnalysis && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-3">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700 truncate flex-1">{file.name}</span>
                  <button
                    onClick={() => { setFile(null); setMeterAnalysis(null); setFileUrl(null); setMainColumn(""); setPhase("idle"); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {t('upload.change')}
                    </button>
                    </div>
                    <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                    <p className="text-sm text-blue-900 font-medium">
                      {t('upload.mainColumnDetected', { column: mainColumn })}
                    </p>
                    <p className="text-xs text-blue-700">
                      {t('upload.splitPrompt')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    className="flex-1"
                    onClick={() => { setSplitMainSub(true); setPhase("meter_config"); }}
                  >
                    {t('upload.yesSplit')}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setSplitMainSub(false); setPhase("meter_config"); }}
                  >
                    {t('upload.noSingle')}
                  </Button>
                </div>
              </div>
            )}

            {/* Meter config phase */}
            {file && phase === "meter_config" && meterAnalysis && (
              <>
                <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-3">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700 truncate flex-1">{file.name}</span>
                  <button
                    onClick={() => { setFile(null); setMeterAnalysis(null); setFileUrl(null); setPhase("idle"); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {t('upload.change')}
                    </button>
                    </div>

                    <div>
                    <Label>{t('upload.layerName')}</Label>
                    <Input value={layerName} onChange={(e) => setLayerName(e.target.value)} placeholder={t('upload.layerNamePlaceholder')} />
                    </div>

                <MeterConfigStep
                  analysis={meterAnalysis}
                  mappings={meterMappings}
                  setMappings={setMeterMappings}
                  isMain={isMain}
                  setIsMain={setIsMain}
                  extraIdColumns={extraIdColumns}
                  setExtraIdColumns={setExtraIdColumns}
                  splitMode={splitMainSub}
                  mainColumn={mainColumn}
                />
              </>
            )}

            {/* ZIP multi-layer review */}
            {phase === "zip_review" && (
              <ZipLayerReview zipLayers={zipLayers} setZipLayers={setZipLayers} layerTypes={layerTypes} />
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('upload.cancel')}</Button>
              {file && phase === "review" && (
                <Button onClick={handleConfirm} disabled={!layerName || !layerCategory} className="gap-1.5">
                  {t('upload.confirmUpload')} <ChevronRight className="w-4 h-4" />
                </Button>
              )}
              {file && phase === "meter_config" && (
                <Button onClick={handleConfirm} disabled={!layerName || !meterMappings?.uid} className="gap-1.5">
                  {splitMainSub ? t('upload.createMetersTwoLayers', { count: meterAnalysis?.rowCount || "" }) : t('upload.createMeters', { count: meterAnalysis?.rowCount || "" })} <ChevronRight className="w-4 h-4" />
                </Button>
              )}
              {phase === "zip_review" && (
                <Button onClick={handleZipConfirm} disabled={!zipLayers.some((l) => l.selected)} className="gap-1.5">
                  {t('upload.uploadAllLayers')} ({zipLayers.filter((l) => l.selected).length}) <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {isZipStats && (
          <ZipImportStats stats={importStats} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}