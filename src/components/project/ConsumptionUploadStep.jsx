import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileText, Check, AlertCircle, Loader2, ChevronRight, Gauge, Ban, FileSpreadsheet } from "lucide-react";
import { uploadFile } from "@/api/storageClient";
import { invokeFunction } from "@/api/functionsClient";
import { supabase } from "@/api/supabaseClient";
import { downloadConsumptionTemplate } from "@/lib/meterTemplate";
import { parseCSV, parseJSONData, detectIdColumns } from "@/lib/meterAnalysis";
import { normalizeDateForProject } from "@/lib/dateUtils";
import { runBatchesInParallel } from "@/lib/parallelBatch";

function detectDateColumns(columns) {
  return columns.filter((c) => /date|period|month|year|time|reading/i.test(c));
}

function detectSumColumns(columns) {
  return columns.filter((c) => /sum|total/i.test(c));
}

function detectNumericColumns(rows, columns) {
  return columns.filter((col) => {
    const values = rows.map((r) => r[col]).filter((v) => v != null && String(v).trim() !== "");
    if (values.length === 0) return false;
    const numericCount = values.filter((v) => !isNaN(parseFloat(String(v).replace(/,/g, "")))).length;
    return numericCount / values.length > 0.5;
  });
}

function buildUidLookup(meters) {
  const lookup = new Map();
  for (const meter of meters) {
    if (meter.uid) lookup.set(meter.uid.trim(), meter);
    if (meter.additional_ids) {
      for (const id of meter.additional_ids) {
        if (id.value) lookup.set(String(id.value).trim(), meter);
      }
    }
  }
  return lookup;
}

function matchRowUid(rawUid, uidLookup) {
  const parts = String(rawUid || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (uidLookup.has(part)) return uidLookup.get(part);
  }
  return null;
}

