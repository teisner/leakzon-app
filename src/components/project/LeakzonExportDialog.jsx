import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Rocket, Loader2, CheckCircle2, ExternalLink, FileArchive } from "lucide-react";
import confetti from "canvas-confetti";
import { invokeFunction } from "@/api/functionsClient";
import { supabase } from "@/api/supabaseClient";
import { useLanguage } from "@/lib/i18n";

// The meter fields offered for the two operator-chosen columns.
const FIELD_OPTIONS = [
  { key: "address", label: "Address" },
  { key: "meter_id", label: "Meter ID" },
  { key: "uid", label: "UID" },
  { key: "account_id", label: "Account ID" },
  { key: "endpoint_id", label: "Endpoint ID" },
  { key: "payer_name", label: "Account Name" },
  { key: "city", label: "City" },
  { key: "provider", label: "Provider" },
];

// First rows of a generated file, exactly as they will be written.
function PreviewTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className="px-3 py-4 text-xs text-muted-foreground">No rows.</p>;
  }
  const columns = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto max-h-56 overflow-y-auto">
      <table className="text-[11px] whitespace-nowrap">
        <thead className="sticky top-0 bg-card">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-2 py-1.5 text-start font-semibold text-foreground border-b border-border">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              {columns.map((c) => (
                <td key={c} className="px-2 py-1 text-muted-foreground">{String(r[c] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

function InsightsPanel({ insights, t }) {
  if (!insights) return null;
  return (
    <div className="w-full rounded-lg border border-border bg-muted/40 p-3 text-start">
      <p className="text-xs font-semibold text-foreground mb-2">{t("leakzonExport.insightsTitle")}</p>
      <dl className="space-y-1 text-xs">
        <Insight label={t("leakzonExport.iDmas")} value={insights.dmasTotal} />
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
        {insights.mainsUnlinked > 0 && (
          <Insight label={t("leakzonExport.iMainsUnlinked")} value={insights.mainsUnlinked} tone="warn" note={t("leakzonExport.iMainsUnlinkedNote")} />
        )}
        {insights.fictitiousMains > 0 && (
          <Insight label={t("leakzonExport.iFictitious")} value={insights.fictitiousMains} tone="warn" note={insights.fictitiousDmaNames.join(", ")} />
        )}
        {insights.noCoords > 0 && (
          <Insight label={t("leakzonExport.iNoCoords")} value={insights.noCoords} tone="warn" />
        )}
      </dl>
    </div>
  );
}

export default function LeakzonExportDialog({ open, onOpenChange, project, onExported }) {
  const { t } = useLanguage();
  // confirm -> analyzing -> review -> exporting -> done -> (portal prompt)
  const [phase, setPhase] = useState("confirm");
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [insights, setInsights] = useState(null);
  const [showPortalPrompt, setShowPortalPrompt] = useState(false);
  // Which meter fields make up the two operator-chosen columns.
  const [identifierFields, setIdentifierFields] = useState(["address", "meter_id"]);
  const [meterNumberField, setMeterNumberField] = useState("meter_id");
  const [preview, setPreview] = useState(null);
  const [previewTab, setPreviewTab] = useState("meter");
  // LeakZon Main doesn't need the DMA shapefile — it reads the areas from the
  // Groups file — so it is off unless the boundaries are wanted elsewhere.
  const [includeDmaShp, setIncludeDmaShp] = useState(false);

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

  // Runs the same meter analysis the export uses, but without building any
  // shapefiles, so the numbers can be reviewed before committing to a download.
  const handleAnalyze = async () => {
    setPhase("analyzing");
    setError("");
    setStats(null);
    setInsights(null);
    try {
      const response = await invokeFunction("exportToLeakZon", {
        project_id: project.id,
        preview_only: true,
        identifier_fields: identifierFields,
        meter_number_field: meterNumberField,
      });
      if (!response.data?.insights) throw new Error("Analysis failed");
      setInsights(response.data.insights);
      setPreview(response.data);
      // Recommend a field that actually holds data — "Meter ID" is empty on
      // any project imported before ID columns were retained.
      const cov = response.data.fieldCoverage || {};
      if (!cov[meterNumberField]) {
        const better = ["meter_id", "uid", "endpoint_id", "account_id"].find((f) => cov[f] > 0);
        if (better) setMeterNumberField(better);
      }
      setPhase("review");
    } catch (e) {
      setError(e.message || "Analysis failed");
      setPhase("error");
    }
  };

  const refreshPreview = async (fields, numberField) => {
    try {
      const res = await invokeFunction("exportToLeakZon", {
        project_id: project.id,
        preview_only: true,
        identifier_fields: fields,
        meter_number_field: numberField,
      });
      if (res.data?.meterData) setPreview(res.data);
    } catch { /* keep the previous preview rather than blanking the screen */ }
  };

  const toggleIdentifierField = (f) => {
    const next = identifierFields.includes(f)
      ? identifierFields.filter((x) => x !== f)
      : [...identifierFields, f];
    setIdentifierFields(next);
    refreshPreview(next, meterNumberField);
  };

  const chooseMeterNumber = (f) => {
    setMeterNumberField(f);
    refreshPreview(identifierFields, f);
  };

  const handleExport = async () => {
    setPhase("exporting");
    setError("");
    try {
      const response = await invokeFunction("exportToLeakZon", {
        project_id: project.id,
        identifier_fields: identifierFields,
        meter_number_field: meterNumberField,
        include_dma_shp: includeDmaShp,
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

      // The portal screen is opened by the user from the insights, not on a timer.
    } catch (e) {
      setError(e.message || "Export failed");
      setPhase("error");
    }
  };

  const handleReset = () => {
    setPhase("confirm");
    setError("");
    setStats(null);
    setInsights(null);
    setShowPortalPrompt(false);
    onOpenChange(false);
  };

  const handleContinueToPortal = () => {
    setShowPortalPrompt(true);
    fireConfetti();
  };

  const handleGoToPortal = () => {
    window.open("https://portal.leakzon.com", "_blank", "noopener,noreferrer");
    handleReset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); }}>
      <DialogContent className={phase === "review" ? "sm:max-w-3xl" : "sm:max-w-md"}>
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

        {phase === "analyzing" && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">{t("leakzonExport.analyzing")}</p>
            <p className="text-xs text-muted-foreground">{t("leakzonExport.analyzingDesc")}</p>
          </div>
        )}

        {phase === "review" && (
          <div className="space-y-3 max-h-[65vh] overflow-y-auto pe-1">
            <p className="text-sm text-muted-foreground">{t("leakzonExport.reviewDesc")}</p>
            <InsightsPanel insights={insights} t={t} />

            {/* Identifier — any combination of fields, joined with commas. */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div>
                <p className="text-xs font-semibold text-foreground">{t("leakzonExport.identifierTitle")}</p>
                <p className="text-[11px] text-muted-foreground">{t("leakzonExport.identifierHint")}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FIELD_OPTIONS.map((f) => {
                  const on = identifierFields.includes(f.key);
                  const count = preview?.fieldCoverage?.[f.key] ?? null;
                  const empty = count === 0;
                  return (
                    <button
                      key={f.key}
                      onClick={() => toggleIdentifierField(f.key)}
                      title={empty ? t("leakzonExport.fieldEmpty") : undefined}
                      className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
                        on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"
                      } ${empty ? "opacity-50" : ""}`}
                    >
                      {f.label}
                      {count !== null && <span className="ms-1 opacity-60">{count}</span>}
                    </button>
                  );
                })}
              </div>
              {identifierFields.length === 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">{t("leakzonExport.identifierEmpty")}</p>
              )}
            </div>

            {/* Meter Number — exactly one field. */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div>
                <p className="text-xs font-semibold text-foreground">{t("leakzonExport.meterNumberTitle")}</p>
                <p className="text-[11px] text-muted-foreground">{t("leakzonExport.meterNumberHint")}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FIELD_OPTIONS.map((f) => {
                  const count = preview?.fieldCoverage?.[f.key] ?? null;
                  const empty = count === 0;
                  return (
                    <button
                      key={f.key}
                      onClick={() => chooseMeterNumber(f.key)}
                      title={empty ? t("leakzonExport.fieldEmpty") : undefined}
                      className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
                        meterNumberField === f.key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"
                      } ${empty ? "opacity-50" : ""}`}
                    >
                      {f.label}
                      {count !== null && <span className="ms-1 opacity-60">{count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Whether the DMA boundaries ship as a shapefile. */}
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDmaShp}
                onChange={(e) => setIncludeDmaShp(e.target.checked)}
                className="mt-0.5 accent-primary w-3.5 h-3.5 shrink-0"
              />
              <span>
                <span className="block text-xs font-semibold text-foreground">{t("leakzonExport.dmaShpTitle")}</span>
                <span className="block text-[11px] text-muted-foreground">{t("leakzonExport.dmaShpHint")}</span>
              </span>
            </label>

            {/* Preview of exactly what each file will contain. */}
            {preview && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5">
                  {[
                    { key: "meter", label: t("leakzonExport.tabMeterData"), n: preview.meterData?.length || 0 },
                    { key: "groups", label: t("leakzonExport.tabGroups"), n: preview.groups?.length || 0 },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setPreviewTab(tab.key)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        previewTab === tab.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {tab.label} <span className="opacity-60">{tab.n}</span>
                    </button>
                  ))}
                  <span className="ms-auto text-[10px] text-muted-foreground">
                    {t("leakzonExport.previewNote")}
                  </span>
                </div>
                <PreviewTable rows={(previewTab === "meter" ? preview.meterData : preview.groups) || []} />
              </div>
            )}
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
            <InsightsPanel insights={insights} t={t} />
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
            <Button onClick={handleAnalyze} className="w-full h-11 text-base font-bold gap-2">
              <Rocket className="w-4 h-4" /> {t("leakzonExport.analyzeBtn")}
            </Button>
          )}
          {phase === "review" && (
            <>
              <Button onClick={handleExport} className="w-full h-11 text-base font-bold gap-2">
                <Rocket className="w-4 h-4" /> {t("leakzonExport.exportBtn")}
              </Button>
              <Button variant="ghost" onClick={handleReset} className="w-full">
                {t("leakzonExport.close")}
              </Button>
            </>
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
            <>
              <Button onClick={handleContinueToPortal} className="w-full h-11 text-base font-bold gap-2">
                <Rocket className="w-4 h-4" /> {t("leakzonExport.continueBtn")}
              </Button>
              <Button variant="ghost" onClick={handleReset} className="w-full">
                {t("leakzonExport.close")}
              </Button>
            </>
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