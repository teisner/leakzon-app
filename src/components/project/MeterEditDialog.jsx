import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ensureMainMetersLayer } from "@/lib/mainMeterLayer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/api/supabaseClient";
import { Loader2, Link2, Unlink, MapPin, ChevronUp, ChevronDown } from "lucide-react";
import MeterLocationPicker from "@/components/project/MeterLocationPicker";
import { useLanguage } from "@/lib/i18n";

export default function MeterEditDialog({ open, onOpenChange, meter, onSaved, dmas, projectId, onPinpoint, project }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    uid: "",
    endpoint_id: "",
    payer_name: "",
    address: "",
    provider: "",
    latitude: "",
    longitude: "",
    altitude: "",
    diameter: "",
    is_main: false,
  });
  const [linkedDmaId, setLinkedDmaId] = useState("");
  const [originalDmaId, setOriginalDmaId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    if (meter) {
      setForm({
        uid: meter.uid || "",
        endpoint_id: meter.endpoint_id || "",
        payer_name: meter.payer_name || "",
        address: meter.address || "",
        provider: meter.provider || "",
        latitude: meter.latitude ?? "",
        longitude: meter.longitude ?? "",
        altitude: meter.altitude ?? "",
        diameter: meter.diameter ?? "",
        is_main: !!meter.is_main,
        });
      // Find DMA currently linked to this meter
      const linkedDma = (dmas || []).find((d) => d.main_meter_id === meter.id);
      const dmaId = linkedDma?.id || "";
      setLinkedDmaId(dmaId);
      setOriginalDmaId(dmaId);
      setError("");
    }
  }, [meter, dmas]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!meter) return;
    setSaving(true);
    setError("");
    try {
      const updates = {
        uid: form.uid || null,
        endpoint_id: form.endpoint_id || null,
        payer_name: form.payer_name || null,
        address: form.address || null,
        provider: form.provider || null,
        is_main: form.is_main,
      };
      // Only update lat/lng if provided as valid numbers
      const lat = form.latitude === "" ? null : parseFloat(form.latitude);
      const lng = form.longitude === "" ? null : parseFloat(form.longitude);
      if (form.latitude !== "" && (isNaN(lat) || lat < -90 || lat > 90)) {
        setError("Latitude must be between -90 and 90");
        setSaving(false);
        return;
      }
      if (form.longitude !== "" && (isNaN(lng) || lng < -180 || lng > 180)) {
        setError("Longitude must be between -180 and 180");
        setSaving(false);
        return;
      }
      if (form.latitude !== "") updates.latitude = lat;
      if (form.longitude !== "") updates.longitude = lng;
      const alt = form.altitude === "" ? null : parseFloat(form.altitude);
      if (form.altitude !== "" && !isNaN(alt)) updates.altitude = alt;
      const dia = form.diameter === "" ? null : parseFloat(form.diameter);
      if (form.diameter !== "" && !isNaN(dia)) updates.diameter = dia;

      // When promoting a sub-meter to main, assign it to the main-meter layer
      if (!meter.is_main && form.is_main && projectId) {
        updates.layer_id = await ensureMainMetersLayer(projectId);
      }

      await supabase.from('meter').update(updates).eq('id', meter.id);

      // Handle DMA linking (only for main meters)
      if (form.is_main && linkedDmaId !== originalDmaId) {
        // Unlink previous DMA if any
        if (originalDmaId) {
          await supabase.from('dma').update({ main_meter_id: null }).eq('id', originalDmaId);
        }
        // Link new DMA — unlink any other DMA that was pointing to a different main meter
        if (linkedDmaId) {
          await supabase.from('dma').update({ main_meter_id: meter.id }).eq('id', linkedDmaId);
        }
        // Keep the meter's own dma_id in step: it drives the DMA column in the
        // meter table and the DMA assignment in the LeakZon export.
        await supabase.from('meter').update({ dma_id: linkedDmaId || null }).eq('id', meter.id);
      }

      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Failed to update meter");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={showMap ? "max-w-2xl" : "max-w-md"}>
        <DialogHeader>
          <DialogTitle>{t('meterEdit.title', { uid: meter?.uid })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="uid">{t('meterEdit.uid')}</Label>
            <Input
              id="uid"
              value={form.uid}
              onChange={(e) => handleChange("uid", e.target.value)}
              placeholder={t('meterEdit.uidPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="endpoint_id">{t('meterEdit.endpointId')}</Label>
            <Input
              id="endpoint_id"
              value={form.endpoint_id}
              onChange={(e) => handleChange("endpoint_id", e.target.value)}
              placeholder={t('meterEdit.endpointPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payer_name">{t('meterEdit.accountName')}</Label>
            <Input
              id="payer_name"
              value={form.payer_name}
              onChange={(e) => handleChange("payer_name", e.target.value)}
              placeholder={t('meterEdit.accountPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address">{t('meterEdit.address')}</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => handleChange("address", e.target.value)}
              placeholder={t('meterEdit.addressPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="provider">{t('meterEdit.provider')}</Label>
            <Input
              id="provider"
              value={form.provider}
              onChange={(e) => handleChange("provider", e.target.value)}
              placeholder={t('meterEdit.providerPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="latitude">{t('meterEdit.latitude')}</Label>
              <Input
                id="latitude"
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => handleChange("latitude", e.target.value)}
                placeholder="e.g. 32.0853"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="longitude">{t('meterEdit.longitude')}</Label>
              <Input
                id="longitude"
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => handleChange("longitude", e.target.value)}
                placeholder="e.g. 34.7818"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="altitude">{t('meterEdit.altitude')}</Label>
              <Input
                id="altitude"
                type="number"
                step="any"
                value={form.altitude}
                onChange={(e) => handleChange("altitude", e.target.value)}
                placeholder="e.g. 120"
              />
            </div>
          </div>

          {/* Pick on Map toggle */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 w-full"
            onClick={() => setShowMap((v) => !v)}
          >
            {showMap ? <ChevronUp className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
            {showMap ? t('meterEdit.hideMap') : t('meterEdit.pickOnMap')}
          </Button>

          {/* Inline map picker — drag marker or search address */}
          {showMap && (
            <MeterLocationPicker
              latitude={form.latitude !== "" ? parseFloat(form.latitude) : null}
              longitude={form.longitude !== "" ? parseFloat(form.longitude) : null}
              defaultCenter={project?.latitude != null && project?.longitude != null ? [project.latitude, project.longitude] : undefined}
              onChange={(lat, lng) => {
                handleChange("latitude", String(lat));
                handleChange("longitude", String(lng));
              }}
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="diameter">{t('meterEdit.diameter')}</Label>
            <Input
              id="diameter"
              type="number"
              step="any"
              value={form.diameter}
              onChange={(e) => handleChange("diameter", e.target.value)}
              placeholder="e.g. 25"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('meterEdit.meterType')}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={form.is_main ? "default" : "outline"}
                size="sm"
                onClick={() => handleChange("is_main", true)}
                className="flex-1"
              >
                {t('meterEdit.main')}
                </Button>
                <Button
                type="button"
                variant={!form.is_main ? "default" : "outline"}
                size="sm"
                onClick={() => handleChange("is_main", false)}
                className="flex-1"
                >
                {t('meterEdit.sub')}
              </Button>
            </div>
          </div>

          {form.is_main && (dmas || []).length > 0 && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" /> {t('meterEdit.linkedDma')}
              </Label>
              <Select value={linkedDmaId || "none"} onValueChange={(v) => setLinkedDmaId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t('meterEdit.selectDma')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Unlink className="w-3.5 h-3.5" /> {t('meterEdit.noDmaLinked')}
                    </span>
                  </SelectItem>
                  {dmas.map((dma) => (
                    <SelectItem key={dma.id} value={dma.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: dma.color }} />
                        {dma.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          {t('meterEdit.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          {t('meterEdit.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}