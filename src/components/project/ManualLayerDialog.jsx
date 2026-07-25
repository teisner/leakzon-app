import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { uploadFile } from "@/api/storageClient";
import { supabase } from "@/api/supabaseClient";
import { resolveLayerTypeId } from "@/lib/layerType";
import { componentPointConfig, componentColor } from "@/lib/componentDefaults";
import LayerColorPicker from "./LayerColorPicker";

const CATEGORIES = [
  "Insertion Meters", "Pump Stations", "Water Source", "Water Tower", "Reservoir",
  "Valve", "Hydrant", "Treatment Plant", "Water Lines", "Other",
];

export default function ManualLayerDialog({ open, onOpenChange, projectId, onCreated, nextSortOrder }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Pump Stations");
  const [color, setColor] = useState("#3b82f6");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setCategory("Pump Stations");
      setColor("#3b82f6");
      setSaving(false);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const geojson = { type: "FeatureCollection", features: [] };
      const file = new File(
        [JSON.stringify(geojson)],
        `${name.trim()}_manual.geojson`,
        { type: "application/json" }
      );
      const { file_url } = await uploadFile({ file });

      const isWaterLine = category === "Water Lines";
      const layer_type_id = await resolveLayerTypeId(category);
      const { data: layer } = await supabase.from('project_layer').insert({
        project_id: projectId,
        name: name.trim(),
        layer_type_id,
        layer_type: "shp",
        file_url,
        color: componentColor(name.trim(), category) || color,
        visible: true,
        is_manual: true,
        feature_count: 0,
        geometry_types: isWaterLine ? ["LineString"] : ["Point"],
        properties: isWaterLine ? ["diameter"] : ["name"],
        bounds: null,
        sort_order: nextSortOrder ?? 0,
        ...(isWaterLine ? {} : { point_config: componentPointConfig(name.trim(), category) || { shape: "circle", fill_style: "filled", radius: 7 } }),
      }).select().single();

      onCreated?.(layer);
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to create manual layer:", err);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-4 h-4" /> {t('manualLayer.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('manualLayer.layerName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('manualLayer.namePlaceholder')}
              className="mt-1.5"
              autoFocus
            />
          </div>

          <div>
            <Label>{t('manualLayer.category')}</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    category === c
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>{t('manualLayer.color')}</Label>
            <div className="mt-2">
              <LayerColorPicker value={color} onChange={setColor} />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex gap-2">
            <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600">
              {t('manualLayer.instructions')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('manualLayer.cancel')}</Button>
          <Button onClick={handleCreate} disabled={saving || !name.trim()} className="gap-1.5">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('manualLayer.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}