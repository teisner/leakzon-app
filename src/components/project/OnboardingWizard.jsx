import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Check, FileUp, Database, BarChart3, Crosshair, Hexagon, Network, Download, ArrowRight, X, HelpCircle, GripVertical, Minus, AlertTriangle, Upload, Search, GitBranch, Rocket, Waypoints, ShieldCheck } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useLanguage } from "@/lib/i18n";
import LeakzonExportDialog from "./LeakzonExportDialog";

const WIZARD_SECTIONS = [
  { id: "import", titleKey: "wizard.section.import", Icon: Upload },
  { id: "analyze", titleKey: "wizard.section.analyze", Icon: Search },
  { id: "design", titleKey: "wizard.section.design", Icon: GitBranch },
  { id: "migration", titleKey: "wizard.section.migration", Icon: Rocket },
];

const WIZARD_STEPS = [
  // First, because every other layer is clipped to it. Normally already done —
  // the boundary is looked up from the city at project creation — but where no
  // official outline exists this is where it gets drawn.
  { activity_type: "boundary_set", section: "import", titleKey: "wizard.stepBoundary", descKey: "wizard.stepBoundaryDesc", helpKey: "wizard.stepBoundaryHelp", view: "gis", action: "drawBoundary", Icon: ShieldCheck },
  { activity_type: "gis_layers_uploaded", section: "import", titleKey: "wizard.step1", descKey: "wizard.step1Desc", helpKey: "wizard.step1Help", view: "import", Icon: FileUp },
  { activity_type: "meters_imported", section: "import", titleKey: "wizard.step2", descKey: "wizard.step2Desc", helpKey: "wizard.step2Help", view: "import", Icon: Database },
  { activity_type: "consumption_imported", section: "import", titleKey: "wizard.step3", descKey: "wizard.step3Desc", helpKey: "wizard.step3Help", view: "import", Icon: BarChart3 },
  { activity_type: "gis_completed", section: "analyze", titleKey: "wizard.step4", descKey: "wizard.step4Desc", helpKey: "wizard.step4Help", view: "data", Icon: Crosshair },
  { activity_type: "anomalies_exported", section: "analyze", titleKey: "wizard.exportAnomalies", descKey: "wizard.exportAnomaliesDesc", helpKey: "wizard.exportAnomaliesHelp", view: "data", Icon: AlertTriangle },
  { activity_type: "dmas_created", section: "design", titleKey: "wizard.step5", descKey: "wizard.step5Desc", helpKey: "wizard.step5Help", view: "gis", panelTab: "dmas", Icon: Hexagon },
  { activity_type: "isolated_points_marked", section: "design", titleKey: "wizard.stepIsolationPoints", descKey: "wizard.stepIsolationPointsDesc", helpKey: "wizard.stepIsolationPointsHelp", view: "gis", panelTab: "dmas", Icon: Waypoints },
  { activity_type: "network_designed", section: "design", titleKey: "wizard.step6", descKey: "wizard.step6Desc", helpKey: "wizard.step6Help", view: "network", Icon: Network },
  { activity_type: "data_exported", section: "migration", titleKey: "wizard.step7", descKey: "wizard.step7Desc", helpKey: "wizard.step7Help", view: "import", Icon: Download },
];

function getCurrentUserId() {
  try {
    const saved = localStorage.getItem("loggedInUser");
    if (saved) return JSON.parse(saved).id || null;
  } catch {}
  return null;
}

