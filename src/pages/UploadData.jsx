import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Map as MapIcon, Check, AlertCircle, Loader2, ChevronRight, Gauge, Info, Undo2, Download, FileSpreadsheet, Sparkles, Hexagon } from "lucide-react";
import { uploadFile } from "@/api/storageClient";
import { invokeFunction } from "@/api/functionsClient";
import { supabase } from "@/api/supabaseClient";
import { waitForSession, clearStaleLogin } from "@/lib/authReady";
import { resolveLayerTypeId } from "@/lib/layerType";
import { meterLayerKind } from "@/lib/meterLayerDetection";
import { createMetersFromGeoJSONUrl } from "@/lib/geojsonMeters";
import { componentPointConfig, componentColor } from "@/lib/componentDefaults";
import { downloadMeterTemplate } from "@/lib/meterTemplate";
import { analyzeGeoJSON } from "@/lib/geoAnalysis";
import { detectLayerCategory } from "@/lib/layerCategoryDetection";
import ZipLayerReview from "@/components/project/ZipLayerReview";
import ZipImportStats from "@/components/project/ZipImportStats";
import { analyzeMeterData, extractMeterRecords, detectMainColumn, toMeterInsertRows } from "@/lib/meterAnalysis";
import { runBatchesInParallel } from "@/lib/parallelBatch";
import MeterConfigStep from "@/components/project/MeterConfigStep";
import ConsumptionUploadStep from "@/components/project/ConsumptionUploadStep";
import ExportPanel from "@/components/project/ExportPanel";
import UndoImportDialog from "@/components/project/UndoImportDialog";
import ProjectNav from "@/components/project/ProjectNav";
import ProjectFooterBar from "@/components/project/ProjectFooterBar";
import ProjectHeader from "@/components/project/ProjectHeader";
import OnboardingWizard from "@/components/project/OnboardingWizard";
import OptimizeDataFilesDialog from "@/components/project/OptimizeDataFilesDialog";
import AutoCreateDmasDialog from "@/components/project/AutoCreateDmasDialog";
import { recordProgress } from "@/lib/progressTracker";
import { useLanguage } from "@/lib/i18n";

const LAYER_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#65a30d", "#facc15"];

