import React, { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Hexagon, AlertTriangle, Gauge, GripVertical, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { supabase } from "@/api/supabaseClient";
import {
  countMetersInPolygon,
  isPolygonOutsideBoundary,
  alignPolygonToBoundary,
  getBoundaryPolygonsLatLng,
} from "@/lib/polygonUtils";
import DmaColorPicker from "@/components/project/DmaColorPicker";
import { DMA_COLORS } from "@/components/project/DmaColorPicker";

export default function DmaConfigDialog({
  open,
  onOpenChange,
  polygonPoints,
  boundaryGeoJSON,
  meters,
  existingDmaCount,
  projectId,
  onSaved,
}) {
  // Floating/draggable panel (same interaction as the layer settings panel) so
  // the map and the drawn polygon stay visible while configuring the DMA.
  const [pos, setPos] = useState(() => ({
    x: Math.max(16, Math.round((window.innerWidth - 460) / 2)),
    y: 80,
  }));
  const dragRef = useRef(null);
  const dragState = useRef(null);

  const [color, setColor] = useState("auto");
  const [transparency, setTransparency] = useState(30);
  const [alignToBoundary, setAlignToBoundary] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (open) {
      setColor("auto");
      setTransparency(30);
      setAlignToBoundary(false);
      setName(`DMA ${existingDmaCount + 1}`);
    }
  }, [open, existingDmaCount]);

  const boundaryPolygons = useMemo(
    () => getBoundaryPolygonsLatLng(boundaryGeoJSON),
    [boundaryGeoJSON]
  );

  const extendsOutside = useMemo(
    () => isPolygonOutsideBoundary(polygonPoints, boundaryPolygons),
    [polygonPoints, boundaryPolygons]
  );

  // Auto-enable alignment suggestion when polygon extends outside
  useEffect(() => {
    if (open && extendsOutside) {
      setAlignToBoundary(true);
    }
  }, [extendsOutside, open]);

  const effectivePolygon = useMemo(() => {
    if (alignToBoundary && extendsOutside) {
      return alignPolygonToBoundary(polygonPoints, boundaryPolygons);
    }
    return polygonPoints;
  }, [alignToBoundary, extendsOutside, polygonPoints, boundaryPolygons]);

  const meterCount = useMemo(
    () => countMetersInPolygon(meters, effectivePolygon, boundaryPolygons),
    [meters, effectivePolygon, boundaryPolygons]
  );

  const resolvedColor =
    color === "auto"
      ? DMA_COLORS[existingDmaCount % DMA_COLORS.length]
      : color;
  const fillOpacity = transparency / 100;

  const handleSave = async () => {
    setSaving(true);
    // meter_count isn't stored anymore — it's computed live via the
    // dma_enriched view, joining actual Meter.dma_id assignments.
    await supabase.from('dma').insert({
      project_id: projectId,
      name,
      color: resolvedColor,
      transparency: fillOpacity,
      polygon_json: effectivePolygon,
      visible: true,
      sort_order: existingDmaCount,
    });
    setSaving(false);
    onSaved?.();
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    const handleMove = (e) => {
      if (!dragState.current) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      setPos({
        x: Math.max(0, Math.min(clientX - dragState.current.offsetX, window.innerWidth - 100)),
        y: Math.max(0, Math.min(clientY - dragState.current.offsetY, window.innerHeight - 60)),
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

  if (!open) return null;

  return (
    <div
      ref={dragRef}
      className="fixed z-[9999] bg-card border-2 border-primary rounded-xl shadow-2xl flex flex-col"
      style={{
        left: pos.x,
        top: pos.y,
        // Sized to the content, never past the viewport — body scrolls instead.
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
        <p className="flex-1 min-w-0 text-base font-bold text-foreground truncate flex items-center gap-2">
          <Hexagon className="w-5 h-5 text-blue-600 shrink-0" /> {t('dmaConfig.newDma')}
        </p>
        <button
          onClick={() => onOpenChange(false)}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          title={t('dmaConfig.cancel')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <div>
            <Label>{t('dmaConfig.dmaName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              autoFocus
            />
          </div>

          <div>
            <Label className="mb-2 block">{t('dmaConfig.color')}</Label>
            <DmaColorPicker
              value={color}
              onChange={setColor}
              showAuto
              autoLabel={t('dmaConfig.auto')}
              t={t}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>{t('dmaConfig.transparency')}</Label>
              <span className="text-xs text-slate-500">{transparency}%</span>
            </div>
            <Slider
              value={[transparency]}
              onValueChange={(v) => setTransparency(v[0])}
              min={0}
              max={100}
              step={5}
            />
          </div>

          {/* Preview swatch */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
            <div
              className="w-10 h-10 rounded-lg border border-slate-200"
              style={{ backgroundColor: resolvedColor, opacity: fillOpacity }}
            />
            <div>
              <p className="text-xs text-slate-500">{t('dmaConfig.preview')}</p>
              <p className="text-sm font-medium text-slate-700">
                {name || "DMA"}
              </p>
            </div>
          </div>

          {/* Meter count */}
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-lg p-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Gauge className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <p className="text-sm font-bold text-blue-900">
                {t('dmaConfig.metersInDma', { count: meterCount })}
              </p>
              <p className="text-xs text-blue-600">
                {t('dmaConfig.excludesMains')}
              </p>
            </div>
          </div>

          {/* Boundary alignment */}
          {extendsOutside && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  {t('dmaConfig.extendsOutside')}
                </p>
              </div>
              <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {t('dmaConfig.alignToBoundary')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t('dmaConfig.snapVertices')}
                  </p>
                </div>
                <Switch
                  checked={alignToBoundary}
                  onCheckedChange={setAlignToBoundary}
                />
              </div>
            </div>
          )}
        </div>

      </div>

      <div className="flex justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t('dmaConfig.cancel')}
        </Button>
        <Button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="gap-1.5"
        >
          {saving ? t('dmaConfig.saving') : t('dmaConfig.createDma')}
        </Button>
      </div>
    </div>
  );
}