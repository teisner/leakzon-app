import React from "react";
import { Check, X, Link2, Unlink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/lib/i18n";
import DmaColorPicker from "@/components/project/DmaColorPicker";

// Floating panel for editing DMA properties (name, color, transparency) alongside shape editing on the map.
export default function DmaEditPanel({ name, color, transparency, pointCount, onNameChange, onColorChange, onTransparencyChange, onSave, onCancel, mainMeters, mainMeterId, onMainMeterChange }) {
  const { t } = useLanguage();
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border px-4 py-3 w-[340px] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{t('dmaEdit.title', { count: pointCount })}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onSave}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90"
          >
            <Check className="w-3.5 h-3.5" /> {t('dmaEdit.save')}
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="w-3.5 h-3.5" /> {t('dmaEdit.cancel')}
          </button>
        </div>
      </div>

      <div>
        <Label className="text-xs">{t('dmaEdit.dmaName')}</Label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="h-8 text-sm mt-1"
          autoFocus
        />
      </div>

      <div>
        <Label className="text-xs mb-1.5 block">{t('dmaEdit.color')}</Label>
        <DmaColorPicker value={color} onChange={onColorChange} t={t} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">{t('dmaEdit.transparency')}</Label>
          <span className="text-xs text-muted-foreground">{transparency}%</span>
        </div>
        <Slider
          value={[transparency]}
          onValueChange={(v) => onTransparencyChange(v[0])}
          min={0}
          max={100}
          step={5}
        />
      </div>

      {mainMeters && mainMeters.length > 0 && (
        <div>
          <Label className="text-xs flex items-center gap-1.5 mb-1">
            <Link2 className="w-3.5 h-3.5" /> {t('dmaEdit.linkedMainMeter')}
          </Label>
          <Select value={mainMeterId || "none"} onValueChange={(v) => onMainMeterChange(v === "none" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={t('dmaEdit.selectMainMeter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Unlink className="w-3 h-3" /> {t('dmaEdit.noMainMeter')}
                </span>
              </SelectItem>
              {mainMeters.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.uid}{m.payer_name ? ` — ${m.payer_name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}