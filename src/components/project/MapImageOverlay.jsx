import React, { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { uploadFile } from "@/api/storageClient";
import { Scissors, Check, X, Loader2 } from "lucide-react";

const CORNERS = [
  { key: "nw", latKey: "north", lngKey: "west" },
  { key: "ne", latKey: "north", lngKey: "east" },
  { key: "sw", latKey: "south", lngKey: "west" },
  { key: "se", latKey: "south", lngKey: "east" },
];

const cornerIcon = L.divIcon({
  className: "",
  html: '<div style="width:16px;height:16px;background:#3b82f6;border:2px solid white;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.6);cursor:grab;"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const cropCornerIcon = L.divIcon({
  className: "",
  html: '<div style="width:16px;height:16px;background:#f59e0b;border:2px solid white;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.6);cursor:crosshair;"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

/**
 * Renders a single PNG image overlay on the Leaflet map.
 * - `editing`: four draggable blue corners to resize / reposition.
 * - `cropping`: amber rectangle with draggable corners to select a region;
 *   an "Apply" button crops the image via canvas and uploads the result.
 */
export default function MapImageOverlay({ overlay, editing, cropping, onBoundsChange, onCropApplied, onCropCancel }) {
  const map = useMap();
  const imgLayerRef = useRef(null);
  const markersRef = useRef({});
  const liveBoundsRef = useRef(null);

  // Crop refs
  const cropRectRef = useRef(null);
  const cropMarkersRef = useRef({});
  const liveCropBoundsRef = useRef(null);
  const [cropping_, setCropping_] = useState(false);

  const { file_url, bounds, opacity, visible } = overlay;

  // Create / update / remove the image layer
  useEffect(() => {
    if (!visible || !bounds || bounds.north == null) {
      if (imgLayerRef.current) {
        map.removeLayer(imgLayerRef.current);
        imgLayerRef.current = null;
      }
      return;
    }
    const llBounds = [[bounds.south, bounds.west], [bounds.north, bounds.east]];
    if (imgLayerRef.current) {
      imgLayerRef.current.setBounds(llBounds);
      imgLayerRef.current.setOpacity(opacity);
    } else {
      imgLayerRef.current = L.imageOverlay(file_url, llBounds, {
        opacity,
        interactive: false,
      }).addTo(map);
    }
    return () => {
      if (imgLayerRef.current) {
        map.removeLayer(imgLayerRef.current);
        imgLayerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file_url, bounds?.north, bounds?.south, bounds?.east, bounds?.west, opacity, visible, map]);

  // Corner markers for interactive editing (reposition / resize)
  useEffect(() => {
    Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
    markersRef.current = {};

    if (!editing || !bounds || bounds.north == null) return;
    liveBoundsRef.current = { ...bounds };

    CORNERS.forEach((c) => {
      const marker = L.marker([bounds[c.latKey], bounds[c.lngKey]], {
        draggable: true,
        icon: cornerIcon,
        zIndexOffset: 1000,
      }).addTo(map);

      marker.on("drag", () => {
        const pos = marker.getLatLng();
        liveBoundsRef.current[c.latKey] = pos.lat;
        liveBoundsRef.current[c.lngKey] = pos.lng;

        const lb = liveBoundsRef.current;
        if (imgLayerRef.current) {
          imgLayerRef.current.setBounds([[lb.south, lb.west], [lb.north, lb.east]]);
        }

        Object.entries(markersRef.current).forEach(([key, m]) => {
          if (key === c.key) return;
          const corner = CORNERS.find((co) => co.key === key);
          const cur = m.getLatLng();
          const newLat = corner.latKey === c.latKey ? pos.lat : cur.lat;
          const newLng = corner.lngKey === c.lngKey ? pos.lng : cur.lng;
          m.setLatLng([newLat, newLng]);
        });
      });

      marker.on("dragend", () => {
        onBoundsChange?.(overlay, liveBoundsRef.current);
      });

      markersRef.current[c.key] = marker;
    });

    return () => {
      Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
      markersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, bounds?.north, bounds?.south, bounds?.east, bounds?.west, map]);

  // Crop selection rectangle with draggable corners
  useEffect(() => {
    if (cropRectRef.current) { map.removeLayer(cropRectRef.current); cropRectRef.current = null; }
    Object.values(cropMarkersRef.current).forEach((m) => map.removeLayer(m));
    cropMarkersRef.current = {};

    if (!cropping || !bounds || bounds.north == null) return;
    liveCropBoundsRef.current = { ...bounds };
    setCropping_(true);

    cropRectRef.current = L.rectangle(
      [[bounds.south, bounds.west], [bounds.north, bounds.east]],
      { color: "#f59e0b", weight: 2, dashArray: "6,3", fillColor: "#f59e0b", fillOpacity: 0.08 }
    ).addTo(map);

    CORNERS.forEach((c) => {
      const marker = L.marker([bounds[c.latKey], bounds[c.lngKey]], {
        draggable: true,
        icon: cropCornerIcon,
        zIndexOffset: 1100,
      }).addTo(map);

      marker.on("drag", () => {
        const pos = marker.getLatLng();
        liveCropBoundsRef.current[c.latKey] = pos.lat;
        liveCropBoundsRef.current[c.lngKey] = pos.lng;

        const lb = liveCropBoundsRef.current;
        if (cropRectRef.current) {
          cropRectRef.current.setBounds([[lb.south, lb.west], [lb.north, lb.east]]);
        }

        Object.entries(cropMarkersRef.current).forEach(([key, m]) => {
          if (key === c.key) return;
          const corner = CORNERS.find((co) => co.key === key);
          const cur = m.getLatLng();
          const newLat = corner.latKey === c.latKey ? pos.lat : cur.lat;
          const newLng = corner.lngKey === c.lngKey ? pos.lng : cur.lng;
          m.setLatLng([newLat, newLng]);
        });
      });

      cropMarkersRef.current[c.key] = marker;
    });

    return () => {
      if (cropRectRef.current) { map.removeLayer(cropRectRef.current); cropRectRef.current = null; }
      Object.values(cropMarkersRef.current).forEach((m) => map.removeLayer(m));
      cropMarkersRef.current = {};
      setCropping_(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropping, bounds?.north, bounds?.south, bounds?.east, bounds?.west, map]);

  const handleApplyCrop = async () => {
    const cb = liveCropBoundsRef.current;
    if (!cb || !bounds) return;
    setCropping_(false); // hide toolbar immediately

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = file_url;
      await img.decode();

      const x = Math.round(((cb.west - bounds.west) / (bounds.east - bounds.west)) * img.naturalWidth);
      const y = Math.round(((bounds.north - cb.north) / (bounds.north - bounds.south)) * img.naturalHeight);
      const w = Math.round(((cb.east - cb.west) / (bounds.east - bounds.west)) * img.naturalWidth);
      const h = Math.round(((cb.north - cb.south) / (bounds.north - bounds.south)) * img.naturalHeight);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const file = new File([blob], `${overlay.name}_cropped.png`, { type: "image/png" });
      const { file_url: newUrl } = await uploadFile({ file });
      onCropApplied?.(overlay, newUrl, cb);
    } catch (err) {
      console.error("Crop failed:", err);
      onCropCancel?.();
    }
  };

  if (!cropping_) return null;

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-2 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border px-3 py-2 pointer-events-auto">
      <Scissors className="w-4 h-4 text-amber-500" />
      <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Drag amber corners to select crop area</span>
      <div className="w-px h-5 bg-border" />
      <button
        onClick={handleApplyCrop}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 whitespace-nowrap"
      >
        <Check className="w-3.5 h-3.5" /> Apply Crop
      </button>
      <button
        onClick={() => onCropCancel?.()}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted whitespace-nowrap"
      >
        <X className="w-3.5 h-3.5" /> Cancel
      </button>
    </div>
  );
}