export default function UploadData() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();

  // Project data
  const [project, setProject] = useState(null);
  const [layers, setLayers] = useState([]);
  const [meters, setMeters] = useState([]);
  const [dmas, setDmas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUndoImport, setShowUndoImport] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showOptimize, setShowOptimize] = useState(false);

  // Upload state
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
  const [zipLayers, setZipLayers] = useState([]);
  const [importStats, setImportStats] = useState(null);
  const [importedWithDmaNames, setImportedWithDmaNames] = useState(false);
  const [showAutoDmas, setShowAutoDmas] = useState(false);
  const intervalRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fetch project data on mount
  useEffect(() => {
    let cancelled = false;
    // Wait for the restored session first — querying before it lands makes RLS
    // hide the row, and `.single()` then returns null, which reads as though
    // the project doesn't exist.
    waitForSession().then((session) => {
      if (cancelled) return;
      if (!session) {
        // Same reasoning as ProjectDetail: don't eject the user over what may
        // just be an in-flight token refresh.
        console.warn("[auth] No session yet on the upload page — waiting.");
        setLoading(false);
        return;
      }
      Promise.all([
        supabase.from('project').select('*').eq('id', id).single(),
        supabase.from('project_layer').select('*').eq('project_id', id).order('created_at', { ascending: false }),
        invokeFunction("getProjectMeters", { project_id: id }).then((res) => res.data?.meters || []),
        supabase.from('dma').select('*').eq('project_id', id).order('sort_order'),
      ])
        .then(([{ data: p }, { data: l }, m, { data: d }]) => {
          if (cancelled) return;
          setProject(p);
          setLayers(l || []);
          setMeters(m);
          setDmas(d || []);
          supabase.from('layer_type').select('*').order('name').then(({ data }) => setLayerTypes(data || []));
          const usedColors = (l || []).filter((ly) => !ly.pipe_config).map((ly) => ly.color).filter(Boolean);
          const avail = LAYER_COLORS.filter((c) => !usedColors.includes(c));
          setLayerColor(avail[0] || LAYER_COLORS[0]);
        })
        .catch((e) => {
          console.error("Failed to load project:", e);
          setProject(null);
        })
        .finally(() => setLoading(false));
    });
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [id]);

  const refreshData = () => {
    supabase.from('project_layer').select('*').eq('project_id', id).order('created_at', { ascending: false }).then(({ data }) => setLayers(data || []));
    invokeFunction("getProjectMeters", { project_id: id })
      .then((res) => setMeters(res.data?.meters || []))
      .catch(() => {});
  };

  const handleAnomalyExported = async () => {
    if (project?.anomaly_reports_exported) return;
    const { error } = await supabase.from('project').update({ anomaly_reports_exported: true }).eq('id', id);
    if (!error) setProject((p) => ({ ...p, anomaly_reports_exported: true }));
  };

  const handleConsumptionUploaded = (result) => {
    recordProgress(id, "consumption_imported");
  };

  const resetToIdle = () => {
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
    setZipLayers([]);
    setImportStats(null);
    setImportedWithDmaNames(false);
    setProgress(0);
    setProgressLabel("");
    setLocalMeterCount(0);
    refreshData();
  };

  const handleFileSelect = async (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setError(null);

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

          const shpLayers = response.data?.layers || [];

          if (shpLayers.length === 0) {
            setError(t('upload.zipNoShp'));
            setPhase("idle");
            return;
          }

          if (shpLayers.length === 1) {
            const geojson = shpLayers[0].geojson;
            const detectedName = shpLayers[0].name || nameWithoutExt;
            setLayerName(detectedName);
            // Auto-detect from the shapefile's own layer name, same as the
            // multi-layer ZIP branch — otherwise this defaulted to "Other"
            // and meter layers silently created no meter rows.
            setLayerCategory(detectLayerCategory(detectedName));
            setProgressLabel(t('upload.storingGeojson'));
            const geojsonBlob = new Blob([JSON.stringify(geojson)], { type: "application/json" });
            const geojsonFile = new File([geojsonBlob], `${detectedName}.geojson`, { type: "application/json" });
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
            const analyzedLayers = [];
            for (let i = 0; i < shpLayers.length; i++) {
              const layer = shpLayers[i];
              setProgressLabel(t('upload.analyzingLayer', { name: layer.name, current: i + 1, total: shpLayers.length }));
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
        // Keep every ID-ish column the file has, not just the one chosen as the
        // UID. Defaulting to the UID alone meant the others — Account ID above
        // all — were discarded at import and could never be shown or exported.
        // extractMeterRecords already skips any column mapped to a real field,
        // so this cannot duplicate them.
        setExtraIdColumns(result.idColumns || []);
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
          project_id: id,
          name: layerName,
          layer_type_id: await resolveLayerTypeId(layerCategory || "Other"),
          layer_type: layerType,
          file_url,
          color: componentColor(layerName, layerCategory) || layerColor,
          visible: true,
          sort_order: layers.length ?? 0,
          feature_count: analysis?.featureCount || 0,
          geometry_types: analysis?.geometryTypes || [],
          properties: analysis?.propertyNames || [],
          bounds: analysis?.bounds || null,
          point_config: componentPointConfig(layerName, layerCategory) || undefined,
          altitude_field: analysis?.altitude_field || (analysis?.has_z_coordinates ? "z" : null),
          altitude_source: analysis?.altitude_source || null,
          altitude_unit: analysis?.altitude_unit || null,
        }).select('id').single();

        // Meter-type layers (Main/Insertion/Ultrasonic) also need is_main
        // meter rows so they show in the meter table, network inventory, DMA
        // linking, and point numbering — not just as a display layer.
        const meterKind = meterLayerKind(layerName, layerCategory);
        if (insertedLayer?.id && meterKind) {
          try {
            await createMetersFromGeoJSONUrl(file_url, { projectId: id, layerId: insertedLayer.id, isMain: meterKind === "main" });
          } catch (e) {
            console.error("Failed to create meter rows for meter layer:", e);
          }
        }

        recordProgress(id, "gis_layers_uploaded");
        setProgress(100);
        setProgressLabel(t('upload.uploadComplete'));
        setPhase("done");
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

        let layerSets;
        if (splitMainSub) {
          const mainRecs = records.filter((r) => r.is_main);
          const subRecs = records.filter((r) => !r.is_main);
          const subColorIdx = (LAYER_COLORS.indexOf(layerColor) + 1) % LAYER_COLORS.length;
          layerSets = [
            { name: `${layerName} - Main`, records: mainRecs, color: layerColor, category: "Main Meters" },
            { name: `${layerName} - Sub`, records: subRecs, color: LAYER_COLORS[subColorIdx], category: "Sub Meters" },
          ];
        } else {
          // Not split — the whole file is one kind, decided by the Main toggle.
          layerSets = [{ name: layerName, records, color: layerColor, category: isMain ? "Main Meters" : "Sub Meters" }];
        }

        setPhase("saving");

        const BATCH_SIZE = 1000;
        const CONCURRENCY = 4;
        const totalRecords = records.length;
        let totalCreated = 0;
        let sortOffset = layers.length ?? 0;

        for (let s = 0; s < layerSets.length; s++) {
          const set = layerSets[s];
          if (set.records.length === 0) continue;

          setProgressLabel(t('upload.savingLayerName', { name: set.name }));

          const { data: layer, error: layerError } = await supabase
            .from('project_layer')
            .insert({
              project_id: id,
              name: set.name,
              layer_type: layerType,
              layer_type_id: await resolveLayerTypeId(set.category),
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
            project_id: id,
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

        recordProgress(id, "meters_imported");
        setImportedWithDmaNames(!!meterMappings?.dma_name);
        setLocalMeterCount(totalCreated);
        setProgress(100);
        setProgressLabel(t('upload.createdMeters', { count: totalCreated }));
        setPhase("done");
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

      let sortOffset = layers.length ?? 0;
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
          project_id: id,
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

        const zipMeterKind = meterLayerKind(layer.name, layer.category);
        if (insertedZipLayer?.id && zipMeterKind) {
          try {
            await createMetersFromGeoJSONUrl(layer.fileUrl, { projectId: id, layerId: insertedZipLayer.id, isMain: zipMeterKind === "main" });
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

      recordProgress(id, "gis_layers_uploaded");
      setProgress(100);
      setProgressLabel(t('upload.uploadComplete'));
      setImportStats(stats);
      setPhase("zip_stats");
    } catch (err) {
      setError(err.message || t('upload.parseFailed'));
      setPhase("zip_review");
    }
  };

  const usedColors = (layers || []).filter((l) => !l.pipe_config).map((l) => l.color).filter(Boolean);
  const availableColors = LAYER_COLORS.filter((c) => !usedColors.includes(c));
  const colorOptions = availableColors.length > 0 ? availableColors : LAYER_COLORS;

  const acceptAttr = layerType === "shp" ? ".json,.geojson,.shp,.zip" : ".csv,.json";
  const isMeterConfig = phase === "meter_config" || phase === "main_prompt";
  const isProcessing = phase === "uploading" || phase === "extracting" || phase === "saving" || phase === "done" || phase === "zip_importing";
  const isLoading = phase === "reading" || phase === "analyzing";
  const isFormPhase = phase === "idle" || phase === "review" || phase === "meter_config" || phase === "main_prompt" || phase === "zip_review";
  const isZipStats = phase === "zip_stats";
  const isLocked = !!project?.locked || !!project?.onboarding_complete;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background">
        <p className="text-muted-foreground mb-4">{t('project.notFound')}</p>
        <Button onClick={() => navigate("/")}>{t('project.backToDashboard')}</Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <ProjectHeader project={project} locked={!!project?.locked} />

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        <ProjectNav viewMode="import" onChange={(mode) => navigate(`/project/${id}?view=${mode}`)} onImportData={() => {}} locked={isLocked} onOpenWizard={() => setShowWizard(true)} />
        <div className="flex-1 overflow-y-auto">
        <div className="mx-auto p-6 w-full max-w-6xl">
          {/* Processing / done */}
          {isProcessing && (
            <div className="py-6 space-y-4">
              <div className="flex items-center gap-3">
                {phase === "done" ? (
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                    <Check className="w-5 h-5 text-emerald-600" />
                  </div>
                ) : (
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">{progressLabel}</p>
                  <p className="text-xs text-muted-foreground">{file?.name}</p>
                </div>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {layerType === "shp" && analysis ? `${analysis.featureCount} features` : ""}
                  {layerType === "data" && phase === "done" ? `${localMeterCount} meters created` : ""}
                </span>
                <span>{Math.round(progress)}%</span>
              </div>

              {/* Auto-create DMAs prompt */}
              {phase === "done" && importedWithDmaNames && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-5 text-center space-y-3">
                    <Hexagon className="w-8 h-8 text-amber-500 mx-auto" />
                    <p className="text-sm font-medium text-foreground">DMA names detected in imported meters</p>
                    <p className="text-xs text-muted-foreground">Automatically create DMA polygons based on meter locations.</p>
                    <Button variant="outline" className="gap-1.5" onClick={() => setShowAutoDmas(true)}>
                      <Hexagon className="w-4 h-4" /> Auto-Create DMAs
                    </Button>
                  </div>
                </div>
              )}

              {/* Switch to map prompt */}
              {phase === "done" && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 text-center space-y-3">
                    <MapIcon className="w-8 h-8 text-primary mx-auto" />
                    <p className="text-sm font-medium text-foreground">{t('upload.switchToMapPrompt')}</p>
                    <div className="flex gap-2 justify-center">
                      <Button className="gap-1.5" onClick={() => navigate(`/project/${id}`)}>
                        <MapIcon className="w-4 h-4" /> {t('upload.goToMap')}
                      </Button>
                      <Button variant="outline" onClick={resetToIdle}>
                        {t('upload.importMore')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading (reading / analyzing) */}
          {isLoading && (
            <div className="py-8 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">{progressLabel}</p>
            </div>
          )}

          {/* Idle: Import + Export stacked */}
          {phase === "idle" && (
            <div className="space-y-6">
              {!isLocked && (
              <>
              {/* Import section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" /> {t('upload.importTab')}
                </h3>

                {error && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {meters.length > 0 && (
                  <div className="flex items-center justify-between gap-2 bg-muted border border-border rounded-lg px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">{t('upload.undoImportPrompt')}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => setShowUndoImport(true)}
                    >
                      <Undo2 className="w-3.5 h-3.5" /> {t('upload.undoImport')}
                    </Button>
                  </div>
                )}

                {/* Layer type selector with flow arrows: SHP → Meter Data → Consumption */}
                <div>
                  <Label className="mb-2 block">{t('upload.dataType')}</Label>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setLayerType("shp"); setPhase("idle"); setFile(null); setAnalysis(null); }}
                      className={`flex-1 flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-colors ${
                        layerType === "shp" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <MapIcon className={`w-5 h-5 ${layerType === "shp" ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-xs font-medium text-foreground">{t('upload.shapefilePoi')}</span>
                    </button>
                    <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                    <button
                      onClick={() => { setLayerType("data"); setPhase("idle"); setFile(null); setAnalysis(null); }}
                      className={`flex-1 flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-colors ${
                        layerType === "data" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <FileText className={`w-5 h-5 ${layerType === "data" ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-xs font-medium text-foreground">{t('upload.meterData')}</span>
                    </button>
                    <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                    <button
                      onClick={() => { setLayerType("consumption"); setPhase("idle"); setFile(null); setAnalysis(null); setError(null); }}
                      className={`flex-1 flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-colors ${
                        layerType === "consumption" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <Gauge className={`w-5 h-5 ${layerType === "consumption" ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-xs font-medium text-foreground">{t('upload.consumption')}</span>
                    </button>
                  </div>
                </div>

                {/* File picker */}
                {!file && layerType !== "consumption" && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  >
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-foreground font-medium">{t('upload.clickToSelect')}</p>
                    <p className="text-xs text-muted-foreground mt-1">
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
                {!file && layerType === "data" && (
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
                {layerType === "consumption" && (
                  <ConsumptionUploadStep
                    projectId={id}
                    dateFormat={project.date_format}
                    meterCount={meters.length}
                    onUploaded={(result) => {
                      setConsumptionDone(true);
                      setPhase("done");
                      setProgress(100);
                      setProgressLabel(t('upload.done', { readings: result?.readings || 0, errors: result?.errors || 0 }));
                      handleConsumptionUploaded(result);
                    }}
                  />
                )}
              </div>

              {/* Divider */}
              <hr className="border-border" />
              </>
              )}

              {/* Export section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Download className="w-4 h-4 text-primary" /> {t('upload.exportTab')}
                </h3>
                <ExportPanel project={project} dmas={dmas} projectId={id} onAnomalyExported={handleAnomalyExported} />
              </div>

              {!isLocked && (
              <>
              {/* Optimize Data Files */}
              <hr className="border-border" />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> {t('optimize.title')}
                </h3>
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t('optimize.title')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('optimize.subtitle')}</p>
                  </div>
                  <Button onClick={() => setShowOptimize(true)} className="gap-1.5 shrink-0" size="sm">
                    <Sparkles className="w-4 h-4" /> {t('optimize.title')}
                  </Button>
                </div>
              </div>
              </>
              )}
            </div>
          )}

          {/* Non-idle form phases */}
          {isFormPhase && phase !== "idle" && (
            <div className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* SHP review phase */}
              {file && phase === "review" && (
                <>
                  <div className="flex items-center gap-2 bg-muted rounded-lg p-3">
                    <MapIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground truncate flex-1">{file.name}</span>
                    <button
                      onClick={() => { setFile(null); setAnalysis(null); setFileUrl(null); setPhase("idle"); }}
                      className="text-xs text-primary hover:underline"
                    >
                      {t('upload.change')}
                    </button>
                  </div>

                  {analysis && (
                    <div className="space-y-3 bg-primary/5 border border-primary/10 rounded-xl p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('upload.fileAnalysis')}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-2xl font-bold text-foreground">{analysis.featureCount}</p>
                          <p className="text-xs text-muted-foreground">{t('upload.features')}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground mb-1">{t('upload.geometry')}</p>
                          <div className="flex flex-wrap gap-1">
                            {analysis.geometryTypes.map((gt) => (
                              <Badge key={gt} variant="outline" className="text-[10px]">{gt}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      {analysis.propertyNames.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t('upload.properties', { count: analysis.propertyNames.length })}</p>
                          <div className="flex flex-wrap gap-1">
                            {analysis.propertyNames.slice(0, 12).map((p) => (
                              <span key={p} className="text-[10px] bg-card border border-border rounded px-1.5 py-0.5 text-muted-foreground">{p}</span>
                            ))}
                            {analysis.propertyNames.length > 12 && (
                              <span className="text-[10px] text-muted-foreground/70">{t('upload.more', { count: analysis.propertyNames.length - 12 })}</span>
                            )}
                          </div>
                        </div>
                      )}
                      {analysis.bounds && (
                        <p className="text-[10px] text-muted-foreground/70">
                          Bounds: {analysis.bounds.south.toFixed(3)}, {analysis.bounds.west.toFixed(3)} → {analysis.bounds.north.toFixed(3)}, {analysis.bounds.east.toFixed(3)}
                        </p>
                      )}
                      {(analysis.altitude_field || analysis.has_z_coordinates) && (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-md px-2 py-1">
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
                    <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg p-3">
                      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-sm text-primary">
                        {t('upload.waterLinesInfo')}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Label className="mb-2 block">{t('upload.layerColor')}</Label>
                      <div className="flex flex-wrap gap-2">
                        {colorOptions.map((c) => (
                          <button
                            key={c}
                            onClick={() => setLayerColor(c)}
                            className={`w-7 h-7 rounded-full transition-transform ${layerColor === c ? "ring-2 ring-offset-2 ring-muted-foreground scale-110" : ""}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Main/Sub prompt phase */}
              {file && phase === "main_prompt" && meterAnalysis && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 bg-muted rounded-lg p-3">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground truncate flex-1">{file.name}</span>
                    <button
                      onClick={() => { setFile(null); setMeterAnalysis(null); setFileUrl(null); setMainColumn(""); setPhase("idle"); }}
                      className="text-xs text-primary hover:underline"
                    >
                      {t('upload.change')}
                    </button>
                  </div>
                  <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg p-4">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm text-foreground font-medium">
                        {t('upload.mainColumnDetected', { column: mainColumn })}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
                  <div className="flex items-center gap-2 bg-muted rounded-lg p-3">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground truncate flex-1">{file.name}</span>
                    <button
                      onClick={() => { setFile(null); setMeterAnalysis(null); setFileUrl(null); setPhase("idle"); }}
                      className="text-xs text-primary hover:underline"
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

              {/* Footer actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => navigate(`/project/${id}`)}>{t('upload.cancel')}</Button>
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
              </div>
            </div>
          )}

          {/* ZIP import stats with switch-to-map prompt */}
          {isZipStats && (
            <ZipImportStats
              stats={importStats}
              onClose={resetToIdle}
              onViewMap={() => navigate(`/project/${id}`)}
            />
          )}
        </div>
        </div>
      </div>

      <ProjectFooterBar />

      <UndoImportDialog
        open={showUndoImport}
        onOpenChange={setShowUndoImport}
        projectId={id}
        onUndone={() => { refreshData(); }}
      />

      <OptimizeDataFilesDialog
        open={showOptimize}
        onOpenChange={setShowOptimize}
        projectId={id}
        onUploaded={() => { refreshData(); }}
      />

      <AutoCreateDmasDialog
        open={showAutoDmas}
        onOpenChange={setShowAutoDmas}
        projectId={id}
        onCreated={() => { refreshData(); }}
      />

      <OnboardingWizard
        open={showWizard}
        onOpenChange={setShowWizard}
        projectId={id}
        onChange={(mode) => navigate(`/project/${id}?view=${mode}`)}
        onImportData={() => {}}
      />
    </div>
  );
}