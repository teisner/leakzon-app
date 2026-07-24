import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { toCanvas } from "html-to-image";
import JSZip from "jszip";
import { Camera, X, Loader2, Download, MousePointer2, LayoutGrid } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/use-toast";

function sanitizeFileName(name) {
  return (name || "")
    .replace(/[^a-zA-Z0-9\-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function getTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function playShutterSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.type = "square";
    o1.frequency.setValueAtTime(2400, now);
    g1.gain.setValueAtTime(0.12, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
    o1.connect(g1).connect(ctx.destination);
    o1.start(now);
    o1.stop(now + 0.02);

    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = "sawtooth";
    o2.frequency.setValueAtTime(1200, now + 0.04);
    o2.frequency.exponentialRampToValueAtTime(500, now + 0.08);
    g2.gain.setValueAtTime(0.2, now + 0.04);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    o2.connect(g2).connect(ctx.destination);
    o2.start(now + 0.04);
    o2.stop(now + 0.09);

    const o3 = ctx.createOscillator();
    const g3 = ctx.createGain();
    o3.type = "square";
    o3.frequency.setValueAtTime(2000, now + 0.11);
    g3.gain.setValueAtTime(0.1, now + 0.11);
    g3.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    o3.connect(g3).connect(ctx.destination);
    o3.start(now + 0.11);
    o3.stop(now + 0.13);

    o3.onended = () => { try { ctx.close(); } catch {} };
  } catch {}
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait for Leaflet map tiles to finish loading (or timeout)
function waitForTilesLoaded(map, timeout = 6000) {
  return new Promise((resolve) => {
    if (!map) return resolve();
    const container = map.getContainer();
    const start = Date.now();
    const check = () => {
      const tiles = container.querySelectorAll(".leaflet-tile");
      if (tiles.length === 0) return resolve();
      const allLoaded = Array.from(tiles).every((t) => t.complete && t.naturalWidth > 0);
      if (allLoaded || Date.now() - start > timeout) {
        resolve();
      } else {
        setTimeout(check, 150);
      }
    };
    check();
  });
}

export default function MapScreenshot({ mapRef, dmas, project, targetRef, onToggleFocusDma }) {
  const [captureMode, setCaptureMode] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState(null);
  const [suggestedName, setSuggestedName] = useState("");
  const [fileName, setFileName] = useState("");
  const [autoProgress, setAutoProgress] = useState(null);
  const startRef = useRef(null);

  const getVisibleDmaNames = useCallback(() => {
    if (!mapRef?.current || !dmas?.length) return [];
    const bounds = mapRef.current.getBounds();
    const n = bounds.getNorth(), s = bounds.getSouth(), e = bounds.getEast(), w = bounds.getWest();
    return dmas
      .filter((dma) => {
        if (dma.visible === false) return false;
        try {
          const poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
          if (!Array.isArray(poly) || poly.length === 0) return false;
          return poly.some(([lat, lng]) => lat <= n && lat >= s && lng <= e && lng >= w);
        } catch { return false; }
      })
      .map((d) => d.name);
  }, [mapRef, dmas]);

  useEffect(() => {
    if (!captureMode) return;
    const handleKey = (e) => {
      if (e.key === "Escape") {
        setCaptureMode(false);
        setSelecting(false);
        setSelectionRect(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [captureMode]);

  const handleStart = () => {
    setCaptureMode(true);
    setSelectionRect(null);
    setScreenshotUrl(null);
  };

  const handleMouseDown = (e) => {
    if (capturing) return;
    setSelecting(true);
    startRef.current = { x: e.clientX, y: e.clientY };
    setSelectionRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
  };

  const handleMouseMove = (e) => {
    if (!selecting || !startRef.current) return;
    const s = startRef.current;
    setSelectionRect({
      x: Math.min(s.x, e.clientX),
      y: Math.min(s.y, e.clientY),
      w: Math.abs(e.clientX - s.x),
      h: Math.abs(e.clientY - s.y),
    });
  };

  const handleMouseUp = async () => {
    if (!selecting) return;
    setSelecting(false);
    if (!selectionRect || selectionRect.w < 10 || selectionRect.h < 10) {
      setCaptureMode(false);
      setSelectionRect(null);
      return;
    }
    await doCapture(selectionRect);
  };

  const captureFullMap = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return null;
    // Capture the Leaflet map container only — excludes legend, toolbars, and all UI overlays
    const container = map.getContainer();
    if (!container) return null;
    // Wait for tiles to finish loading so the capture is complete
    await waitForTilesLoaded(map);
    // Small extra delay for SVG/vector layers (DMA polygons, water lines) to settle
    await wait(300);
    const pixelRatio = 2;
    const canvas = await toCanvas(container, {
      pixelRatio,
      backgroundColor: null,
      cacheBust: false,
      skipFonts: true,
      // Exclude Leaflet's own UI chrome (attribution, zoom, etc.)
      filter: (node) => {
        if (node.classList && (node.classList.contains("leaflet-control-container") || node.classList.contains("leaflet-control-attribution"))) {
          return false;
        }
        return true;
      },
    });
    return canvas.toDataURL("image/png");
  }, [mapRef]);

  const doCapture = async (sel) => {
    setCapturing(true);
    setCaptureMode(false);
    try {
      const target = targetRef?.current || mapRef.current?.getContainer()?.parentElement;
      if (!target) {
        toast({ title: "Screenshot failed", description: "Map not ready for capture.", variant: "destructive" });
        return;
      }
      const targetRect = target.getBoundingClientRect();

      const capX = Math.max(0, sel.x - targetRect.left);
      const capY = Math.max(0, sel.y - targetRect.top);
      const capW = Math.min(sel.w, targetRect.width - capX);
      const capH = Math.min(sel.h, targetRect.height - capY);

      if (capW < 5 || capH < 5) {
        toast({ title: "No map content in selection", description: "Drag over the map area to capture.", variant: "destructive" });
        return;
      }

      const pixelRatio = window.devicePixelRatio || 2;
      const canvas = await toCanvas(target, {
        pixelRatio,
        backgroundColor: null,
        cacheBust: false,
        skipFonts: true,
      });

      const sx = capX * pixelRatio;
      const sy = capY * pixelRatio;
      const sw = capW * pixelRatio;
      const sh = capH * pixelRatio;
      const cropped = document.createElement("canvas");
      cropped.width = sw;
      cropped.height = sh;
      const ctx = cropped.getContext("2d");
      ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

      let dataUrl;
      try {
        dataUrl = cropped.toDataURL("image/png");
      } catch {
        toast({
          title: "Screenshot blocked",
          description: "Map tiles don't support capture. Try switching map source (e.g. OSM).",
          variant: "destructive",
        });
        return;
      }

      playShutterSound();

      const dmaNames = getVisibleDmaNames();
      const dateStr = new Date().toISOString().split("T")[0];
      let suggested;
      if (dmaNames.length > 0) {
        const names = dmaNames.slice(0, 4).map(sanitizeFileName).join("_");
        const suffix = dmaNames.length > 4 ? "_and_more" : "";
        suggested = `${names}${suffix}_${dateStr}.png`;
      } else {
        suggested = `${sanitizeFileName(project?.name || "Map")}_${dateStr}.png`;
      }

      setSuggestedName(suggested);
      setFileName(suggested);
      setScreenshotUrl(dataUrl);
      setShowDialog(true);
    } catch (err) {
      toast({ title: "Screenshot failed", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setCapturing(false);
      setSelectionRect(null);
    }
  };

  const runAutoCapture = useCallback(async () => {
    const visibleDmas = (dmas || []).filter((d) => d.visible !== false && d.polygon);
    if (visibleDmas.length === 0) {
      toast({ title: "No DMAs to capture", description: "Create DMAs with polygons first.", variant: "destructive" });
      return;
    }

    const total = visibleDmas.length + 1;
    const timestamp = getTimestamp();
    const zip = new JSZip();
    let captured = 0;

    setAutoProgress({ current: 0, total, dmaName: "", phase: "Starting..." });
    let failedDmas = [];

    // Clear any existing focus
    onToggleFocusDma?.(null, true);
    await wait(1000);

    // Capture each DMA individually
    for (let i = 0; i < visibleDmas.length; i++) {
      const dma = visibleDmas[i];

      setAutoProgress({ current: i, total, dmaName: dma.name, phase: "Focusing DMA..." });
      onToggleFocusDma?.(dma.id);
      // Wait for map to pan/zoom and tiles to begin loading
      await wait(1500);

      setAutoProgress({ current: i, total, dmaName: dma.name, phase: "Capturing DMA..." });
      try {
        const dataUrl = await captureFullMap();
        if (dataUrl) {
          const fn = `DMA_${sanitizeFileName(dma.name)}_Screenshot_${timestamp}.png`;
          zip.file(fn, dataUrl.split(",")[1], { base64: true });
          captured++;
        } else {
          failedDmas.push(dma.name);
        }
      } catch (err) {
        console.error(`Capture failed for ${dma.name}:`, err);
        failedDmas.push(dma.name);
      }

      onToggleFocusDma?.(dma.id);
      await wait(500);
    }

    // Capture all DMAs together
    setAutoProgress({ current: visibleDmas.length, total, dmaName: "All DMAs", phase: "Capturing all DMAs..." });

    const allPoints = visibleDmas.flatMap((d) => {
      try {
        const poly = typeof d.polygon === "string" ? JSON.parse(d.polygon) : d.polygon;
        return Array.isArray(poly) ? poly : [];
      } catch { return []; }
    });

    if (allPoints.length > 0 && mapRef?.current) {
      const lats = allPoints.map((p) => p[0]);
      const lngs = allPoints.map((p) => p[1]);
      mapRef.current.fitBounds(
        [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
        { padding: [60, 60], animate: false }
      );
      // Wait longer for all-DMA view — more tiles to load
      await wait(2000);

      try {
        const dataUrl = await captureFullMap();
        if (dataUrl) {
          const fn = `DMA_All_Screenshot_${timestamp}.png`;
          zip.file(fn, dataUrl.split(",")[1], { base64: true });
          captured++;
        }
      } catch (err) {
        console.error("Capture failed for all DMAs:", err);
      }
    }

    // Generate and download ZIP
    setAutoProgress({ current: total, total, dmaName: "", phase: "Creating ZIP file..." });
    try {
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `DMA_Captures_${timestamp}.zip`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      playShutterSound();
      const desc = failedDmas.length > 0
        ? `${captured} screenshots saved. ${failedDmas.length} failed: ${failedDmas.slice(0, 3).join(", ")}${failedDmas.length > 3 ? "..." : ""}`
        : `${captured} screenshots saved to ZIP.`;
      toast({ title: "Auto-capture complete", description: desc });
    } catch (err) {
      toast({ title: "ZIP creation failed", description: err?.message, variant: "destructive" });
    }

    setAutoProgress(null);
  }, [dmas, mapRef, onToggleFocusDma, captureFullMap]);

  const handleDownload = () => {
    if (!screenshotUrl) return;
    let name = fileName.trim() || suggestedName;
    if (!name.endsWith(".png")) name += ".png";
    const link = document.createElement("a");
    link.download = name;
    link.href = screenshotUrl;
    link.click();
    setShowDialog(false);
    setScreenshotUrl(null);
  };

  const hasDmas = (dmas || []).some((d) => d.visible !== false && d.polygon);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            disabled={capturing || !!autoProgress}
            className={`flex items-center justify-center w-9 h-9 border-l border-border ${captureMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"} disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Capture screenshot"
          >
            {capturing || autoProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="min-w-[180px]">
          <DropdownMenuItem onClick={handleStart}>
            <MousePointer2 className="w-4 h-4 mr-2" /> Select Area
          </DropdownMenuItem>
          <DropdownMenuItem onClick={runAutoCapture} disabled={!hasDmas || !onToggleFocusDma}>
            <LayoutGrid className="w-4 h-4 mr-2" /> Auto Capture (All DMAs)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {captureMode && createPortal(
        <div
          className="fixed inset-0 z-[10000] cursor-crosshair"
          style={{ background: "rgba(0,0,0,0.35)" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {!selecting && !selectionRect && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border px-4 py-3 text-center pointer-events-none">
              <p className="text-sm font-medium text-foreground">Drag to select capture area</p>
              <p className="text-xs text-muted-foreground mt-1">Release to capture · Esc to cancel</p>
            </div>
          )}
          {selectionRect && (
            <div
              className="absolute border-2 border-primary"
              style={{
                left: selectionRect.x,
                top: selectionRect.y,
                width: selectionRect.w,
                height: selectionRect.h,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
              }}
            />
          )}
          {selecting && selectionRect && (
            <div
              className="absolute bg-card/95 backdrop-blur rounded-md shadow border border-border px-2 py-1 text-xs font-medium text-foreground pointer-events-none"
              style={{ left: selectionRect.x + selectionRect.w + 8, top: selectionRect.y }}
            >
              {Math.round(selectionRect.w)} × {Math.round(selectionRect.h)}
            </div>
          )}
          <button
            onClick={() => { setCaptureMode(false); setSelecting(false); setSelectionRect(null); }}
            className="absolute top-4 right-4 flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-red-500 hover:bg-red-600"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>,
        document.body
      )}

      {/* Auto-capture progress modal */}
      {autoProgress && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-xl shadow-2xl border border-border p-6 w-80 space-y-4">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold text-foreground">Auto-Capturing DMAs</h3>
            </div>
            <Progress value={Math.round((autoProgress.current / autoProgress.total) * 100)} className="w-full" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">{autoProgress.phase}</p>
              {autoProgress.dmaName && (
                <p className="text-xs text-muted-foreground">
                  {autoProgress.dmaName} ({autoProgress.current + 1}/{autoProgress.total})
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              Save Screenshot
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {screenshotUrl && (
              <div className="rounded-lg overflow-hidden border border-border max-h-48 bg-muted">
                <img src={screenshotUrl} alt="Screenshot preview" className="w-full object-contain" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">File name</Label>
              <Input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleDownload(); }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleDownload}>
              <Download className="w-4 h-4" /> Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}