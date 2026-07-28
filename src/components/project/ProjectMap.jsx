import React, { useState, useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap, Polygon, Marker, Tooltip, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { Satellite, Mountain, Map as MapIcon, Eye, EyeOff, Maximize2, Square, Plus, Minus, Undo2, Check, X, Ruler, Trash2, MapPin, Pencil, RefreshCw, Globe, Sun, ChevronDown, ChevronRight, AlertTriangle, ListOrdered } from "lucide-react";
import { MAP_SOURCES, SOURCE_KEYS } from "@/lib/mapSources";
import { reprojectToWGS84 } from "@/lib/geoAnalysis";
import { isPipeLayer, detectDiameterField, buildPipeConfig, getPipeStyle, ensureDiameterCounts } from "@/lib/pipeStyling";
import { supabase } from "@/api/supabaseClient";
import { buildFeaturePopup } from "@/lib/featurePopup";
import { filterFeaturesByBoundary } from "@/lib/boundaryFilter";
import MeterMarkers from "@/components/project/MeterMarkers";
import EstimationMarkers from "@/components/project/EstimationMarkers";
import MeterSearchBar from "@/components/project/MeterSearchBar";
import { createShapeIcon } from "@/lib/shapeIcons";
import BingTileLayer from "@/components/project/BingTileLayer";
import "leaflet/dist/leaflet.css";
import DrawPolygonHandler from "@/components/project/DrawPolygonHandler";
import EditPolygonHandler from "@/components/project/EditPolygonHandler";
import DmaConfigDialog from "@/components/project/DmaConfigDialog";
import DmaEditPanel from "@/components/project/DmaEditPanel";
import RulerHandler, { formatDistance } from "@/components/project/RulerHandler";
import ManualPointHandler from "@/components/project/ManualPointHandler";
import ManualLineHandler from "@/components/project/ManualLineHandler";
import ManualMeterDialog from "@/components/project/ManualMeterDialog";
import PinpointHandler from "@/components/project/PinpointHandler";
import PinpointPanel from "@/components/project/PinpointPanel";
import MapImageOverlay from "@/components/project/MapImageOverlay";

import PipeDiameterLabels from "@/components/project/PipeDiameterLabels";
import { diameterUnit } from "@/lib/pipeStyling";
import PointNumberBadges from "@/components/project/PointNumberBadges";
import NumberStyleControls from "@/components/project/NumberStyleControls";
import { buildNumberablePoints } from "@/lib/pointNumbering";
import { isMeterManualLayer } from "@/lib/meterLayerDetection";
import { loadNumberStyle, saveNumberStyle, applyStyleProp } from "@/lib/numberStyle";
import { collectValvePoints, findBorderValves } from "@/lib/borderValves";
import { resolvePointColors } from "@/lib/colorPalette";
import { isolationDistanceMeters } from "@/lib/isolationDistance";
import OutBoundaryHighlighter from "@/components/project/OutBoundaryHighlighter";
import MapKeyboardNav from "@/components/project/MapKeyboardNav";
import MapAnnotations from "@/components/project/MapAnnotations";
import CustomerAnnotationLayer from "@/components/project/CustomerAnnotationLayer";
import MapHelpBox from "@/components/project/MapHelpBox";
import MapScreenshot from "@/components/project/MapScreenshot";
import ViewSelector from "@/components/project/ViewSelector";
import { countMetersInPolygon, getBoundaryPolygonsLatLng, dmaPolygonsToGeoJSON, pointInDmaPolygons } from "@/lib/polygonUtils";
import { parseDmaPolygons, filterNearBoundaryValves, isValveLayer, isIsolatedModeLayer, isFeatureIsolated, findIsolatedForFeature } from "@/lib/isolatedPoints";
import { mapRenderSort, panelSort } from "@/lib/layerSort";
import { isPointInOrNearDma, filterFeaturesByDmaProximity, DEFAULT_PROXIMITY_FEET, feetToMeters } from "@/lib/dmaProximity";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

function RecenterMap({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) map.setView([lat, lng], 13);
  }, [lat, lng, map]);
  return null;
}

// Fits the map to the combined bounds of all layers once, when data becomes available.
// Replaces the per-layer fitBounds that caused the map to jump as each layer loaded.
function FitToBounds({ bounds }) {
  const map = useMap();
  const fittedRef = useRef(false);
  useEffect(() => {
    if (!bounds || fittedRef.current) return;
    fittedRef.current = true;
    const timer = setTimeout(() => {
      map.fitBounds(
        [[bounds.south, bounds.west], [bounds.north, bounds.east]],
        { padding: [50, 50] }
      );
    }, 120);
    return () => clearTimeout(timer);
  }, [bounds, map]);
  return null;
}

// Explicit Leaflet panes so z-order is deterministic instead of depending on
// the order Leaflet happened to add layers in. Without this, toggling a layer's
// visibility re-adds it last → it jumps to the top of the stack, and dragging in
// the panel had no effect on already-mounted layers.
//
// Stack (Leaflet defaults in brackets): tiles [200] < DMA polygons (395) <
// layer panes (400 + rank, rank 0 = bottom) < highlights (490) <
// shadows [500] < markers [600] < tooltips [650] < popups [700].
export const DMA_PANE = "dma-pane";
export const HIGHLIGHT_PANE = "highlight-pane";
export const layerPaneName = (rank) => `layer-pane-${rank}`;

function MapPanes({ layerCount }) {
  const map = useMap();
  useEffect(() => {
    const ensure = (name, zIndex) => {
      let pane = map.getPane(name);
      if (!pane) pane = map.createPane(name);
      pane.style.zIndex = String(zIndex);
      return pane;
    };
    ensure(DMA_PANE, 395);
    // A few spare panes so adding a layer doesn't need a re-render to exist.
    // Clamped so layer panes always stay below the highlight/shadow panes.
    for (let i = 0; i < Math.max(layerCount, 1) + 8; i++) {
      ensure(layerPaneName(i), 400 + Math.min(i, 85));
    }
    ensure(HIGHLIGHT_PANE, 490);
  }, [map, layerCount]);
  return null;
}

// Applies a brightness filter to the map's tile pane (tiles only, not overlays/markers).
function TileDimmer({ dimming }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const tilePane = container.querySelector(".leaflet-tile-pane");
    if (tilePane) {
      tilePane.style.filter = `brightness(${dimming}%)`;
    }
  }, [dimming, map]);
  return null;
}

// Calls map.invalidateSize() whenever the container is resized.
// Without this, Leaflet keeps stale tile dimensions after layout changes
// (panel toggle, view switch, initial render) and the map appears black.
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    // Fix dimensions on mount after layout settles
    const raf = requestAnimationFrame(() => map.invalidateSize());
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(container);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

function BoxZoomHandler({ active, onDone }) {
  const map = useMap();
  const startRef = useRef(null);
  const rectRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    map.dragging.disable();
    map.getContainer().style.cursor = "crosshair";

    const onMouseDown = (e) => {
      const latlng = map.mouseEventToLatLng(e.originalEvent);
      startRef.current = latlng;
      rectRef.current = L.rectangle([[latlng.lat, latlng.lng], [latlng.lat, latlng.lng]], {
        color: "#2563eb", weight: 2, dashArray: "4,2", fillColor: "#2563eb", fillOpacity: 0.1,
      }).addTo(map);
    };
    const onMouseMove = (e) => {
      if (!startRef.current || !rectRef.current) return;
      const latlng = map.mouseEventToLatLng(e.originalEvent);
      rectRef.current.setBounds([startRef.current, latlng]);
    };
    const onMouseUp = (e) => {
      if (!startRef.current || !rectRef.current) return;
      const latlng = map.mouseEventToLatLng(e.originalEvent);
      const bounds = L.latLngBounds(startRef.current, latlng);
      map.removeLayer(rectRef.current);
      rectRef.current = null;
      startRef.current = null;
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
      onDone?.();
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);

    return () => {
      map.dragging.enable();
      map.getContainer().style.cursor = "";
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
      if (rectRef.current) { map.removeLayer(rectRef.current); rectRef.current = null; }
      startRef.current = null;
    };
  }, [active, map, onDone]);

  return null;
}

