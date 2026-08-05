import React, { useState, useEffect, useCallback } from "react";
import { Settings, Droplets, Ruler, Calendar, Footprints, Check, Lock, Unlock, Shield, Radio, FileSignature, Copy, Download, Trash2, Ban } from "lucide-react";
import { isolationDistanceDisplay, displayToMeters } from "@/lib/isolationDistance";
import { DEFAULT_PROXIMITY_FEET } from "@/lib/dmaProximity";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { invokeFunction } from "@/api/functionsClient";
import { supabase } from "@/api/supabaseClient";
import { useToast } from "@/components/ui/use-toast";

function SegmentedToggle({ value, options, onChange }) {
  return (
    <div className="flex items-center bg-muted rounded-md p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
            value === opt.value
              ? "bg-blue-500 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SettingRow({ icon: Icon, title, description, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-border last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 shrink-0 w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function ProjectSettingsPage({ project, onUpdate, locked, currentUser }) {
  const { toast } = useToast();
  const handleUpdate = (field, value) => {
    onUpdate({ [field]: value });
  };

  // Signature page — a quick test feature, reuses the same customer_view_link
  // token as the rest of the customer-facing surface rather than a link system
  // of its own.
  const [signatureUrl, setSignatureUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  const loadSignatureLink = useCallback(async () => {
    if (!project?.id) return;
    try {
      const res = await invokeFunction("manageCustomerViewLinks", { action: "list", project_id: project.id });
      const active = (res.data?.links || []).find((l) => l.is_valid);
      setSignatureUrl(active ? `${window.location.origin}/customer-signature/${project.id}?token=${active.token}` : null);
    } catch {
      setSignatureUrl(null);
    }
  }, [project?.id]);

  useEffect(() => {
    if (project?.signature_page_enabled) loadSignatureLink();
  }, [project?.signature_page_enabled, loadSignatureLink]);

  const handleCopySignatureUrl = async () => {
    if (!signatureUrl) return;
    await navigator.clipboard.writeText(signatureUrl);
    setCopied(true);
    toast({ title: "Link copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  // Submitted permission PDFs, kept visible regardless of whether the page is
  // currently toggled on — turning it off doesn't erase past authorizations.
  const [submittedSignatures, setSubmittedSignatures] = useState([]);

  const loadSubmittedSignatures = useCallback(async () => {
    if (!project?.id) return;
    const { data } = await supabase
      .from("customer_signature")
      .select("id, provider_name, customer_official_name, signer_name, signer_title, signed_at, pdf_data")
      .eq("project_id", project.id)
      .order("signed_at", { ascending: false });
    setSubmittedSignatures(data || []);
  }, [project?.id]);

  useEffect(() => {
    loadSubmittedSignatures();
  }, [loadSubmittedSignatures]);

  const handleDownloadPdf = (sig) => {
    if (!sig.pdf_data) return;
    const a = document.createElement("a");
    a.href = sig.pdf_data;
    a.download = `meter-data-authorization-${(sig.provider_name || "provider").replace(/\s+/g, "-")}.pdf`;
    a.click();
  };

  const [signatureToDelete, setSignatureToDelete] = useState(null);

  const handleDeleteSignature = async () => {
    if (!signatureToDelete) return;
    const { error } = await supabase.from("customer_signature").delete().eq("id", signatureToDelete.id);
    if (error) {
      toast({ variant: "destructive", title: "Failed to delete", description: error.message });
    } else {
      setSubmittedSignatures((prev) => prev.filter((s) => s.id !== signatureToDelete.id));
      toast({ title: "Authorization deleted" });
    }
    setSignatureToDelete(null);
  };

  // Revoke access: kills the permission page's link (turns the project-level
  // toggle off, the same switch above) without deleting the submitted
  // authorization/PDF — unlike Delete, which removes both. Gated by typing
  // the signer's name, since it's a distinct, deliberate action.
  const [signatureToRevoke, setSignatureToRevoke] = useState(null);
  const [revokeConfirmText, setRevokeConfirmText] = useState("");

  const handleRevokeAccess = () => {
    if (!signatureToRevoke) return;
    handleUpdate("signature_page_enabled", false);
    toast({
      title: "Access revoked",
      description: "The permission link no longer works. The submitted PDF is still available below.",
    });
    setSignatureToRevoke(null);
    setRevokeConfirmText("");
  };

  // Shown in the project's own distance unit (m for metric, ft for imperial);
  // stored canonically in metres.
  const { value: isolationValue, unit: isolationUnit } = isolationDistanceDisplay(project);
  const boundaryFeet = project.boundary_deviation_feet ?? DEFAULT_PROXIMITY_FEET;

  const handleToggleLock = () => {
    if (locked) {
      // locked_by_id/date are the real DB columns; locked_by_name is a
      // display-only field the parent keeps in local state (and resolves via a
      // join on load) — it is not a column, so writing it would fail the update.
      // Unlocking also withdraws a customer approval — same single action the
      // operator already knows, per the approval spec.
      onUpdate({
        locked: false,
        locked_by_id: null,
        locked_date: null,
        locked_by_name: null,
        customer_approved_by: null,
        customer_approved_at: null,
        approval_requested: false,
      });
    } else {
      onUpdate({
        locked: true,
        locked_by_id: currentUser?.id || null,
        locked_date: new Date().toISOString(),
        locked_by_name: currentUser?.full_name || null,
      });
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Project Settings</h1>
            <p className="text-sm text-muted-foreground">Configure measurement units, date formats, and DMA proximity</p>
          </div>
        </div>

        {/* Project Lock card */}
        <div className="mb-4">
          <h2 className="text-sm font-bold text-foreground mb-1 px-1">Project Lock</h2>
          <div className="bg-card border border-border rounded-xl px-5">
            <SettingRow
              icon={locked ? Lock : Unlock}
              title={locked ? "Project is Locked" : "Project is Unlocked"}
              description={
                locked
                  ? project.customer_approved_by
                    ? `Approved and locked by ${project.customer_approved_by} (customer) — unlocking withdraws the approval`
                    : `Locked${project.locked_by_name ? ` by ${project.locked_by_name}` : ""} — all editing is disabled`
                  : "Lock the project to make it read-only and prevent any changes"
              }
            >
              <Switch checked={!!locked} onCheckedChange={handleToggleLock} />
            </SettingRow>
          </div>
        </div>

        {/* Settings card */}
        <div className={`bg-card border border-border rounded-xl px-5 ${locked ? "pointer-events-none opacity-60" : ""}`}>
          {/* Water unit */}
          <SettingRow
            icon={Droplets}
            title="Water Measurement Unit"
            description="Unit used for consumption and volume values"
          >
            <SegmentedToggle
              value={project.water_unit || "m3"}
              options={[
                { value: "m3", label: "m³" },
                { value: "Gallons", label: "Gallons" },
              ]}
              onChange={(v) => handleUpdate("water_unit", v)}
            />
          </SettingRow>

          {/* Sub-meter communication — written into the LeakZon export. Mains are
              always AMI; this covers everything else, which varies by utility. */}
          <SettingRow
            icon={Radio}
            title="Sub-meter communication"
            description="Written as the Communication value for sub-meters in the LeakZon export. Main meters always export as AMI."
          >
            {/* Was free text, which meant a typo or a synonym went straight into
                the export as the Communication value. There are only two answers
                a utility gives here. Nothing is selected until one is chosen —
                a project that never set it still exports an empty Communication
                for its sub-meters, as before. */}
            <SegmentedToggle
              value={project.sub_meter_communication || ""}
              options={[
                { value: "AMI", label: "AMI" },
                { value: "AMR", label: "AMR" },
              ]}
              onChange={(v) => handleUpdate("sub_meter_communication", v)}
            />
          </SettingRow>

          {/* Distance unit */}
          <SettingRow
            icon={Ruler}
            title="Distance Unit"
            description="Unit used for distances and lengths"
          >
            <SegmentedToggle
              value={project.distance_unit || "Km"}
              options={[
                { value: "Km", label: "Km" },
                { value: "Miles", label: "Miles" },
              ]}
              onChange={(v) => handleUpdate("distance_unit", v)}
            />
          </SettingRow>

          {/* Date format */}
          <SettingRow
            icon={Calendar}
            title="Date Format"
            description="Display format for dates throughout the project"
          >
            <SegmentedToggle
              value={project.date_format || "EU"}
              options={[
                { value: "EU", label: "EU (DD/MM/YYYY)" },
                { value: "US", label: "US (MM/DD/YYYY)" },
              ]}
              onChange={(v) => handleUpdate("date_format", v)}
            />
          </SettingRow>

        </div>

        {/* DMA Focus card */}
        <div className="mt-4">
          <h2 className="text-sm font-bold text-foreground mb-1 px-1">DMA Focus</h2>
          <div className={`bg-card border border-border rounded-xl px-5 ${locked ? "pointer-events-none opacity-60" : ""}`}>
            {/* Boundary deviation */}
            <SettingRow
              icon={Footprints}
              title="Boundary Deviation Distance"
              description="Proximity radius (in feet) used when focusing on a DMA on the map"
            >
              <div className="flex items-center gap-3 w-56">
                <input
                  type="range"
                  min={0}
                  max={500}
                  step={5}
                  value={boundaryFeet}
                  onChange={(e) => handleUpdate("boundary_deviation_feet", parseInt(e.target.value, 10))}
                  className="flex-1 accent-primary cursor-pointer"
                />
                <span className="text-sm font-semibold text-foreground tabular-nums w-16 text-right shrink-0">
                  {boundaryFeet} ft
                </span>
              </div>
            </SettingRow>
          </div>
        </div>

        {/* Isolation Points card */}
        <div className="mt-4">
          <h2 className="text-sm font-bold text-foreground mb-1 px-1">Isolation Points</h2>
          <div className={`bg-card border border-border rounded-xl px-5 ${locked ? "pointer-events-none opacity-60" : ""}`}>
            <SettingRow
              icon={Shield}
              title="Isolation Valve Distance"
              description={`How close two valves on opposite sides of a DMA boundary must be to count as a candidate isolation point — used by "Find border valves"`}
            >
              <div className="flex items-center gap-3 w-56">
                <input
                  type="range"
                  min={0}
                  max={isolationUnit === "ft" ? 500 : 150}
                  step={isolationUnit === "ft" ? 5 : 1}
                  value={isolationValue}
                  onChange={(e) =>
                    handleUpdate("isolation_distance_meters", displayToMeters(project, parseFloat(e.target.value)))
                  }
                  className="flex-1 accent-primary cursor-pointer"
                />
                <span className="text-sm font-semibold text-foreground tabular-nums w-16 text-right shrink-0">
                  {isolationValue} {isolationUnit}
                </span>
              </div>
            </SettingRow>
          </div>
        </div>

        {/* Meter Data Permission Request card */}
        <div className="mt-4">
          <h2 className="text-sm font-bold text-foreground mb-1 px-1">Meter Data Permission Request</h2>
          <div className="bg-card border border-border rounded-xl px-5">
            <SettingRow
              icon={FileSignature}
              title="Permission Request Page"
              description="A page where the customer names their meter provider and signs to grant LeakZon access to that provider's meter data. Opens via the same link as Customer View."
            >
              <Switch
                checked={!!project.signature_page_enabled}
                onCheckedChange={(v) => handleUpdate("signature_page_enabled", v)}
              />
            </SettingRow>
            {project.signature_page_enabled && (
              <div className="pb-4">
                {signatureUrl ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 truncate">{signatureUrl}</code>
                    <Button size="sm" variant="outline" onClick={handleCopySignatureUrl} className="shrink-0 gap-1.5">
                      <Copy className="w-3.5 h-3.5" /> {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No active Customer View link yet — create one first to get a permission request link.
                  </p>
                )}
              </div>
            )}

            {submittedSignatures.length > 0 && (
              <div className="py-4 border-t border-border">
                <p className="text-xs font-semibold text-foreground mb-2">Submitted authorizations</p>
                <div className="space-y-2">
                  {submittedSignatures.map((sig) => (
                    <div
                      key={sig.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {sig.provider_name} — {sig.customer_official_name}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {sig.signer_name}, {sig.signer_title} ·{" "}
                          {new Date(sig.signed_at).toLocaleDateString(undefined, {
                            year: "numeric", month: "short", day: "numeric",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleDownloadPdf(sig)}
                          disabled={!sig.pdf_data}
                        >
                          <Download className="w-3.5 h-3.5" /> PDF
                        </Button>
                        {project.signature_page_enabled && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-amber-600 hover:text-amber-700"
                            onClick={() => setSignatureToRevoke(sig)}
                            title="Revoke link access"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-500 hover:text-red-600"
                          onClick={() => setSignatureToDelete(sig)}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <AlertDialog open={!!signatureToDelete} onOpenChange={(open) => !open && setSignatureToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this authorization?</AlertDialogTitle>
              <AlertDialogDescription>
                {signatureToDelete && (
                  <>
                    This permanently deletes the submitted authorization from{" "}
                    <strong>{signatureToDelete.customer_official_name}</strong> for{" "}
                    <strong>{signatureToDelete.provider_name}</strong>, including its stored PDF. This can't be undone.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteSignature} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog
          open={!!signatureToRevoke}
          onOpenChange={(open) => {
            if (!open) {
              setSignatureToRevoke(null);
              setRevokeConfirmText("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revoke permission link?</DialogTitle>
              <DialogDescription>
                {signatureToRevoke && (
                  <>
                    The permission link will stop working — nobody can open it again. The authorization already
                    submitted by <strong>{signatureToRevoke.signer_name}</strong> and its PDF stay here, unaffected.
                    <br /><br />
                    Type <strong>{signatureToRevoke.signer_name}</strong> to confirm.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <Input
              value={revokeConfirmText}
              onChange={(e) => setRevokeConfirmText(e.target.value)}
              placeholder="Signer's name"
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setSignatureToRevoke(null); setRevokeConfirmText(""); }}>
                Cancel
              </Button>
              <Button
                onClick={handleRevokeAccess}
                disabled={!signatureToRevoke || revokeConfirmText !== signatureToRevoke.signer_name}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Revoke Access
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Summary badge */}
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Check className="w-3.5 h-3.5 text-primary" />
          Changes are saved automatically
        </div>
      </div>
    </div>
  );
}