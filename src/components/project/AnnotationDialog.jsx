import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AnnotationDialog({ open, type, onClose, onSave, initialText, isEdit }) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) setText(initialText || "");
  }, [open, initialText]);

  const handleSave = () => {
    onSave(text.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Annotation" : (type === "arrow" ? "Arrow Label" : "Note Text")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{type === "arrow" ? "Label (optional)" : "Note text"}</Label>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={type === "arrow" ? "e.g. Flow direction" : "e.g. Check this area"}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>{isEdit ? "Save" : (type === "arrow" ? "Add Arrow" : "Add Note")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}