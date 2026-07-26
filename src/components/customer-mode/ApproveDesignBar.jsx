import React, { useState } from "react";
import { ShieldCheck, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callFunction } from "@/lib/publicFunction";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

/**
 * Customer-facing sign-off for the network design.
 *
 * Only rendered when the operator has requested approval. Approving locks the
 * project in the customer's name, so the confirmation spells that out rather
 * than approving on a single tap.
 */
export default function ApproveDesignBar({ project, token, onApproved }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [approved, setApproved] = useState(!!project?.customer_approved_at);
  const [approvedBy, setApprovedBy] = useState(project?.customer_approved_by || null);

  if (!project?.approval_requested) return null;

  const handleApprove = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await callFunction("approveNetworkDesign", {
        project_id: project.id,
        token,
        approver_name: name.trim(),
      });
      if (res?.error) throw new Error(res.error);
      setApproved(true);
      setApprovedBy(res?.approved_by || name.trim());
      setOpen(false);
      onApproved?.(res);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Could not record the approval.");
    } finally {
      setSaving(false);
    }
  };

  if (approved) {
    return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1200] pointer-events-none">
        <div className="flex items-center gap-2 rounded-full bg-emerald-600 text-white px-5 py-3 shadow-2xl">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold">
            Design approved{approvedBy ? ` by ${approvedBy}` : ""}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1200]">
        <Button
          onClick={() => setOpen(true)}
          className="h-14 px-8 text-base font-bold gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xl"
        >
          <ShieldCheck className="w-5 h-5" />
          Approve this design
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={(v) => { if (!saving) setOpen(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this network design?</AlertDialogTitle>
            <AlertDialogDescription>
              This confirms you accept the network design for "{project.name}". The project will be
              locked as approved and recorded against your name. This can only be undone by the
              LeakZon team.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="approver-name">Your name</Label>
            <Input
              id="approver-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !saving) handleApprove(); }}
              placeholder="Full name"
              autoFocus
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleApprove}
              disabled={!name.trim() || saving}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm approval
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
