import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadFile } from "@/api/storageClient";
import { supabase } from "@/api/supabaseClient";
import { resolveLayerTypeId } from "@/lib/layerType";
import { Loader2, Upload, Trash2, Layers } from "lucide-react";
import { SHAPE_OPTIONS } from "@/lib/shapeIcons";

const COLOR_PRESETS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#facc15",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#6b7280", "#1f2937",
];

const SHAPE_SVG_PATHS = {
  star: "M12 2 L14.9 8.6 L22 9.3 L16.5 14.1 L18.2 21 L12 17.3 L5.8 21 L7.5 14.1 L2 9.3 L9.1 8.6 Z",
  square: "M4 4 H20 V20 H4 Z",
  triangle: "M12 3 L21 20 H3 Z",
};

function ShapePreview({ shape, color, size, fillStyle }) {
  const isOutline = fillStyle === "outline";
  if (shape === "circle") {
    return (
      <span
        className="rounded-full inline-block"
        style={{
          width: size * 2,
          height: size * 2,
          backgroundColor: isOutline ? "transparent" : color,
          border: isOutline ? `2px solid ${color}` : "none",
        }}
      />
    );
  }
  const path = SHAPE_SVG_PATHS[shape];
  return (
    <svg width={size * 2} height={size * 2} viewBox="0 0 24 24" className="inline-block">
      <path d={path} fill={isOutline ? "transparent" : color} stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export default function CreateLayerFromMetersDialog({ open, onOpenChange, projectId, selectedIds, layers, onCreated }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [shape, setShape] = useState("circle");
  const [fillStyle, setFillStyle] = useState("filled");
  const [radius, setRadius] = useState(6);
  const [iconUrl, setIconUrl] = useState("");
  const [layerTypes, setLayerTypes] = useState([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setCategory("");
      setColor("#3b82f6");
      setShape("circle");
      setFillStyle("filled");
      setRadius(6);
      setIconUrl("");
      setShowNewCategory(false);
      setNewCategoryName("");
      setError("");
      supabase.from('layer_type').select('*').order('name').then(({ data }) => setLayerTypes(data || []));
    }
  }, [open]);

  const handleIconUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await uploadFile({ file });
      setIconUrl(file_url);
    } catch (err) {
      setError("Failed to upload icon");
    }
    setUploading(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Layer name is required");
      return;
    }
    if (selectedIds.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const nextSortOrder = (layers || []).length;
      const layer_type_id = await resolveLayerTypeId(category || "Other");
      const { data: layer, error: createError } = await supabase
        .from('project_layer')
        .insert({
          project_id: projectId,
          name: name.trim(),
          layer_type_id,
          layer_type: "data",
          file_url: "",
          color,
          icon_url: iconUrl || null,
          visible: true,
          sort_order: nextSortOrder,
          feature_count: selectedIds.length,
          geometry_types: ["Point"],
          properties: [],
          bounds: null,
          point_config: { shape, fill_style: fillStyle, radius },
        })
        .select()
        .single();
      if (createError) throw createError;

      await supabase.from('meter').update({ layer_id: layer.id }).in('id', [...selectedIds]);

      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Failed to create layer");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" /> Create Layer from Meters
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
          )}

          <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
            <Layers className="w-4 h-4 text-blue-600 shrink-0" />
            <p className="text-sm text-blue-800">
              {selectedIds.length} meter{selectedIds.length !== 1 ? "s" : ""} will be assigned to this new layer
            </p>
          </div>

          {/* Layer name */}
          <div>
            <Label>Layer Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Meters" className="mt-1.5" />
          </div>

          {/* Category */}
          <div>
            <Label className="mb-1.5 block">Layer Category</Label>
            {!showNewCategory ? (
              <div className="flex gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— Select category —</option>
                  {layerTypes.map((lt) => (
                    <option key={lt.id} value={lt.name}>{lt.name}</option>
                  ))}
                </select>
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowNewCategory(true); setCategory(""); }} className="shrink-0">
                  + New
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Enter new category name"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={!newCategoryName.trim()}
                  onClick={async () => {
                    const catName = newCategoryName.trim();
                    const { data: created } = await supabase
                      .from('layer_type')
                      .insert({ name: catName, is_default: false })
                      .select()
                      .single();
                    if (created) {
                      setLayerTypes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
                    }
                    setCategory(catName);
                    setShowNewCategory(false);
                    setNewCategoryName("");
                  }}
                  className="shrink-0"
                >
                  Add
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setShowNewCategory(false); setNewCategoryName(""); }} className="shrink-0">
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Color */}
          <div>
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? "border-slate-900 scale-110" : "border-white"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Shape (only when no custom icon) */}
          {!iconUrl && (
            <div>
              <Label>Shape</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {SHAPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setShape(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 text-sm transition-colors ${shape === opt.value ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                  >
                    <ShapePreview shape={opt.value} color={color} size={10} fillStyle={fillStyle} />
                    {opt.label}
                  </button>
                ))}
              </div>

              <Label className="mt-3 block">Fill Style</Label>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setFillStyle("filled")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm transition-colors ${fillStyle !== "outline" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                >
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                  Filled
                </button>
                <button
                  onClick={() => setFillStyle("outline")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm transition-colors ${fillStyle === "outline" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                >
                  <span className="w-4 h-4 rounded-full border-2" style={{ borderColor: color, backgroundColor: "transparent" }} />
                  Outline
                </button>
              </div>

              <Label className="mt-3 block">Size</Label>
              <div className="flex items-center gap-2 mt-2">
                {[4, 6, 8, 10, 12].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRadius(r)}
                    className={`flex items-center justify-center w-10 h-10 rounded-lg border-2 transition-colors ${radius === r ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                  >
                    <ShapePreview shape={shape} color={color} size={r} fillStyle={fillStyle} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Icon */}
          <div>
            <Label>Custom Icon</Label>
            <p className="text-xs text-slate-400 mt-0.5">Replaces the colored dot for point features</p>
            <div className="flex items-center gap-3 mt-2">
              {iconUrl ? (
                <img src={iconUrl} alt="icon" className="w-10 h-10 object-contain border rounded-lg p-1" />
              ) : (
                <span className="w-8 h-8 rounded-full shrink-0" style={{ backgroundColor: color }} />
              )}
              <Button variant="outline" size="sm" className="gap-1.5" disabled={uploading} onClick={() => document.getElementById("layer-icon-upload")?.click()}>
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {iconUrl ? "Replace" : "Upload"}
              </Button>
              {iconUrl && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-red-500" onClick={() => setIconUrl("")}>
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </Button>
              )}
              <input id="layer-icon-upload" type="file" accept="image/*" className="hidden" onChange={handleIconUpload} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || selectedIds.length === 0} className="gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Create Layer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}