import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";

export default function DeleteMetersDialog({ open, onOpenChange, count, onConfirm }) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setTyped("");
      setDeleting(false);
    }
  }, [open]);

  const confirmed = parseInt(typed, 10) === count;

  const handleConfirm = async () => {
    if (!confirmed || deleting) return;
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" /> Confirm Deletion
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-600">
            You are about to permanently delete{" "}
            <span className="font-bold text-red-600">{count}</span> meter{count !== 1 ? "s" : ""}.
            This action cannot be undone.
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">
              Type the number <span className="font-bold text-slate-700">{count}</span> to confirm
            </Label>
            <Input
              type="number"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={String(count)}
              className="h-9"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!confirmed || deleting}
            className="gap-1.5"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Delete {count} Meter{count !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}