import React, { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, ChevronUp, ChevronDown, Loader2, Eye } from "lucide-react";
import { invokeFunction } from "@/api/functionsClient";
import { ALL_COLUMNS, meterToRow, exportMetersXLS, exportMetersCSV } from "@/lib/meterExport";
import { useLanguage } from "@/lib/i18n";

const PRESETS = [
  { key: "all", labelKey: "exportMeters.allMeters" },
  { key: "missing_gis", labelKey: "exportMeters.missingGis" },
  { key: "unassigned_subs", labelKey: "exportMeters.unassignedSubs" },
  { key: "duplications", labelKey: "exportMeters.duplications" },
];

export default function ExportMetersDialog({ open, onOpenChange, projectId, dmas, defaultName, onAnomalyExported }) {
  const { t } = useLanguage();
  const [filename, setFilename] = useState(defaultName || "meters");
  const [selectedFields, setSelectedFields] = useState(ALL_COLUMNS.map((c) => c.key));
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [filterKey, setFilterKey] = useState(null);
  const [filterVal, setFilterVal] = useState("");
  const [preset, setPreset] = useState("all");
  const [format, setFormat] = useState("xls");
  const [meters, setMeters] = useState([]);
  const [loadingMeters, setLoadingMeters] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Fetch all meters when dialog opens (DMA names are resolved server-side)
  useEffect(() => {
    if (open && projectId) {
      setFilename(defaultName || "meters");
      setSelectedFields(ALL_COLUMNS.map((c) => c.key));
      setSortKey(null);
      setSortDir("asc");
      setFilterKey(null);
      setFilterVal("");
      setPreset("all");
      setFormat("xls");
      setLoadingMeters(true);
      invokeFunction("getProjectMeters", { project_id: projectId })
        .then((res) => setMeters(res.data?.meters || []))
        .catch(() => setMeters([]))
        .finally(() => setLoadingMeters(false));
    }
  }, [open, projectId, defaultName]);

  // Find duplicate UIDs — meters whose UID appears more than once
  const duplicateUids = useMemo(() => {
    const counts = {};
    for (const m of meters || []) {
      const uid = (m.uid || "").trim();
      if (!uid) continue;
      counts[uid] = (counts[uid] || 0) + 1;
    }
    return new Set(Object.keys(counts).filter((uid) => counts[uid] > 1));
  }, [meters]);

  const presetMeters = useMemo(() => {
    const all = meters || [];
    switch (preset) {
      case "missing_gis":
        return all.filter((m) => m.latitude == null || m.longitude == null);
      case "unassigned_subs":
        return all.filter((m) => !m.is_main && !m.dma_name);
      case "duplications":
        return all.filter((m) => duplicateUids.has((m.uid || "").trim()));
      default:
        return all;
    }
  }, [meters, preset, duplicateUids]);

  const presetCounts = useMemo(() => {
    const all = meters || [];
    return {
      all: all.length,
      missing_gis: all.filter((m) => m.latitude == null || m.longitude == null).length,
      unassigned_subs: all.filter((m) => !m.is_main && !m.dma_name).length,
      duplications: all.filter((m) => duplicateUids.has((m.uid || "").trim())).length,
    };
  }, [meters, duplicateUids]);

  const preparedRows = useMemo(() => presetMeters.map((m) => {
    return meterToRow(m, m.dma_name || "");
  }), [presetMeters]);

  const filteredRows = useMemo(() => {
    if (!filterKey || !filterVal.trim()) return preparedRows;
    const q = filterVal.toLowerCase();
    return preparedRows.filter((r) => String(r[filterKey] ?? "").toLowerCase().includes(q));
  }, [preparedRows, filterKey, filterVal]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va ?? "").localeCompare(String(vb ?? "")) * dir;
    });
  }, [filteredRows, sortKey, sortDir]);

  const columns = ALL_COLUMNS.filter((c) => selectedFields.includes(c.key));

  const toggleField = (key) => {
    setSelectedFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleExport = () => {
    if (columns.length === 0 || sortedRows.length === 0) return;
    const name = filename || "meters";
    if (format === "csv") {
      exportMetersCSV(sortedRows, columns, name);
    } else {
      exportMetersXLS(sortedRows, columns, name);
    }
    if (preset !== "all") {
      onAnomalyExported?.();
    }
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-4 h-4" /> {t('exportMeters.title')}
            </DialogTitle>
          </DialogHeader>

          {loadingMeters ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">{t('exportMeters.loading')}</p>
            </div>
          ) : (
            <>
              {/* Preset + Format — compact two-column row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('exportMeters.preset')}</Label>
                  <div className="space-y-1">
                    {PRESETS.map((p) => (
                      <button
                        key={p.key}
                        onClick={() => setPreset(p.key)}
                        className={`w-full text-xs px-2.5 py-1.5 rounded-md border transition-colors text-left flex items-center justify-between gap-2 ${
                          preset === p.key
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {t(p.labelKey)}
                        <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
                          preset === p.key ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                        }`}>
                          {presetCounts[p.key] ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('exportMeters.format')}</Label>
                    <div className="flex gap-1.5">
                      {["xls", "csv"].map((f) => (
                        <button
                          key={f}
                          onClick={() => setFormat(f)}
                          className={`text-xs px-4 py-1.5 rounded-md border transition-colors uppercase font-medium ${
                            format === f
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('exportMeters.fileName')}</Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
                        placeholder="meters"
                        className="h-8"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">.{format}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filter + Sort — compact two-column row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('exportMeters.filterByField')}</Label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={filterKey || ""}
                      onChange={(e) => setFilterKey(e.target.value || null)}
                      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      <option value="">{t('exportMeters.noFilter')}</option>
                      {ALL_COLUMNS.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('exportMeters.sortByField')}</Label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={sortKey || ""}
                      onChange={(e) => setSortKey(e.target.value || null)}
                      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      <option value="">{t('exportMeters.noSort')}</option>
                      {ALL_COLUMNS.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                    {sortKey && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 shrink-0"
                        onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                      >
                        {sortDir === "asc" ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {filterKey && (
                <Input
                  value={filterVal}
                  onChange={(e) => setFilterVal(e.target.value)}
                  placeholder={t('exportMeters.filterByField') + "..."}
                  className="h-8"
                />
              )}

              {/* Field selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('exportMeters.fieldsToExport')}</Label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedFields(ALL_COLUMNS.map((c) => c.key))}
                      className="text-[11px] text-primary hover:underline"
                    >
                      {t('exportMeters.selectAll')}
                    </button>
                    <button
                      onClick={() => setSelectedFields([])}
                      className="text-[11px] text-muted-foreground hover:underline"
                    >
                      {t('exportMeters.clear')}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 border border-border rounded-lg p-2.5 max-h-40 overflow-y-auto">
                  {ALL_COLUMNS.map((col) => (
                    <div key={col.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`exp-${col.key}`}
                        checked={selectedFields.includes(col.key)}
                        onCheckedChange={() => toggleField(col.key)}
                      />
                      <Label htmlFor={`exp-${col.key}`} className="text-xs cursor-pointer">
                        {col.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {t('exportMeters.recordsWillExport', { count: sortedRows.length, fields: columns.length })}
                </p>
                {sortedRows.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 shrink-0"
                    onClick={() => setShowPreview(true)}
                  >
                    <Eye className="w-3.5 h-3.5" /> {t('exportMeters.preview')}
                  </Button>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>{t('exportMeters.cancel')}</Button>
                <Button
                  onClick={handleExport}
                  disabled={columns.length === 0 || sortedRows.length === 0}
                  className="gap-1.5"
                >
                  <Download className="w-4 h-4" /> {t('exportMeters.export')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview dialog — opens in a separate window on demand */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" /> {t('exportMeters.preview')}
              <span className="text-xs font-normal text-muted-foreground">({sortedRows.length} rows · {columns.length} cols)</span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1 border border-border rounded-lg">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted border-b border-border">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      className="px-2 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort(c.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        {sortKey === c.key && (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.slice(0, 100).map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/50">
                    {columns.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 text-muted-foreground whitespace-nowrap max-w-[200px] truncate">
                        {String(row[c.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sortedRows.length > 100 && (
            <p className="text-[10px] text-muted-foreground text-center">
              Showing 100 of {sortedRows.length} rows
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}