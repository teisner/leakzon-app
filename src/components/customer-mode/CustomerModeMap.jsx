import React, { useState, useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, Polygon, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { Satellite, Mountain, Map as MapIcon, Globe, Plus, Minus, Maximize2, X } from "lucide-react";
import { MAP_SOURCES, SOURCE_KEYS } from "@/lib/mapSources";
import { reprojectToWGS84 } from "@/lib/geoAnalysis";
import { getPipeStyle } from "@/lib/pipeStyling";
import { createShapeIcon } from "@/lib/shapeIcons";
import { buildFeaturePopup } from "@/lib/featurePopup";
import { isValveLayer, isFeatureIsolated, findIsolatedForFeature } from "@/lib/isolatedPoints";
import BingTileLayer from "@/components/project/BingTileLayer";
import MeterMarkers from "@/components/project/MeterMarkers";
import PointNumberBadges from "@/components/project/PointNumberBadges";
import { buildNumberablePoints } from "@/lib/pointNumbering";
import CustomerModeLegend from "./CustomerModeLegend";
import CustomerModeDmaPanel from "./CustomerModeDmaPanel";
import CustomerModeAnnotationTools, { ANNOTATION_COLORS } from "./CustomerModeAnnotationTools";
import { AnnotationHandler, AnnotationLayer } from "./CustomerModeAnnotations";
import CustomerModeAnnotationList from "./CustomerModeAnnotationList";
import CustomerModeCommentEditor from "./CustomerModeCommentEditor";
import { callFunction } from "@/lib/publicFunction";
import "leaflet/dist/leaflet.css";


delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

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
    }, 200);
    return () => clearTimeout(timer);
  }, [bounds, map]);
  return null;
}

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export default function CustomerModeMap({ project, layers, dmas, meters, isolatedPoints, token }) {
  const [geojsonCache, setGeojsonCache] = useState({});
  const [visibleLayers, setVisibleLayers] = useState({});
  const [showDmas, setShowDmas] = useState(true);
  const [showDmaNames, setShowDmaNames] = useState(true);
  const [showPointNumbers, setShowPointNumbers] = useState(false);
  const [mapSource, setMapSource] = useState("google");
  const [mapType, setMapType] = useState("terrain");
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [annotationMode, setAnnotationMode] = useState(null);
  const [annotationColor, setAnnotationColor] = useState("#ef4444");
  const [annotationWidth, setAnnotationWidth] = useState(3);
  const [arrowStart, setArrowStart] = useState(null);
  const [editingComment, setEditingComment] = useState(null);
  const mapRef = useRef(null);

  // Load annotations from DB (fall back to localStorage migration)
  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await callFunction("manageCustomerAnnotations", { action: "list", project_id: project.id, token });
        if (cancelled) return;
        const dbAnnotations = res?.annotations || [];
        if (dbAnnotations.length > 0) {
          setAnnotations(dbAnnotations.map((a) => {
            let data = {};
            try { data = JSON.parse(a.data); } catch { /* skip */ }
            return { ...data, db_id: a.id };
          }));
        } else {
          // Migrate from localStorage if exists
          const saved = localStorage.getItem(`cm-annotations-${project.id}`);
          if (saved) {
            const local = JSON.parse(saved);
            if (Array.isArray(local) && local.length > 0) {
              setAnnotations(local);
              for (const ann of local) {
                try {
                  const createRes = await callFunction("manageCustomerAnnotations", { action: "create", project_id: project.id, annotation: ann, token });
                  if (createRes?.id) {
                    setAnnotations((prev) => prev.map((a) => a.id === ann.id ? { ...a, db_id: createRes.id } : a));
                  }
                } catch { /* skip */ }
              }
            }
          }
        }
      } catch {
        // Fallback to localStorage
        try {
          const saved = localStorage.getItem(`cm-annotations-${project.id}`);
          if (saved) setAnnotations(JSON.parse(saved));
        } catch { /* skip */ }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [project?.id]);

  // Keep localStorage in sync as cache
  useEffect(() => {
    if (!project?.id) return;
    try {
      localStorage.setItem(`cm-annotations-${project.id}`, JSON.stringify(annotations));
    } catch { /* skip */ }
  }, [annotations, project?.id]);

  // DB persistence helpers
  const persistCreate = async (annotation) => {
    if (!project?.id) return;
    try {
      const res = await callFunction("manageCustomerAnnotations", { action: "create", project_id: project.id, annotation, token });
      if (res?.id) {
        setAnnotations((prev) => prev.map((a) => (a.id === annotation.id ? { ...a, db_id: res.id } : a)));
      }
    } catch { /* skip */ }
  };

  const persistUpdate = async (annotation) => {
    if (!annotation?.db_id) return;
    try {
      await callFunction("manageCustomerAnnotations", { action: "update", project_id: project.id, annotation_id: annotation.db_id, annotation, token });
    } catch { /* skip */ }
  };

  const persistDelete = async (annotation) => {
    if (!annotation?.db_id) return;
    try {
      await callFunction("manageCustomerAnnotations", { action: "delete", project_id: project.id, annotation_id: annotation.db_id, token });
    } catch { /* skip */ }
  };

  // Fetch GeoJSON for visible SHP layers
  useEffect(() => {
    layers
      .filter((l) => l.layer_type === "shp" && l.file_url)
      .forEach(async (layer) => {
        if (!geojsonCache[layer.id]) {
          try {
            const res = await fetch(layer.file_url);
            if (!res.ok) return;
            const raw = await res.json();
            const data = reprojectToWGS84(raw);
            setGeojsonCache((prev) => ({ ...prev, [layer.id]: data }));
          } catch {
            /* skip */
          }
        }
      });
  }, [layers]);

  const combinedBounds = useMemo(() => {
    const withBounds = layers.filter((l) => l.bounds);
    if (withBounds.length === 0) return null;
    return withBounds.reduce(
      (acc, l) => ({
        north: Math.max(acc.north, l.bounds.north),
        south: Math.min(acc.south, l.bounds.south),
        east: Math.max(acc.east, l.bounds.east),
        west: Math.min(acc.west, l.bounds.west),
      }),
      { north: -Infinity, south: Infinity, east: -Infinity, west: Infinity }
    );
  }, [layers]);

  const shpLayers = layers.filter((l) => l.layer_type === "shp");
  const dataLayers = layers.filter((l) => l.layer_type === "data");

  // Numbered points for the "Show Point Numbers" toggle — main/insertion
  // meters, Ultrasonic Meters layer points, and isolated valves/points only.
  const numberedPoints = useMemo(() => {
    if (!showPointNumbers) return [];
    return buildNumberablePoints({ meters, layers, isolatedPoints, geojsonCache });
  }, [showPointNumbers, meters, layers, isolatedPoints, geojsonCache]);

  const handleFocusDma = (polygon) => {
    if (!mapRef.current || !polygon || polygon.length < 3) return;
    const lats = polygon.map(([lat]) => lat);
    const lngs = polygon.map(([, lng]) => lng);
    mapRef.current.fitBounds(
      [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
      { padding: [60, 60] }
    );
  };

  const handleZoomFit = () => {
    if (!mapRef.current || !combinedBounds) return;
    mapRef.current.fitBounds(
      [[combinedBounds.south, combinedBounds.west], [combinedBounds.north, combinedBounds.east]],
      { padding: [50, 50] }
    );
  };

  const handleSetAnnotationMode = (newMode) => {
    setAnnotationMode(newMode);
    if (!newMode) setArrowStart(null);
  };

  const genId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const handlePlaceComment = (lat, lng) => {
    const newComment = {
      id: genId(),
      type: "comment",
      lat, lng,
      text: "",
      color: annotationColor,
    };
    setAnnotations((prev) => [...prev, newComment]);
    setAnnotationMode(null);
    setTimeout(() => setEditingComment(newComment), 150);
  };

  const handleSaveComment = (id, text) => {
    const annotation = annotations.find((a) => a.id === id);
    if (!text.trim()) {
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      persistDelete(annotation);
    } else {
      const updated = { ...annotation, text };
      setAnnotations((prev) => prev.map((a) => (a.id === id ? updated : a)));
      if (annotation?.db_id) {
        persistUpdate(updated);
      } else {
        persistCreate(updated);
      }
    }
    setEditingComment(null);
  };

  const handleCloseCommentEditor = () => {
    if (editingComment && !editingComment.text?.trim()) {
      setAnnotations((prev) => prev.filter((a) => a.id !== editingComment.id));
    }
    setEditingComment(null);
  };

  const handleArrowClick = (lat, lng) => {
    if (!arrowStart) {
      setArrowStart({ lat, lng });
    } else {
      const newArrow = {
        id: genId(),
        type: "arrow",
        title: "",
        start_lat: arrowStart.lat,
        start_lng: arrowStart.lng,
        end_lat: lat,
        end_lng: lng,
        color: annotationColor,
        width: annotationWidth,
      };
      setAnnotations((prev) => [...prev, newArrow]);
      setArrowStart(null);
      setAnnotationMode(null);
      persistCreate(newArrow);
    }
  };

  const handleDrawingComplete = (points) => {
    const newDrawing = {
      id: genId(),
      type: "drawing",
      title: "",
      points,
      color: annotationColor,
      width: annotationWidth,
    };
    setAnnotations((prev) => [...prev, newDrawing]);
    setAnnotationMode(null);
    persistCreate(newDrawing);
  };

  const handleDeleteAnnotation = (id) => {
    const annotation = annotations.find((a) => a.id === id);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    persistDelete(annotation);
    setEditingComment(null);
  };

  const handleRenameAnnotation = (id, title) => {
    const annotation = annotations.find((a) => a.id === id);
    const updated = { ...annotation, title };
    setAnnotations((prev) => prev.map((a) => (a.id === id ? updated : a)));
    persistUpdate(updated);
  };

  const handleFocusAnnotation = (annotation) => {
    if (!mapRef.current) return;
    if (annotation.type === "comment") {
      mapRef.current.flyTo([annotation.lat, annotation.lng], 17, { duration: 0.6 });
    } else if (annotation.type === "arrow") {
      mapRef.current.fitBounds(
        [[annotation.start_lat, annotation.start_lng], [annotation.end_lat, annotation.end_lng]],
        { padding: [80, 80] }
      );
    } else if (annotation.type === "drawing" && annotation.points?.length >= 2) {
      const lats = annotation.points.map(([lat]) => lat);
      const lngs = annotation.points.map(([, lng]) => lng);
      mapRef.current.fitBounds(
        [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
        { padding: [80, 80] }
      );
    }
  };

  const isLayerVisible = (layer) =>
    visibleLayers[layer.id] !== undefined ? visibleLayers[layer.id] : (layer.visible ?? true);

  const toggleLayer = (layerId) => {
    setVisibleLayers((prev) => {
      const layer = layers.find((l) => l.id === layerId);
      const currentlyVisible = prev[layerId] !== undefined ? prev[layerId] : (layer?.visible ?? true);
      return { ...prev, [layerId]: !currentlyVisible };
    });
  };

  const tileConfig = MAP_SOURCES[mapSource]?.[mapType] || MAP_SOURCES["google"]?.["terrain"];

  // Style function for GeoJSON features — mirrors ProjectMap exactly
  const buildLayerStyleFn = (layer) => {
    return (feature) => {
      // Isolated point on a valve layer
      if (isValveLayer(layer) && isFeatureIsolated(feature, isolatedPoints)) {
        const ip = findIsolatedForFeature(feature, isolatedPoints);
        return {
          color: "#000000",
          weight: 3,
          fillColor: ip?.color || "#92c141",
          fillOpacity: 0.9,
        };
      }
      // Boundary
      if (/boundary/i.test(layer.name)) {
        return {
          color: "#dc2626",
          weight: 4,
          opacity: 1,
          fillColor: "#000000",
          fillOpacity: 0,
          dashArray: "8,4",
        };
      }
      // Pipe / water line
      const pipe = layer.pipe_config;
      if (pipe) {
        return pipe.uniform
          ? { color: layer.color, weight: 3, opacity: 1 }
          : getPipeStyle(feature, pipe);
      }
      // Point layer
      const isPointLayer = layer.geometry_types?.some((t) => t === "Point" || t === "MultiPoint");
      if (isPointLayer) {
        const pc = layer.point_config || {};
        const isOutline = pc.fill_style === "outline";
        return {
          color: layer.color,
          weight: 2,
          fillColor: isOutline ? "transparent" : layer.color,
          fillOpacity: isOutline ? 0 : 0.8,
        };
      }
      // Default polygon/line
      return { color: layer.color, weight: 2, fillColor: layer.color, fillOpacity: 0.15 };
    };
  };

  // pointToLayer — mirrors ProjectMap exactly
  const buildPointToLayerFn = (layer) => {
    return (feature, latlng) => {
      // Isolated point styling on valve layer
      if (isValveLayer(layer) && isFeatureIsolated(feature, isolatedPoints)) {
        const ip = findIsolatedForFeature(feature, isolatedPoints);
        return L.circleMarker(latlng, {
          radius: 9,
          color: "#000000",
          weight: 3,
          fillColor: ip?.color || "#92c141",
          fillOpacity: 0.9,
        });
      }
      // Custom icon
      if (layer.icon_url) {
        const iconSize = layer.point_config?.icon_size || 28;
        return L.marker(latlng, {
          icon: L.icon({
            iconUrl: layer.icon_url,
            iconSize: [iconSize, iconSize],
            iconAnchor: [iconSize / 2, iconSize / 2],
          }),
        });
      }
      // Shape markers (star, square, triangle)
      const pc = layer.point_config || {};
      const isOutline = pc.fill_style === "outline";
      const shape = pc.shape || "circle";
      if (shape !== "circle") {
        return L.marker(latlng, {
          icon: createShapeIcon(shape, layer.color, pc.radius || 6, pc.fill_style),
        });
      }
      // Default circle marker
      return L.circleMarker(latlng, {
        radius: pc.radius || 6,
        color: layer.color,
        weight: 2,
        fillColor: isOutline ? "transparent" : layer.color,
        fillOpacity: isOutline ? 0 : 0.8,
      });
    };
  };

  const getLayerKey = (layer) => {
    const pipeKey = layer.pipe_config
      ? `${layer.pipe_config.uniform ? "uniform" : "diameter"}|${(layer.pipe_config.diameters || []).map((d) => `${d.value}-${d.visible}-${d.color}-${d.weight}`).join("|")}`
      : "";
    const pc = layer.point_config;
    const pointKey = pc ? `${pc.shape || "circle"}-${pc.fill_style}-${pc.radius}-${pc.icon_size || 28}` : "";
    return `${layer.id}-${layer.color}-${layer.icon_url || ""}-${pipeKey}-${pointKey}-${layer.sort_order ?? 0}-${isolatedPoints?.length || 0}`;
  };

  return (
    <div className="relative h-full w-full">
      <MapContainer
        ref={mapRef}
        center={[project.latitude || 0, project.longitude || 0]}
        zoom={13}
        maxZoom={20}
        className="h-full w-full"
        scrollWheelZoom
        zoomControl={false}
        preferCanvas
      >
        {tileConfig?.bing ? (
          <BingTileLayer
            url={tileConfig.url}
            attribution={tileConfig.attribution}
            subdomains={tileConfig.subdomains || "0123"}
            maxZoom={20}
          />
        ) : (
          <TileLayer
            key={`${mapSource}-${mapType}`}
            url={tileConfig?.url}
            attribution={tileConfig?.attribution}
            subdomains={tileConfig?.subdomains || "abc"}
            maxZoom={20}
          />
        )}
        <FitToBounds bounds={combinedBounds} />
        <MapResizer />
        {showPointNumbers && <PointNumberBadges points={numberedPoints} />}

        {/* SHP / GeoJSON layers */}
        {shpLayers.map((layer) => {
          if (!isLayerVisible(layer)) return null;
          const raw = geojsonCache[layer.id];
          if (!raw) return null;
          return (
            <GeoJSON
              key={getLayerKey(layer)}
              data={raw}
              style={buildLayerStyleFn(layer)}
              onEachFeature={(feature, lyr) => {
                if (!/boundary/i.test(layer.name)) {
                  lyr.bindPopup(buildFeaturePopup(feature, layer));
                }
              }}
              pointToLayer={buildPointToLayerFn(layer)}
            />
          );
        })}

        {/* DMA polygons */}
        {showDmas &&
          dmas
            .filter((d) => d.visible)
            .map((dma) => {
              let poly;
              try {
                poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
              } catch {
                return null;
              }
              if (!Array.isArray(poly) || poly.length < 3) return null;
              const centroid = poly
                .reduce((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0])
                .map((v) => v / poly.length);
              return (
                <React.Fragment key={`dma-${dma.id}`}>
                  <Polygon
                    positions={poly}
                    pathOptions={{
                      color: dma.color,
                      fillColor: dma.color,
                      fillOpacity: dma.transparency ?? 0.3,
                      weight: 2,
                    }}
                  />
                  {showDmaNames && (
                    <Marker
                      position={centroid}
                      icon={L.divIcon({
                        className: "dma-label-marker",
                        html: `<div class="dma-label"><span class="dma-dot" style="background:${dma.color || "#3b82f6"}"></span>${dma.name}</div>`,
                        iconSize: [0, 0],
                        iconAnchor: [0, 0],
                      })}
                      interactive={false}
                    />
                  )}
                </React.Fragment>
              );
            })}

        {/* Data layers (meters) */}
        {dataLayers.map((layer) => {
          if (!isLayerVisible(layer)) return null;
          const layerMeters = meters.filter(
            (m) =>
              m.layer_id
                ? m.layer_id === layer.id
                : m.source_file_url && m.source_file_url === layer.file_url
          );
          if (layerMeters.length === 0) return null;
          return (
            <MeterMarkers
              key={`data-${layer.id}`}
              meters={layerMeters}
              layerConfig={layer}
              highlightedUid={null}
              highlightedMeterIds={null}
              onToggleMain={null}
            />
          );
        })}

        {/* Annotations — interaction handler + rendering */}
        <AnnotationHandler
          mode={annotationMode}
          color={annotationColor}
          width={annotationWidth}
          arrowStart={arrowStart}
          onArrowClick={handleArrowClick}
          onDrawingComplete={handleDrawingComplete}
          onPlaceComment={handlePlaceComment}
        />
        <AnnotationLayer
          annotations={annotations}
          arrowStart={arrowStart}
          annotationMode={annotationMode}
          onDeleteAnnotation={handleDeleteAnnotation}
          onEditComment={setEditingComment}
        />
      </MapContainer>

      {/* Map source + type selectors — top center */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1.5">
        <div className="relative">
          <button
            onClick={() => {
              setShowTypeMenu((v) => !v);
              setShowSourceMenu(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-card/95 backdrop-blur border border-border text-muted-foreground hover:bg-muted transition-colors"
          >
            {(() => {
              const types = [
                { key: "satellite", label: "Satellite", Icon: Satellite },
                { key: "terrain", label: "Terrain", Icon: Mountain },
              ];
              const active = types.find((t) => t.key === mapType) || types[1];
              return (
                <>
                  <active.Icon className="w-3.5 h-3.5" /> {active.label}
                </>
              );
            })()}
          </button>
          {showTypeMenu && (
            <>
              <div className="fixed inset-0 z-[999] bg-transparent" onClick={() => setShowTypeMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg p-1 z-[1001] min-w-[130px]">
                {[
                  { key: "satellite", label: "Satellite", Icon: Satellite },
                  { key: "terrain", label: "Terrain", Icon: Mountain },
                ].map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setMapType(key);
                      setShowTypeMenu(false);
                    }}
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
            onClick={() => {
              setShowSourceMenu((v) => !v);
              setShowTypeMenu(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-card/95 backdrop-blur border border-border text-muted-foreground hover:bg-muted transition-colors"
          >
            <Globe className="w-3.5 h-3.5" /> {MAP_SOURCES[mapSource]?.label}
          </button>
          {showSourceMenu && (
            <>
              <div className="fixed inset-0 z-[999] bg-transparent" onClick={() => setShowSourceMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg p-1 z-[1001] min-w-[130px]">
                {SOURCE_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      setMapSource(key);
                      setShowSourceMenu(false);
                    }}
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
      </div>

      {/* Legend */}
      <CustomerModeLegend
        layers={layers}
        dmas={dmas}
        visibleLayers={visibleLayers}
        onToggleLayer={toggleLayer}
        showDmas={showDmas}
        onToggleDmas={() => setShowDmas((v) => !v)}
        showDmaNames={showDmaNames}
        onToggleDmaNames={() => setShowDmaNames((v) => !v)}
        showPointNumbers={showPointNumbers}
        onTogglePointNumbers={() => setShowPointNumbers((v) => !v)}
      />

      {/* DMA panel — right side */}
      <CustomerModeDmaPanel
        dmas={dmas}
        meters={meters}
        distanceUnit={project?.distance_unit || "Km"}
        onFocusDma={handleFocusDma}
      />

      {/* Annotation mode banner */}
      {annotationMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-3 bg-zinc-700/95 backdrop-blur rounded-lg shadow-lg border border-border px-4 py-2">
          <span className="text-sm font-semibold text-foreground">
            {annotationMode === "comment" ? "Add Comment" : annotationMode === "arrow" ? "Add Arrow" : "Free Draw"}
          </span>
          <div className="w-px h-5 bg-border" />
          <span className="text-xs text-muted-foreground">
            {annotationMode === "comment"
              ? "Click on map to place"
              : annotationMode === "arrow"
                ? arrowStart ? "Click end point" : "Click start point"
                : "Click and drag to draw"}
          </span>
          <div className="w-px h-5 bg-border" />
          <button
            onClick={() => handleSetAnnotationMode(null)}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-white bg-primary hover:bg-primary/90"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      )}

      {/* Zoom controls — bottom left */}
      <div className="absolute bottom-3 left-3 z-[1000] flex flex-col bg-zinc-700/95 backdrop-blur rounded-lg shadow-lg border border-border overflow-hidden">
        <button onClick={() => mapRef.current?.zoomIn()} className="flex items-center justify-center w-11 h-11 text-foreground hover:bg-muted border-b border-border transition-colors" title="Zoom in">
          <Plus className="w-5 h-5" />
        </button>
        <button onClick={() => mapRef.current?.zoomOut()} className="flex items-center justify-center w-11 h-11 text-foreground hover:bg-muted border-b border-border transition-colors" title="Zoom out">
          <Minus className="w-5 h-5" />
        </button>
        <button onClick={handleZoomFit} disabled={!combinedBounds} className="flex items-center justify-center w-11 h-11 text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="Fit to boundary">
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>

      {/* Color palette — above footer when annotation tools active */}
      {(annotationMode === "arrow" || annotationMode === "draw" || annotationMode === "comment") && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 bg-zinc-700/95 backdrop-blur rounded-lg shadow-lg border border-border px-3 py-2">
          <div className="grid grid-cols-8 gap-1">
            {ANNOTATION_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setAnnotationColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${annotationColor === c ? "border-white" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">W</span>
            <input
              type="range"
              min={1}
              max={10}
              value={annotationWidth}
              onChange={(e) => setAnnotationWidth(parseInt(e.target.value))}
              className="w-14 accent-primary"
            />
            <span className="text-[10px] text-muted-foreground w-4">{annotationWidth}</span>
          </div>
        </div>
      )}

      {/* Annotation tools + list — bottom right, merged */}
      <CustomerModeAnnotationList
        annotations={annotations}
        onDeleteAnnotation={handleDeleteAnnotation}
        onFocusAnnotation={handleFocusAnnotation}
        onRenameAnnotation={handleRenameAnnotation}
        onEditComment={setEditingComment}
        mode={annotationMode}
        setMode={handleSetAnnotationMode}
      />

      {/* Comment editor */}
      {editingComment && (
        <CustomerModeCommentEditor
          comment={editingComment}
          onSave={handleSaveComment}
          onDelete={handleDeleteAnnotation}
          onClose={handleCloseCommentEditor}
        />
      )}
    </div>
  );
}