import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invokeFunction } from "@/api/functionsClient";
import { supabase } from "@/api/supabaseClient";
import { Search, Gauge, Loader2, Inbox, BarChart3, Sparkles, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, MousePointerClick, Pencil, Trash2, X, Layers, MapPin, Smartphone, AlertTriangle, Copy } from "lucide-react";
import { pointInPolygon } from "@/lib/polygonUtils";
import { isInsertionManualLayer } from "@/lib/meterLayerDetection";
import { meterIdOf, accountIdOf } from "@/lib/meterIds";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import MeterConsumptionDialog from "./MeterConsumptionDialog";
import MeterConsumptionTableDialog from "./MeterConsumptionTableDialog";
import MeterEditDialog from "./MeterEditDialog";
import DeleteMetersDialog from "./DeleteMetersDialog";
import CreateLayerFromMetersDialog from "./CreateLayerFromMetersDialog";
import MobileLocatorDialog from "./MobileLocatorDialog";
import ExportAnomaliesDialog from "./ExportAnomaliesDialog";
import { useLanguage } from "@/lib/i18n";

const PAGE_SIZE = 100;

export default function MeterDataView({ projectId, project, dmas, layers, onMetersUpdated, onStartInteractiveEstimation, locked, onAnomalyExported, onViewOnMap, onPinpoint, networkFilter, onClearNetworkFilter }) {
  const { t } = useLanguage();
  const [meters, setMeters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedMeter, setSelectedMeter] = useState(null);
  const [consumptionTableMeter, setConsumptionTableMeter] = useState(null);
  const [editMeter, setEditMeter] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreateLayer, setShowCreateLayer] = useState(false);
  const [showMobileLocator, setShowMobileLocator] = useState(false);
  const [showAnomalyExport, setShowAnomalyExport] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [counts, setCounts] = useState({ total: 0, main: 0, mainIns: 0, sub: 0, unlocatedCount: 0 });
  const [countsLoading, setCountsLoading] = useState(false);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const tableRef = useRef(null);

  const insertionLayerIds = useMemo(() => {
    return (layers || []).filter(isInsertionManualLayer).map((l) => l.id);
  }, [layers]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const dmaFilter = useMemo(() => {
    if (!networkFilter || networkFilter.type === "all") return undefined;
    return { type: networkFilter.type, dmaId: networkFilter.dmaId };
  }, [networkFilter]);

  // Fetch current page from server (plain function — always uses latest state)
  const loadPage = (targetPage) => {
    const p = targetPage ?? 1;
    setLoading(true);
    invokeFunction("getProjectMeters", {
      project_id: projectId,
      page: p,
      pageSize: PAGE_SIZE,
      search: debouncedSearch || undefined,
      meterType: filter !== "all" ? filter : undefined,
      insertionLayerIds: insertionLayerIds.length > 0 ? insertionLayerIds : undefined,
      sortKey: sortKey || undefined,
      sortDir,
      dmaFilter,
    })
      .then((res) => {
        setMeters(res.data?.meters || []);
        setHasMore(res.data?.hasMore || false);
        if (tableRef.current) tableRef.current.scrollTo(0, 0);
      })
      .catch((err) => console.error('loadPage error:', err))
      .finally(() => {
        setLoading(false);
        setHasInitiallyLoaded(true);
      });
  };

  // Fetch total counts in background (non-blocking), reflecting current search
  const loadCounts = useCallback(() => {
    setCountsLoading(true);
    invokeFunction("getProjectMeters", {
      project_id: projectId,
      countsOnly: true,
      search: debouncedSearch || undefined,
      insertionLayerIds: insertionLayerIds.length > 0 ? insertionLayerIds : undefined,
      dmaFilter,
    })
      .then((res) => {
        setCounts({
          total: res.data?.total ?? 0,
          main: res.data?.mainCount ?? 0,
          mainIns: res.data?.mainInsCount ?? 0,
          sub: res.data?.subCount ?? 0,
          unlocatedCount: res.data?.unlocatedCount ?? 0,
        });
      })
      .catch(() => {})
      .finally(() => setCountsLoading(false));
  }, [projectId, debouncedSearch, dmaFilter, insertionLayerIds]);

  // Load on mount and when filters/search/sort change (NOT on page change — buttons call loadPage directly)
  useEffect(() => {
    setPage(1);
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, debouncedSearch, filter, sortKey, sortDir, dmaFilter, insertionLayerIds]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // Auto-navigate back if page becomes empty (e.g. after deletions)
  useEffect(() => {
    if (!loading && hasInitiallyLoaded && meters.length === 0 && page > 1) {
      const np = page - 1;
      setPage(np);
      loadPage(np);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, meters.length, page, hasInitiallyLoaded]);

  const handleMeterSaved = () => {
    loadPage(page);
    loadCounts();
    onMetersUpdated?.();
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === meters.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(meters.map((m) => m.id)));
    }
  };

  const enterDeleteMode = () => {
    setDeleteMode(true);
    setSelectedIds(new Set());
  };

  const exitDeleteMode = () => {
    setDeleteMode(false);
    setSelectedIds(new Set());
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    const ids = [...selectedIds];

    // A DMA's main_meter_id references the meter with ON DELETE NO ACTION, so
    // deleting a meter that is some DMA's main is refused outright. Unlink those
    // DMAs first — otherwise nothing is deleted and, because the error was only
    // logged, the dialog closed as though it had worked.
    const { data: linkedDmas, error: dmaReadError } = await supabase
      .from('dma').select('id, name').eq('project_id', projectId).in('main_meter_id', ids);
    if (dmaReadError) {
      setDeleting(false);
      alert(`Could not delete: ${dmaReadError.message}`);
      return;
    }
    if (linkedDmas && linkedDmas.length > 0) {
      const { error: unlinkError } = await supabase
        .from('dma').update({ main_meter_id: null }).in('id', linkedDmas.map((d) => d.id));
      if (unlinkError) {
        setDeleting(false);
        alert(`Could not unlink the DMA main meter: ${unlinkError.message}`);
        return;
      }
    }
    const { error } = await supabase.from('meter').delete().in('id', ids);
    if (error) {
      setDeleting(false);
      alert(`Could not delete the selected meters: ${error.message}`);
      return;
    }

    // Confirm they are actually gone before reporting success — a filtered
    // delete can return no error while matching nothing.
    const { data: survivors } = await supabase.from('meter').select('id').in('id', ids).limit(1);
    if (survivors && survivors.length > 0) {
      setDeleting(false);
      alert("The selected meters could not be deleted. Please reload and try again.");
      return;
    }

    setDeleting(false);
    setShowDeleteConfirm(false);
    exitDeleteMode();
    if (linkedDmas && linkedDmas.length > 0) {
      onMetersUpdated?.();
    }
    if (selectedIds.size >= meters.length && page > 1) {
      const np = Math.max(1, page - 1);
      setPage(np);
      loadPage(np);
    } else {
      loadPage(page);
    }
    loadCounts();
    onMetersUpdated?.();
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const handleFilterChange = (key) => {
    setFilter(key);
    setPage(1);
  };

  // Pre-parse DMA polygons for meter→DMA lookup
  const parsedDmas = useMemo(() => {
    return (dmas || []).map((dma) => {
      let poly;
      try {
        // Base44's `polygon` (JSON string) became `polygon_json` (jsonb) —
        // accept either, or every sub-meter shows a blank DMA.
        const raw = dma.polygon_json ?? dma.polygon;
        poly = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch { poly = null; }
      return { id: dma.id, name: dma.name, main_meter_id: dma.main_meter_id, poly };
    });
  }, [dmas]);

  // Every DMA this meter serves. A main meter can be the main for more than one
  // DMA (dma.main_meter_id has no unique constraint), and those belong on a
  // single row as "DMA1, DMA2" rather than as duplicate rows.
  const getMeterDmaNames = useCallback((m) => {
    const linked = parsedDmas.filter((d) => d.main_meter_id && d.main_meter_id === m.id);
    if (linked.length > 0) return linked.map((d) => d.name);
    // A main belongs to a DMA only by an explicit link (see v1.064).
    if (m.is_main) return [];
    for (const dma of parsedDmas) {
      if (dma.poly && dma.poly.length >= 3 && m.latitude != null && m.longitude != null) {
        if (pointInPolygon(m.latitude, m.longitude, dma.poly)) return [dma.name];
      }
    }
    return [];
  }, [parsedDmas]);

  const getMeterDma = useCallback((m) => {
    // An explicit link always wins.
    for (const dma of parsedDmas) {
      if (dma.main_meter_id && dma.main_meter_id === m.id) return dma.name;
    }
    // A main meter belongs to a DMA only by that explicit link — mains sit at
    // inlets and boundaries, so falling back to "which polygon contains it"
    // would keep showing a DMA after the main meter was unassigned from it.
    if (m.is_main) return null;
    for (const dma of parsedDmas) {
      if (dma.poly && dma.poly.length >= 3 && m.latitude != null && m.longitude != null) {
        if (pointInPolygon(m.latitude, m.longitude, dma.poly)) return dma.name;
      }
    }
    return null;
  }, [parsedDmas]);

  // Reset to page 1 when dma filter changes
  useEffect(() => {
    setPage(1);
  }, [dmaFilter]);

  // Rows actually rendered. A meter appears once, except when it is a main that
  // is ALSO metered as a sub-meter of another DMA — then it gets a second,
  // clearly-marked row. That extra row is presentation only: it is excluded
  // from every count and from selection, so totals still reflect real meters.
  const displayRows = useMemo(() => {
    const rows = [];
    for (const m of meters) {
      rows.push({ meter: m, key: m.id, dmaNames: getMeterDmaNames(m), asSubMeter: false });
      const subDma = m.sub_meter_dma_id
        ? (dmas || []).find((d) => d.id === m.sub_meter_dma_id)
        : null;
      if (m.is_main && subDma) {
        rows.push({ meter: m, key: `${m.id}:sub`, dmaNames: [subDma.name], asSubMeter: true });
      }
    }
    return rows;
  }, [meters, dmas, getMeterDmaNames]);

  const activeFilterCount = filter === "main" ? counts.main : filter === "main_ins" ? counts.mainIns : filter === "sub" ? counts.sub : counts.total;
  const hasMeters = counts.total > 0 || (hasInitiallyLoaded && meters.length > 0);
  // Fallback: also derive "has more" from total counts — more reliable than the paginated response
  const hasMorePages = hasMore || (counts.total > page * PAGE_SIZE);

  const maxReadings = useMemo(() => {
    if (meters.length === 0) return 0;
    return Math.max(...meters.map((m) => m.reading_count || 0));
  }, [meters]);

  return (
    <div className="relative h-full flex flex-col bg-muted">
      {/* Toolbar */}
      <div className="bg-card border-b border-border px-4 py-3 shrink-0 space-y-3">
        {networkFilter && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-md text-xs w-fit">
            <span className="font-medium text-primary">
              {networkFilter.type === "all" ? "All Meters (Source)" :
               networkFilter.type === "orphans" ? "Unassigned Meters (Orphans)" :
               `DMA: ${(dmas || []).find((d) => d.id === networkFilter.dmaId)?.name || ""}`}
            </span>
            <button onClick={onClearNetworkFilter} className="text-muted-foreground hover:text-foreground ml-1">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-semibold text-foreground">Meter Data</h2>
            <Badge variant="secondary" className="text-xs">
              {countsLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                `${activeFilterCount.toLocaleString()} meters`
              )}
            </Badge>
          </div>
          <div className="flex-1" />
          <Button
            onClick={() => setShowAnomalyExport(true)}
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={!hasMeters}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> {t('meterData.exportAnomalies')}
          </Button>
          <Button
            onClick={onStartInteractiveEstimation}
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={locked || !hasMeters}
          >
            <MousePointerClick className="w-3.5 h-3.5" /> Complete missing GIS
          </Button>
          <Button
            onClick={() => setShowMobileLocator(true)}
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={!hasMeters || counts.unlocatedCount === 0}
            title={counts.unlocatedCount === 0 ? "No meters with missing GIS coordinates" : `${counts.unlocatedCount} meters need location`}
          >
            <Smartphone className="w-3.5 h-3.5" /> Mobile Locator
          </Button>
          <Button
            onClick={deleteMode ? exitDeleteMode : enterDeleteMode}
            variant={deleteMode ? "destructive" : "outline"}
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={locked || !hasMeters}
          >
            <Trash2 className="w-3.5 h-3.5" /> {deleteMode ? "Cancel" : "Select Meters"}
          </Button>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { key: "all", label: "All", count: counts.total },
              { key: "main", label: "Main", count: counts.main },
              { key: "main_ins", label: "Mains (Ins)", count: counts.mainIns },
              { key: "sub", label: "Sub", count: counts.sub },
            ].map((f) => (
              <Button
                key={f.key}
                variant={filter === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => handleFilterChange(f.key)}
                className="h-7 text-xs gap-1.5"
              >
                {f.label}
                <span className={`text-[10px] ${filter === f.key ? "text-blue-100" : "text-muted-foreground/70"}`}>
                  {countsLoading ? "…" : f.count.toLocaleString()}
                </span>
              </Button>
            ))}
          </div>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by UID, Meter ID, Account ID, endpoint, name, address, provider…"
            className="pl-9 h-9"
          />
          {search !== debouncedSearch && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 animate-spin" />
          )}
        </div>
      </div>

      {/* Pagination bar (top) */}
      {hasMeters && (
        <div className="border-b border-border bg-card px-4 py-2 flex items-center justify-between shrink-0 relative z-50">
          <span className="text-xs text-muted-foreground">
            {t('meterData.page', { page, count: meters.length, more: hasMorePages ? t('meterData.moreAvailable') : "" })}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              className="inline-flex items-center justify-center h-7 w-7 p-0 rounded-md border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50"
              type="button"
              disabled={page === 1 || loading}
              onClick={() => {
                const np = Math.max(1, page - 1);
                setPage(np);
                loadPage(np);
              }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <span className="text-xs font-medium text-muted-foreground min-w-[24px] text-center">{page}</span>
            <button
              className="inline-flex items-center justify-center h-7 w-7 p-0 rounded-md border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50"
              type="button"
              disabled={!hasMorePages || loading}
              onClick={() => {
                const np = page + 1;
                setPage(np);
                loadPage(np);
              }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div ref={tableRef} className="flex-1 overflow-auto">
        {loading && !hasInitiallyLoaded ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-muted-foreground/50 animate-spin" />
          </div>
        ) : meters.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground/70">
            <Inbox className="w-12 h-12 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">
              {!hasMeters ? "No meters imported yet" : "No meters match your filters"}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {!hasMeters ? "Upload meter data via the Upload Layer button" : "Try adjusting your search or filters"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr className="text-start text-xs text-muted-foreground uppercase tracking-wide">
                {[
                  { key: "uid", label: t('meterData.colUid') },
                  { key: null, label: t('meterData.colMeterId') },
                  { key: null, label: t('meterData.colAccountId') },
                  { key: null, label: t('meterData.colEndpointId') },
                  { key: "type", label: t('meterData.colType') },
                  { key: "payer_name", label: t('meterData.colAccountName') },
                  { key: "address", label: t('meterData.colAddress') },
                  { key: null, label: t('meterData.colProvider') },
                  { key: null, label: t('meterData.colDiameter') },
                  { key: "status", label: t('meterData.colStatus') },
                  { key: null, label: t('meterData.colDma') },
                  { key: null, label: t('meterData.colLocation') },
                  { key: null, label: "" },
                ].map((col, i) => (
                  <th key={i} className="px-4 py-2.5 font-semibold">
                    {i === 0 && deleteMode && (
                      <Checkbox
                        checked={meters.length > 0 && selectedIds.size === meters.length}
                        onCheckedChange={toggleSelectAll}
                        className="mr-2"
                      />
                    )}
                    {col.key ? (
                      <button
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-foreground/90"
                      >
                        {col.label}
                        {sortKey === col.key && (
                          sortDir === "asc"
                            ? <ChevronUp className="w-3 h-3" />
                            : <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRows.map((row) => {
                const m = row.meter;
                const hasLocation = m.latitude != null && m.longitude != null;
                return (
                  <tr key={row.key} className={`hover:bg-muted transition-colors ${row.asSubMeter ? "bg-muted/30" : ""}`}>
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">
                      <div className="flex items-center gap-2">
                        {deleteMode && !row.asSubMeter && (
                          <Checkbox
                            checked={selectedIds.has(m.id)}
                            onCheckedChange={() => toggleSelect(m.id)}
                          />
                        )}
                        <button
                          onClick={() => !deleteMode && setSelectedMeter(m)}
                          className={`flex items-center gap-1.5 ${deleteMode ? "text-muted-foreground cursor-default" : "text-primary hover:underline"}`}
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          {m.uid}
                        </button>
                        {(m.reading_count === 0 || (maxReadings > 0 && (m.reading_count || 0) < maxReadings * 0.5)) && (
                          <span
                            title={
                              (m.reading_count || 0) === 0
                                ? t('meterData.noConsumptionData')
                                : t('meterData.limitedConsumptionData', { count: m.reading_count || 0 })
                            }
                            className="shrink-0"
                          >
                            <AlertTriangle className={`w-3.5 h-3.5 ${(m.reading_count || 0) === 0 ? "text-red-500" : "text-amber-500"}`} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{meterIdOf(m) || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{accountIdOf(m) || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{m.endpoint_id || "—"}</td>
                    <td className="px-4 py-2.5">
                      {(() => {
                        if (row.asSubMeter) {
                          // Same physical meter shown a second time because it is
                          // metered as a consumer of another DMA. Marked so it is
                          // never mistaken for an extra meter — it is not counted.
                          return (
                            <span className="inline-flex items-center gap-1">
                              <Badge variant="secondary" className="text-[10px]">{t('meterData.sub')}</Badge>
                              <span title={t('meterData.duplicateRowHint')}>
                                <Copy className="w-3 h-3 text-amber-500" />
                              </span>
                            </span>
                          );
                        }
                        const isIns = insertionLayerIds.includes(m.layer_id);
                        if (isIns) {
                          return <Badge variant="default" className="text-[10px] bg-blue-600 hover:bg-blue-700">Mains (Ins)</Badge>;
                        }
                        return (
                          <Badge variant={m.is_main ? "default" : "secondary"} className="text-[10px]">
                            {m.is_main ? t('meterData.main') : t('meterData.sub')}
                          </Badge>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2.5 text-foreground/90 max-w-[180px] truncate">{m.payer_name || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate">{m.address || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-[140px] truncate">{m.provider || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{m.diameter != null ? `${m.diameter} mm` : "—"}</td>
                    <td className="px-4 py-2.5">
                      {m.is_active == null ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground/70">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          N/A
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${m.is_active ? "text-emerald-600" : "text-muted-foreground/70"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${m.is_active ? "bg-emerald-500" : "bg-slate-300"}`} />
                          {m.is_active ? t('meterData.active') : t('meterData.inactive')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.dmaNames.length > 0 ? (
                        // A main serving several DMAs stays one row, listing them
                        // all here, rather than appearing once per DMA.
                        <span className="inline-flex flex-wrap items-center gap-1">
                          {row.dmaNames.map((name) => (
                            <Badge key={name} variant="outline" className="text-[10px] gap-1">
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: (dmas || []).find((d) => d.name === name)?.color || "#64748b" }}
                              />
                              {name}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 text-xs font-mono whitespace-nowrap ${hasLocation ? "text-muted-foreground" : "text-red-600 font-semibold"}`}>
                      {hasLocation ? (
                        <span className="flex items-center gap-1">
                          {m.latitude.toFixed(5)}, {m.longitude.toFixed(5)}
                          {m.altitude != null && (
                            <span className="text-muted-foreground/70" title="Altitude (m)">
                              · {m.altitude.toFixed(1)}m
                            </span>
                          )}
                          {m.location_source && (
                            <span
                              title={t('meterData.locationCalculated', { source: m.location_source })}
                              className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-purple-100 text-purple-600 shrink-0"
                            >
                              <Sparkles className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </span>
                      ) : (
                        t('meterData.noLocation')
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => onViewOnMap?.(m)}
                        disabled={!hasLocation}
                        className={`inline-flex items-center text-xs mr-1 ${!hasLocation ? "text-muted-foreground/50 cursor-not-allowed" : "text-emerald-600 hover:text-emerald-800"}`}
                        title={hasLocation ? t('meterData.viewOnMap') : t('meterData.noLocation')}
                      >
                        <MapPin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditMeter(m)}
                        disabled={locked}
                        className={`inline-flex items-center text-xs ${locked ? "text-muted-foreground/50 cursor-not-allowed" : "text-blue-600 hover:text-blue-800 hover:underline"}`}
                        title={t('meterData.editMeter')}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <MeterConsumptionDialog
        open={!!selectedMeter}
        onOpenChange={(o) => !o && setSelectedMeter(null)}
        meter={selectedMeter}
        project={project}
        onViewReadings={() => setConsumptionTableMeter(selectedMeter)}
      />
      <MeterConsumptionTableDialog
        open={!!consumptionTableMeter}
        onOpenChange={(o) => !o && setConsumptionTableMeter(null)}
        meter={consumptionTableMeter}
        project={project}
      />
      <MeterEditDialog
        open={!!editMeter}
        onOpenChange={(o) => !o && setEditMeter(null)}
        meter={editMeter}
        dmas={dmas}
        projectId={projectId}
        project={project}
        onSaved={handleMeterSaved}
        onPinpoint={onPinpoint}
      />
      <DeleteMetersDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        count={selectedIds.size}
        linkedDmaNames={(dmas || []).filter((d) => selectedIds.has(d.main_meter_id)).map((d) => d.name)}
        onConfirm={handleConfirmDelete}
      />
      <CreateLayerFromMetersDialog
        open={showCreateLayer}
        onOpenChange={setShowCreateLayer}
        projectId={projectId}
        selectedIds={[...selectedIds]}
        layers={layers}
        onCreated={() => {
          exitDeleteMode();
          loadPage(page);
          loadCounts();
          onMetersUpdated?.();
        }}
      />
      <MobileLocatorDialog
        open={showMobileLocator}
        onOpenChange={setShowMobileLocator}
        projectId={projectId}
        projectName={project?.name}
      />
      <ExportAnomaliesDialog
        open={showAnomalyExport}
        onOpenChange={setShowAnomalyExport}
        projectId={projectId}
        projectName={project?.name}
        onAnomalyExported={onAnomalyExported}
      />

      {/* Delete mode selection bar */}
      {deleteMode && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-3 bg-slate-900 text-white rounded-lg shadow-xl px-5 py-3 max-w-[calc(100%-2rem)]">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            <span className="text-sm font-medium whitespace-nowrap">
              {t('meterData.selected', { selected: selectedIds.size, total: meters.length })}
            </span>
          </div>
          <div className="w-px h-5 bg-slate-600 hidden sm:block" />
          <button
            onClick={toggleSelectAll}
            className="text-xs text-muted-foreground/50 hover:text-white underline whitespace-nowrap"
          >
            {selectedIds.size === meters.length && meters.length > 0 ? t('meterData.deselectAll') : t('meterData.selectAll')}
          </button>
          <div className="w-px h-5 bg-slate-600" />
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" /> {t('meterData.deleteSelected')}
          </button>
          <button
            onClick={() => setShowCreateLayer(true)}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5" /> {t('meterData.createLayer')}
          </button>
          <button
            onClick={exitDeleteMode}
            className="flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-white whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" /> {t('meterData.exit')}
          </button>
        </div>
      )}

      {deleting && (
        <div className="absolute inset-0 bg-card/60 flex items-center justify-center z-30">
          <Loader2 className="w-8 h-8 text-muted-foreground/70 animate-spin" />
        </div>
      )}
    </div>
  );
}