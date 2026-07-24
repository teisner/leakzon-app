import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Gauge, X, Check, AlertCircle, Loader2, Download, Sparkles, ChevronDown, ChevronUp, Info, CloudUpload } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import {
  parseDataFile, analyzeAllFiles, checkUidConsistency,
  generateMeterRows, generateConsumptionData, buildConsumptionCSV,
  downloadCSV, deduplicateMeterRows, METER_TEMPLATE_HEADERS,
} from "@/lib/fileOptimizer";
import { importOptimizedMeterData, importOptimizedConsumptionData } from "@/lib/optimizedDataImporter";

export default function OptimizeDataFilesDialog({ open, onOpenChange, projectId, onUploaded }) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState("upload");
  const [rawFiles, setRawFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState(null);
  const [uidCheck, setUidCheck] = useState(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [country, setCountry] = useState("");
  const [previewTab, setPreviewTab] = useState(null);
  const [uploadPhase, setUploadPhase] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({ phase: "", processed: 0, total: 0 });
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);

  const reset = () => {
    setPhase("upload");
    setRawFiles([]);
    setFiles([]);
    setError(null);
    setResults(null);
    setUidCheck(null);
    setShowAdjust(false);
    setCountry("");
    setPreviewTab(null);
    setUploadPhase(null);
    setUploadProgress({ phase: "", processed: 0, total: 0 });
    setUploadResult(null);
  };

  const handleClose = (open) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    e.target.value = "";
    setRawFiles((prev) => [...prev, ...selected]);
  };

  const removeRawFile = (idx) => setRawFiles((prev) => prev.filter((_, i) => i !== idx));

  // --- Main: parse → AI analyze → check UIDs → generate ---

  const handleOptimize = async () => {
    setPhase("analyzing");
    setBusy(true);
    setError(null);
    try {
      // 1. Parse all files
      const parsed = [];
      for (const file of rawFiles) {
        const result = await parseDataFile(file);
        if (!result) {
          setError(t("optimize.unsupportedFile", { name: file.name }));
          continue;
        }
        parsed.push(result);
      }
      if (parsed.length === 0) {
        setPhase("upload");
        setBusy(false);
        return;
      }

      // 2. AI analysis of all files together
      const analysis = await analyzeAllFiles(parsed);
      const analysisFiles = analysis.files || [];
      const detectedCountry = analysis.detectedCountry || "";

      // 3. Merge analysis into parsed files
      const enriched = parsed.map((f, i) => {
        const a = analysisFiles.find((x) => x.fileIndex === i) || {};
        return {
          ...f,
          uidColumn: a.uidColumn || "",
          hasMeterData: a.hasMeterData ?? false,
          hasConsumptionData: a.hasConsumptionData ?? false,
          addressColumn: a.addressColumn || "",
          dateColumn: a.dateColumn || "",
          consumptionColumns: a.consumptionColumns || [],
          readingFrequency: a.readingFrequency || "unknown",
          latitudeColumn: a.latitudeColumn || "",
          longitudeColumn: a.longitudeColumn || "",
          };
          });
      setFiles(enriched);

      // 4. UID consistency check
      const meterFiles = enriched.filter((f) => f.hasMeterData && f.uidColumn);
      const consFiles = enriched.filter((f) => f.hasConsumptionData && f.uidColumn);
      if (meterFiles.length > 0 && consFiles.length > 0) {
        const meterUids = meterFiles.flatMap((f) => f.rows.map((r) => String(r[f.uidColumn] || "").trim()).filter(Boolean));
        const consUids = consFiles.flatMap((f) => f.rows.map((r) => String(r[f.uidColumn] || "").trim()).filter(Boolean));
        if (meterUids.length > 0 && consUids.length > 0) {
          setUidCheck(checkUidConsistency(meterUids, consUids));
        }
      }

      // 5. Generate optimized data (with detected country, or ask if unknown)
      if (detectedCountry) {
        setCountry(detectedCountry);
        const data = generateOptimizedData(enriched, detectedCountry);
        setResults(data);
        setPhase("results");
      } else {
        setPhase("country");
      }
    } catch (err) {
      setError(err.message || t("optimize.parseFailed"));
      setPhase("upload");
    } finally {
      setBusy(false);
    }
  };

  // --- Generate from enriched files ---

  const generateOptimizedData = (enriched, selectedCountry = "") => {
    let meterData = null;
    let consumptionData = null;

    const meterFiles = enriched.filter((f) => f.hasMeterData && f.uidColumn);
    if (meterFiles.length > 0) {
      let allRows = [];
      for (const f of meterFiles) {
        const mappings = { ...f.suggestions, uid: f.uidColumn, address: f.addressColumn || f.suggestions?.address || "", latitude: f.latitudeColumn || f.suggestions?.latitude || "", longitude: f.longitudeColumn || f.suggestions?.longitude || "" };
        allRows = allRows.concat(generateMeterRows(f.rows, mappings, f.mainColumn));
      }
      if (selectedCountry) {
        allRows = allRows.map((row) => {
          if (!row[8]) row[8] = selectedCountry;
          return row;
        });
      }
      allRows = deduplicateMeterRows(allRows);
      meterData = { headers: METER_TEMPLATE_HEADERS, rows: allRows };
    }

    const consFiles = enriched.filter((f) => f.hasConsumptionData && f.uidColumn && f.consumptionColumns.length > 0);
    if (consFiles.length > 0) {
      const mergedByUid = new Map();
      const allDates = new Set();
      for (const f of consFiles) {
        const { byUid, dates } = generateConsumptionData(f.rows, f.uidColumn, f.dateColumn, f.consumptionColumns);
        for (const [uid, readings] of byUid) {
          if (!mergedByUid.has(uid)) mergedByUid.set(uid, new Map());
          for (const [date, val] of readings) {
            if (!mergedByUid.get(uid).has(date)) {
              mergedByUid.get(uid).set(date, val);
            }
            allDates.add(date);
          }
        }
      }
      consumptionData = buildConsumptionCSV(mergedByUid, [...allDates].sort());
    }

    return { meterData, consumptionData };
  };

  // --- Re-generate after adjustment ---

  const updateFile = (idx, updates) => {
    const newFiles = files.map((f, i) => (i === idx ? { ...f, ...updates } : f));
    setFiles(newFiles);
    setResults(generateOptimizedData(newFiles, country));
  };

  const handleDownloadMeter = () => {
    if (!results?.meterData) return;
    downloadCSV("optimized_meter_data.csv", results.meterData.headers, results.meterData.rows);
  };

  const handleDownloadConsumption = () => {
    if (!results?.consumptionData) return;
    downloadCSV("optimized_consumption_data.csv", results.consumptionData.headers, results.consumptionData.rows);
  };

  const handleCountrySelect = (selectedCountry) => {
    setCountry(selectedCountry);
    const data = generateOptimizedData(files, selectedCountry);
    setResults(data);
    setPhase("results");
  };

  const handleUploadToPlatform = async () => {
    setUploadPhase("uploading");
    setUploadProgress({ phase: "starting", processed: 0, total: 0 });
    setError(null);
    try {
      let meterResult = null;
      let consumptionResult = null;

      if (results.meterData) {
        setUploadProgress({ phase: "meters", processed: 0, total: results.meterData.rows.length });
        meterResult = await importOptimizedMeterData(results.meterData, projectId, (p) => setUploadProgress(p));
      }

      if (results.consumptionData) {
        setUploadProgress({ phase: "fetching_meters", processed: 0, total: 0 });
        consumptionResult = await importOptimizedConsumptionData(results.consumptionData, projectId, (p) => setUploadProgress(p));
      }

      setUploadResult({
        meters: meterResult?.metersCreated ?? 0,
        readings: consumptionResult?.readingsCreated ?? 0,
        errors: consumptionResult?.errors ?? 0,
      });
      setUploadPhase("done");
      onUploaded?.();
    } catch (err) {
      setError(err.message || t("optimize.uploadFailed"));
      setUploadPhase("error");
    }
  };

  const selectClass = "w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  const meterFileCount = files.filter((f) => f.hasMeterData).length;
  const consFileCount = files.filter((f) => f.hasConsumptionData).length;
  const isMonthly = files.some((f) => f.hasConsumptionData && f.readingFrequency === "monthly");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {t("optimize.title")}
          </DialogTitle>
          <DialogDescription>{t("optimize.subtitle")}</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* === Phase: Upload === */}
        {phase === "upload" && (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-foreground font-medium">{t("optimize.clickToSelect")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("optimize.uploadAllDesc")}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{t("optimize.csvXlsOnly")}</p>
              <input ref={fileInputRef} type="file" accept=".csv,.xls,.xlsx" multiple onChange={handleFileSelect} className="hidden" />
            </div>

            {rawFiles.map((f, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-muted border border-border rounded-lg p-2.5">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground truncate flex-1">{f.name}</span>
                <button onClick={() => removeRawFile(idx)} className="text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => handleClose(false)}>{t("optimize.close")}</Button>
              <Button onClick={handleOptimize} disabled={rawFiles.length === 0 || busy} className="gap-1.5">
                <Sparkles className="w-4 h-4" /> {t("optimize.optimizeNow")}
              </Button>
            </div>
          </div>
        )}

        {/* === Phase: Analyzing === */}
        {phase === "analyzing" && (
          <div className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">{t("optimize.analyzingAll")}</p>
              <p className="text-xs text-muted-foreground">{t("optimize.analyzingDesc")}</p>
            </div>
          </div>
        )}

        {/* === Phase: Country question === */}
        {phase === "country" && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <Info className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">{t("optimize.countryQuestion")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("optimize.countryQuestionDesc")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleCountrySelect("United States")} className="border-2 border-border rounded-lg p-4 hover:border-primary hover:bg-primary/5 transition-colors text-center">
                <span className="text-3xl block mb-1">🇺🇸</span>
                <span className="text-sm font-medium text-foreground">{t("optimize.countryUS")}</span>
              </button>
              <button onClick={() => handleCountrySelect("Israel")} className="border-2 border-border rounded-lg p-4 hover:border-primary hover:bg-primary/5 transition-colors text-center">
                <span className="text-3xl block mb-1">🇮🇱</span>
                <span className="text-sm font-medium text-foreground">{t("optimize.countryIL")}</span>
              </button>
            </div>
            <Button variant="ghost" onClick={() => handleClose(false)} className="w-full">{t("optimize.close")}</Button>
          </div>
        )}

        {/* === Phase: Results === */}
        {phase === "results" && results && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className={`border rounded-lg p-4 ${results.meterData ? "border-primary/30 bg-primary/5" : "border-border opacity-50"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-foreground">{t("optimize.meterData")}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{results.meterData?.rows.length ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">{t("optimize.metersFromFiles", { files: meterFileCount })}</p>
              </div>
              <div className={`border rounded-lg p-4 ${results.consumptionData ? "border-primary/30 bg-primary/5" : "border-border opacity-50"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Gauge className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-foreground">{t("optimize.consumptionData")}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{results.consumptionData?.rows.length ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">{t("optimize.readingsFromFiles", { files: consFileCount })}</p>
              </div>
            </div>

            {/* Warnings */}
            {isMonthly && (
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">{t("optimize.amrWarning")}</p>
              </div>
            )}

            {uidCheck && !uidCheck.isConsistent && (
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">{t("optimize.uidMismatch", { rate: uidCheck.matchRate })}</p>
              </div>
            )}
            {uidCheck && uidCheck.isConsistent && (
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg p-3">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-700 dark:text-emerald-400">{t("optimize.uidMatch", { rate: uidCheck.matchRate })}</p>
              </div>
            )}

            {/* File analysis summary */}
            <div className="space-y-1.5">
              {files.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate flex-1">{f.name}</span>
                  {f.hasMeterData && <Badge className="text-[9px] bg-primary/10 text-primary">{t("optimize.meterData")}</Badge>}
                  {f.hasConsumptionData && (
                    <Badge className={`text-[9px] ${f.readingFrequency === "monthly" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" : f.readingFrequency === "daily" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                      {f.readingFrequency === "monthly" ? t("optimize.monthly") : f.readingFrequency === "daily" ? t("optimize.daily") : t("optimize.unknownFreq")}
                    </Badge>
                  )}
                </div>
              ))}
            </div>

            {/* Download buttons */}
            <div className="flex flex-col gap-2 pt-2">
              {results.meterData && (
                <Button onClick={handleDownloadMeter} className="w-full gap-2" size="lg">
                  <Download className="w-4 h-4" /> {t("optimize.downloadMeter")} ({results.meterData.rows.length})
                </Button>
              )}
              {results.consumptionData && (
                <Button onClick={handleDownloadConsumption} className="w-full gap-2" size="lg" variant="outline">
                  <Download className="w-4 h-4" /> {t("optimize.downloadConsumption")} ({results.consumptionData.rows.length})
                </Button>
              )}
              {!results.meterData && !results.consumptionData && (
                <p className="text-sm text-muted-foreground text-center py-2">{t("optimize.noDataGenerated")}</p>
              )}
            </div>

            {/* Data preview */}
            {(results.meterData || results.consumptionData) && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-1 px-2 py-1.5 bg-muted border-b border-border">
                  {results.meterData && (
                    <button
                      onClick={() => setPreviewTab((p) => (p === "meter" ? null : "meter"))}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${previewTab === "meter" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-background"}`}
                    >
                      <FileText className="w-3 h-3" /> {t("optimize.meterData")}
                    </button>
                  )}
                  {results.consumptionData && (
                    <button
                      onClick={() => setPreviewTab((p) => (p === "consumption" ? null : "consumption"))}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${previewTab === "consumption" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-background"}`}
                    >
                      <Gauge className="w-3 h-3" /> {t("optimize.consumptionData")}
                    </button>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {previewTab === "meter" && results.meterData && `${Math.min(10, results.meterData.rows.length)} / ${results.meterData.rows.length}`}
                    {previewTab === "consumption" && results.consumptionData && `${Math.min(10, results.consumptionData.rows.length)} / ${results.consumptionData.rows.length}`}
                  </span>
                </div>
                {previewTab && (
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          {(previewTab === "meter" ? results.meterData?.headers : results.consumptionData?.headers)?.map((h, i) => (
                            <th key={i} className="px-2 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap border-b border-border">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(previewTab === "meter" ? results.meterData?.rows : results.consumptionData?.rows)?.slice(0, 10).map((row, ri) => (
                          <tr key={ri} className="border-b border-border/50">
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-2 py-1 whitespace-nowrap text-foreground max-w-[160px] truncate">
                                {String(cell ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {!previewTab && (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">{t("optimize.previewHint")}</div>
                )}
              </div>
            )}

            {/* Adjust mappings (collapsible) */}
            <div className="border-t border-border pt-3">
              <button
                onClick={() => setShowAdjust((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdjust ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {t("optimize.adjustMappings")}
              </button>
              {showAdjust && (
                <div className="mt-3 space-y-2">
                  {files.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground truncate w-32 shrink-0">{f.name}</span>
                      <select value={f.uidColumn} onChange={(e) => updateFile(idx, { uidColumn: e.target.value })} className={selectClass}>
                        <option value="">{t("optimize.selectColumn")}</option>
                        {f.columns.map((col) => <option key={col} value={col}>{col}</option>)}
                      </select>
                      {f.hasMeterData && f.addressColumns.length > 1 && (
                        <select value={f.addressColumn} onChange={(e) => updateFile(idx, { addressColumn: e.target.value })} className={`${selectClass} w-32`}>
                          <option value="">{t("optimize.addressColumn")}</option>
                          {f.addressColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upload to platform */}
            {projectId && !uploadPhase && (
              <div className="border-t border-border pt-3">
                <Button onClick={() => setUploadPhase("confirm")} className="w-full gap-2" size="lg" variant="outline">
                  <CloudUpload className="w-4 h-4" /> {t("optimize.uploadToPlatform")}
                </Button>
              </div>
            )}

            {/* Upload confirmation */}
            {uploadPhase === "confirm" && (
              <div className="border border-primary/30 bg-primary/5 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <CloudUpload className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("optimize.uploadConfirmTitle")}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("optimize.uploadConfirmDesc", {
                        meters: results.meterData?.rows.length ?? 0,
                        readings: results.consumptionData?.rows.length ?? 0,
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setUploadPhase(null)}>{t("optimize.cancel")}</Button>
                  <Button size="sm" onClick={handleUploadToPlatform} className="gap-1.5">
                    <CloudUpload className="w-3.5 h-3.5" /> {t("optimize.confirmUpload")}
                  </Button>
                </div>
              </div>
            )}

            {/* Upload progress */}
            {uploadPhase === "uploading" && (
              <div className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {uploadProgress.phase === "meters" && t("optimize.uploadMeters")}
                      {uploadProgress.phase === "fetching_meters" && t("optimize.uploadFetchingMeters")}
                      {uploadProgress.phase === "readings" && t("optimize.uploadReadings")}
                      {uploadProgress.phase === "starting" && t("optimize.uploadStarting")}
                    </p>
                    {uploadProgress.total > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {uploadProgress.processed} / {uploadProgress.total}
                      </p>
                    )}
                  </div>
                </div>
                {uploadProgress.total > 0 && (
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-full transition-all"
                      style={{ width: `${Math.round((uploadProgress.processed / uploadProgress.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Upload done */}
            {uploadPhase === "done" && uploadResult && (
              <div className="border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm font-medium text-foreground">{t("optimize.uploadDone")}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("optimize.uploadDoneDesc", { meters: uploadResult.meters, readings: uploadResult.readings })}
                </p>
                {uploadResult.errors > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t("optimize.uploadErrors", { count: uploadResult.errors })}
                  </p>
                )}
                <Button onClick={() => handleClose(false)} className="w-full gap-2" size="sm">
                  <Check className="w-3.5 h-3.5" /> {t("optimize.close")}
                </Button>
              </div>
            )}

            {/* Upload error */}
            {uploadPhase === "error" && (
              <div className="border border-destructive/20 bg-destructive/5 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                  <p className="text-sm font-medium text-foreground">{t("optimize.uploadFailed")}</p>
                </div>
                <Button onClick={() => setUploadPhase(null)} variant="outline" size="sm">{t("optimize.back")}</Button>
              </div>
            )}

            {!uploadPhase && (
              <div className="flex justify-between gap-2 pt-2">
                <Button variant="outline" onClick={reset} className="gap-1.5">
                  <Sparkles className="w-4 h-4" /> {t("optimize.startOver")}
                </Button>
                <Button variant="ghost" onClick={() => handleClose(false)}>{t("optimize.close")}</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}