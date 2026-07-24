import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invokeFunction } from "@/api/functionsClient";
import { supabase } from "@/api/supabaseClient";
import { Search, Gauge, Loader2, Inbox, BarChart3, Sparkles, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, MousePointerClick, Pencil, Trash2, X, Layers, MapPin, Smartphone, AlertTriangle } from "lucide-react";
import { pointInPolygon } from "@/lib/polygonUtils";
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
    return (layers || []).filter((l) => l.category === "Insertion Meters").map((l) => l.id);
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
    const { error } = await supabase.from('meter').delete().in('id', [...selectedIds]);
    if (error) console.error('Delete error:', error);
    setDeleting(false);
    setShowDeleteConfirm(false);
    exitDeleteMode();
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
        poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
      } catch { poly = null; }
      return { id: dma.id, name: dma.name, main_meter_id: dma.main_meter_id, poly };
    });
  }, [dmas]);

  const getMeterDma = useCallback((m) => {
    for (const dma of parsedDmas) {
      if (dma.main_meter_id && dma.main_meter_id === m.id) return dma.name;
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
            placeholder="Search by UID, name, address, provider…"
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
                  { key: "type", label: t('meterData.colType') },
                  { key: "payer_name", label: t('meterData.colAccountName') },
                  { key: "address", label: t('meterData.colAddress') },
                  { key: null, label: t('meterData.colProvider') },
                  { key: null, label: t('meterData.colComm') },
                  { key: null, label: t('meterData.colDiameter') },
                  { key: "status", label: t('meterData.colStatus') },
                  { key: null, label: t('meterData.colDma') },
                  { key: null, label: t('meterData.colLocation') },
                  { key: null, label: t('meterData.colAdditionalIds') },
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
              {meters.map((m) => {
                const hasLocation = m.latitude != null && m.longitude != null;
                return (
                  <tr key={m.id} className="hover:bg-muted transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">
                      <div className="flex items-center gap-2">
                        {deleteMode && (
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
                    <td className="px-4 py-2.5">
                      {(() => {
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
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{m.communication_type || "—"}</td>
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
                      {(() => {
                        const dmaName = getMeterDma(m);
                        return dmaName ? (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: (dmas || []).find(d => d.name === dmaName)?.color || "#64748b" }} />
                            {dmaName}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        );
                      })()}
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
                    <td className="px-4 py-2.5">
                      {m.additional_ids && m.additional_ids.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {m.additional_ids.slice(0, 2).map((id, i) => (
                            <span key={i} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                              {id.label}: {id.value}
                            </span>
                          ))}
                          {m.additional_ids.length > 2 && (
                            <span className="text-[10px] text-muted-foreground/70">+{m.additional_ids.length - 2}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
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