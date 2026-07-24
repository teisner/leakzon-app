import React, { useState, useRef } from "react";
import { Eye, EyeOff, Trash2, Upload, ImageIcon, Loader2, Move, Check, X, Crop, RotateCw } from "lucide-react";
import { uploadFile } from "@/api/storageClient";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pdfToPngFile } from "@/lib/pdfToImage";
import { compressImageFile } from "@/lib/imageCompress";

export default function ImageOverlayPanel({ projectId, overlays, editingOverlayId, onOverlaysChanged, onToggleEdit, croppingOverlayId, onToggleCrop, mapRef, locked }) {
  const [uploading, setUploading] = useState(false);
  const [opacityValues, setOpacityValues] = useState({});
  const [rotatingIds, setRotatingIds] = useState(new Set());
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    try {
      // If PDF, convert first page to PNG so all overlay capabilities work
      let fileToUpload = file;
      let displayName = file.name;
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        fileToUpload = await pdfToPngFile(file);
        displayName = file.name.replace(/\.pdf$/i, "");
      } else {
        displayName = file.name.replace(/\.(png|jpe?g)$/i, "");
      }

      // Downscale/compress large images before upload so it's fast (the raw
      // site plans/scans are often very large). No visible difference on a
      // map overlay.
      fileToUpload = await compressImageFile(fileToUpload);

      const { file_url } = await uploadFile({ file: fileToUpload });

      // Default bounds = current map view
      let bounds = null;
      if (mapRef?.current) {
        const b = mapRef.current.getBounds();
        bounds = {
          north: b.getNorth(),
          south: b.getSouth(),
          east: b.getEast(),
          west: b.getWest(),
        };
      }

      await supabase.from('image_overlay').insert({
        project_id: projectId,
        name: displayName.slice(0, 60),
        file_url,
        bounds,
        opacity: 0.7,
        visible: true,
      });
      onOverlaysChanged?.();
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload file: " + (err?.message || err));
    } finally {
      setUploading(false);
    }
  };

  const handleToggleVisibility = async (overlay) => {
    await supabase.from('image_overlay').update({ visible: !overlay.visible }).eq('id', overlay.id);
    onOverlaysChanged?.();
  };

  const handleDelete = async (overlay) => {
    await supabase.from('image_overlay').delete().eq('id', overlay.id);
    if (editingOverlayId === overlay.id) onToggleEdit?.(null);
    onOverlaysChanged?.();
  };

  const handleOpacityChange = async (overlay, value) => {
    setOpacityValues((p) => ({ ...p, [overlay.id]: value }));
    await supabase.from('image_overlay').update({ opacity: value }).eq('id', overlay.id);
    onOverlaysChanged?.();
  };

  const handleRename = async (overlay, name) => {
    if (!name.trim()) return;
    await supabase.from('image_overlay').update({ name: name.trim() }).eq('id', overlay.id);
    onOverlaysChanged?.();
  };

  const handleRotate = async (overlay) => {
    setRotatingIds((prev) => new Set(prev).add(overlay.id));
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = overlay.file_url;
      await img.decode();

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext("2d");
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const file = new File([blob], `${overlay.name}_rotated.png`, { type: "image/png" });
      const { file_url: newUrl } = await uploadFile({ file });
      await supabase.from('image_overlay').update({ file_url: newUrl }).eq('id', overlay.id);
      onOverlaysChanged?.();
    } catch (err) {
      console.error("Rotate failed:", err);
      alert("Failed to rotate image: " + (err?.message || err));
    } finally {
      setRotatingIds((prev) => {
        const next = new Set(prev);
        next.delete(overlay.id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        onClick={() => fileInputRef.current?.click()}
        variant="outline"
        size="sm"
        className="w-full gap-1.5"
        disabled={locked || uploading}
      >
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        Upload Image / PDF Overlay
      </Button>

      {overlays.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground/70">
          <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No image overlays yet.
          <p className="text-xs mt-1">Upload a scanned PNG or PDF to place it on the map.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {overlays.map((overlay) => {
            const isEditing = editingOverlayId === overlay.id;
            const isCropping = croppingOverlayId === overlay.id;
            const localOpacity = opacityValues[overlay.id] ?? overlay.opacity;
            return (
              <div key={overlay.id} className={`rounded-xl p-3 ${overlay.visible ? "bg-muted" : "bg-muted/50"}`}>
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    defaultValue={overlay.name}
                    key={overlay.id}
                    onBlur={(e) => {
                      if (e.target.value !== overlay.name) handleRename(overlay, e.target.value);
                    }}
                    className="flex-1 min-w-0 bg-transparent text-sm font-medium text-foreground outline-none border-b border-transparent focus:border-primary"
                    disabled={locked}
                  />
                </div>

                <div className="flex items-center gap-1 mt-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-blue-600"
                    onClick={() => onToggleEdit?.(isEditing ? null : overlay.id)}
                    title={isEditing ? "Finish adjusting" : "Adjust position & size"}
                    disabled={locked}
                  >
                    {isEditing ? <Check className="w-3.5 h-3.5" /> : <Move className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 text-purple-600 ${rotatingIds.has(overlay.id) ? "opacity-50" : ""}`}
                    onClick={() => handleRotate(overlay)}
                    title="Rotate 90° clockwise"
                    disabled={locked || rotatingIds.has(overlay.id)}
                  >
                    {rotatingIds.has(overlay.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${isCropping ? "text-amber-500 bg-amber-500/10" : "text-amber-600"}`}
                    onClick={() => onToggleCrop?.(isCropping ? null : overlay.id)}
                    title="Crop image"
                    disabled={locked}
                  >
                    <Crop className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => handleToggleVisibility(overlay)}
                    title={overlay.visible ? "Hide" : "Show"}
                  >
                    {overlay.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 ml-auto text-red-500"
                    onClick={() => handleDelete(overlay)}
                    title="Delete overlay"
                    disabled={locked}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {overlay.visible && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground shrink-0">Transparency</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={localOpacity}
                      onChange={(e) => handleOpacityChange(overlay, parseFloat(e.target.value))}
                      className="flex-1 accent-primary h-1"
                    />
                    <span className="text-[10px] font-medium text-muted-foreground w-8 text-right">
                      {Math.round(localOpacity * 100)}%
                    </span>
                  </div>
                )}

                {isEditing && (
                  <div className="mt-2 px-2 py-1.5 bg-blue-500/10 rounded-md">
                    <p className="text-[10px] text-blue-600 font-medium">
                      Drag the blue corners on the map to resize / reposition
                    </p>
                  </div>
                )}
                {isCropping && (
                  <div className="mt-2 px-2 py-1.5 bg-amber-500/10 rounded-md">
                    <p className="text-[10px] text-amber-600 font-medium">
                      Drag the amber corners on the map, then click Apply Crop
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}