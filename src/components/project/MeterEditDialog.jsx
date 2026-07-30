import React, { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ensureMainMetersLayer } from "@/lib/mainMeterLayer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/api/supabaseClient";
import { invokeFunction } from "@/api/functionsClient";
import { Loader2, Link2, Unlink, MapPin, ChevronUp, Gauge, GripVertical, X, MessageSquareWarning } from "lucide-react";
import MeterLocationPicker from "@/components/project/MeterLocationPicker";
import { useLanguage } from "@/lib/i18n";
import { recommendLinkedDmaId, recommendSubMeterDmaId } from "@/lib/dmaRecommendation";
import {
  meterIdOf, accountIdOf, setAdditionalId, otherAdditionalIds,
  METER_ID_PATTERNS, ACCOUNT_ID_PATTERNS,
} from "@/lib/meterIds";

// Grouped panel, matching the layer editor. The fields were one flat column of
// eleven inputs, which made an unrelated pair like Diameter and Root read as
// though they belonged together.
function Section({ title, children }) {
  return (
    <section className="rounded-lg border border-border bg-muted/20 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

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
    is_root: false,
    meter_id: "",
    account_id: "",
  });
  const [linkedDmaId, setLinkedDmaId] = useState("");
  const [originalDmaId, setOriginalDmaId] = useState("");
  const [subMeterDmaId, setSubMeterDmaId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [clearingNote, setClearingNote] = useState(false);
  const [noteCleared, setNoteCleared] = useState(false);
  // Floating/draggable panel so the map stays visible and usable while editing
  // a meter — the same interaction as the layer editor.
  const [pos, setPos] = useState(() => ({
    x: Math.max(16, Math.round((window.innerWidth - 460) / 2)),
    y: 72,
  }));
  const dragRef = useRef(null);
  const dragState = useRef(null);

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
        is_root: !!meter.is_root,
        // Not columns — they are label/value pairs inside additional_ids.
        meter_id: meterIdOf(meter),
        account_id: accountIdOf(meter),
        });
      // Find DMA currently linked to this meter
      const linkedDma = (dmas || []).find((d) => d.main_meter_id === meter.id);
      const dmaId = linkedDma?.id || "";
      setLinkedDmaId(dmaId);
      setOriginalDmaId(dmaId);
      setSubMeterDmaId(meter.sub_meter_dma_id || "");
      setNoteCleared(false);
      setError("");
    }
  }, [meter, dmas]);

  // Suggestions only — never applied automatically. The Linked DMA suggestion
  // is the DMA containing the meter (or the closest boundary); the Sub-Meter
  // suggestion is the nearest DMA that isn't already the Linked one, so it
  // updates as soon as the Linked DMA changes.
  const recommendedLinkedId = useMemo(
    () => recommendLinkedDmaId(meter, dmas),
    [meter, dmas]
  );
  const recommendedSubId = useMemo(
    () => recommendSubMeterDmaId(meter, dmas, linkedDmaId),
    [meter, dmas, linkedDmaId]
  );

  const extraIds = otherAdditionalIds(meter);

  const dmaOption = (dma, recommendedId) => (
    <SelectItem key={dma.id} value={dma.id}>
      <span className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: dma.color }} />
        {dma.name}
        {dma.id === recommendedId && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            {t('meterEdit.recommended')}
          </span>
        )}
      </span>
    </SelectItem>
  );

  // Clearing goes through the same endpoint the field uses, so there is one
  // place that owns the note and its timestamp.
  const handleClearFieldNote = async () => {
    setClearingNote(true);
    try {
      const res = await invokeFunction("saveMeterFieldNote", { meter_id: meter.id, note: "" });
      if (res.data?.error) throw new Error(res.data.error);
      setNoteCleared(true);
      onSaved?.();
    } catch (err) {
      setError(err?.message || "Could not clear the note");
    } finally {
      setClearingNote(false);
    }
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!meter) return;
    setSaving(true);
    setError("");
    try {
      // Meter ID and Account ID are stored inside additional_ids, so they are
      // merged into the existing array rather than sent as columns — a column
      // that doesn't exist fails the whole update with PGRST204.
      let additionalIds = setAdditionalId(meter, METER_ID_PATTERNS, "Meter ID", form.meter_id);
      additionalIds = setAdditionalId({ additional_ids: additionalIds }, ACCOUNT_ID_PATTERNS, "Account ID", form.account_id);

      const updates = {
        additional_ids: additionalIds,
        sub_meter_dma_id: form.is_main ? (subMeterDmaId || null) : null,
        is_root: !!form.is_root,
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
      // A coordinate changed here was typed in or dragged on the picker, so it
      // is no longer the imported position — record that, or the meter table
      // keeps presenting a hand-placed location as if it came from the file.
      const movedLat = updates.latitude !== undefined && updates.latitude !== meter.latitude;
      const movedLng = updates.longitude !== undefined && updates.longitude !== meter.longitude;
      if (movedLat || movedLng) updates.location_source = 'manual';
      const alt = form.altitude === "" ? null : parseFloat(form.altitude);
      if (form.altitude !== "" && !isNaN(alt)) updates.altitude = alt;
      const dia = form.diameter === "" ? null : parseFloat(form.diameter);
      if (form.diameter !== "" && !isNaN(dia)) updates.diameter = dia;

      // When promoting a sub-meter to main, assign it to the main-meter layer
      if (!meter.is_main && form.is_main && projectId) {
        updates.layer_id = await ensureMainMetersLayer(projectId);
      }

      // Same rule as everywhere else that writes from the browser: check the
      // error. This closed as though saved when the write was refused.
      const { error: updateError } = await supabase.from('meter').update(updates).eq('id', meter.id);
      if (updateError) throw new Error(updateError.message);

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

  if (!open) return null;

  return (
    <div
      ref={dragRef}
      className="fixed z-[9999] bg-card border-2 border-primary rounded-xl shadow-2xl flex flex-col"
      style={{
        left: pos.x,
        top: pos.y,
        // Widens when the location picker is open, and never exceeds the
        // viewport — the body scrolls instead.
        width: showMap ? "min(calc(100vw - 32px), 680px)" : "min(calc(100vw - 32px), 460px)",
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
          {t('meterEdit.title', { uid: meter?.uid })}
        </p>
        <button
          onClick={() => onOpenChange(false)}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          aria-label={t('meterEdit.cancel')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-y-auto px-4 py-3">
        <div className="space-y-3">

          <Section title={t('meterEdit.sectionIdentity')}>
            <div className="space-y-1.5">
              <Label htmlFor="uid">{t('meterEdit.uid')}</Label>
              <Input
                id="uid"
                value={form.uid}
                onChange={(e) => handleChange("uid", e.target.value)}
                placeholder={t('meterEdit.uidPlaceholder')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="meter_id">{t('meterEdit.meterId')}</Label>
                <Input
                  id="meter_id"
                  value={form.meter_id}
                  onChange={(e) => handleChange("meter_id", e.target.value)}
                  placeholder={t('meterEdit.meterIdPlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account_id">{t('meterEdit.accountId')}</Label>
                <Input
                  id="account_id"
                  value={form.account_id}
                  onChange={(e) => handleChange("account_id", e.target.value)}
                  placeholder={t('meterEdit.accountIdPlaceholder')}
                />
              </div>
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
            {/* Anything else the import carried, so it is visible rather than
                silently attached to the record. */}
            {extraIds.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">{t('meterEdit.otherIds')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {extraIds.map((id) => (
                    <span key={`${id.label}-${id.value}`} className="text-[11px] bg-muted border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                      <span className="font-medium text-foreground">{id.label}:</span> {id.value}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* Reported from the field. Read-only here — it is the technician's
              account of what they found — but the office can clear it once it
              has been dealt with. */}
          {meter?.field_note && !noteCleared && (
            <section className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1.5">
                <MessageSquareWarning className="w-3.5 h-3.5" /> {t('meterEdit.fieldNote')}
              </h3>
              <p className="text-sm text-foreground whitespace-pre-wrap">{meter.field_note}</p>
              {meter.field_note_at && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {new Date(meter.field_note_at).toLocaleString()}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                disabled={clearingNote}
                onClick={handleClearFieldNote}
              >
                {clearingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('meterEdit.clearFieldNote')}
              </Button>
            </section>
          )}

          <Section title={t('meterEdit.sectionCustomer')}>
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
          </Section>

          <Section title={t('meterEdit.sectionLocation')}>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="latitude">{t('meterEdit.latitude')}</Label>
                <Input id="latitude" type="number" step="any" value={form.latitude}
                  onChange={(e) => handleChange("latitude", e.target.value)} placeholder="e.g. 32.0853" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="longitude">{t('meterEdit.longitude')}</Label>
                <Input id="longitude" type="number" step="any" value={form.longitude}
                  onChange={(e) => handleChange("longitude", e.target.value)} placeholder="e.g. 34.7818" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="altitude">{t('meterEdit.altitude')}</Label>
                <Input id="altitude" type="number" step="any" value={form.altitude}
                  onChange={(e) => handleChange("altitude", e.target.value)} placeholder="e.g. 120" />
              </div>
            </div>

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
          </Section>

          <Section title={t('meterEdit.sectionRole')}>
            <div className="space-y-1.5">
              <Label>{t('meterEdit.meterType')}</Label>
              <div className="flex gap-2">
                <Button type="button" variant={form.is_main ? "default" : "outline"} size="sm"
                  onClick={() => handleChange("is_main", true)} className="flex-1">
                  {t('meterEdit.main')}
                </Button>
                <Button type="button" variant={!form.is_main ? "default" : "outline"} size="sm"
                  onClick={() => handleChange("is_main", false)} className="flex-1">
                  {t('meterEdit.sub')}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('meterEdit.root')}</Label>
                <div className="flex gap-4 pt-1.5">
                  {[
                    { value: true, label: t('meterEdit.rootYes') },
                    { value: false, label: t('meterEdit.rootNo') },
                  ].map((opt) => (
                    <label key={String(opt.value)} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input
                        type="radio"
                        name="meter-root"
                        checked={!!form.is_root === opt.value}
                        onChange={() => handleChange("is_root", opt.value)}
                        className="accent-primary w-3.5 h-3.5"
                      />
                      <span className={!!form.is_root === opt.value ? "text-foreground font-medium" : "text-muted-foreground"}>
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="diameter">{t('meterEdit.diameter')}</Label>
                <Input id="diameter" type="number" step="any" value={form.diameter}
                  onChange={(e) => handleChange("diameter", e.target.value)} placeholder="e.g. 25" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('meterEdit.rootHint')}</p>
          </Section>

          {/* DMA links only apply to a main meter — a sub-meter's DMA follows
              from where it sits, so the section is hidden entirely. */}
          {form.is_main && (dmas || []).length > 0 && (
            <Section title={t('meterEdit.sectionDma')}>
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
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Unlink className="w-3.5 h-3.5" /> {t('meterEdit.noDmaLinked')}
                      </span>
                    </SelectItem>
                    {dmas.map((dma) => dmaOption(dma, recommendedLinkedId))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5" /> {t('meterEdit.subMeterIn')}
                </Label>
                <Select value={subMeterDmaId || "none"} onValueChange={(v) => setSubMeterDmaId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t('meterEdit.selectDma')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Unlink className="w-3.5 h-3.5" /> {t('meterEdit.noSubMeterDma')}
                      </span>
                    </SelectItem>
                    {/* A meter cannot supply a DMA and be metered by it, so the
                        Linked DMA is not offered here. */}
                    {dmas
                      .filter((dma) => dma.id !== linkedDmaId)
                      .map((dma) => dmaOption(dma, recommendedSubId))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('meterEdit.subMeterInHint')}</p>
              </div>
            </Section>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          {t('meterEdit.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          {t('meterEdit.saveChanges')}
        </Button>
      </div>
    </div>
  );
}