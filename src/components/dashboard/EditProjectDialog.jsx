import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, UserPlus, Lock } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import OwnerDialog from "./OwnerDialog";
import ParentProjectInput from "./ParentProjectInput";
import { useLanguage } from "@/lib/i18n";

export default function EditProjectDialog({ open, onOpenChange, project, onUpdated }) {
  const { t } = useLanguage();
  const [owners, setOwners] = useState([]);
  const [showOwnerDialog, setShowOwnerDialog] = useState(false);
  const [form, setForm] = useState({
    name: "",
    owner_id: "",
    utility_name: "",
    water_unit: "m3",
    distance_unit: "Km",
    date_format: "EU",
    parent_project_name: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      supabase.from('owner').select('*').then(({ data }) => setOwners(data || []));
    }
  }, [open]);

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || "",
        owner_id: project.owner_id || "",
        utility_name: project.utility_name || "",
        water_unit: project.water_unit || "m3",
        distance_unit: project.distance_unit || "Km",
        date_format: project.date_format || "EU",
        parent_project_name: project.parent_project_name || "",
      });
    }
  }, [project]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleAddOwner = async (ownerData) => {
    const { data: newOwner } = await supabase.from('owner').insert(ownerData).select().single();
    if (!newOwner) return;
    setOwners((prev) => [...prev, newOwner]);
    set("owner_id", newOwner.id);
  };

  const handleSave = async () => {
    setSaving(true);
    const { data: updated, error } = await supabase
      .from('project')
      .update({
        ...form,
        parent_project_name: form.parent_project_name?.trim() || undefined,
      })
      .eq('id', project.id)
      .select()
      .single();
    setSaving(false);
    if (error) return;
    onUpdated?.(updated);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-600" /> {t('editProject.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t('editProject.projectName')}</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>

            <div>
              <Label>{t('editProject.owner')}</Label>
              <div className="flex gap-2">
                <Select value={form.owner_id} onValueChange={(v) => set("owner_id", v)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t('editProject.selectOwner')} />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => setShowOwnerDialog(true)}>
                  <UserPlus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label>{t('editProject.utilityName')}</Label>
              <Input value={form.utility_name} onChange={(e) => set("utility_name", e.target.value)} />
            </div>

            <div>
              <Label>{t('editProject.parentProject')}</Label>
              <ParentProjectInput value={form.parent_project_name} onChange={(v) => set("parent_project_name", v)} placeholder={t('editProject.parentProjectPlaceholder')} />
            </div>

            {/* Read-only calculated fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-1 text-slate-400">
                  <Lock className="w-3 h-3" /> {t('editProject.serviceConnections')}
                </Label>
                <Input value={project?.service_connections ?? 0} disabled className="bg-slate-50 text-slate-500" />
              </div>
              <div>
                <Label className="flex items-center gap-1 text-slate-400">
                  <Lock className="w-3 h-3" /> {t('editProject.dmas')}
                </Label>
                <Input value={project?.num_dma ?? 0} disabled className="bg-slate-50 text-slate-500" />
              </div>
            </div>
            <p className="text-xs text-slate-400 -mt-2">{t('editProject.autoCalc')}</p>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>{t('editProject.waterUnit')}</Label>
                <Select value={form.water_unit} onValueChange={(v) => set("water_unit", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="m3">m³</SelectItem>
                    <SelectItem value="Gallons">Gallons</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('editProject.distanceUnit')}</Label>
                <Select value={form.distance_unit} onValueChange={(v) => set("distance_unit", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Km">Km</SelectItem>
                    <SelectItem value="Miles">Miles</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('editProject.dateFormat')}</Label>
                <Select value={form.date_format} onValueChange={(v) => set("date_format", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EU">DD/MM/YYYY</SelectItem>
                    <SelectItem value="US">MM/DD/YYYY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('editProject.cancel')}</Button>
            <Button onClick={handleSave} disabled={saving || !form.name}>
              {saving ? t('editProject.saving') : t('editProject.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OwnerDialog
        open={showOwnerDialog}
        onOpenChange={setShowOwnerDialog}
        onSave={handleAddOwner}
      />
    </>
  );
}