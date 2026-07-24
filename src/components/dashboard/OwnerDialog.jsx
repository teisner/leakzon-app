import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus } from "lucide-react";

export default function OwnerDialog({ open, onOpenChange, onSave }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", role: "" });

  const handleSave = () => {
    if (!form.full_name || !form.email) return;
    onSave(form);
    setForm({ full_name: "", email: "", phone: "", role: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-600" />
            Add New Owner
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Full Name *</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="John Doe" />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 000 0000" />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Project Manager" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.full_name || !form.email}>Save Owner</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}