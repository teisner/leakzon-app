import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderPlus, MapPin, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { uploadFile } from "@/api/storageClient";
import { invokeFunction } from "@/api/functionsClient";
import { supabase } from "@/api/supabaseClient";
import { analyzeGeoJSON } from "@/lib/geoAnalysis";
import { recordProgress } from "@/lib/progressTracker";
import MapConfirmDialog from "./MapConfirmDialog";
import ParentProjectInput from "./ParentProjectInput";
import { useLanguage } from "@/lib/i18n";

const CITY_BOUNDARY_COLOR = "#6b7280";

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
  "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
  "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico",
  "New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
  "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming"
];

const COUNTRIES = [
  "United States","United Kingdom","Canada","Australia","Germany","France","Spain","Italy",
  "Israel","India","Brazil","Mexico","Japan","South Korea","Netherlands","Sweden","Norway",
  "Denmark","Finland","Switzerland","Austria","Belgium","Portugal","Ireland","New Zealand",
  "South Africa","Singapore","Chile","Colombia","Argentina","Peru","Poland","Czech Republic",
  "Romania","Greece","Turkey","Thailand","Philippines","Indonesia","Vietnam","Malaysia",
  "Saudi Arabia","UAE","Egypt","Nigeria","Kenya","Ghana","Morocco","Tunisia"
];

