import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Trash2, Loader2, Plus, Minus, Mountain, GripVertical, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadFile } from "@/api/storageClient";
import { supabase } from "@/api/supabaseClient";
import { resolveLayerTypeId } from "@/lib/layerType";
import { meterLayerKind } from "@/lib/meterLayerDetection";
import { createMetersFromGeoJSONUrl } from "@/lib/geojsonMeters";
import { SHAPE_OPTIONS } from "@/lib/shapeIcons";
import { useLanguage } from "@/lib/i18n";
import LayerColorPicker from "./LayerColorPicker";
import { COMPONENTS, matchComponentKey, componentPointConfig, componentColor } from "@/lib/componentDefaults";

const CATEGORY_OPTIONS = [
  "Water Lines",
  "Valves",
  "Hydrant",
  "Water Tower",
  "Pump Stations",
  "Reservoir Water",
  "Water Source",
  "Main Meters",
  "Sub Meters",
  "Insertion Meters",
  "Meters",
  "Other",
];

const SHAPE_SVG_PATHS = {
  star: "M12 2 L14.9 8.6 L22 9.3 L16.5 14.1 L18.2 21 L12 17.3 L5.8 21 L7.5 14.1 L2 9.3 L9.1 8.6 Z",
  square: "M4 4 H20 V20 H4 Z",
  triangle: "M12 3 L21 20 H3 Z",
};