export default function OnboardingWizard({ open, onOpenChange, projectId, onChange, onImportData, onDrawBoundary, hasBoundary }) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState({ x: 24, y: 80 });
  const [showLeakzonExport, setShowLeakzonExport] = useState(false);
  const [project, setProject] = useState(null);
  const dragRef = useRef(null);
  const dragState = useRef(null);

  const loadProgress = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const [{ data: list }, { data: proj }] = await Promise.all([
      supabase.from('project_progress').select('*').eq('project_id', projectId),
      supabase.from('project').select('*').eq('id', projectId).single(),
    ]);
    setEntries(list || []);
    setProject(proj || null);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (open) loadProgress();
  }, [open, loadProgress]);

  useEffect(() => {
    if (!open) return;
    const handleMove = (e) => {
      if (!dragState.current) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const newX = clientX - dragState.current.offsetX;
      const newY = clientY - dragState.current.offsetY;
      const maxX = window.innerWidth - 100;
      const maxY = window.innerHeight - 60;
      setPos({ x: Math.max(0, Math.min(newX, maxX)), y: Math.max(0, Math.min(newY, maxY)) });
    };
    const handleUp = () => { dragState.current = null; };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [open]);

  const handleDragStart = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragState.current = { offsetX: clientX - pos.x, offsetY: clientY - pos.y };
  };

  // Map activity_type → earliest entry (with timestamp)
  const doneMap = new Map();
  for (const e of entries) {
    if (!e.activity_type) continue;
    if (!doneMap.has(e.activity_type)) doneMap.set(e.activity_type, e);
  }

  // The boundary step is done when the boundary exists, whether or not a
  // progress row was ever written for it — a project can be given a boundary by
  // import, or predate the milestone.
  const isDone = (step) => doneMap.has(step.activity_type)
    || (step.activity_type === "boundary_set" && hasBoundary);

  const completedCount = WIZARD_STEPS.filter(isDone).length;
  const pct = Math.round((completedCount / WIZARD_STEPS.length) * 100);

  const handleMarkDone = async (step) => {
    await supabase.from('project_progress').insert({
      project_id: projectId,
      activity_type: step.activity_type,
      title: t(step.titleKey),
      user_id: getCurrentUserId(),
    });
    loadProgress();
  };

  const handleUnmarkDone = async (step) => {
    await supabase
      .from('project_progress')
      .delete()
      .eq('project_id', projectId)
      .eq('activity_type', step.activity_type);
    loadProgress();
  };

  const handleGoTo = (step) => {
    if (step.activity_type === "data_exported") {
      setShowLeakzonExport(true);
      return;
    }
    onOpenChange(false);
    if (step.action === "drawBoundary") {
      onDrawBoundary?.();
      return;
    }
    if (step.view === "import") {
      onImportData?.();
    } else {
      onChange?.(step.view, step.panelTab);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return "";
    }
  };

  if (!open) return null;

  return (
    <div
      ref={dragRef}
      className="fixed z-[9999] bg-card border-2 border-primary rounded-xl shadow-2xl flex flex-col"
      style={{ left: pos.x, top: pos.y, width: collapsed ? 260 : 380, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 100px)" }}
    >
      {/* Header — draggable */}
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className="flex items-center gap-2 px-3 py-2.5 border-b border-border cursor-grab active:cursor-grabbing select-none"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-foreground truncate">{t("wizard.title")}</p>
          {!collapsed && <p className="text-[11px] text-muted-foreground truncate">{t("wizard.subtitle")}</p>}
        </div>
        <span className="text-xs font-bold text-primary shrink-0">{pct}%</span>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ArrowRight className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => onOpenChange(false)}
          className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title={t("wizard.close")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div className="overflow-y-auto p-3 space-y-3">
          {/* Progress stepper */}
          <div className="flex items-center">
            {WIZARD_STEPS.map((step, idx) => {
              const done = isDone(step);
              return (
                <React.Fragment key={step.activity_type}>
                  <div
                    className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 text-[10px] font-bold transition-colors ${
                      done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"
                    }`}
                    title={t(step.titleKey)}
                  >
                    {done ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  {idx < WIZARD_STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-0.5 rounded-full transition-colors ${done ? "bg-primary" : "bg-muted"}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Sectioned step list */}
          <div className="space-y-3">
            {WIZARD_SECTIONS.map((section) => {
              const sectionSteps = WIZARD_STEPS.filter((s) => s.section === section.id);
              if (!sectionSteps.length) return null;
              return (
                <div key={section.id}>
                  <div className="flex items-center gap-1.5 px-1 mb-1.5">
                    <section.Icon className="w-3 h-3 shrink-0" style={{ color: "#3fbee5" }} />
                    <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#3fbee5" }}>{t(section.titleKey)}</p>
                  </div>
                  <div className="space-y-1.5">
                    {sectionSteps.map((step) => {
                      const done = isDone(step);
                      const entry = doneMap.get(step.activity_type);
                      return (
                        <div
                          key={step.activity_type}
                          className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors ${
                            done ? "border-primary/30 bg-primary/5" : "border-border bg-card"
                          }`}
                        >
                          <div
                            className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${
                              done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {done ? <Check className="w-3.5 h-3.5" /> : <step.Icon className="w-3.5 h-3.5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-xs font-semibold text-foreground truncate">{t(step.titleKey)}</p>
                              <button
                                onClick={() => setHelpOpen((prev) => (prev === step.activity_type ? null : step.activity_type))}
                                className={`shrink-0 p-0.5 rounded-full transition-colors ${helpOpen === step.activity_type ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                                title={t("wizard.moreInfo")}
                              >
                                <HelpCircle className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">{t(step.descKey)}</p>
                            {done && entry?.created_at && (
                              <p className="text-[10px] text-primary mt-0.5">✓ {formatDate(entry.created_at)}</p>
                            )}
                            {helpOpen === step.activity_type && (
                              <div className="mt-1 p-1.5 rounded-md bg-muted/60 border border-border text-[10px] leading-relaxed text-muted-foreground">
                                {t(step.helpKey)}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => handleGoTo(step)}>
                              {t("wizard.go")}
                            </Button>
                            {!done && (
                              <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => handleMarkDone(step)}>
                                <Check className="w-3 h-3" />
                              </Button>
                            )}
                            {done && (
                              <button
                                onClick={() => handleUnmarkDone(step)}
                                className="shrink-0 p-1 rounded text-primary hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title={t("wizard.unmark")}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <LeakzonExportDialog
        open={showLeakzonExport}
        onOpenChange={setShowLeakzonExport}
        project={project}
        onExported={loadProgress}
      />
    </div>
  );
}