export default function CreateProjectDialog({ open, onOpenChange, onCreated }) {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [users, setUsers] = useState([]);
  const [showMapDialog, setShowMapDialog] = useState(false);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    owner_id: "",
    utility_name: "",
    country: "",
    city: "",
    state: "",
    latitude: null,
    longitude: null,
    water_unit: "m3",
    distance_unit: "Km",
    date_format: "EU",
    parent_project_name: "",
    project_type: "AMI",
  });

  useEffect(() => {
    if (open) {
      // owner_id is a real FK to `owner`, not SystemUser — matches
      // EditProjectDialog's owner selector (the original app inconsistently
      // sourced this from SystemUser here, which never matched the real FK).
      supabase.from('owner').select('*').then(({ data }) => setUsers(data || []));
      setStep(1);
      setForm({
        name: "", owner_id: "", utility_name: "", country: "", city: "", state: "",
        latitude: null, longitude: null, water_unit: "m3", distance_unit: "Km", date_format: "EU", project_type: "AMI",
        parent_project_name: "",
      });
      setLocationConfirmed(false);
    }
  }, [open]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleLocationConfirm = (coords) => {
    set("latitude", coords.latitude);
    set("longitude", coords.longitude);
    setLocationConfirmed(true);
  };

  const canProceedStep1 = form.name && form.owner_id && form.utility_name;
  const canProceedStep2 = form.country && form.city && locationConfirmed;

  const handleCreate = async () => {
    setSaving(true);

    // 1. Create the project
    const { data: project, error } = await supabase
      .from('project')
      .insert({
        ...form,
        parent_project_name: form.parent_project_name?.trim() || undefined,
        service_connections: 0,
      })
      .select()
      .single();
    if (error) {
      setSaving(false);
      return;
    }
    recordProgress(project.id, "project_created");

    // 2. Fetch city boundary and create an auto layer
    try {
      const res = await invokeFunction("getCityBoundary", {
        city: form.city,
        state: form.state,
        country: form.country,
      });

      const geojson = res.data?.geojson;
      if (geojson) {
        // Analyze the boundary GeoJSON (handles CRS reprojection if needed)
        const analysis = analyzeGeoJSON(geojson);

        // Upload the GeoJSON file
        const file = new File(
          [JSON.stringify(geojson)],
          `${form.city}_boundary.geojson`,
          { type: "application/json" }
        );
        const { file_url } = await uploadFile({ file });

        // Create the city boundary layer
        await supabase.from('project_layer').insert({
          project_id: project.id,
          name: `${form.city} Boundary`,
          layer_type: "shp",
          file_url,
          color: CITY_BOUNDARY_COLOR,
          visible: true,
          feature_count: analysis?.featureCount || 1,
          geometry_types: analysis?.geometryTypes || [],
          properties: analysis?.propertyNames || [],
          bounds: analysis?.bounds || null,
        });
        recordProgress(project.id, "boundary_set");
      }
    } catch {
      // Boundary fetch is best-effort — don't fail project creation
    }

    setSaving(false);
    onCreated(project);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-blue-600" />
              {t('createProject.title')}
            </DialogTitle>
          </DialogHeader>

          {/* Progress */}
          <div className="flex items-center gap-2 mb-2">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`h-1.5 rounded-full flex-1 transition-colors ${s <= step ? "bg-blue-600" : "bg-slate-200"}`} />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mb-4">
            {t('createProject.step', { step, label: step === 1 ? t('createProject.step1') : t('createProject.step2') })}
          </p>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label>{t('createProject.projectName')}</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="My Water Project" />
              </div>
              <div>
                <Label>{t('createProject.owner')}</Label>
                <Select value={form.owner_id} onValueChange={(v) => set("owner_id", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('createProject.selectUser')} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('createProject.utilityName')}</Label>
                <Input value={form.utility_name} onChange={(e) => set("utility_name", e.target.value)} placeholder="City Water Authority" />
              </div>
              <div>
                <Label>{t('projectType.label')}</Label>
                <div className="flex gap-2 mt-1.5">
                  {["AMI", "Hybrid"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => set("project_type", opt)}
                      className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                        form.project_type === opt
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t('projectType.hint')}</p>
              </div>
              <div>
                <Label>{t('createProject.parentProject')}</Label>
                <ParentProjectInput value={form.parent_project_name} onChange={(v) => set("parent_project_name", v)} placeholder={t('createProject.parentProjectPlaceholder')} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label>{t('createProject.country')}</Label>
                <Select value={form.country} onValueChange={(v) => {
                  set("country", v);
                  set("state", "");
                  setLocationConfirmed(false);
                  if (v === "United States") {
                    set("water_unit", "Gallons");
                    set("distance_unit", "Miles");
                    set("date_format", "US");
                  } else {
                    set("water_unit", "m3");
                    set("distance_unit", "Km");
                    set("date_format", "EU");
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('createProject.selectCountry')} />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.country === "United States" && (
                <div>
                  <Label>{t('createProject.state')}</Label>
                  <Select value={form.state} onValueChange={(v) => { set("state", v); setLocationConfirmed(false); }}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('createProject.selectState')} />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>{t('createProject.city')}</Label>
                <Input value={form.city} onChange={(e) => { set("city", e.target.value); setLocationConfirmed(false); }} placeholder={t('createProject.enterCity')} />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowMapDialog(true)}
                  disabled={!form.city || !form.country}
                  className="gap-1.5"
                >
                  <MapPin className="w-4 h-4" />
                  {locationConfirmed ? t('createProject.locationConfirmed') : t('createProject.confirmOnMap')}
                </Button>
                {locationConfirmed && (
                  <span className="text-xs text-emerald-600">
                    {form.latitude?.toFixed(4)}, {form.longitude?.toFixed(4)}
                  </span>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between sm:justify-between">
            <div>
              {step > 1 && (
                <Button variant="ghost" onClick={() => setStep(step - 1)} className="gap-1">
                  <ChevronLeft className="w-4 h-4" /> {t('createProject.back')}
                </Button>
              )}
            </div>
            <div>
              {step < 2 ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
                  className="gap-1"
                >
                  {t('createProject.next')} <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={handleCreate} disabled={saving} className="gap-1.5">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('createProject.creating')}</> : t('createProject.createProject')}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MapConfirmDialog
        open={showMapDialog}
        onOpenChange={setShowMapDialog}
        city={form.city}
        state={form.state}
        country={form.country}
        onConfirm={handleLocationConfirm}
      />
    </>
  );
}