import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Polygon, Tooltip, GeoJSON, useMap, Marker } from "react-leaflet";
import L from "leaflet";
import { reprojectToWGS84 } from "@/lib/geoAnalysis";
import "leaflet/dist/leaflet.css";
import MapKeyboardNav from "@/components/project/MapKeyboardNav";
import { Plus, Minus } from "lucide-react";

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const raf = requestAnimationFrame(() => map.invalidateSize());
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(container);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [map]);
  return null;
}

export default function NetworkMapPanel({ project, dmas, layers }) {
  const mapRef = useRef(null);
  const [geojsonCache, setGeojsonCache] = useState({});
  const hasFittedRef = useRef(false);

  const shpLayers = (layers || [])
    .filter((l) => l.layer_type === "shp" && l.file_url && l.visible)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  useEffect(() => {
    shpLayers.forEach(async (layer) => {
      if (geojsonCache[layer.id]) return;
      try {
        const res = await fetch(layer.file_url);
        const rawData = await res.json();
        const data = reprojectToWGS84(rawData);
        setGeojsonCache((prev) => ({ ...prev, [layer.id]: data }));
      } catch (err) {
        console.error("Failed to fetch layer:", layer.name, err);
      }
    });
  }, [layers]);

  const polygons = (dmas || [])
    .map((dma) => {
      try {
        const poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
        if (!Array.isArray(poly) || poly.length < 3) return null;
        return { dma, poly };
      } catch { return null; }
    })
    .filter(Boolean);

  // Fit bounds once when first layer data is available
  useEffect(() => {
    if (!mapRef.current || hasFittedRef.current) return;
    const layerWithBounds = shpLayers.find((l) => l.bounds);
    if (layerWithBounds?.bounds) {
      const b = layerWithBounds.bounds;
      mapRef.current.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [50, 50] });
      hasFittedRef.current = true;
    }
  }, [geojsonCache]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        ref={mapRef}
        center={[project.latitude || 0, project.longitude || 0]}
        zoom={13}
        className="h-full w-full"
        zoomControl={false}
        scrollWheelZoom
        >
        <MapKeyboardNav />
        <TileLayer
          url="https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"
          attribution="&copy; Google"
          subdomains="0123"
        />
        <MapResizer />

        {/* SHP layers */}
        {shpLayers.map((layer) => {
          const data = geojsonCache[layer.id];
          if (!data || data.error) return null;
          const isBoundary = /boundary/i.test(layer.name);
          return (
            <GeoJSON
              key={`${layer.id}-${layer.color}`}
              data={data}
              style={
                isBoundary
                  ? { color: "#dc2626", weight: 3, fillOpacity: 0, dashArray: "8,4" }
                  : { color: layer.color, weight: 2, fillColor: layer.color, fillOpacity: 0.15 }
              }
              pointToLayer={(_, latlng) => L.circleMarker(latlng, {
                radius: 4,
                color: layer.color,
                fillColor: layer.color,
                fillOpacity: 0.8,
                weight: 2,
              })}
            />
          );
        })}

        {/* DMA polygons with name labels */}
        {polygons.map(({ dma, poly }) => {
          const centroid = poly.reduce((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0]).map((v) => v / poly.length);
          return (
            <React.Fragment key={dma.id}>
              <Polygon
                positions={poly}
                pathOptions={{
                  color: dma.color || "#3b82f6",
                  fillColor: dma.color || "#3b82f6",
                  fillOpacity: dma.transparency ?? 0.3,
                  weight: 2,
                }}
              />
              <Marker
                position={centroid}
                interactive={false}
                icon={L.divIcon({
                  className: "dma-label-marker",
                  html: `<div class="dma-label"><span class="dma-dot" style="background:${dma.color || "#3b82f6"}"></span>${dma.name}</div>`,
                  iconSize: [0, 0],
                  iconAnchor: [0, 0],
                })}
              />
            </React.Fragment>
          );
        })}
      </MapContainer>

      {/* Zoom controls */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex flex-row bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border overflow-hidden">
        <button onClick={() => mapRef.current?.zoomIn()} className="flex items-center justify-center w-9 h-9 text-muted-foreground hover:bg-muted border-r border-border" title="Zoom in">
          <Plus className="w-4 h-4" />
        </button>
        <button onClick={() => mapRef.current?.zoomOut()} className="flex items-center justify-center w-9 h-9 text-muted-foreground hover:bg-muted" title="Zoom out">
          <Minus className="w-4 h-4" />
        </button>
      </div>

      {/* Floating legend */}
      <div className="absolute bottom-2 right-2 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border p-2 max-w-[180px] z-[1000]">
        <p className="text-[10px] font-semibold text-foreground/80 mb-1">Legend</p>
        <div className="space-y-0.5">
          {polygons.length === 0 && shpLayers.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/50">No data</p>
          ) : (
            <>
              {polygons.slice(0, 6).map(({ dma }) => (
                <div key={dma.id} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: dma.color || "#3b82f6" }} />
                  <span className="text-[10px] text-muted-foreground truncate">{dma.name}</span>
                </div>
              ))}
              {polygons.length > 6 && (
                <p className="text-[10px] text-muted-foreground/50">+{polygons.length - 6} more</p>
              )}
              {polygons.length > 0 && shpLayers.length > 0 && (
                <div className="border-t border-border my-1" />
              )}
              {shpLayers.slice(0, 6).map((layer) => {
                const isBoundary = /boundary/i.test(layer.name);
                return (
                  <div key={layer.id} className="flex items-center gap-1.5">
                    {isBoundary ? (
                      <span className="w-3 h-0 border-t-2 border-dashed shrink-0" style={{ borderColor: "#dc2626" }} />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: layer.color }} />
                    )}
                    <span className="text-[10px] text-muted-foreground truncate">{layer.name}</span>
                  </div>
                );
              })}
              {shpLayers.length > 6 && (
                <p className="text-[10px] text-muted-foreground/50">+{shpLayers.length - 6} more</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}