export default function ProjectMap({ project, layers, meters, mapType, setMapType, mapSource, setMapSource, onToggleVisibility, mapRef, onLayerUpdated, clipToBoundary, dmas, onDmaCreated, drawMode, setDrawMode, drawTarget, onBoundaryDrawn, editDma, setEditDma, estimationTarget, onDragProposed, manualEditLayer, onSaveManualLayer, onCancelManualLayer, focusedDmaIds, onToggleFocusDma, highlightedMeterIds, focusMeter, editBoundary, onBoundaryEditSave, onBoundaryEditCancel, onRedrawBoundary, onRefetchBoundary, refetchingBoundary, pinpointMeter, pinpointCoords, onPinpointPlaced, pinpointAddress, pinpointLoading, onPinpointConfirm, onPinpointCancel, pinpointDiameter, onPinpointDiameterChange, imageOverlays, editingOverlayId, onImageOverlayBoundsChange, croppingOverlayId, onCropApplied, onCropCancel, isolatedMode, isolatedPoints, onValveClick, onDeleteIsolatedPoint, onExitIsolatedMode, onToggleMeterMain, onEditMeter, highlightBorderValves, isolationViewMode, annotations, annotationMode, onAnnotationClick, onArrowFirstClick, onArrowSecondClick, arrowStart, highlightedAnnotationId, onCancelAnnotation,   annotationsHidden, hiddenAnnotationIds, focusIsolatedPoint, customerAnnotations, customerAnnotationsHidden, hiddenCustomerAnnotationIds }) {
  const proximityMeters = feetToMeters(project?.boundary_deviation_feet ?? DEFAULT_PROXIMITY_FEET);
  const [geojsonCache, setGeojsonCache] = useState({});
  const [highlightedUid, setHighlightedUid] = useState(null);
  const [boxMode, setBoxMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]);
  const [mousePos, setMousePos] = useState(null);
  const [dmaDialog, setDmaDialog] = useState(null);
  const [rulerActive, setRulerActive] = useState(false);
  const [rulerPoints, setRulerPoints] = useState([]);
  const [rulerDistance, setRulerDistance] = useState(0);
  const [manualPoints, setManualPoints] = useState([]);
  const [manualLines, setManualLines] = useState([]);
  const [currentLinePoints, setCurrentLinePoints] = useState([]);
  const [lineDiameterDialog, setLineDiameterDialog] = useState(null);
  const [lineDiameterValue, setLineDiameterValue] = useState("");
  const [meterPointId, setMeterPointId] = useState(null);
  const [showDmaLabels, setShowDmaLabels] = useState(false);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [showMapTypeMenu, setShowMapTypeMenu] = useState(false);
  const [showDimMenu, setShowDimMenu] = useState(false);
  const [legendMinimized, setLegendMinimized] = useState(false);
  const [highlightOutBoundary, setHighlightOutBoundary] = useState(false);
  const [viewHideNotes, setViewHideNotes] = useState(false);
  const [viewHideArrows, setViewHideArrows] = useState(false);
  const [viewHideIsolated, setViewHideIsolated] = useState(false);
  const [showPointNumbers, setShowPointNumbers] = useState(false);
  const [numberStyle, setNumberStyle] = useState(() => loadNumberStyle(project?.id));
  const [numberScope, setNumberScope] = useState("all");
  const [selectedNumberIds, setSelectedNumberIds] = useState(() => new Set());
  const [mapDimming, setMapDimming] = useState(() => {
    const saved = localStorage.getItem("mapDimming");
    if (saved !== null) return parseInt(saved, 10);
    return document.documentElement.classList.contains("dark") ? 55 : 100;
  });

  useEffect(() => {
    localStorage.setItem("mapDimming", String(mapDimming));
  }, [mapDimming]);

  const rootRef = useRef(null);

  useEffect(() => {
    if (drawMode) {
      setDrawPoints([]);
      setMousePos(null);
    }
  }, [drawMode]);

  // Load manual layer points when entering edit mode
  useEffect(() => {
    if (!manualEditLayer?.file_url) {
      setManualPoints([]);
      return;
    }
    fetch(manualEditLayer.file_url)
      .then((res) => res.json())
      .then((data) => {
        const pts = (data.features || []).map((f) => ({
          id: f.properties?.id || (crypto.randomUUID?.() || Math.random().toString(36).slice(2)),
          name: f.properties?.name || "",
          endpoint_id: f.properties?.endpoint_id || "",
          account_name: f.properties?.account_name || "",
          address: f.properties?.address || "",
          lat: f.geometry?.coordinates?.[1] || 0,
          lng: f.geometry?.coordinates?.[0] || 0,
          // Keep every original attribute. Imported layers (valves, hydrants)
          // carry arbitrary shapefile columns, and the save path rebuilds
          // properties from a fixed list — without this, moving one point
          // would strip the attributes off every feature in the layer.
          _props: f.properties || {},
        }));
        setManualPoints(pts);
      })
      .catch(() => setManualPoints([]));
  }, [manualEditLayer]);

  // Load manual line layer features when entering edit mode
  useEffect(() => {
    if (!manualEditLayer?.file_url || !manualEditLayer.geometry_types?.includes("LineString")) {
      setManualLines([]);
      setCurrentLinePoints([]);
      return;
    }
    fetch(manualEditLayer.file_url)
      .then((res) => res.json())
      .then((data) => {
        const lines = (data.features || [])
          .filter((f) => f.geometry?.type === "LineString")
          .map((f) => ({
            points: (f.geometry.coordinates || []).map(([lng, lat]) => [lat, lng]),
            diameter: f.properties?.diameter || "",
          }));
        setManualLines(lines);
      })
      .catch(() => setManualLines([]));
  }, [manualEditLayer]);

  // Reset line state when manual edit layer is cleared
  useEffect(() => {
    if (!manualEditLayer) {
      setManualLines([]);
      setCurrentLinePoints([]);
      setLineDiameterDialog(null);
      setLineDiameterValue("");
      setMeterPointId(null);
    }
  }, [manualEditLayer]);

  // Invalidate geojson cache when a layer's file_url changes (e.g. after manual layer save)
  const prevFileUrls = useRef({});
  useEffect(() => {
    layers.forEach((layer) => {
      const prev = prevFileUrls.current[layer.id];
      if (prev && prev !== layer.file_url) {
        setGeojsonCache((cache) => {
          const next = { ...cache };
          delete next[layer.id];
          return next;
        });
      }
      prevFileUrls.current[layer.id] = layer.file_url;
    });
  }, [layers]);

  const [editPoints, setEditPoints] = useState([]);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#3b82f6");
  const [editTransparency, setEditTransparency] = useState(30);
  const [editMainMeterId, setEditMainMeterId] = useState("");
  const [boundaryEditPoints, setBoundaryEditPoints] = useState([]);
  const drawPointsRef = useRef([]);
  useEffect(() => {
    drawPointsRef.current = drawPoints;
  }, [drawPoints]);

  // Initialize edit points and properties from the DMA being edited
  useEffect(() => {
    if (editDma) {
      try {
        const rawPoly = editDma.polygon_json ?? editDma.polygon;
        const poly = typeof rawPoly === "string" ? JSON.parse(rawPoly) : rawPoly;
        setEditPoints(Array.isArray(poly) ? poly : []);
      } catch {
        setEditPoints([]);
      }
      setEditName(editDma.name || "");
      setEditColor(editDma.color || "#3b82f6");
      setEditTransparency(Math.round((editDma.transparency ?? 0.3) * 100));
      setEditMainMeterId(editDma.main_meter_id || "");
    } else {
      setEditPoints([]);
    }
  }, [editDma]);

  // Load boundary polygon points when entering boundary edit mode
  useEffect(() => {
    if (!editBoundary) {
      setBoundaryEditPoints([]);
      return;
    }
    const extract = (geojson) => {
      for (const f of (geojson.features || [])) {
        const geom = f.geometry;
        if (!geom) continue;
        let ring = null;
        if (geom.type === "Polygon" && geom.coordinates?.[0]) {
          ring = geom.coordinates[0];
        } else if (geom.type === "MultiPolygon" && geom.coordinates?.length) {
          ring = geom.coordinates.reduce((big, p) => p[0].length > big.length ? p[0] : big, geom.coordinates[0][0]);
        }
        if (ring && ring.length >= 3) {
          const points = ring.map(([lng, lat]) => [lat, lng]);
          if (points.length > 1) {
            const [fLat, fLng] = points[0];
            const [lLat, lLng] = points[points.length - 1];
            if (fLat === lLat && fLng === lLng) points.pop();
          }
          setBoundaryEditPoints(points);
          return;
        }
      }
    };
    const cached = geojsonCache[editBoundary.id];
    if (cached && !cached.error) {
      extract(cached);
    } else if (editBoundary.file_url) {
      fetch(editBoundary.file_url).then((r) => r.json()).then(extract).catch(() => {});
    }
  }, [editBoundary, geojsonCache]);

  // Keyboard shortcuts during draw mode: Enter = finish, U = undo
  useEffect(() => {
    if (!drawMode) return;
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Enter") {
        e.preventDefault();
        const pts = drawPointsRef.current;
        if (pts.length >= 3) {
          if (drawTarget === "boundary") {
            onBoundaryDrawn?.(pts);
          } else {
            setDmaDialog({ points: pts });
          }
          setDrawMode(false);
        }
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        setDrawPoints((prev) => prev.slice(0, -1));
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setMapType("satellite");
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setMapType("terrain");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawMode, setDrawMode, drawTarget, onBoundaryDrawn, setMapType]);

  // External "view on map" trigger — highlight + fly to meter
  useEffect(() => {
    if (!focusMeter) return;
    setHighlightedUid(focusMeter.uid);
    if (mapRef?.current && focusMeter.latitude != null && focusMeter.longitude != null) {
      mapRef.current.flyTo([focusMeter.latitude, focusMeter.longitude], 17, { duration: 0.8 });
    }
  }, [focusMeter]);

  const handleMeterSelect = (meter) => {
    if (!meter) {
      setHighlightedUid(null);
      return;
    }
    setHighlightedUid(meter.uid);
    if (mapRef?.current && meter.latitude != null && meter.longitude != null) {
      mapRef.current.flyTo([meter.latitude, meter.longitude], 17, { duration: 0.8 });
    }
  };

  const shpLayers = layers
    .filter((l) => l.layer_type === "shp" && l.file_url)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const visibleShpLayers = shpLayers.filter((l) => l.visible);

  useEffect(() => {
    visibleShpLayers.forEach(async (layer) => {
      if (!geojsonCache[layer.id]) {
        try {
          const res = await fetch(layer.file_url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const rawData = await res.json();
          const data = reprojectToWGS84(rawData);
          setGeojsonCache((prev) => ({ ...prev, [layer.id]: data }));

          // Auto-detect pipe config for pipe layers that don't have one yet
          if (isPipeLayer(layer) && !layer.pipe_config) {
            const field = detectDiameterField(layer.properties);
            if (field) {
              const config = buildPipeConfig(data, field);
              await supabase.from('project_layer').update({ pipe_config: config }).eq('id', layer.id);
              onLayerUpdated?.();
            }
          }

          // Backfill counts for existing pipe configs that don't have them
          if (layer.pipe_config && layer.pipe_config.diameter_field) {
            const updated = ensureDiameterCounts(data, layer.pipe_config);
            if (updated !== layer.pipe_config) {
              await supabase.from('project_layer').update({ pipe_config: updated }).eq('id', layer.id);
              onLayerUpdated?.();
            }
          }
        } catch (err) {
          console.error("Failed to fetch layer GeoJSON:", layer.name, err);
          setGeojsonCache((prev) => ({ ...prev, [layer.id]: { error: true } }));
        }
      }
    });
  }, [layers, geojsonCache]);

  // During interactive estimation, only show the reference meters for the current target
  const estimationMeterIds = useMemo(() => {
    if (!estimationTarget?.similarMeters) return null;
    return new Set(estimationTarget.similarMeters.map((m) => m.id));
  }, [estimationTarget]);

  // Focused DMA data — polygons for point-in-polygon + GeoJSON for feature clipping
  const focusedDmaData = useMemo(() => {
    if (!focusedDmaIds || focusedDmaIds.length === 0) return null;
    const focused = (dmas || []).filter((d) => focusedDmaIds.includes(d.id));
    if (focused.length === 0) return null;
    const polygons = [];
    const linkedMainMeterIds = new Set();
    for (const dma of focused) {
      let poly;
      try {
        const rawPoly = dma.polygon_json ?? dma.polygon;
        poly = typeof rawPoly === "string" ? JSON.parse(rawPoly) : rawPoly;
      } catch { continue; }
      if (Array.isArray(poly) && poly.length >= 3) polygons.push(poly);
      if (dma.main_meter_id) linkedMainMeterIds.add(dma.main_meter_id);
    }
    if (polygons.length === 0) return null;
    return {
      polygons,
      geojson: dmaPolygonsToGeoJSON(focused),
      linkedMainMeterIds,
      dmaNames: new Set(focused.map((d) => d.name).filter(Boolean)),
    };
  }, [focusedDmaIds, dmas]);

  // DMA polygons for isolated points mode (near-boundary valve detection)
  const isolatedDmaPolygons = useMemo(() => {
    if (!isolatedMode) return null;
    return parseDmaPolygons(dmas);
  }, [isolatedMode, dmas]);

  // Fit bounds to focused DMA polygons
  useEffect(() => {
    if (!focusedDmaData || !mapRef.current) return;
    const allPoints = focusedDmaData.polygons.flat();
    if (allPoints.length === 0) return;
    const lats = allPoints.map(([lat]) => lat);
    const lngs = allPoints.map(([, lng]) => lng);
    mapRef.current.fitBounds(
      [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
      { padding: [60, 60] }
    );
  }, [focusedDmaData]);

  const source = MAP_SOURCES[mapSource];
  const tileConfig = source[mapType];

  const dataLayers = layers
    .filter((l) => l.layer_type === "data" && l.visible)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const allDataLayers = layers.filter((l) => l.layer_type === "data");
  const boundaryLayer = shpLayers.find((l) => /boundary/i.test(l.name));
  const boundaryGeoJSON = boundaryLayer ? geojsonCache[boundaryLayer.id] : null;

  // Combined bounds of all layers — used to fit the map once on project open
  const combinedBounds = useMemo(() => {
    const withBounds = layers.filter((l) => l.bounds);
    if (withBounds.length === 0) return null;
    return withBounds.reduce((acc, l) => ({
      north: Math.max(acc.north, l.bounds.north),
      south: Math.min(acc.south, l.bounds.south),
      east: Math.max(acc.east, l.bounds.east),
      west: Math.min(acc.west, l.bounds.west),
    }), { north: -Infinity, south: Infinity, east: -Infinity, west: Infinity });
  }, [layers]);

  // Pre-compute boundary polygons in [lat,lng] format for meter clipping
  const boundaryPolygonsLatLng = useMemo(() => {
    if (!clipToBoundary || !boundaryGeoJSON || boundaryGeoJSON.error) return null;
    return getBoundaryPolygonsLatLng(boundaryGeoJSON);
  }, [clipToBoundary, boundaryGeoJSON]);

  // Numbered points for the "Show Point Numbers" toggle — main/insertion
  // meters, Ultrasonic Meters layer points, and isolated valves/points only.
  // Isolated points are excluded while viewHideIsolated is on, matching the
  // map's own suppression of their special styling.
  const numberedPoints = useMemo(() => {
    if (!showPointNumbers) return [];
    const all = buildNumberablePoints({ meters, layers, isolatedPoints: viewHideIsolated ? [] : isolatedPoints, geojsonCache });
    if (!focusedDmaData) return all;
    // A DMA is focused ("Zoom DMA on map"): numbers are still assigned across
    // ALL points (as if every DMA were visible), so each point keeps its global
    // number — we only hide the ones that don't belong to the focused DMA.
    // Relevant = inside the polygon, or within the project's boundary-deviation
    // proximity (the same radius the map uses to filter layer features), or the
    // DMA's linked main meter even if it sits further out.
    return all.filter((p) => {
      const meterId = p.id.startsWith("meter-") ? p.id.slice("meter-".length) : null;
      if (meterId && focusedDmaData.linkedMainMeterIds.has(meterId)) return true;
      return isPointInOrNearDma(p.lat, p.lng, focusedDmaData.polygons, proximityMeters);
    });
  }, [showPointNumbers, meters, layers, isolatedPoints, viewHideIsolated, geojsonCache, focusedDmaData, proximityMeters]);

  // Valves sitting at borders between two DMAs (candidate isolation valves).
  const borderValvePoints = useMemo(() => {
    if (!highlightBorderValves) return [];
    // Pairing distance comes from the project's "Isolation Valve Distance"
    // setting (metres; unit-aware default of 60 m / 200 ft when unset).
    const pairMeters = isolationDistanceMeters(project);
    return findBorderValves(
      collectValvePoints(layers, geojsonCache),
      parseDmaPolygons(dmas),
      {
        pairMeters,
        maxAssignMeters: pairMeters * 2,
        // Valves already marked as isolation points don't need marking again.
        excludePoints: isolatedPoints || [],
      }
    );
  }, [highlightBorderValves, layers, geojsonCache, dmas, project, isolatedPoints]);

  // Persist number styling per project; apply size/color to all or selected.
  useEffect(() => {
    if (project?.id) saveNumberStyle(project.id, numberStyle);
  }, [project?.id, numberStyle]);

  const applyNumberStyle = (prop, value) => {
    setNumberStyle((s) => applyStyleProp(s, prop, value, numberScope, selectedNumberIds));
  };
  const toggleNumberSelect = (pointId) => {
    setSelectedNumberIds((prev) => {
      const next = new Set(prev);
      if (next.has(pointId)) next.delete(pointId); else next.add(pointId);
      return next;
    });
  };

  const handleZoomFit = () => {
    if (!mapRef.current || !boundaryLayer?.bounds) return;
    const b = boundaryLayer.bounds;
    mapRef.current.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [50, 50] });
  };

  const allDmaVisible = (dmas || []).length > 0 && dmas.every((d) => d.visible);
  const handleToggleAllDmaVisible = async () => {
    const targetState = !allDmaVisible;
    await supabase.from('dma').update({ visible: targetState }).in('id', dmas.map((d) => d.id));
    onDmaCreated?.();
  };

  const handleApplyView = async (view) => {
    if (!view) {
      const allComponentKeys = new Set([
        ...layers.map((l) => `layer:${l.id}`),
        "dma_polygons", "dma_names", "isolated_points", "notes", "arrows",
      ]);
      view = { components: [...allComponentKeys] };
    }
    const componentSet = new Set(view.components);

    // Layer visibility — split into two groups since each can flip to a
    // different target value (no single-value bulk update covers both).
    const layerUpdates = layers.filter((l) => componentSet.has(`layer:${l.id}`) !== l.visible);
    const layersToShow = layerUpdates.filter((l) => componentSet.has(`layer:${l.id}`)).map((l) => l.id);
    const layersToHide = layerUpdates.filter((l) => !componentSet.has(`layer:${l.id}`)).map((l) => l.id);
    if (layersToShow.length > 0) await supabase.from('project_layer').update({ visible: true }).in('id', layersToShow);
    if (layersToHide.length > 0) await supabase.from('project_layer').update({ visible: false }).in('id', layersToHide);
    if (layerUpdates.length > 0) onLayerUpdated?.();

    // DMA visibility
    const showDmas = componentSet.has("dma_polygons");
    if (dmas && dmas.length > 0 && dmas.some((d) => d.visible !== showDmas)) {
      await supabase.from('dma').update({ visible: showDmas }).in('id', dmas.map((d) => d.id));
      onDmaCreated?.();
    }

    // DMA labels
    setShowDmaLabels(componentSet.has("dma_names"));

    // Notes / Arrows / Isolated
    setViewHideNotes(!componentSet.has("notes"));
    setViewHideArrows(!componentSet.has("arrows"));
    setViewHideIsolated(!componentSet.has("isolated_points"));
  };

  const handleEditSave = async () => {
    if (!editDma || editPoints.length < 3) return;
    const boundaryPolys = getBoundaryPolygonsLatLng(boundaryGeoJSON);
    const count = countMetersInPolygon(meters, editPoints, boundaryPolys);
    // A main meter (any type) can serve more than one DMA — e.g. one meter
    // feeding both "North" and "North Central". We intentionally do NOT unlink
    // it from other DMAs here, so the same main_meter_id can be shared across
    // DMAs. (dma.main_meter_id has no unique constraint, so this is allowed.)
    // meter_count isn't stored anymore — it's computed live via the
    // dma_enriched view.
    const prevMainId = editDma.main_meter_id || null;
    const nextMainId = editMainMeterId || null;

    const { error } = await supabase.from('dma').update({
      name: editName,
      color: editColor,
      transparency: editTransparency / 100,
      polygon_json: editPoints,
      main_meter_id: editMainMeterId || null,
    }).eq('id', editDma.id);
    if (error) {
      console.error("Failed to save DMA:", error);
      return;
    }

    // The meter carries its own dma_id, and the export reads it. Keep it in
    // step with the link, or a meter unassigned here still exports under this
    // DMA and keeps showing it in the meter table.
    if (prevMainId !== nextMainId) {
      if (prevMainId) {
        // A main meter can serve several DMAs — only clear it when no other
        // DMA still points at it.
        const stillLinked = (dmas || []).some((d) => d.id !== editDma.id && d.main_meter_id === prevMainId);
        if (!stillLinked) {
          await supabase.from('meter').update({ dma_id: null })
            .eq('id', prevMainId).eq('dma_id', editDma.id);
        }
      }
      if (nextMainId) {
        await supabase.from('meter').update({ dma_id: editDma.id }).eq('id', nextMainId);
      }
    }

    setEditDma(null);
    onDmaCreated?.();
  };

  const isManualLineLayer = manualEditLayer?.geometry_types?.includes("LineString");

  const handleFinishLine = (pts) => {
    if (pts.length < 2) return;
    setLineDiameterDialog({ points: pts });
    setLineDiameterValue("");
  };

  const handleConfirmLineDiameter = () => {
    if (!lineDiameterDialog || !lineDiameterValue.trim()) return;
    setManualLines((prev) => [...prev, {
      points: lineDiameterDialog.points,
      diameter: lineDiameterValue.trim(),
    }]);
    setCurrentLinePoints([]);
    setLineDiameterDialog(null);
    setLineDiameterValue("");
  };

  const handleCancelLineDiameter = () => {
    setLineDiameterDialog(null);
    setLineDiameterValue("");
  };

  const handleLineUndo = () => {
    if (currentLinePoints.length > 0) {
      setCurrentLinePoints((prev) => prev.slice(0, -1));
    } else if (manualLines.length > 0) {
      setManualLines((prev) => prev.slice(0, -1));
    }
  };

  const isMeterLayer = isMeterManualLayer(manualEditLayer);

  const handleMeterPointPlaced = (id) => {
    setMeterPointId(id);
  };

  const handleMeterPointSave = (data) => {
    setManualPoints((prev) => prev.map((p) => p.id === meterPointId ? { ...p, ...data } : p));
    setMeterPointId(null);
  };

  const handleMeterPointCancel = () => {
    const point = manualPoints.find((p) => p.id === meterPointId);
    if (point && !point.name?.trim()) {
      setManualPoints((prev) => prev.filter((p) => p.id !== meterPointId));
    }
    setMeterPointId(null);
  };

  const handleMeterPointDelete = () => {
    setManualPoints((prev) => prev.filter((p) => p.id !== meterPointId));
    setMeterPointId(null);
  };

  // Stable pane rank per layer, computed over ALL layers (not just the visible
  // ones) so showing/hiding a layer never reshuffles anyone's z-order — only
  // an actual reorder (which changes sort_order) does.
  const layerPaneRank = useMemo(() => {
    const ranks = {};
    [...layers].sort(mapRenderSort).forEach((l, i) => { ranks[l.id] = i; });
    return ranks;
  }, [layers]);

  const getLayerKey = (layer) => {
    const pipeKey = layer.pipe_config
      ? `${layer.pipe_config.uniform ? "uniform" : "diameter"}|${layer.pipe_config.diameters.map((d) => `${d.value}-${d.visible}-${d.color}-${d.weight}`).join("|")}`
      : "";
    const pc = layer.point_config;
    const pointKey = pc ? `${pc.shape || "circle"}-${pc.fill_style}-${pc.radius}-${pc.icon_size || 28}` : "";
    const clipKey = clipToBoundary && !/boundary/i.test(layer.name) ? "clip" : "noclip";
    return `${layer.id}-${layer.color}-${layer.icon_url || ""}-${pipeKey}-${pointKey}-${clipKey}-${layer.sort_order ?? 0}`;
  };

  return (
    <div ref={rootRef} className="relative h-full w-full isolate">
      <MapContainer
        ref={mapRef}
        center={[project.latitude || 0, project.longitude || 0]}
        zoom={13}
        maxZoom={20}
        className="h-full w-full"
        scrollWheelZoom
        zoomControl={false}
        >
        <MapKeyboardNav />
        {tileConfig.bing ? (
          <BingTileLayer
            key={`${mapSource}-${mapType}`}
            url={tileConfig.url}
            attribution={tileConfig.attribution}
            subdomains={tileConfig.subdomains || "0123"}
            maxZoom={20}
          />
        ) : (
          <TileLayer
            key={`${mapSource}-${mapType}`}
            url={tileConfig.url}
            attribution={tileConfig.attribution}
            subdomains={tileConfig.subdomains || "abc"}
            maxZoom={20}
          />
        )}
        <MapPanes layerCount={layers.length} />
        <TileDimmer dimming={mapDimming} />
        <RecenterMap lat={project.latitude} lng={project.longitude} />
        <FitToBounds bounds={combinedBounds} />
        <MapResizer />
        {showPointNumbers && (
          <PointNumberBadges
            points={numberedPoints}
            style={numberStyle}
            selectedIds={selectedNumberIds}
            onToggleSelect={toggleNumberSelect}
          />
        )}
        {highlightBorderValves && borderValvePoints.map((p, i) => (
          <CircleMarker
            key={`bv-${i}`}
            center={[p.lat, p.lng]}
            radius={13}
            pane={HIGHLIGHT_PANE}
            pathOptions={{ color: "#f59e0b", weight: 3, fillColor: "#f59e0b", fillOpacity: 0.25, className: "meter-highlight-pulse" }}
          />
        ))}
        <BoxZoomHandler active={boxMode} onDone={() => setBoxMode(false)} />
        {/* Combined render — z-order follows panel order (top of panel = top of
            map), enforced via per-layer panes (see MapPanes) so it holds even
            when layers are re-added by a visibility toggle or a drag reorder.
            DMA polygons always render beneath all of these. */}
        {layers
          .filter((l) => {
            if (!l.visible || l.id === manualEditLayer?.id || l.id === editBoundary?.id) return false;
            if (isolatedMode) return l.layer_type === "shp" && isIsolatedModeLayer(l);
            if (isolationViewMode) {
              if (l.layer_type === "shp") return isIsolatedModeLayer(l);
              // Data layers: keep visible, meters filtered to main only below
              return true;
            }
            return true;
          })
          .sort(mapRenderSort)
          .map((layer) => {
            // Each layer draws into its own pane (rank 0 = bottom) so z-order
            // comes from the panel order, not from the order Leaflet added them.
            const layerPane = layerPaneName(layerPaneRank[layer.id] ?? 0);
            if (layer.layer_type === "data") {
              const layerMeters = (meters || []).filter(
                (m) => m.layer_id ? m.layer_id === layer.id : (m.source_file_url && m.source_file_url === layer.file_url)
              ).filter((m) => !estimationMeterIds || estimationMeterIds.has(m.id))
              .filter((m) => !isolationViewMode || m.is_main)
              .filter((m) => {
                if (!focusedDmaData) return true;
                // Show meters assigned to the focused DMA (by dma_name), plus linked main meters
                if (focusedDmaData.linkedMainMeterIds.has(m.id)) return true;
                return focusedDmaData.dmaNames.has(m.dma_name);
              })
              .filter((m) => {
                if (!boundaryPolygonsLatLng) return true;
                if (m.latitude == null || m.longitude == null) return false;
                return pointInDmaPolygons(m.latitude, m.longitude, boundaryPolygonsLatLng);
              });
              if (layerMeters.length === 0) return null;
              return (
                <MeterMarkers
                  key={`${layer.id}-${layer.sort_order ?? 0}`}
                  meters={layerMeters}
                  layerConfig={layer}
                  highlightedUid={highlightedUid}
                  highlightedMeterIds={highlightedMeterIds}
                  onToggleMain={onToggleMeterMain}
                  onEditMeter={onEditMeter}
                  pane={layerPane}
                />
              );
            }

            // SHP / GeoJSON layer
            if (!layer.file_url) return null;
            // Check if this SHP layer has associated meter records (e.g. insertion meter layers).
            // If so, render MeterMarkers with live data popups instead of stale GeoJSON properties.
            const layerHasMeters = (meters || []).some((m) => m.layer_id === layer.id);
            const rawData = geojsonCache[layer.id];
          if (!rawData || rawData.error) return null;
          const boundary = /boundary/i.test(layer.name);
          let data = clipToBoundary && !boundary && boundaryGeoJSON && !boundaryGeoJSON.error
            ? filterFeaturesByBoundary(rawData, boundaryGeoJSON)
            : rawData;
          // When DMA focus is active, show features inside DMA or within 30ft (no clipping —
          // water lines that touch the DMA are shown in their entirety even if they extend beyond)
          if (focusedDmaData && !boundary) {
            data = filterFeaturesByDmaProximity(data, focusedDmaData.polygons, proximityMeters);
          }
          if (!data) return null;
          const pipe = layer.pipe_config;
          const isPointLayer = layer.geometry_types?.some((t) => t === "Point" || t === "MultiPoint");

          const boundaryStyle = {
            color: "#dc2626",
            weight: 4,
            opacity: 1,
            fillColor: "#000000",
            fillOpacity: 0,
            dashArray: "8,4",
            interactive: false,
          };

          const defaultStyle = { color: layer.color, weight: 2, fillColor: layer.color, fillOpacity: 0.15 };

          const pointStyle = () => {
            const { fill, stroke } = resolvePointColors(layer);
            const isOutline = (layer.point_config || {}).fill_style === "outline";
            return {
              color: stroke,
              weight: 2,
              fillColor: fill,
              fillOpacity: isOutline ? 0 : 0.8,
            };
          };

          const isolatedValveStyle = { color: "#ffffff", weight: 2, fillColor: "#f59e0b", fillOpacity: 0.9 };

          const layerStyle = (feature) => {
            if (!viewHideIsolated && isValveLayer(layer) && isFeatureIsolated(feature, isolatedPoints)) {
              const ip = findIsolatedForFeature(feature, isolatedPoints);
              return { color: "#000000", weight: 3, fillColor: ip?.color || "#92c141", fillOpacity: 0.9 };
            }
            if (isolatedMode && isValveLayer(layer)) return isolatedValveStyle;
            if (boundary) return boundaryStyle;
            if (pipe) {
              return pipe.uniform
                ? { color: layer.color, weight: 3, opacity: 1 }
                : getPipeStyle(feature, pipe);
            }
            if (isPointLayer) return pointStyle();
            return defaultStyle;
          };

          return (
            <React.Fragment key={`${getLayerKey(layer)}-${pipe?.show_diameter_labels ? "dlbl" : "nodlbl"}-${drawMode}-${!!editDma}-${isolatedMode}-${isolatedPoints?.length || 0}-${viewHideIsolated}-${focusedDmaIds?.join(",") || "none"}-${proximityMeters}`}>
            <GeoJSON
              key={`${getLayerKey(layer)}-${drawMode}-${!!editDma}-${isolatedMode}-${isolatedPoints?.length || 0}-${viewHideIsolated}-${focusedDmaIds?.join(",") || "none"}-${proximityMeters}`}
              data={data}
              pane={layerPane}
              style={layerStyle}
              onEachFeature={(feature, lyr) => {
                const ip = (!viewHideIsolated && isValveLayer(layer)) ? findIsolatedForFeature(feature, isolatedPoints) : null;

                if (ip) {
                  // Assigned isolation valve — popup with DMA info + remove button
                  const dma1Name = (dmas || []).find((d) => d.id === ip.dma1_id)?.name || "—";
                  const dma2Name = (dmas || []).find((d) => d.id === ip.dma2_id)?.name || "—";
                  lyr.bindPopup(`
                    <div class="feature-popup">
                      <div style="font-weight:600; margin-bottom:6px;">🛡 Isolated Point</div>
                      <table>
                        <tr><td class="popup-key">DMA 1</td><td class="popup-val">${dma1Name}</td></tr>
                        <tr><td class="popup-key">DMA 2</td><td class="popup-val">${dma2Name}</td></tr>
                      </table>
                      <button id="del-iso-${ip.id}" style="color:#dc2626;cursor:pointer;border:none;background:none;padding:4px 0;font-size:12px;font-weight:500;margin-top:4px;">Remove</button>
                    </div>
                  `);
                  lyr.on("popupopen", (e) => {
                    const btn = e.popup.getElement()?.querySelector(`#del-iso-${ip.id}`);
                    if (btn) {
                      btn.onclick = () => onDeleteIsolatedPoint?.(ip.id);
                    }
                  });
                } else if (isolatedMode && isValveLayer(layer)) {
                  // Unassigned valve — click to open assignment dialog
                  lyr.on("click", () => {
                    const coords = feature.geometry?.coordinates || [];
                    onValveClick?.({
                      layer_id: layer.id,
                      latitude: coords[1],
                      longitude: coords[0],
                      properties: feature.properties,
                    });
                  });
                } else if (!drawMode && !editDma && !boundary && !layerHasMeters) {
                  lyr.bindPopup(buildFeaturePopup(feature, layer));
                  const geomType = feature.geometry?.type;
                  if (geomType === "LineString" || geomType === "MultiLineString") {
                    lyr.on("click", () => {
                      const original = layerStyle(feature);
                      lyr.setStyle({ color: "#ffeb00", weight: 6, opacity: 1 });
                      setTimeout(() => lyr.setStyle(original), 3000);
                    });
                  }
                }
              }}
              pointToLayer={(feature, latlng) => {
                // A custom pointToLayer does NOT inherit the GeoJSON's pane, so
                // every point layer sets it explicitly to keep this layer's
                // points in its own z-order slot.
                if (layerHasMeters) {
                  return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0, interactive: false, pane: layerPane });
                }
                if (!viewHideIsolated && isValveLayer(layer) && isFeatureIsolated(feature, isolatedPoints)) {
                  const ip = findIsolatedForFeature(feature, isolatedPoints);
                  return L.circleMarker(latlng, {
                    radius: 9,
                    color: "#000000",
                    weight: 3,
                    fillColor: ip?.color || "#92c141",
                    fillOpacity: 0.9,
                    pane: layerPane,
                  });
                }
                if (isolatedMode && isValveLayer(layer)) {
                  return L.circleMarker(latlng, {
                    radius: 8,
                    color: "#ffffff",
                    weight: 2,
                    fillColor: "#f59e0b",
                    fillOpacity: 0.9,
                    pane: layerPane,
                  });
                }
                if (layer.icon_url) {
                  const iconSize = layer.point_config?.icon_size || 28;
                  return L.marker(latlng, {
                    pane: layerPane,
                    icon: L.icon({
                      iconUrl: layer.icon_url,
                      iconSize: [iconSize, iconSize],
                      iconAnchor: [iconSize / 2, iconSize / 2],
                    }),
                  });
                }
                const pc = layer.point_config || {};
                const isOutline = pc.fill_style === "outline";
                const shape = pc.shape || "circle";
                const { fill: pFill, stroke: pStroke } = resolvePointColors(layer);
                if (shape !== "circle") {
                  return L.marker(latlng, {
                    pane: layerPane,
                    icon: createShapeIcon(shape, layer.color, pc.radius || 6, pc.fill_style, pStroke),
                  });
                }
                return L.circleMarker(latlng, {
                  radius: pc.radius || 6,
                  color: pStroke,
                  weight: 2,
                  fillColor: pFill,
                  fillOpacity: isOutline ? 0 : 0.8,
                  pane: layerPane,
                });
              }}
            />
            {pipe?.show_diameter_labels && (
              <PipeDiameterLabels data={data} pipeConfig={pipe} pane={layerPane} distanceUnit={project?.distance_unit} />
            )}
            {layerHasMeters && (() => {
              const layerMeters = (meters || []).filter(
                (m) => m.layer_id === layer.id
              ).filter((m) => !estimationMeterIds || estimationMeterIds.has(m.id))
              .filter((m) => !isolationViewMode || m.is_main)
              .filter((m) => {
                if (!focusedDmaData) return true;
                if (focusedDmaData.linkedMainMeterIds.has(m.id)) return true;
                return focusedDmaData.dmaNames.has(m.dma_name);
              })
              .filter((m) => {
                if (!boundaryPolygonsLatLng) return true;
                if (m.latitude == null || m.longitude == null) return false;
                return pointInDmaPolygons(m.latitude, m.longitude, boundaryPolygonsLatLng);
              });
              if (layerMeters.length === 0) return null;
              return (
                <MeterMarkers
                  key={`${layer.id}-meters`}
                  meters={layerMeters}
                  layerConfig={layer}
                  highlightedUid={highlightedUid}
                  highlightedMeterIds={highlightedMeterIds}
                  onToggleMain={onToggleMeterMain}
                  onEditMeter={onEditMeter}
                  pane={layerPane}
                />
              );
            })()}
            </React.Fragment>
          );
          })}
        {/* DMA polygons */}
        {(dmas || []).filter((d) => d.visible && d.id !== editDma?.id && (!focusedDmaData || focusedDmaIds.includes(d.id))).map((dma) => {
          let poly;
          try {
            const rawPoly = dma.polygon_json ?? dma.polygon;
            poly = typeof rawPoly === "string" ? JSON.parse(rawPoly) : rawPoly;
          } catch { return null; }
          if (!Array.isArray(poly) || poly.length < 3) return null;
          const centroid = poly.reduce((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0]).map((v) => v / poly.length);
          return (
            <React.Fragment key={`dma-${dma.id}`}>
              {/* DMA polygons always sit beneath every layer (DMA_PANE). Their
                  name labels stay in the default marker pane so they remain
                  readable on top. */}
              <Polygon
                positions={poly}
                pane={DMA_PANE}
                pathOptions={{ color: dma.color, fillColor: dma.color, fillOpacity: dma.transparency ?? 0.3, weight: 2 }}
              />
              {(showDmaLabels || isolatedMode) && (
                <Marker position={centroid} icon={L.divIcon({ className: "dma-label-marker", html: `<div class="dma-label"><span class="dma-dot" style="background:${dma.color || "#3b82f6"}"></span>${dma.name}</div>`, iconSize: [0, 0], iconAnchor: [0, 0] })} interactive={false}>
                </Marker>
              )}
            </React.Fragment>
          );
        })}

        {/* Preview polygon during DMA config dialog */}
        {dmaDialog && (
          <Polygon
            positions={dmaDialog.points}
            pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.2, weight: 2, dashArray: "5,5" }}
          />
        )}

        {/* Polygon drawing handler */}
        <DrawPolygonHandler
          active={drawMode}
          points={drawPoints}
          setPoints={setDrawPoints}
          mousePos={mousePos}
          setMousePos={setMousePos}
        />

        {/* DMA polygon editor */}
        {editDma && editPoints.length >= 3 && (
          <EditPolygonHandler points={editPoints} onChange={setEditPoints} />
        )}

        {/* Boundary polygon editor */}
        {editBoundary && boundaryEditPoints.length >= 3 && (
          <EditPolygonHandler points={boundaryEditPoints} onChange={setBoundaryEditPoints} />
        )}

        {/* Interactive estimation markers */}
        <EstimationMarkers target={estimationTarget} onDragProposed={onDragProposed} />

        {/* Ruler / distance measurement */}
        <RulerHandler
          active={rulerActive}
          points={rulerPoints}
          setPoints={setRulerPoints}
          onDistanceChange={setRulerDistance}
          distanceUnit={project?.distance_unit || "Km"}
        />

        {/* Manual point editing */}
        <ManualPointHandler
          active={!!manualEditLayer && !isManualLineLayer}
          points={manualPoints}
          setPoints={setManualPoints}
          color={manualEditLayer?.color || "#3b82f6"}
          isMeterLayer={isMeterLayer}
          onMeterPointPlaced={handleMeterPointPlaced}
        />

        {/* Manual line editing */}
        <ManualLineHandler
          active={!!manualEditLayer && isManualLineLayer}
          paused={!!lineDiameterDialog}
          currentPoints={currentLinePoints}
          setCurrentPoints={setCurrentLinePoints}
          lines={manualLines}
          color={manualEditLayer?.color || "#3b82f6"}
          onFinishLine={handleFinishLine}
        />

        {/* Pinpoint mode — single click to set meter location */}
        <PinpointHandler
          active={!!pinpointMeter && !pinpointCoords}
          coords={pinpointCoords}
          onPlaced={onPinpointPlaced}
        />

        {/* Image overlays (scanned PNGs) */}
        {(imageOverlays || []).map((ov) => (
          <MapImageOverlay
            key={ov.id}
            overlay={ov}
            editing={editingOverlayId === ov.id}
            cropping={croppingOverlayId === ov.id}
            onBoundsChange={onImageOverlayBoundsChange}
            onCropApplied={onCropApplied}
            onCropCancel={onCropCancel}
          />
        ))}

        {/* Highlight all components outside the city boundary */}
        <OutBoundaryHighlighter
          active={highlightOutBoundary}
          boundaryGeoJSON={boundaryGeoJSON}
          layers={layers}
          meters={meters}
          geojsonCache={geojsonCache}
          onComplete={() => setHighlightOutBoundary(false)}
        />

        {/* Map annotations (notes & arrows) */}
        <MapAnnotations
          annotations={annotationsHidden ? [] : (annotations || []).filter((a) => !(hiddenAnnotationIds || []).includes(a.id)).filter((a) => !(viewHideNotes && a.note_type === "note")).filter((a) => !(viewHideArrows && a.note_type === "arrow"))}
          mode={annotationMode}
          onPlaceNote={onAnnotationClick}
          onArrowFirstClick={onArrowFirstClick}
          onArrowSecondClick={onArrowSecondClick}
          arrowStart={arrowStart}
          highlightedId={highlightedAnnotationId}
        />
        {/* Customer-submitted annotations (read-only overlay) */}
        <CustomerAnnotationLayer
          annotations={customerAnnotationsHidden ? [] : (customerAnnotations || []).filter((a) => !(hiddenCustomerAnnotationIds || []).includes(a.id))}
        />
        {/* Isolated point highlight on zoom-to */}
        {focusIsolatedPoint && focusIsolatedPoint.latitude != null && (
          <CircleMarker
            center={[focusIsolatedPoint.latitude, focusIsolatedPoint.longitude]}
            radius={25}
            pathOptions={{
              color: "#f59e0b",
              weight: 3,
              fillColor: "#f59e0b",
              fillOpacity: 0.2,
              className: "meter-highlight-pulse",
            }}
            interactive={false}
          />
        )}
        </MapContainer>

      {/* Isolated mode toolbar */}
      {isolatedMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border px-4 py-2">
          <span className="text-sm font-semibold text-foreground">Isolated Points Mode</span>
          <div className="w-px h-5 bg-border" />
          <span className="text-xs text-muted-foreground">Click a valve to assign DMAs</span>
          <div className="w-px h-5 bg-border" />
          <button
            onClick={onExitIsolatedMode}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-white bg-primary hover:bg-primary/90"
          >
            <X className="w-3.5 h-3.5" /> Finish
          </button>
        </div>
      )}

      {/* Annotation mode banner */}
      {annotationMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border px-4 py-2">
          <span className="text-sm font-semibold text-foreground">
            {annotationMode === "note" ? "Add Note" : "Add Arrow"}
          </span>
          <div className="w-px h-5 bg-border" />
          <span className="text-xs text-muted-foreground">
            {annotationMode === "note"
              ? "Click on map to place"
              : arrowStart
                ? "Click end point on map"
                : "Click start point on map"}
          </span>
          <div className="w-px h-5 bg-border" />
          <button
            onClick={onCancelAnnotation}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-white bg-primary hover:bg-primary/90"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      )}

      {/* Pinpoint confirmation panel */}
      {pinpointMeter && pinpointCoords && (
        <PinpointPanel
          meter={pinpointMeter}
          coords={pinpointCoords}
          address={pinpointAddress}
          loading={pinpointLoading}
          diameter={pinpointDiameter}
          onDiameterChange={onPinpointDiameterChange}
          onConfirm={onPinpointConfirm}
          onCancel={onPinpointCancel}
        />
      )}

      {/* Zoom controls — bottom-center footer */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex flex-row bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border overflow-hidden">
        <button onClick={handleZoomFit} disabled={!boundaryLayer?.bounds} className="flex items-center justify-center w-9 h-9 text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed border-r border-border" title="Zoom to boundary">
          <Maximize2 className="w-4 h-4" />
        </button>
        <button onClick={() => setBoxMode((v) => !v)} className={`flex items-center justify-center w-9 h-9 border-r border-border ${boxMode ? "bg-blue-500 text-white hover:bg-blue-600" : "text-muted-foreground hover:bg-muted"}`} title="Zoom to drawn area">
          <Square className="w-4 h-4" />
        </button>
        <button onClick={() => mapRef.current?.zoomIn()} className="flex items-center justify-center w-9 h-9 text-muted-foreground hover:bg-muted border-r border-border" title="Zoom in">
          <Plus className="w-4 h-4" />
        </button>
        <button onClick={() => mapRef.current?.zoomOut()} className="flex items-center justify-center w-9 h-9 text-muted-foreground hover:bg-muted border-r border-border" title="Zoom out">
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setRulerActive((v) => !v); if (rulerActive) setRulerPoints([]); }}
          className={`flex items-center justify-center w-9 h-9 ${rulerActive ? "bg-blue-500 text-white hover:bg-blue-600" : "text-muted-foreground hover:bg-muted"}`}
          title="Measure distance"
        >
          <Ruler className="w-4 h-4" />
        </button>
        <button
          onClick={() => setHighlightOutBoundary(true)}
          disabled={!boundaryGeoJSON || boundaryGeoJSON.error || highlightOutBoundary}
          className={`flex items-center justify-center w-9 h-9 border-l border-border ${highlightOutBoundary ? "bg-red-500 text-white" : "text-muted-foreground hover:bg-muted"} disabled:opacity-40 disabled:cursor-not-allowed`}
          title="Highlight components outside boundary"
        >
          <AlertTriangle className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowPointNumbers((v) => !v)}
          className={`flex items-center justify-center w-9 h-9 border-l border-border ${showPointNumbers ? "bg-blue-500 text-white hover:bg-blue-600" : "text-muted-foreground hover:bg-muted"}`}
          title="Show point numbers (main/insertion meters, Ultrasonic Meters, isolated valves/points)"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        {showPointNumbers && (
          <NumberStyleControls
            style={numberStyle}
            scope={numberScope}
            setScope={setNumberScope}
            selectedCount={selectedNumberIds.size}
            onApply={applyNumberStyle}
            onClearSelection={() => setSelectedNumberIds(new Set())}
          />
        )}
        <MapScreenshot mapRef={mapRef} dmas={dmas} project={project} targetRef={rootRef} onToggleFocusDma={onToggleFocusDma} />
      </div>

      {/* Manual layer editing toolbar — point mode */}
      {manualEditLayer && !isManualLineLayer && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: manualEditLayer.color || "#3b82f6" }} />
            <span className="text-sm font-semibold text-foreground">{manualEditLayer.name}</span>
          </div>
          <div className="w-px h-5 bg-slate-200" />
          <span className="text-xs text-muted-foreground">{manualPoints.length} point{manualPoints.length !== 1 ? "s" : ""}</span>
          <span className="text-xs text-muted-foreground/70 hidden lg:inline">Click map to add · Drag to move · Click marker to name/delete</span>
          <div className="w-px h-5 bg-slate-200" />
          <button
            onClick={() => setManualPoints((prev) => prev.slice(0, -1))}
            disabled={manualPoints.length === 0}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            title="Remove last point"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
          <button
            onClick={() => setManualPoints([])}
            disabled={manualPoints.length === 0}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Remove all points"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <button
            onClick={() => onSaveManualLayer?.(manualEditLayer, manualPoints)}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button
            onClick={() => onCancelManualLayer?.()}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      )}

      {/* Manual layer editing toolbar — line mode */}
      {manualEditLayer && isManualLineLayer && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="w-4 h-1 rounded-full shrink-0" style={{ backgroundColor: manualEditLayer.color || "#3b82f6" }} />
            <span className="text-sm font-semibold text-foreground">{manualEditLayer.name}</span>
          </div>
          <div className="w-px h-5 bg-border" />
          <span className="text-xs text-muted-foreground">{manualLines.length} line{manualLines.length !== 1 ? "s" : ""}</span>
          {currentLinePoints.length > 0 && (
            <span className="text-xs text-muted-foreground/70">{currentLinePoints.length} vertices</span>
          )}
          <span className="text-xs text-muted-foreground/70 hidden lg:inline">Click to add · Enter to finish · U to undo</span>
          <div className="w-px h-5 bg-border" />
          <button
            onClick={handleLineUndo}
            disabled={currentLinePoints.length === 0 && manualLines.length === 0}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo last vertex or line"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
          <button
            onClick={() => { setCurrentLinePoints([]); setManualLines([]); }}
            disabled={currentLinePoints.length === 0 && manualLines.length === 0}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Remove all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
          <div className="w-px h-5 bg-border" />
          <button
            onClick={() => onSaveManualLayer?.(manualEditLayer, [], manualLines)}
            disabled={manualLines.length === 0}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button
            onClick={() => onCancelManualLayer?.()}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      )}

      {/* Diameter prompt for finished line */}
      {lineDiameterDialog && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-2 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border px-4 py-3">
          <span className="text-sm font-medium text-foreground">Diameter ({diameterUnit(project?.distance_unit)}):</span>
          <input
            type="text"
            value={lineDiameterValue}
            onChange={(e) => setLineDiameterValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirmLineDiameter();
              if (e.key === "Escape") handleCancelLineDiameter();
            }}
            placeholder="e.g. 100"
            className="w-24 px-2 py-1 text-sm border border-border rounded-md bg-background"
            autoFocus
          />
          <button
            onClick={handleConfirmLineDiameter}
            disabled={!lineDiameterValue.trim()}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-3.5 h-3.5" /> Add Line
          </button>
          <button
            onClick={handleCancelLineDiameter}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="w-3.5 h-3.5" /> Back
          </button>
        </div>
      )}

      {/* Manual meter point dialog */}
      {meterPointId && (() => {
        const pt = manualPoints.find((p) => p.id === meterPointId);
        if (!pt) return null;
        return (
          <ManualMeterDialog
            point={pt}
            onSave={handleMeterPointSave}
            onCancel={handleMeterPointCancel}
            onDelete={handleMeterPointDelete}
          />
        );
      })()}

      {/* Drawing toolbar */}
      {drawMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border px-3 py-2">
          <span className="text-xs text-muted-foreground font-medium">{drawTarget === "boundary" ? "Boundary" : "DMA"} · {drawPoints.length} pts · S:Satellite T:Terrain</span>
          <div className="w-px h-5 bg-slate-200" />
          <button
            onClick={() => setDrawPoints((prev) => prev.slice(0, -1))}
            disabled={drawPoints.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
          <button
            onClick={() => {
              if (drawPoints.length >= 3) {
                if (drawTarget === "boundary") {
                  onBoundaryDrawn?.(drawPoints);
                } else {
                  setDmaDialog({ points: drawPoints });
                }
                setDrawMode(false);
              }
            }}
            disabled={drawPoints.length < 3}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-3.5 h-3.5" /> Finish
          </button>
          <button
            onClick={() => { setDrawMode(false); setDrawPoints([]); setMousePos(null); }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      )}

      {/* DMA edit panel — shape + properties */}
      {editDma && (
        <DmaEditPanel
          name={editName}
          color={editColor}
          transparency={editTransparency}
          pointCount={editPoints.length}
          points={editPoints}
          onPointsChange={setEditPoints}
          onNameChange={setEditName}
          onColorChange={setEditColor}
          onTransparencyChange={setEditTransparency}
          onSave={handleEditSave}
          onCancel={() => setEditDma(null)}
          mainMeters={(meters || []).filter((m) => m.is_main)}
          mainMeterId={editMainMeterId}
          onMainMeterChange={setEditMainMeterId}
        />
      )}

      {/* Boundary edit toolbar */}
      {editBoundary && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border px-4 py-2">
          <span className="text-sm font-semibold text-foreground">Edit Boundary</span>
          <span className="text-xs text-muted-foreground">{boundaryEditPoints.length} pts</span>
          <div className="w-px h-5 bg-slate-200" />
          <span className="text-xs text-muted-foreground/70 hidden lg:inline">Drag vertices · Click midpoints to add</span>
          <div className="w-px h-5 bg-slate-200" />
          <button
            onClick={() => onRedrawBoundary?.()}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted"
            title="Discard current boundary and draw a new one from scratch"
          >
            <Pencil className="w-3.5 h-3.5" /> Redraw
          </button>
          <button
            onClick={() => onRefetchBoundary?.()}
            disabled={refetchingBoundary}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            title="Re-download the city boundary from Google Maps"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refetchingBoundary ? "animate-spin" : ""}`} /> {refetchingBoundary ? "Fetching…" : "Re-fetch"}
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <button
            onClick={() => onBoundaryEditSave?.(boundaryEditPoints)}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button
            onClick={() => onBoundaryEditCancel?.()}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      )}

      {/* Ruler info panel */}
      {rulerActive && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-bold text-foreground">{formatDistance(rulerDistance, project?.distance_unit || "Km")}</span>
          </div>
          {rulerPoints.length > 0 && (
            <div className="w-px h-5 bg-slate-200" />
          )}
          {rulerPoints.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{rulerPoints.length} pt{rulerPoints.length > 1 ? "s" : ""}</span>
              <button
                onClick={() => setRulerPoints((prev) => prev.slice(0, -1))}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted"
                title="Undo last point"
              >
                <Undo2 className="w-3.5 h-3.5" /> Undo
              </button>
              <button
                onClick={() => setRulerPoints([])}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted"
                title="Clear all"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          )}
          <div className="w-px h-5 bg-slate-200" />
          <button
            onClick={() => { setRulerActive(false); setRulerPoints([]); }}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="w-3.5 h-3.5" /> Exit
          </button>
        </div>
      )}

      {/* Meter search — top-left */}
      {meters && meters.length > 0 && (
        <MeterSearchBar meters={meters} onSelect={handleMeterSelect} />
      )}

      {/* Map view controls + Legend — top-left */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2 items-start">
        {/* Map type + source selectors */}
        <div className="flex items-center gap-2 self-start">
        <div className="relative">
          <button
            onClick={() => setShowMapTypeMenu((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-card/95 backdrop-blur border border-border text-muted-foreground hover:bg-muted transition-colors"
            title="Map Type"
          >
            {(() => {
              const mapTypes = [
                { key: "satellite", label: "Satellite", Icon: Satellite },
                { key: "terrain", label: "Terrain", Icon: Mountain },
                { key: "topo", label: "Topo", Icon: MapIcon },
              ];
              const active = mapTypes.find((mt) => mt.key === mapType) || mapTypes[1];
              return <><active.Icon className="w-3.5 h-3.5" /> {active.label}</>;
            })()}
          </button>
          {showMapTypeMenu && (
            <>
              <div className="fixed inset-0 z-[999]" onClick={() => setShowMapTypeMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg p-1 z-[1001] min-w-[140px]">
                {[
                  { key: "satellite", label: "Satellite", Icon: Satellite },
                  { key: "terrain", label: "Terrain", Icon: Mountain },
                  { key: "topo", label: "Topo", Icon: MapIcon },
                ].map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => { setMapType(key); setShowMapTypeMenu(false); }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      mapType === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowSourceMenu((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-card/95 backdrop-blur border border-border text-muted-foreground hover:bg-muted transition-colors"
            title="Map Source"
          >
            <Globe className="w-3.5 h-3.5" /> {MAP_SOURCES[mapSource]?.label}
          </button>
          {showSourceMenu && (
            <>
              <div className="fixed inset-0 z-[999]" onClick={() => setShowSourceMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg p-1 z-[1001] min-w-[140px]">
                {SOURCE_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => { setMapSource(key); setShowSourceMenu(false); }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      mapSource === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <MapIcon className="w-3.5 h-3.5" /> {MAP_SOURCES[key].label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Map brightness / dimming control */}
        <div className="relative">
          <button
            onClick={() => setShowDimMenu((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-card/95 backdrop-blur border border-border text-muted-foreground hover:bg-muted transition-colors"
            title="Map brightness"
          >
            <Sun className="w-3.5 h-3.5" /> {mapDimming}%
          </button>
          {showDimMenu && (
            <>
              <div className="fixed inset-0 z-[999]" onClick={() => setShowDimMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg p-3 z-[1001] min-w-[180px]">
                <input
                  type="range"
                  min={20}
                  max={100}
                  step={5}
                  value={mapDimming}
                  onChange={(e) => setMapDimming(parseInt(e.target.value, 10))}
                  className="w-full accent-primary"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-muted-foreground">Dim</span>
                  <span className="text-xs font-medium text-foreground">{mapDimming}%</span>
                  <span className="text-[10px] text-muted-foreground">Bright</span>
                </div>
              </div>
            </>
          )}
        </div>
        </div>

        {(shpLayers.length > 0 || allDataLayers.length > 0 || (dmas || []).length > 0) && (
          <div className="bg-card/95 backdrop-blur rounded-xl shadow-lg border border-border p-3 w-[230px]">
            <div className={`flex items-center justify-between transition-[margin] duration-300 ${legendMinimized ? "mb-0" : "mb-2"}`}>
              <p className="text-xs font-semibold text-foreground/90">Legend</p>
              <button
                onClick={() => setLegendMinimized((v) => !v)}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title={legendMinimized ? "Expand" : "Minimize"}
              >
                <ChevronDown className="w-3.5 h-3.5 transition-transform duration-300 ease-in-out" style={{ transform: legendMinimized ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
              </button>
            </div>
            {/* Roll-up: grid-rows 1fr -> 0fr animates to the content's own
                height, which a plain max-height transition can't do. */}
            <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${legendMinimized ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
            <div className="overflow-hidden min-h-0">
            <button
              onClick={() => setShowDmaLabels((v) => !v)}
              className={`w-full flex items-center justify-between gap-2 mb-2 pb-2 border-b border-border px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${showDmaLabels ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:bg-muted"}`}
            >
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> DMA Names
              </span>
              <span className={`relative inline-flex h-3.5 w-6 rounded-full transition-colors ${showDmaLabels ? "bg-primary" : "bg-muted-foreground/40"}`}>
                <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-card transition-transform ${showDmaLabels ? "translate-x-3" : "translate-x-0.5"}`} />
              </span>
            </button>
            {(dmas || []).length > 0 && (
              <button
                onClick={handleToggleAllDmaVisible}
                className={`w-full flex items-center justify-between gap-2 mb-2 pb-2 border-b border-border px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${allDmaVisible ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:bg-muted"}`}
              >
                <span className="flex items-center gap-1.5">
                  {allDmaVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} {allDmaVisible ? "Hide All DMAs" : "Show All DMAs"}
                </span>
                <span className={`relative inline-flex h-3.5 w-6 rounded-full transition-colors ${allDmaVisible ? "bg-primary" : "bg-muted-foreground/40"}`}>
                  <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-card transition-transform ${allDmaVisible ? "translate-x-3" : "translate-x-0.5"}`} />
                </span>
              </button>
            )}
            <div className="space-y-1.5">
              {[...allDataLayers, ...shpLayers].sort(panelSort).map((layer) => {
                const boundary = /boundary/i.test(layer.name);
                const pipe = layer.pipe_config;
                return (
                  <div key={layer.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    {boundary ? (
                      <span className="w-4 h-0 border-t-2 border-dashed shrink-0" style={{ borderColor: "#dc2626" }} />
                    ) : layer.icon_url ? (
                      <img src={layer.icon_url} className="w-4 h-4 object-contain shrink-0" alt="" />
                    ) : pipe ? (
                      <span className="w-4 h-0 border-t-2 shrink-0" style={{ borderColor: pipe.uniform ? layer.color : (pipe.diameters[0]?.color || layer.color), borderTopWidth: 3 }} />
                    ) : (
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: layer.color }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-foreground">{layer.name}</p>
                      <p className="text-[10px] text-muted-foreground/70">{layer.feature_count || 0} records</p>
                    </div>
                    <button
                      onClick={() => onToggleVisibility?.(layer)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                      title={layer.visible ? "Hide layer" : "Show layer"}
                    >
                      {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border mt-2 pt-2">
              <ViewSelector projectId={project.id} layers={layers} onApplyView={handleApplyView} />
            </div>
            </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating help box for draw/edit modes */}
      <MapHelpBox mode={
        drawMode && drawTarget !== "boundary" ? "draw_dma"
        : manualEditLayer && isManualLineLayer ? "water_lines"
        : manualEditLayer && !isManualLineLayer ? "insertion_meters"
        : isolatedMode ? "isolated_points"
        : null
      } />

      <DmaConfigDialog
        open={!!dmaDialog}
        onOpenChange={(open) => { if (!open) setDmaDialog(null); }}
        polygonPoints={dmaDialog?.points || []}
        boundaryGeoJSON={boundaryGeoJSON}
        meters={meters}
        existingDmaCount={dmas?.length || 0}
        projectId={project.id}
        onSaved={onDmaCreated}
      />
    </div>
  );
}