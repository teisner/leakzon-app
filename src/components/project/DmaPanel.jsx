import React, { useState } from "react";
import { Eye, EyeOff, Trash2, Hexagon, BarChart3, PenTool, MapPinOff, Pencil, Focus, Link2, GitCompare, Shield, Filter, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, RefreshCw, MapPin } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { pointInPolygon, formatPolygonArea } from "@/lib/polygonUtils";
import DmaConsumptionDialog from "./DmaConsumptionDialog";
import DmaMasterChart from "./DmaMasterChart";
import IsolatedPointsList from "./IsolatedPointsList";
import InsertionMetersList from "./InsertionMetersList";
import { useLanguage } from "@/lib/i18n";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

// Dma.polygon (JSON string) is now polygon_json (jsonb) — accept either
// shape defensively until the loader (ProjectDetail.jsx) is fully migrated.
const parsePolygon = (dma) => {
  try {
    const raw = dma.polygon_json ?? dma.polygon;
    const poly = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(poly) && poly.length >= 3 ? poly : null;
  } catch {
    return null;
  }
};

export default function DmaPanel({ dmas, meters, layers, onChanged, onStartDraw, onEditDma, project, focusedDmaIds, onToggleFocusDma, locked, highlightUnassigned, onToggleHighlightUnassigned, isolatedMode, onToggleIsolatedMode, isolatedPoints, onDeleteIsolatedPoint, onZoomToIsolated, isolationViewMode, onToggleIsolationView, onZoomToInsertionMeter }) {
  const { t } = useLanguage();
  const [chartDma, setChartDma] = useState(null);
  const [showMasterChart, setShowMasterChart] = useState(false);
  const [dmasExpanded, setDmasExpanded] = useState(true);
  const [isolatedExpanded, setIsolatedExpanded] = useState(true);
  const [insertionExpanded, setInsertionExpanded] = useState(true);
  const [dmaToDelete, setDmaToDelete] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [refreshingAddr, setRefreshingAddr] = useState(false);

  const handleRefreshAddresses = () => {
    setRefreshingAddr(true);
    setRefreshTrigger((v) => v + 1);
    setTimeout(() => setRefreshingAddr(false), 4000);
  };
  const allExpanded = dmasExpanded && isolatedExpanded && insertionExpanded;
  const toggleAll = () => {
    const val = !allExpanded;
    setDmasExpanded(val);
    setIsolatedExpanded(val);
    setInsertionExpanded(val);
  };

  const handleToggleVisible = async (dma) => {
    await supabase.from('dma').update({ visible: !dma.visible }).eq('id', dma.id);
    onChanged?.();
  };

  const handleDelete = (dma) => {
    setDmaToDelete(dma);
  };

  const confirmDelete = async () => {
    if (!dmaToDelete) return;
    await supabase.from('dma').delete().eq('id', dmaToDelete.id);
    setDmaToDelete(null);
    onChanged?.();
  };

  const hasMeters = (meters || []).length > 0;

  // Insertion meters: all main meters, regardless of layer category
  const insertionMeters = (meters || []).filter((m) => m.is_main);

  // Unassigned sub-meters: those not inside any DMA polygon
  const dmaPolygons = (dmas || []).map(parsePolygon).filter(Boolean);
  const subMeters = (meters || []).filter((m) => !m.is_main);
  const assignedCount = subMeters.filter(
    (m) =>
      m.latitude != null &&
      m.longitude != null &&
      dmaPolygons.some((poly) => pointInPolygon(m.latitude, m.longitude, poly))
  ).length;
  const unassignedCount = subMeters.length - assignedCount;

  const getLinkedMainMeter = (dma) => {
    if (!dma.main_meter_id) return null;
    return (meters || []).find((m) => m.id === dma.main_meter_id);
  };

  const focusedSet = new Set(focusedDmaIds || []);

  return (
    <div className="space-y-3">
      {/* Draw DMA button */}
      <button
        onClick={onStartDraw}
        disabled={!hasMeters || locked}
        className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          !hasMeters || locked
            ? "text-muted-foreground/70 bg-slate-200 cursor-not-allowed"
            : "text-white bg-blue-600 hover:bg-blue-700"
        }`}
      >
        <PenTool className="w-4 h-4" /> {t('dma.draw')}
      </button>
      {!hasMeters && (
        <p className="text-xs text-amber-600 text-center -mt-1">
          {t('dma.uploadFirst')}
        </p>
      )}

      {/* Isolated points + Isolation DMA View — grouped container */}
      <div className={`rounded-xl border-2 p-2 space-y-2 transition-colors ${
        isolatedMode || isolationViewMode
          ? "border-primary/50 bg-primary/5"
          : "border-border"
      }`}>
        <button
          onClick={() => onToggleIsolatedMode?.()}
          disabled={(dmas || []).length < 2 || locked}
          className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors border ${
            isolatedMode
              ? "bg-slate-800 border-slate-600 ring-2 ring-slate-500"
              : "bg-slate-50 border-slate-200 hover:bg-slate-100/60 dark:bg-slate-900/50 dark:border-slate-700"
          } ${(dmas || []).length < 2 || locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          title={(dmas || []).length < 2 ? t('dma.isolatedPointsRequireTwo') : t('dma.markIsolatedPoints')}
        >
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isolatedMode ? "bg-slate-700" : "bg-slate-100 dark:bg-slate-800"}`}>
            <Shield className={`w-5 h-5 ${isolatedMode ? "text-amber-400" : "text-slate-500 dark:text-slate-400"}`} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">{t('dma.isolatedPoints')}</p>
            <p className="text-[11px] text-muted-foreground">{(dmas || []).length < 2 ? t('dma.isolatedPointsRequireTwo') : t('dma.isolatedPointsHint')}</p>
          </div>
          {isolatedMode && (
            <span className="text-[10px] font-medium text-amber-400 bg-slate-700 px-2 py-0.5 rounded-full shrink-0">
              {t('dma.highlighting')}
            </span>
          )}
        </button>

        {/* Isolation DMA View — compact sub-toggle beneath Isolated Points */}
        <button
          onClick={() => onToggleIsolationView?.()}
          disabled={locked}
          className={`w-full text-left rounded-lg py-1.5 px-2.5 flex items-center gap-2 transition-colors border ${
            isolationViewMode
              ? "bg-primary/10 border-primary/40"
              : "bg-muted/30 border-border/60 hover:bg-muted/60"
          } ${locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          title="Display only water lines, valves, and main meters"
        >
          <Filter className={`w-3.5 h-3.5 shrink-0 ${isolationViewMode ? "text-primary" : "text-muted-foreground"}`} />
          <span className={`text-xs font-medium ${isolationViewMode ? "text-primary" : "text-muted-foreground"}`}>Isolation DMA View</span>
          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${isolationViewMode ? "text-primary bg-primary/15" : "text-muted-foreground/60 bg-muted"}`}>
            {isolationViewMode ? "ON" : "OFF"}
          </span>
        </button>
      </div>

      {/* DMA list or empty state */}
      {dmas && dmas.length > 0 ? (
        <>
          {/* Combined stats cube — DMA count, assigned & unassigned meters */}
          <div className="rounded-xl p-3 border" style={{ borderColor: "#92c141" }}>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <p className="text-2xl font-bold" style={{ color: "#92c141" }}>{dmas.length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t('dma.dmas')}</p>
              </div>
              <div className="border-x border-border">
                <p className="text-2xl font-bold" style={{ color: "#92c141" }}>{assignedCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t('dma.assigned')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: "#92c141" }}>{unassignedCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t('dma.unassigned')}</p>
              </div>
            </div>
            {unassignedCount > 0 && (
              <button
                onClick={() => onToggleHighlightUnassigned?.()}
                className={`w-full mt-2 pt-2 border-t border-border text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  highlightUnassigned ? "text-amber-600" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MapPinOff className="w-3.5 h-3.5" />
                {highlightUnassigned ? t('dma.stopHighlight') : t('dma.highlightUnassigned')}
              </button>
            )}
          </div>

          <button
            onClick={() => setShowMasterChart(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 transition-colors"
          >
            <GitCompare className="w-4 h-4" /> {t('dma.compareDmas')}
          </button>

          {focusedSet.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-blue-700 font-medium">{t('dma.focused', { count: focusedSet.size })}</span>
              <button
                onClick={() => onToggleFocusDma?.(null, true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
              >
                {t('dma.clearFocus')}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setDmasExpanded((v) => !v)}
              className="flex items-center gap-2 text-left group"
            >
              {dmasExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
              )}
              <Hexagon className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">DMA List</p>
              <span className="text-xs text-muted-foreground">({dmas.length})</span>
            </button>
            <button
              onClick={toggleAll}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
              title={allExpanded ? "Collapse all" : "Expand all"}
            >
              {allExpanded ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
              {allExpanded ? "Collapse all" : "Expand all"}
            </button>
          </div>
          {dmasExpanded && (
          <div className="space-y-2">
            {dmas.map((dma) => {
              const isFocused = focusedSet.has(dma.id);
              const linkedMain = getLinkedMainMeter(dma);
              const poly = parsePolygon(dma);
              const areaLabel = poly ? formatPolygonArea(poly, project?.distance_unit) : null;
              return (
                <div
                  key={dma.id}
                  className={`flex flex-col p-3 bg-card border rounded-lg transition-colors ${
                    isFocused ? "border-blue-400 bg-blue-50/50" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-5 h-5 rounded shrink-0 border border-border"
                      style={{
                        backgroundColor: dma.color,
                        opacity: dma.visible ? dma.transparency ?? 0.5 : 0.3,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-foreground truncate">
                        {dma.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-4 mt-1.5 mb-2">
                    <div>
                      <span className="text-2xl font-bold text-foreground">{dma.meter_count || 0}</span>
                      <span className="text-sm text-muted-foreground ml-1.5">{t('dma.subMeters')}</span>
                    </div>
                    {areaLabel && (
                      <div>
                        <span className="text-2xl font-bold text-foreground">{areaLabel.split(" ")[0]}</span>
                        <span className="text-sm text-muted-foreground ml-1.5">{areaLabel.split(" ").slice(1).join(" ")}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 pt-2 border-t border-border">
                    <button
                      onClick={() => onToggleFocusDma?.(dma.id)}
                      className={`p-1.5 rounded transition-colors ${
                        isFocused
                          ? "bg-blue-500 text-white hover:bg-blue-600"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                      title={isFocused ? t('dma.unfocusDma') : t('dma.focusDma')}
                    >
                      <Focus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onEditDma?.(dma)}
                      disabled={locked}
                      className={`p-1.5 rounded ${locked ? "text-muted-foreground/40 cursor-not-allowed" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
                      title={t('dma.editShape')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setChartDma(dma)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title={t('dma.consumptionChart')}
                    >
                      <BarChart3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleVisible(dma)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                      title={dma.visible ? t('dma.hide') : t('dma.show')}
                    >
                      {dma.visible ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(dma)}
                      disabled={locked}
                      className={`p-1.5 rounded ${locked ? "text-muted-foreground/40 cursor-not-allowed" : "hover:bg-destructive/10 text-muted-foreground hover:text-destructive"}`}
                      title={t('dma.deleteDma')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>


                    {linkedMain && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto truncate">
                        <Link2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">{t('dma.mainLabel', { uid: linkedMain.uid })}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </>
      ) : (
        <div className="text-center py-6">
          <Hexagon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground/70">{t('dma.noDmas')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {t('dma.clickDraw')}
          </p>
        </div>
      )}

      <IsolatedPointsList
        isolatedPoints={isolatedPoints}
        dmas={dmas}
        onDeleteIsolatedPoint={onDeleteIsolatedPoint}
        onZoomTo={onZoomToIsolated}
        expanded={isolatedExpanded}
        onExpandedChange={setIsolatedExpanded}
        refreshTrigger={refreshTrigger}
      />

      <InsertionMetersList
        insertionMeters={insertionMeters}
        dmas={dmas}
        onZoomTo={onZoomToInsertionMeter}
        expanded={insertionExpanded}
        onExpandedChange={setInsertionExpanded}
        refreshTrigger={refreshTrigger}
      />

      {(insertionMeters.length > 0 || (isolatedPoints?.length || 0) > 0) && (
        <button
          onClick={handleRefreshAddresses}
          disabled={refreshingAddr || locked}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors disabled:opacity-50"
        >
          {refreshingAddr ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <MapPin className="w-4 h-4" />
          )}
          {refreshingAddr ? "Refreshing addresses…" : "Refresh Addresses"}
        </button>
      )}

      <DmaConsumptionDialog
        open={!!chartDma}
        onOpenChange={(v) => { if (!v) setChartDma(null); }}
        dma={chartDma}
        project={project}
      />
      <DmaMasterChart
        open={showMasterChart}
        onOpenChange={setShowMasterChart}
        dmas={dmas}
        project={project}
      />

      <AlertDialog open={!!dmaToDelete} onOpenChange={(v) => { if (!v) setDmaToDelete(null); }}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dma.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('dma.deleteConfirmDesc', { name: dmaToDelete?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('dma.deleteConfirmCancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('dma.deleteConfirmBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}