function ShapePreview({ shape, color, size, fillStyle, strokeColor }) {
  const isOutline = fillStyle === "outline";
  const stroke = strokeColor || color;
  if (shape === "circle") {
    return (
      <span
        className="rounded-full inline-block"
        style={{
          width: size * 2,
          height: size * 2,
          backgroundColor: isOutline ? "transparent" : color,
          border: `2px solid ${stroke}`,
        }}
      />
    );
  }
  const path = SHAPE_SVG_PATHS[shape];
  return (
    <svg width={size * 2} height={size * 2} viewBox="0 0 24 24" className="inline-block">
      <path d={path} fill={isOutline ? "transparent" : color} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export default function LayerEditDialog({ open, onOpenChange, layer, onSaved }) {
  const { t } = useLanguage();
  const [color, setColor] = useState("#3b82f6");
  const [iconUrl, setIconUrl] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [pipeConfig, setPipeConfig] = useState(null);
  const [pointConfig, setPointConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [lastLayer, setLastLayer] = useState(null);
  // Floating/draggable panel (same interaction as the onboarding wizard) so the
  // map stays visible and usable while restyling a layer.
  const [pos, setPos] = useState(() => ({
    x: Math.max(16, Math.round((window.innerWidth - 460) / 2)),
    y: 80,
  }));
  const dragRef = useRef(null);
  const dragState = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleMove = (e) => {
      if (!dragState.current) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const maxX = window.innerWidth - 100;
      const maxY = window.innerHeight - 60;
      setPos({
        x: Math.max(0, Math.min(clientX - dragState.current.offsetX, maxX)),
        y: Math.max(0, Math.min(clientY - dragState.current.offsetY, maxY)),
      });
    };
    const handleUp = () => { dragState.current = null; };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [open]);

  const handleDragStart = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragState.current = { offsetX: clientX - pos.x, offsetY: clientY - pos.y };
  };

  useEffect(() => {
    if (layer) {
      setLastLayer(layer);
      setColor(layer.color || "#3b82f6");
      setIconUrl(layer.icon_url || "");
      setName(layer.name || "");
      // layer.category (free text in Base44) is now flattened onto each
      // layer object by ProjectDetail.jsx's loader (from a layer_type_id FK
      // join) before it ever reaches this component.
      setCategory(layer.category || "Other");
      setPipeConfig(layer.pipe_config || null);
      setPointConfig(layer.point_config || { shape: "circle", fill_style: "filled", radius: 6 });
    }
  }, [layer]);

  const effectiveLayer = layer || lastLayer;
  if (!open || !effectiveLayer) return null;

  const isPipe = !!pipeConfig;
  const isPoint = effectiveLayer.geometry_types?.some(
    (t) => t === "Point" || t === "MultiPoint"
  );

  const handleIconUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await uploadFile({ file });
      setIconUrl(file_url);
    } catch (err) {
      console.error("Icon upload failed:", err);
    }
    setUploading(false);
  };

  const handleDiameterChange = (idx, key, value) => {
    setPipeConfig((prev) => {
      if (!prev) return prev;
      const diameters = [...prev.diameters];
      diameters[idx] = { ...diameters[idx], [key]: value };
      return { ...prev, diameters };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const layer_type_id = await resolveLayerTypeId(category);
      const updates = { color, name, layer_type_id };
      if (isPoint) {
        updates.icon_url = iconUrl;
        updates.point_config = pointConfig;
      }
      if (isPipe) updates.pipe_config = pipeConfig;
      const { error } = await supabase.from('project_layer').update(updates).eq('id', effectiveLayer.id);
      if (error) throw error;
      await backfillMeters();
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to update layer:", err);
    }
    setSaving(false);
  };

  // A layer imported under a non-meter category (e.g. "Other") creates no rows
  // in the `meter` table, so its points show a feature count but no meters
  // anywhere. Re-categorising it as a meter type here repairs that: if the
  // layer has no meter rows yet, build them from its stored GeoJSON.
  const backfillMeters = async () => {
    const kind = meterLayerKind(name, category);
    if (!kind || !isPoint || !effectiveLayer.file_url) return;
    const { count, error: countError } = await supabase
      .from('meter')
      .select('id', { count: 'exact', head: true })
      .eq('layer_id', effectiveLayer.id);
    if (countError || count > 0) return;
    setProgressLabel(t('layerEdit.creatingMeters'));
    try {
      await createMetersFromGeoJSONUrl(effectiveLayer.file_url, {
        projectId: effectiveLayer.project_id,
        layerId: effectiveLayer.id,
        isMain: kind === "main",
      });
    } catch (e) {
      console.error("Failed to create meter rows for re-categorised layer:", e);
    }
    setProgressLabel("");
  };

  // If this layer matches a component type configured in the dashboard
  // Settings (by its current name/category), offer to pull that type's shape,
  // size, fill and colours in — overwriting whatever this layer has now.
  const defaultsKey = matchComponentKey(name, category);
  const defaultsLabel = COMPONENTS.find((c) => c.key === defaultsKey)?.label;

  const applyComponentDefaults = () => {
    const pc = componentPointConfig(name, category);
    const col = componentColor(name, category);
    if (col) setColor(col);
    if (pc) {
      setPointConfig((prev) => {
        const next = { ...(prev || {}), ...pc };
        // Defaults with no outline colour mean "same as shape" — clear any
        // existing override rather than leaving a stale one behind.
        if (!pc.stroke_color) delete next.stroke_color;
        return next;
      });
    }
  };

  return (
    <div
      ref={dragRef}
      className="fixed z-[9999] bg-card border-2 border-primary rounded-xl shadow-2xl flex flex-col"
      style={{
        left: pos.x,
        top: pos.y,
        // Sized to the content (the colour palette is the widest element) and
        // never wider/taller than the viewport — the body scrolls instead.
        width: "min(calc(100vw - 32px), 460px)",
        maxHeight: "calc(100vh - 100px)",
      }}
    >
      {/* Header — draggable */}
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className="flex items-center gap-2 px-4 py-2.5 border-b border-border cursor-grab active:cursor-grabbing select-none shrink-0"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
        <p className="flex-1 min-w-0 text-base font-bold text-foreground truncate">
          {t('layerEdit.title', { name: effectiveLayer.name })}
        </p>
        <button
          onClick={() => onOpenChange(false)}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          title={t('layerEdit.cancel')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {/* Altitude info */}
          {effectiveLayer.altitude_field && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <Mountain className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="text-sm">
                <span className="text-emerald-800 font-medium">{t('layerEdit.altitudeData')}</span>
                <span className="text-emerald-700">
                  {effectiveLayer.altitude_field === "z" ? t('layerEdit.altitudeZ') : t('layerEdit.altitudeField', { field: effectiveLayer.altitude_field })}
                  {effectiveLayer.altitude_unit ? ` (${effectiveLayer.altitude_unit})` : ""}
                </span>
              </div>
            </div>
          )}

          {/* Layer name */}
          <div>
            <Label>{t('layerEdit.layerName')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('layerEdit.layerName')} className="mt-1.5" />
          </div>

          {/* Layer category */}
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              {/* Portals to <body> at z-50 by default, which is below this
                  floating panel (z-[9999]) — without this the menu opens
                  behind the panel and looks like it never opened. */}
              <SelectContent className="z-[10000]">
                {CATEGORY_OPTIONS.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Color picker (non-pipe layers) */}
          {!isPipe && (
            <div>
              <Label>{t('layerEdit.color')}</Label>
              <div className="mt-2">
                <LayerColorPicker value={color} onChange={setColor} />
              </div>
            </div>
          )}

          {/* Dot style (point layers, no custom icon) */}
          {isPoint && !iconUrl && (
            <div>
              {defaultsKey && (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Defaults exist for <span className="font-medium text-foreground">{defaultsLabel}</span> in dashboard Settings.
                  </p>
                  <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={applyComponentDefaults}>
                    Apply
                  </Button>
                </div>
              )}
              <Label>{t('layerEdit.shape')}</Label>
              <div className="flex gap-2 mt-2">
                {SHAPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPointConfig((p) => ({ ...p, shape: opt.value }))}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 text-sm transition-colors ${(pointConfig?.shape || "circle") === opt.value ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                  >
                    <ShapePreview shape={opt.value} color={color} size={10} fillStyle={pointConfig?.fill_style} strokeColor={pointConfig?.stroke_color} />
                    {opt.label}
                  </button>
                ))}
              </div>

              <Label className="mt-3 block">{t('layerEdit.fillStyle')}</Label>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setPointConfig((p) => ({ ...p, fill_style: "filled" }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm transition-colors ${pointConfig?.fill_style !== "outline" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                >
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                  {t('layerEdit.filled')}
                </button>
                <button
                  onClick={() => setPointConfig((p) => ({ ...p, fill_style: "outline" }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm transition-colors ${pointConfig?.fill_style === "outline" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                >
                  <span className="w-4 h-4 rounded-full border-2" style={{ borderColor: color, backgroundColor: "transparent" }} />
                  {t('layerEdit.outline')}
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <Label>Outline color</Label>
                {pointConfig?.stroke_color && (
                  <button
                    onClick={() => setPointConfig((p) => { const { stroke_color, ...rest } = p || {}; return rest; })}
                    className="text-[11px] text-blue-600 hover:underline"
                  >
                    Same as shape
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Optional — give the outline a different color than the shape (e.g. a white shape with a dark outline).
              </p>
              <div className="mt-2">
                <LayerColorPicker
                  value={pointConfig?.stroke_color || color}
                  onChange={(c) => setPointConfig((p) => ({ ...p, stroke_color: c }))}
                />
              </div>

              <Label className="mt-3 block">{t('layerEdit.size')}</Label>
              <div className="flex items-center gap-2 mt-2">
                {[4, 6, 8, 10, 12].map((r) => (
                  <button
                    key={r}
                    onClick={() => setPointConfig((p) => ({ ...p, radius: r }))}
                    className={`flex items-center justify-center w-10 h-10 rounded-lg border-2 transition-colors ${pointConfig?.radius === r ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                  >
                    <ShapePreview shape={pointConfig?.shape || "circle"} color={color} size={r} fillStyle={pointConfig?.fill_style} strokeColor={pointConfig?.stroke_color} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Icon upload (point layers only) */}
          {isPoint && (
            <div>
              <Label>{t('layerEdit.customIcon')}</Label>
              <p className="text-xs text-slate-400 mt-0.5">{t('layerEdit.iconDesc')}</p>
              <div className="flex items-center gap-3 mt-2">
                {iconUrl ? (
                  <img src={iconUrl} alt="icon" className="w-10 h-10 object-contain border rounded-lg p-1" />
                ) : (
                  <span className="w-8 h-8 rounded-full shrink-0" style={{ backgroundColor: color }} />
                )}
                <Button variant="outline" size="sm" className="gap-1.5" disabled={uploading} onClick={() => document.getElementById("icon-upload")?.click()}>
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {iconUrl ? t('layerEdit.replace') : t('layerEdit.upload')}
                </Button>
                {iconUrl && (
                  <Button variant="ghost" size="sm" className="gap-1.5 text-red-500" onClick={() => setIconUrl("")}>
                    <Trash2 className="w-3.5 h-3.5" /> {t('layerEdit.remove')}
                  </Button>
                )}
                <input id="icon-upload" type="file" accept="image/*" className="hidden" onChange={handleIconUpload} />
              </div>

              {iconUrl && (
                <>
                  <Label className="mt-3 block">Icon Size</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setPointConfig((p) => ({ ...p, icon_size: Math.max(12, (p?.icon_size || 28) - 4) }))}
                      className="w-8 h-8 flex items-center justify-center rounded-md border border-border bg-card hover:bg-muted text-foreground cursor-pointer transition-colors"
                      title="Decrease icon size"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="flex-1 flex items-center justify-center">
                      <img src={iconUrl} alt="icon preview" className="object-contain" style={{ width: pointConfig?.icon_size || 28, height: pointConfig?.icon_size || 28 }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-center">{pointConfig?.icon_size || 28}px</span>
                    <button
                      type="button"
                      onClick={() => setPointConfig((p) => ({ ...p, icon_size: Math.min(64, (p?.icon_size || 28) + 4) }))}
                      className="w-8 h-8 flex items-center justify-center rounded-md border border-border bg-card hover:bg-muted text-foreground cursor-pointer transition-colors"
                      title="Increase icon size"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Pipe diameter configuration */}
          {isPipe && (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('layerEdit.pipeDiameters')}</Label>
                  <p className="text-xs text-slate-400 mt-0.5">{t('layerEdit.fieldLabel', { field: pipeConfig.diameter_field })}</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 mr-1">{t('layerEdit.scaleAll')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPipeConfig((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          diameters: prev.diameters.map((d) => ({
                            ...d,
                            weight: Math.max(1, Math.round((d.weight || 1) * 0.8)),
                          })),
                        };
                      });
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-300 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
                    title={t('layerEdit.decreaseWidth')}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPipeConfig((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          diameters: prev.diameters.map((d) => ({
                            ...d,
                            weight: Math.min(10, Math.round((d.weight || 1) * 1.25)),
                          })),
                        };
                      });
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-300 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
                    title={t('layerEdit.increaseWidth')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 mt-2">
                {pipeConfig.diameters.map((d, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-slate-50 rounded-lg p-2.5">
                    <input
                      type="color"
                      value={d.color}
                      onChange={(e) => handleDiameterChange(idx, "color", e.target.value)}
                      className="w-8 h-8 rounded border border-slate-200 cursor-pointer shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{d.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400">{t('layerEdit.weight')}</span>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          value={d.weight}
                          onChange={(e) => handleDiameterChange(idx, "weight", parseInt(e.target.value))}
                          className="flex-1"
                        />
                        <span className="text-xs text-slate-600 w-4">{d.weight}</span>
                      </div>
                    </div>
                    <div className="w-12 h-0 border-t-2 shrink-0" style={{ borderColor: d.color, borderTopWidth: Math.min(d.weight, 6) }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      <div className="flex justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
        <Button variant="outline" onClick={() => onOpenChange(false)}>{t('layerEdit.cancel')}</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {progressLabel || t('layerEdit.save')}
        </Button>
      </div>
    </div>
  );
}