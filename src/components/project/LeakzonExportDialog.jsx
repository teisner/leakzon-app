import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Rocket, Loader2, CheckCircle2, ExternalLink, FileArchive } from "lucide-react";
import confetti from "canvas-confetti";
import { invokeFunction } from "@/api/functionsClient";
import { supabase } from "@/api/supabaseClient";
import { useLanguage } from "@/lib/i18n";

function Insight({ label, value, tone, note }) {
  const toneClass =
    tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : tone === "ok" ? "text-emerald-600 dark:text-emerald-400"
    : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-medium tabular-nums ${toneClass}`}>
        {value}
        {note && <span className="ms-1.5 font-normal text-muted-foreground">({note})</span>}
      </dd>
    </div>
  );
}

export default function LeakzonExportDialog({ open, onOpenChange, project, onExported }) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState("confirm"); // confirm | exporting | done | error
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [insights, setInsights] = useState(null);
  const [showPortalPrompt, setShowPortalPrompt] = useState(false);

  const fireConfetti = () => {
    const colors = ["#92c141", "#3fbee5", "#f59e0b", "#ffffff"];
    const burst = (particleRatio, opts) =>
      confetti({
        origin: { y: 0.6 },
        colors,
        particleCount: Math.floor(200 * particleRatio),
        ...opts,
      });
    burst(0.25, { spread: 26, startVelocity: 55 });
    burst(0.2, { spread: 60 });
    burst(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
    burst(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    burst(0.1, { spread: 120, startVelocity: 45 });
    // Side cannons
    setTimeout(() => {
      confetti({ particleCount: 80, spread: 70, origin: { x: 0.2, y: 0.5 }, colors });
      confetti({ particleCount: 80, spread: 70, origin: { x: 0.8, y: 0.5 }, colors });
    }, 300);
  };

  const handleExport = async () => {
    setPhase("exporting");
    setError("");
    setStats(null);
    try {
      const response = await invokeFunction("exportToLeakZon", {
        project_id: project.id,
      });
      const base64Zip = response.data?.zip;
      if (!base64Zip) throw new Error("Failed to generate export");

      const bytes = Uint8Array.from(atob(base64Zip), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const zipName = response.data?.zipName || "project_Layers";
      a.download = `${zipName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setStats(response.data?.stats || null);
      setInsights(response.data?.insights || null);
      setPhase("done");
      fireConfetti();

      // Mark the "Export to LeakZon" onboarding step as done
      try {
        const currentUserId = (() => {
          try {
            const saved = localStorage.getItem("loggedInUser");
            return saved ? JSON.parse(saved).id : null;
          } catch {
            return null;
          }
        })();
        await supabase.from('project_progress').insert({
          project_id: project.id,
          activity_type: "data_exported",
          title: t("leakzonExport.title"),
          user_id: currentUserId,
        });
        onExported?.();
      } catch {}

      setTimeout(() => setShowPortalPrompt(true), 1200);
    } catch (e) {
      setError(e.message || "Export failed");
      setPhase("error");
    }
  };

  const handleReset = () => {
    setPhase("confirm");
    setError("");
    setStats(null);
    setShowPortalPrompt(false);
    onOpenChange(false);
  };

  const handleGoToPortal = () => {
    window.open("https://portal.leakzon.com", "_blank", "noopener,noreferrer");
    handleReset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 shrink-0">
              <Rocket className="w-6 h-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg">{t("leakzonExport.title")}</DialogTitle>
              <DialogDescription>{t("leakzonExport.subtitle")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {phase === "confirm" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <FileArchive className="w-4 h-4 text-primary shrink-0" />
                <span>{t("leakzonExport.includesShp")}</span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <FileArchive className="w-4 h-4 text-primary shrink-0" />
                <span>{t("leakzonExport.includesMeters")}</span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <FileArchive className="w-4 h-4 text-primary shrink-0" />
                <span>{t("leakzonExport.includesZip")}</span>
              </div>
            </div>
          </div>
        )}

        {phase === "exporting" && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">{t("leakzonExport.exporting")}</p>
            <p className="text-xs text-muted-foreground">{t("leakzonExport.exportingDesc")}</p>
          </div>
        )}

        {phase === "done" && !showPortalPrompt && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <p className="text-sm font-bold text-foreground">{t("leakzonExport.success")}</p>
            {stats && (
              <p className="text-xs text-muted-foreground">
                {t("leakzonExport.stats", stats)}
              </p>
            )}
            {insights && (
              <div className="w-full mt-2 rounded-lg border border-border bg-muted/40 p-3 text-start">
                <p className="text-xs font-semibold text-foreground mb-2">{t("leakzonExport.insightsTitle")}</p>
                <dl className="space-y-1 text-xs">
                  <Insight label={t("leakzonExport.iAssigned")} value={`${insights.assigned} / ${insights.metersTotal + insights.fictitiousMains}`} />
                  <Insight
                    label={t("leakzonExport.iUnassigned")}
                    value={insights.unassigned}
                    tone={insights.unassigned > 0 ? "warn" : "ok"}
                    note={insights.unassigned > 0 ? t("leakzonExport.iUnassignedNote") : null}
                  />
                  <Insight label={t("leakzonExport.iMainSub")} value={`${insights.mains} / ${insights.subs}`} />
                  <Insight
                    label={t("leakzonExport.iDmasWithMain")}
                    value={`${insights.dmasWithMain} / ${insights.dmasTotal}`}
                    tone={insights.dmasWithMain < insights.dmasTotal ? "warn" : "ok"}
                  />
                  {insights.fictitiousMains > 0 && (
                    <Insight
                      label={t("leakzonExport.iFictitious")}
                      value={insights.fictitiousMains}
                      tone="warn"
                      note={insights.fictitiousDmaNames.join(", ")}
                    />
                  )}
                  {insights.noCoords > 0 && (
                    <Insight label={t("leakzonExport.iNoCoords")} value={insights.noCoords} tone="warn" />
                  )}
                </dl>
              </div>
            )}
          </div>
        )}

        {phase === "done" && showPortalPrompt && (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-4 gap-2">
              <Rocket className="w-10 h-10 text-primary" />
              <p className="text-sm font-bold text-foreground text-center">{t("leakzonExport.portalPrompt")}</p>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <p className="text-sm font-medium text-destructive">{t("leakzonExport.failed")}</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {phase === "confirm" && (
            <Button onClick={handleExport} className="w-full h-11 text-base font-bold gap-2">
              <Rocket className="w-4 h-4" /> {t("leakzonExport.exportBtn")}
            </Button>
          )}
          {phase === "done" && showPortalPrompt && (
            <>
              <Button onClick={handleGoToPortal} className="w-full h-11 text-base font-bold gap-2">
                <ExternalLink className="w-4 h-4" /> {t("leakzonExport.goToPortal")}
              </Button>
              <Button variant="ghost" onClick={handleReset} className="w-full">
                {t("leakzonExport.stayHere")}
              </Button>
            </>
          )}
          {phase === "done" && !showPortalPrompt && (
            <Button variant="ghost" onClick={handleReset} className="w-full">
              {t("leakzonExport.close")}
            </Button>
          )}
          {phase === "error" && (
            <Button variant="ghost" onClick={handleReset} className="w-full">
              {t("leakzonExport.close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}