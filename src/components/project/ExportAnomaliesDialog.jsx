import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Download, Loader2, AlertTriangle, FileWarning, CircleSlash, Search } from "lucide-react";
import { invokeFunction } from "@/api/functionsClient";
import { exportMetersXLS } from "@/lib/meterExport";
import { useLanguage } from "@/lib/i18n";

const ANOMALY_COLUMNS = [
  { key: "uid", label: "UID", type: "string" },
  { key: "type", label: "Type", type: "string" },
  { key: "payer_name", label: "Account Name", type: "string" },
  { key: "address", label: "Address", type: "string" },
  { key: "provider", label: "Provider", type: "string" },
  { key: "anomaly_category", label: "Anomaly Category", type: "string" },
  { key: "anomaly_reason", label: "Reason", type: "string" },
  { key: "reading_count", label: "Reading Count", type: "number" },
  { key: "expected_readings", label: "Expected Readings", type: "number" },
  { key: "min_consumption", label: "Min Consumption", type: "number" },
  { key: "max_consumption", label: "Max Consumption", type: "number" },
  { key: "avg_consumption", label: "Avg Consumption", type: "number" },
  { key: "has_negative", label: "Has Negative", type: "string" },
  { key: "has_outlier", label: "Has Outlier", type: "string" },
  { key: "latitude", label: "Latitude", type: "number" },
  { key: "longitude", label: "Longitude", type: "number" },
];

const CATEGORIES = [
  {
    key: "no_data",
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    Icon: CircleSlash,
  },
  {
    key: "partial_data",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    Icon: FileWarning,
  },
  {
    key: "need_investigation",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    Icon: AlertTriangle,
  },
];

const CATEGORY_LABELS = {
  no_data: "No Data",
  partial_data: "Partial Data",
  need_investigation: "Need Investigation",
};

const CATEGORY_DESCRIPTIONS = {
  no_data: "All readings for this meter are empty or zero",
  partial_data: "The majority of the data for this meter is missing",
  need_investigation: "Unusual consumption, negative readings, or extreme outliers",
};

function meterToAnomalyRow(meter) {
  return {
    uid: meter.uid || "",
    type: meter.is_main ? "Main" : "Sub",
    payer_name: meter.payer_name || "",
    address: meter.address || "",
    provider: meter.provider || "",
    anomaly_category: CATEGORY_LABELS[meter.anomaly_category] || meter.anomaly_category,
    anomaly_reason: meter.anomaly_reason || "",
    reading_count: meter.reading_count ?? 0,
    expected_readings: meter.expected_readings ?? 0,
    min_consumption: meter.min_consumption ?? "",
    max_consumption: meter.max_consumption ?? "",
    avg_consumption: meter.avg_consumption ?? "",
    has_negative: meter.has_negative ? "Yes" : "No",
    has_outlier: meter.has_outlier ? "Yes" : "No",
    latitude: meter.latitude ?? "",
    longitude: meter.longitude ?? "",
  };
}

export default function ExportAnomaliesDialog({ open, onOpenChange, projectId, projectName, onAnomalyExported }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [anomalies, setAnomalies] = useState([]);
  const [counts, setCounts] = useState({ no_data: 0, partial_data: 0, need_investigation: 0, total: 0 });
  const [maxReadings, setMaxReadings] = useState(0);
  const [selectedCats, setSelectedCats] = useState(new Set(["no_data", "partial_data", "need_investigation"]));
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open && projectId) {
      setLoading(true);
      setSearch("");
      setSelectedCats(new Set(["no_data", "partial_data", "need_investigation"]));
      invokeFunction("getMeterAnomalies", { project_id: projectId })
        .then((res) => {
          setAnomalies(res.data?.anomalies || []);
          setCounts(res.data?.counts || { no_data: 0, partial_data: 0, need_investigation: 0, total: 0 });
          setMaxReadings(res.data?.max_readings || 0);
        })
        .catch(() => {
          setAnomalies([]);
          setCounts({ no_data: 0, partial_data: 0, need_investigation: 0, total: 0 });
        })
        .finally(() => setLoading(false));
    }
  }, [open, projectId]);

  const toggleCategory = (key) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredAnomalies = useMemo(() => {
    let result = anomalies.filter((a) => selectedCats.has(a.anomaly_category));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((a) =>
        (a.uid || "").toLowerCase().includes(q) ||
        (a.payer_name || "").toLowerCase().includes(q) ||
        (a.address || "").toLowerCase().includes(q) ||
        (a.provider || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [anomalies, selectedCats, search]);

  const selectedCount = filteredAnomalies.length;

  const handleExport = () => {
    if (filteredAnomalies.length === 0) return;
    const rows = filteredAnomalies.map(meterToAnomalyRow);
    const safeProject = String(projectName || "project").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `${safeProject}_Meter_Anomalies_${ts}`;
    exportMetersXLS(rows, ANOMALY_COLUMNS, filename);
    onAnomalyExported?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            {t('exportAnomalies.title')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t('exportAnomalies.subtitle')}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-muted-foreground/50 animate-spin" />
            <p className="text-sm text-muted-foreground">{t('exportAnomalies.loading')}</p>
          </div>
        ) : counts.total === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-12 h-12 text-emerald-500/50" />
            <p className="text-sm font-medium text-foreground">{t('exportAnomalies.noAnomalies')}</p>
            <p className="text-xs text-muted-foreground">{t('exportAnomalies.noAnomaliesDesc')}</p>
          </div>
        ) : (
          <>
            {/* Category cards */}
            <div className="space-y-2">
              {CATEGORIES.map((cat) => {
                const count = counts[cat.key] || 0;
                const isActive = selectedCats.has(cat.key);
                return (
                  <button
                    key={cat.key}
                    onClick={() => toggleCategory(cat.key)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                      isActive ? `${cat.bg} ${cat.border}` : "border-border bg-card opacity-60"
                    }`}
                  >
                    <Checkbox checked={isActive} className="pointer-events-none" />
                    <cat.Icon className={`w-5 h-5 shrink-0 ${cat.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{CATEGORY_LABELS[cat.key]}</p>
                      <p className="text-xs text-muted-foreground">{CATEGORY_DESCRIPTIONS[cat.key]}</p>
                    </div>
                    <span className={`text-lg font-bold tabular-nums shrink-0 ${cat.color}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('exportAnomalies.searchPlaceholder')}
                className="pl-9 h-9"
              />
            </div>

            {maxReadings > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('exportAnomalies.maxReadings', { count: maxReadings })}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              {t('exportAnomalies.recordsWillExport', { count: selectedCount })}
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('exportAnomalies.cancel')}
              </Button>
              <Button
                onClick={handleExport}
                disabled={selectedCount === 0}
                className="gap-1.5"
              >
                <Download className="w-4 h-4" /> {t('exportAnomalies.export')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}