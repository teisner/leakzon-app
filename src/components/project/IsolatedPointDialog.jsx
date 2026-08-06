import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, MapPin, Loader2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export default function IsolatedPointDialog({ open, onOpenChange, valveInfo, dmas, nearestDmas, onAssigned }) {
  const { t } = useLanguage();
  const [dma1Id, setDma1Id] = useState("");
  const [dma2Id, setDma2Id] = useState("");
  const [color, setColor] = useState("#92c141");
  const [saving, setSaving] = useState(false);

  const COLOR_OPTIONS = ["#92c141", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#6b7280"];

  useEffect(() => {
    if (open && nearestDmas) {
      setDma1Id(nearestDmas[0]?.id || "");
      setDma2Id(nearestDmas[1]?.id || "");
      setColor("#92c141");
    }
  }, [open, nearestDmas]);

  const properties = valveInfo?.properties
    ? typeof valveInfo.properties === "string"
      ? JSON.parse(valveInfo.properties)
      : valveInfo.properties
    : {};

  const propEntries = Object.entries(properties).slice(0, 6);

  // Try to detect the valve number/id from common property field names
  const VALVE_NO_KEYS = [
    "valve_no", "valveno", "valve_id", "valveid", "valve_number", "valvenumber",
    "vnum", "v_num", "valvenum", "valve_no_", "valve", "no", "number", "num",
    "id", "fid", "objectid", "gid", "ref", "code", "asset_id", "assetid",
    "facility_id", "facilityid", "equip_id", "equipid",
  ];
  const valveNumber = (() => {
    const keys = Object.keys(properties);
    for (const candidate of VALVE_NO_KEYS) {
      const match = keys.find((k) => k.toLowerCase().replace(/[\s_-]/g, "") === candidate);
      if (match && properties[match] != null && String(properties[match]).trim() !== "") {
        return String(properties[match]);
      }
    }
    return null;
  })();

  const handleConfirm = async () => {
    if (!dma1Id || !dma2Id || dma1Id === dma2Id) return;
    setSaving(true);
    try {
      await onAssigned({
        layer_id: valveInfo.layer_id,
        latitude: valveInfo.latitude,
        longitude: valveInfo.longitude,
        dma1_id: dma1Id,
        dma2_id: dma2Id,
        feature_properties: JSON.stringify(properties),
        color,
      });
      onOpenChange(false);
    } catch {
      // onAssigned already surfaced a toast — keep the dialog open to retry.
    } finally {
      setSaving(false);
    }
  };

  const dma1Name = (dmas || []).find((d) => d.id === dma1Id)?.name || "";
  const dma2Name = (dmas || []).find((d) => d.id === dma2Id)?.name || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-600" />
            {t('dma.assignIsolatedPoint')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('dma.isolatedPointDesc')}
          </p>

          {/* Valve number + coordinates */}
          <div className="flex items-center gap-2 bg-muted rounded-lg p-2.5 flex-wrap">
            {valveNumber && (
              <>
                <span className="text-xs font-semibold text-foreground">#{valveNumber}</span>
                <span className="w-px h-3.5 bg-border" />
              </>
            )}
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-mono text-muted-foreground">
              {valveInfo?.latitude?.toFixed(5)}, {valveInfo?.longitude?.toFixed(5)}
            </span>
          </div>

          {/* Valve properties */}
          {propEntries.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                {t('dma.valveProperties')}
              </p>
              <div className="bg-muted rounded-lg p-2.5 space-y-1">
                {propEntries.map(([key, value]) => (
                  <div key={key} className="flex items-baseline gap-2 text-xs">
                    <span className="text-muted-foreground font-medium shrink-0">{key}:</span>
                    <span className="text-foreground truncate">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nearest DMAs hint */}
          {nearestDmas && nearestDmas.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md px-2.5 py-1.5">
              <span className="font-medium">{t('dma.nearestDmas')}:</span>
              <span>{nearestDmas.map((d) => d.name).join(', ')}</span>
            </div>
          )}

          {/* DMA selectors */}
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block">{t('dma.selectDma1')}</Label>
              <Select value={dma1Id} onValueChange={setDma1Id}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('dma.selectDma1')} />
                </SelectTrigger>
                <SelectContent>
                  {(dmas || []).filter((d) => d.id !== dma2Id).map((dma) => (
                    <SelectItem key={dma.id} value={dma.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dma.color || "#6b7280" }} />
                        {dma.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">{t('dma.selectDma2')}</Label>
              <Select value={dma2Id} onValueChange={setDma2Id}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('dma.selectDma2')} />
                </SelectTrigger>
                <SelectContent>
                  {(dmas || []).filter((d) => d.id !== dma1Id).map((dma) => (
                    <SelectItem key={dma.id} value={dma.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dma.color || "#6b7280" }} />
                        {dma.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {dma1Id && dma2Id && dma1Id === dma2Id && (
            <p className="text-xs text-destructive">{t('dma.dmaMustBeDifferent')}</p>
          )}

          {/* Color picker */}
          <div>
            <Label className="mb-1.5 block">Point Color</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('dma.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!dma1Id || !dma2Id || dma1Id === dma2Id || saving}
            className="gap-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {t('dma.assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}