export default function ConsumptionUploadStep({ projectId, dateFormat = "EU", meterCount, onUploaded }) {
  const [phase, setPhase] = useState("idle");
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [idCols, setIdCols] = useState([]);
  const [dateCols, setDateCols] = useState([]);
  const [numericCols, setNumericCols] = useState([]);
  const [sumCols, setSumCols] = useState([]);
  const [uidColumn, setUidColumn] = useState("");
  const [dateColumn, setDateColumn] = useState("");
  const [consumptionColumns, setConsumptionColumns] = useState([]);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [matchResults, setMatchResults] = useState(null);
  const [meters, setMeters] = useState([]);
  const [computing, setComputing] = useState(false);
  const [eta, setEta] = useState(null);
  const [batchInfo, setBatchInfo] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setPhase("idle");
    setFile(null);
    setFileUrl(null);
    setRows([]);
    setColumns([]);
    setIdCols([]);
    setDateCols([]);
    setNumericCols([]);
    setSumCols([]);
    setUidColumn("");
    setDateColumn("");
    setConsumptionColumns([]);
    setError(null);
    setProgress(0);
    setProgressLabel("");
    setMatchResults(null);
    setMeters([]);
    setComputing(false);
    setEta(null);
    setBatchInfo(null);
  }, []);

  useEffect(() => {
    if (phase !== "config") return;
    if (!uidColumn || consumptionColumns.length === 0) {
      setMatchResults(null);
      return;
    }
    computeMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uidColumn, dateColumn, consumptionColumns, phase]);

  const handleFileSelect = async (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setError(null);

    const ext = selected.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "json"].includes(ext)) {
      setError("Unsupported file type. Please upload a CSV or JSON file.");
      e.target.value = "";
      return;
    }

    setFile(selected);
    setPhase("analyzing");

    try {
      const { file_url } = await uploadFile({ file: selected });
      setFileUrl(file_url);

      const text = await selected.text();
      const parsed = ext === "csv" ? parseCSV(text) : parseJSONData(text);
      if (parsed.length === 0) {
        setError("No data rows found in the file.");
        setPhase("idle");
        return;
      }

      const cols = Object.keys(parsed[0]);
      const detectedIds = detectIdColumns(cols);
      const detectedDates = detectDateColumns(cols);
      const detectedNumeric = detectNumericColumns(parsed, cols);
      const detectedSums = detectSumColumns(cols);

      setRows(parsed);
      setColumns(cols);
      setIdCols(detectedIds);
      setDateCols(detectedDates);
      setNumericCols(detectedNumeric);
      setSumCols(detectedSums);

      const suggestedUid = detectedIds[0] || "";
      const suggestedDate = detectedDates[0] || "";
      const suggestedConsumption = detectedNumeric.filter((c) => c !== suggestedUid && c !== suggestedDate && !detectedSums.includes(c));

      setUidColumn(suggestedUid);
      setDateColumn(suggestedDate);
      setConsumptionColumns(suggestedConsumption);
      setPhase("config");
    } catch (err) {
      setError(err.message || "Failed to analyze file.");
      setPhase("idle");
    }
  };

  const computeMatches = async () => {
    setComputing(true);
    try {
      let meterList = meters;
      if (meterList.length === 0) {
        const res = await invokeFunction("getProjectMeters", { project_id: projectId });
        meterList = res.data?.meters || [];
        setMeters(meterList);
      }

      const uidLookup = buildUidLookup(meterList);

      let matched = 0;
      let unmatched = 0;
      const matchedSamples = [];
      const unmatchedSamples = [];

      for (const row of rows) {
        const rawUid = row[uidColumn] || "";
        const meter = matchRowUid(rawUid, uidLookup);
        if (meter) {
          matched++;
          if (matchedSamples.length < 3) matchedSamples.push({ rawUid, meterUid: meter.uid });
        } else {
          unmatched++;
          if (unmatchedSamples.length < 3) unmatchedSamples.push({ rawUid });
        }
      }

      setMatchResults({ matched, unmatched, matchedSamples, unmatchedSamples, total: rows.length });
    } catch (err) {
      setError("Failed to compute matches: " + (err.message || "unknown error"));
    } finally {
      setComputing(false);
    }
  };

  const toggleConsumptionColumn = (col) => {
    setConsumptionColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const handleConfirm = async () => {
    try {
      setPhase("processing");
      setProgress(5);
      setProgressLabel("Loading meters...");

      let meterList = meters;
      if (meterList.length === 0) {
        const res = await invokeFunction("getProjectMeters", { project_id: projectId });
        meterList = res.data?.meters || [];
      }
      const uidLookup = buildUidLookup(meterList);

      setProgress(10);
      setProgressLabel("Calculating batch sizes...");

      // Each record produces one reading per consumption column.
      // Split the file into batches so each batch produces at most 10,000 readings.
      const readingsPerRecord = consumptionColumns.length || 1;
      const MAX_READINGS_PER_BATCH = 18000;
      const recordsPerBatch = Math.max(1, Math.floor(MAX_READINGS_PER_BATCH / readingsPerRecord));
      const totalBatches = Math.ceil(rows.length / recordsPerBatch);

      setBatchInfo({ current: 0, total: totalBatches, recordsPerBatch, readingsPerRecord });

      setProgress(15);
      setProgressLabel(`Processing ${rows.length} records in ${totalBatches} batch${totalBatches !== 1 ? "es" : ""} (${recordsPerBatch} records/batch, ${readingsPerRecord} readings/record)...`);

      const formatDuration = (ms) => {
        const totalMin = Math.max(0, Math.round(ms / 60000));
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m`;
        return "< 1m";
      };
      const formatLocalTime = (date) =>
        date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      const errorLogs = [];
      let totalReadingsCreated = 0;
      const uploadStart = Date.now();

      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        const batchRows = rows.slice(batchIdx * recordsPerBatch, (batchIdx + 1) * recordsPerBatch);
        const batchReadings = [];

        for (const row of batchRows) {
          const rawUid = row[uidColumn] || "";
          const meter = matchRowUid(rawUid, uidLookup);

          if (meter) {
            for (const col of consumptionColumns) {
              const val = parseFloat(String(row[col] || "").replace(/,/g, ""));
              if (isNaN(val)) continue;

              let readingDate = null;
              let periodLabel = null;

              if (dateColumn) {
                // Long format: date is in a cell
                const rawDate = String(row[dateColumn] || "").trim();
                const normalized = normalizeDateForProject(rawDate, dateFormat);
                readingDate = normalized.isoDate;
                periodLabel = normalized.label || rawDate || null;
              } else {
                // Wide format: date is in the column header
                const normalized = normalizeDateForProject(col, dateFormat);
                readingDate = normalized.isoDate;
                periodLabel = normalized.label || col;
              }

              batchReadings.push({
                project_id: projectId,
                meter_id: meter.id,
                reading_date: readingDate,
                period_label: periodLabel,
                consumption: val,
                source_file_url: fileUrl,
                source_file_name: file?.name || "",
              });
            }
          } else {
            errorLogs.push({
              project_id: projectId,
              import_type: "consumption",
              uid_value: String(rawUid),
              row_data: row,
              source_file_url: fileUrl,
              source_file_name: file?.name || "",
              error_message: "UID not found in meter database",
            });
          }
        }

        if (batchReadings.length > 0) {
          await supabase.from('consumption_reading').insert(batchReadings);
          totalReadingsCreated += batchReadings.length;
        }

        const completedBatches = batchIdx + 1;
        const elapsed = Date.now() - uploadStart;
        const avgPerBatch = elapsed / completedBatches;
        const batchesLeft = totalBatches - completedBatches;
        const remainingMs = avgPerBatch * batchesLeft;

        setBatchInfo({ current: completedBatches, total: totalBatches, recordsPerBatch, readingsPerRecord });
        setProgress(15 + Math.round((completedBatches / totalBatches) * 65));
        setProgressLabel(`Saving readings — batch ${completedBatches}/${totalBatches} (${totalReadingsCreated} readings saved)`);
        setEta({
          remaining: formatDuration(remainingMs),
          completion: formatLocalTime(new Date(Date.now() + remainingMs)),
        });
      }

      setProgress(80);
      setProgressLabel(`Saving ${errorLogs.length} error logs...`);

      const ERROR_BATCH_SIZE = 150;
      const ERROR_CONCURRENCY = 4;
      const errorStart = Date.now();
      await runBatchesInParallel(
        errorLogs,
        ERROR_BATCH_SIZE,
        ERROR_CONCURRENCY,
        (batch) => supabase.from('import_log').insert(batch),
        (completedBatches, totalErrorBatches) => {
          const elapsed = Date.now() - errorStart;
          const avgPerBatch = elapsed / completedBatches;
          const batchesLeft = totalErrorBatches - completedBatches;
          const remainingMs = avgPerBatch * batchesLeft;
          setProgressLabel(`Saving error logs — batch ${completedBatches}/${totalErrorBatches}`);
          setEta({
            remaining: formatDuration(remainingMs),
            completion: formatLocalTime(new Date(Date.now() + remainingMs)),
          });
        }
      );

      setEta(null);
      setBatchInfo(null);

      setProgress(100);
      setProgressLabel(`Done! ${totalReadingsCreated} readings saved, ${errorLogs.length} errors logged.`);
      setPhase("done");

      setTimeout(() => {
        onUploaded?.({ readings: totalReadingsCreated, errors: errorLogs.length });
      }, 1500);
    } catch (err) {
      setError(err.message || "Failed to upload consumption data.");
      setPhase("config");
    }
  };

  const noMeters = meterCount === 0;
  const isProcessing = phase === "processing" || phase === "done";
  const canConfirm = uidColumn && consumptionColumns.length > 0 && !computing;

  if (noMeters) {
    return (
      <div className="flex items-start gap-3 text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg p-4">
        <Ban className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">No meter data found</p>
          <p className="text-xs mt-1">You must upload and create basic meter data before uploading consumption data. Use the "Meter Data" type first.</p>
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="py-6 space-y-4">
        <div className="flex items-center gap-3">
          {phase === "done" ? (
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          ) : (
            <Loader2 className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-spin" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">{progressLabel}</p>
            <p className="text-xs text-muted-foreground">{file?.name}</p>
          </div>
        </div>
        <Progress value={progress} className="h-2" />
        {batchInfo && phase === "processing" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-[10px]">
              Batch {batchInfo.current}/{batchInfo.total}
            </Badge>
            <span className="text-muted-foreground">·</span>
            <span>{batchInfo.recordsPerBatch} records/batch</span>
            <span className="text-muted-foreground">·</span>
            <span>{batchInfo.readingsPerRecord} readings/record</span>
          </div>
        )}
        <div className="flex justify-between text-xs text-muted-foreground">
          {eta ? (
            <span>~{eta.remaining} remaining · ETA {eta.completion}</span>
          ) : (
            <span />
          )}
          <span>{Math.round(progress)}%</span>
        </div>
      </div>
    );
  }

  if (phase === "analyzing") {
    return (
      <div className="py-8 flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
        <p className="text-sm text-muted-foreground">Analyzing file...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {phase === "idle" && (
        <>
          <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300 bg-blue-500/10 border border-blue-500/25 rounded-lg p-3">
            <Gauge className="w-4 h-4 shrink-0" />
            <span>Upload a CSV or JSON file containing meter consumption data. UIDs will be matched against the {meterCount} existing meter{meterCount !== 1 ? "s" : ""} in this project.</span>
          </div>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-500/5 transition-colors"
          >
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-medium">Click to select a file</p>
            <p className="text-xs text-muted-foreground mt-1">CSV or JSON files</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
          <div className="flex justify-center">
            <button
              onClick={downloadConsumptionTemplate}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Download CSV Template
            </button>
          </div>
        </>
      )}

      {phase === "config" && (
        <>
          <div className="flex items-center gap-2 bg-muted rounded-lg p-3">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground truncate flex-1">{file.name}</span>
            <span className="text-xs text-muted-foreground">{rows.length} rows</span>
            <button
              onClick={() => { setFile(null); setPhase("idle"); setRows([]); setColumns([]); setMatchResults(null); }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Change
            </button>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm">UID Column <span className="text-red-600 dark:text-red-400">*</span></Label>
            <p className="text-xs text-muted-foreground mb-2">Select the column containing meter identifiers. If UIDs are merged with other IDs (comma/semicolon separated), each part will be tried for matching.</p>
            <select
              value={uidColumn}
              onChange={(e) => setUidColumn(e.target.value)}
              className="flex-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— Select UID column —</option>
              {columns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
            {idCols.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">Detected ID columns: {idCols.join(", ")}</p>
            )}
          </div>

          <div>
            <Label className="mb-1.5 block text-sm">Date Column (optional)</Label>
            <p className="text-xs text-muted-foreground mb-2">For long-format data. If left empty, consumption column headers will be used as period labels (wide format). Dates are auto-detected and reformatted to the project's {dateFormat === "US" ? "US (MM/DD/YYYY)" : "EU (DD/MM/YYYY)"} format.</p>
            <select
              value={dateColumn}
              onChange={(e) => setDateColumn(e.target.value)}
              className="flex-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— None (wide format) —</option>
              {columns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
            {!dateColumn && consumptionColumns.length > 0 && (() => {
              const sample = consumptionColumns.find((c) => normalizeDateForProject(c, dateFormat).isoDate);
              if (!sample) return null;
              const norm = normalizeDateForProject(sample, dateFormat);
              return (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                  ✓ Date headers detected — "{sample}" → "{norm.label}"
                </p>
              );
            })()}
          </div>

          <div>
            <Label className="mb-1.5 block text-sm">Consumption Column(s) <span className="text-red-600 dark:text-red-400">*</span></Label>
            <p className="text-xs text-muted-foreground mb-2">Select one or more columns containing consumption values.</p>
            <div className="border border-border rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
              {columns.map((col) => {
                const isUid = col === uidColumn;
                const isDate = col === dateColumn;
                const isSum = sumCols.includes(col);
                const isDisabled = isUid || isDate || isSum;
                const isNumeric = numericCols.includes(col);
                return (
                  <label
                    key={col}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-muted"}`}
                  >
                    <Checkbox
                      checked={consumptionColumns.includes(col)}
                      onCheckedChange={() => !isDisabled && toggleConsumptionColumn(col)}
                      disabled={isDisabled}
                    />
                    <span className="text-xs text-foreground flex-1 truncate">{col}</span>
                    {isSum ? (
                      <Badge variant="secondary" className="text-[9px] text-amber-700 dark:text-amber-300">sum — ignored</Badge>
                    ) : isNumeric && !isUid && !isDate ? (
                      <Badge variant="secondary" className="text-[9px]">numeric</Badge>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>

          {computing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Computing matches...
            </div>
          )}
          {matchResults && !computing && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{matchResults.total}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Total Rows</p>
                </div>
                <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{matchResults.matched}</p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">Matched</p>
                </div>
                <div className="bg-red-500/10 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-red-700 dark:text-red-300">{matchResults.unmatched}</p>
                  <p className="text-[10px] text-red-600 dark:text-red-400 mt-0.5">Unmatched</p>
                </div>
              </div>
              {matchResults.unmatched > 0 && (
                <div className="border border-amber-500/25 bg-amber-500/5 rounded-lg p-3">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1.5">Sample unmatched UIDs (will be logged as errors):</p>
                  <div className="space-y-1">
                    {matchResults.unmatchedSamples.map((s, i) => (
                      <p key={i} className="text-xs font-mono text-amber-800 dark:text-amber-200 truncate">"{s.rawUid}"</p>
                    ))}
                  </div>
                </div>
              )}
              {matchResults.matched > 0 && (
                <div className="border border-emerald-500/25 bg-emerald-500/5 rounded-lg p-3">
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-1.5">Sample matched meters:</p>
                  <div className="space-y-1">
                    {matchResults.matchedSamples.map((s, i) => (
                      <p key={i} className="text-xs font-mono text-emerald-800 dark:text-emerald-200 truncate">"{s.rawUid}" → {s.meterUid}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={handleConfirm} disabled={!canConfirm} className="gap-1.5">
              Upload Consumption <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}