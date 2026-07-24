import React, { useState, useEffect, useMemo } from "react";
import { Boxes, Droplets, Shield, Gauge, Loader2, Layers, Search, LayoutGrid, Network } from "lucide-react";
import { reprojectToWGS84 } from "@/lib/geoAnalysis";
import { isValveLayer } from "@/lib/isolatedPoints";
import { pointInPolygon } from "@/lib/polygonUtils";
import { parseDmaPolygons } from "@/lib/isolatedPoints";
import WetworkTable from "./WetworkTable";

const COMPONENT_TYPES = [
  { key: "valve", label: "Valves", Icon: Gauge },
  { key: "isolated", label: "Isolated Points", Icon: Shield },
  { key: "water_line", label: "Water Lines", Icon: Droplets },
  { key: "insertion_meter", label: "Insertion Meters", Icon: Layers },
];

function getFeatureCoords(feature) {
  const g = feature.geometry;
  if (!g) return null;
  const c = g.coordinates;
  switch (g.type) {
    case "Point": return { lat: c[1], lng: c[0] };
    case "LineString": return c.length ? { lat: c[0][1], lng: c[0][0] } : null;
    default: return null;
  }
}

function getLineCentroid(feature) {
  const g = feature.geometry;
  if (!g || g.type !== "LineString" || !g.coordinates.length) return null;
  const coords = g.coordinates;
  const sumLat = coords.reduce((s, [, lat]) => s + lat, 0);
  const sumLng = coords.reduce((s, [lng]) => s + lng, 0);
  return { lat: sumLat / coords.length, lng: sumLng / coords.length };
}

// Calculates the total length of a LineString/MultiLineString in meters (haversine)
function calculateLineLength(feature) {
  const g = feature.geometry;
  if (!g) return 0;
  let coords = [];
  if (g.type === "LineString") coords = g.coordinates;
  else if (g.type === "MultiLineString") coords = g.coordinates.flat();
  else return 0;
  if (coords.length < 2) return 0;
  const R = 6371000;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(a));
  }
  return total;
}

function findDmaIds(lat, lng, dmaPolygons) {
  if (lat == null || lng == null) return [];
  return dmaPolygons.filter((d) => pointInPolygon(lat, lng, d.poly)).map((d) => d.id);
}

export default function WetworkInventory({ project, layers, dmas, meters, isolatedPoints }) {
  const [orgMode, setOrgMode] = useState("type");
  const [activeTypeTab, setActiveTypeTab] = useState("valve");
  const [activeDmaTab, setActiveDmaTab] = useState("__unassigned__");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const dmaPolygons = useMemo(() => parseDmaPolygons(dmas), [dmas]);
  const insertionLayerIds = useMemo(
    () => new Set(layers.filter((l) => l.category === "Insertion Meters").map((l) => l.id)),
    [layers]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const shpLayers = layers.filter((l) => l.layer_type === "shp" && l.file_url);
        const valveLayers = shpLayers.filter(isValveLayer);
        const waterLineLayers = shpLayers.filter(
          (l) => !isValveLayer(l) && !/boundary/i.test(l.name) &&
            (l.geometry_types?.some((t) => t === "LineString" || t === "MultiLineString"))
        );

        const built = [];

        // Valves
        const valveResults = await Promise.all(
          valveLayers.map(async (layer) => {
            try {
              const res = await fetch(layer.file_url);
              if (!res.ok) return [];
              const raw = await res.json();
              const data = reprojectToWGS84(raw);
              const features = (data.features || []).filter(
                (f) => f.geometry?.type === "Point" || f.geometry?.type === "MultiPoint"
              );
              return features.map((f, idx) => {
                const c = getFeatureCoords(f);
                return {
                  id: `valve-${layer.id}-${idx}`,
                  type: "valve",
                  name: f.properties?.name || f.properties?.NAME || `Valve ${idx + 1}`,
                  lat: c?.lat ?? null,
                  lng: c?.lng ?? null,
                  layerName: layer.name,
                  dmaIds: c ? findDmaIds(c.lat, c.lng, dmaPolygons) : [],
                  properties: f.properties || {},
                };
              });
            } catch { return []; }
          })
        );
        built.push(...valveResults.flat());

        // Water Lines
        const lineResults = await Promise.all(
          waterLineLayers.map(async (layer) => {
            try {
              const res = await fetch(layer.file_url);
              if (!res.ok) return [];
              const raw = await res.json();
              const data = reprojectToWGS84(raw);
              const features = (data.features || []).filter(
                (f) => f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString"
              );
              return features.map((f, idx) => {
                const center = getLineCentroid(f);
                return {
                  id: `wl-${layer.id}-${idx}`,
                  type: "water_line",
                  name: f.properties?.diameter ? `⌀${f.properties.diameter}` : `Line ${idx + 1}`,
                  lat: center?.lat ?? null,
                  lng: center?.lng ?? null,
                  length: calculateLineLength(f),
                  layerName: layer.name,
                  dmaIds: center ? findDmaIds(center.lat, center.lng, dmaPolygons) : [],
                  properties: f.properties || {},
                };
              });
            } catch { return []; }
          })
        );
        built.push(...lineResults.flat());

        // Isolated Points
        for (const ip of isolatedPoints || []) {
          const props = (() => {
            try { return typeof ip.feature_properties === "string" ? JSON.parse(ip.feature_properties) : ip.feature_properties || {}; }
            catch { return {}; }
          })();
          built.push({
            id: `iso-${ip.id}`,
            type: "isolated",
            name: props.valve_number || props.name || `Isolated ${ip.id.slice(-4)}`,
            lat: ip.latitude,
            lng: ip.longitude,
            layerName: "Isolated Valves",
            dmaIds: [ip.dma1_id, ip.dma2_id].filter(Boolean),
            properties: props,
          });
        }

        // Insertion Meters
        const insertionMeters = (meters || []).filter(
          (m) => m.is_main && insertionLayerIds.has(m.layer_id)
        );
        for (const m of insertionMeters) {
          const linkedDma = dmas.find((d) => d.main_meter_id === m.id);
          const dmaIds = linkedDma
            ? [linkedDma.id]
            : (m.latitude != null ? findDmaIds(m.latitude, m.longitude, dmaPolygons) : []);
          built.push({
            id: `ins-${m.id}`,
            type: "insertion_meter",
            name: m.uid,
            lat: m.latitude,
            lng: m.longitude,
            layerName: layers.find((l) => l.id === m.layer_id)?.name || "Insertion Meters",
            dmaIds,
            properties: { uid: m.uid, address: m.address, payer_name: m.payer_name, endpoint_id: m.endpoint_id, diameter: m.diameter },
          });
        }

        if (!cancelled) setItems(built);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [layers, dmas, meters, isolatedPoints, dmaPolygons, insertionLayerIds]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => {
      const dmaNames = item.dmaIds.map((id) => dmas.find((d) => d.id === id)?.name || "").join(" ");
      const propValues = Object.values(item.properties || {}).map((v) => String(v)).join(" ");
      const haystack = [item.name, item.layerName, item.type, dmaNames, propValues].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [items, searchQuery, dmas]);

  // Items grouped by component type
  const itemsByType = useMemo(() => {
    const map = { valve: [], isolated: [], water_line: [], insertion_meter: [] };
    for (const item of filteredItems) {
      if (map[item.type]) map[item.type].push(item);
    }
    return map;
  }, [filteredItems]);

  // Items grouped by DMA (each item can appear in multiple DMAs)
  const itemsByDma = useMemo(() => {
    const map = {};
    for (const d of dmas) map[d.id] = [];
    map["__unassigned__"] = [];
    for (const item of filteredItems) {
      if (item.dmaIds.length === 0) {
        map["__unassigned__"].push(item);
      } else {
        for (const did of item.dmaIds) {
          if (map[did]) map[did].push(item);
        }
      }
    }
    return map;
  }, [filteredItems, dmas]);

  const typeCounts = useMemo(() => ({
    valve: itemsByType.valve.length,
    isolated: itemsByType.isolated.length,
    water_line: itemsByType.water_line.length,
    insertion_meter: itemsByType.insertion_meter.length,
  }), [itemsByType]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading inventory…
      </div>
    );
  }

  const totalItems = filteredItems.length;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setOrgMode("type")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${orgMode === "type" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> By Type
            </button>
            <button
              onClick={() => setOrgMode("dma")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${orgMode === "dma" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Network className="w-3.5 h-3.5" /> By DMA
            </button>
          </div>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Network Inventory</span>
            <span className="text-xs text-muted-foreground">{totalItems} components</span>
          </div>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search components…"
            className="w-64 pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Tabs + Content */}
      {orgMode === "type" ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-border bg-card overflow-x-auto">
            {COMPONENT_TYPES.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTypeTab(key)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  activeTypeTab === key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTypeTab === key ? "bg-primary/20" : "bg-muted"}`}>
                  {typeCounts[key]}
                </span>
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden bg-background">
            <WetworkTable items={itemsByType[activeTypeTab] || []} dmas={dmas} itemType={activeTypeTab} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-border bg-card overflow-x-auto">
            <button
              onClick={() => setActiveDmaTab("__unassigned__")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                activeDmaTab === "__unassigned__"
                  ? "bg-orange-500/10 text-orange-600"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Not Assigned Yet
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeDmaTab === "__unassigned__" ? "bg-orange-500/20" : "bg-muted"}`}>
                {(itemsByDma["__unassigned__"] || []).length}
              </span>
            </button>
            {dmas.map((dma) => (
              <button
                key={dma.id}
                onClick={() => setActiveDmaTab(dma.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  activeDmaTab === dma.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dma.color || "#3b82f6" }} />
                {dma.name}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeDmaTab === dma.id ? "bg-primary/20" : "bg-muted"}`}>
                  {(itemsByDma[dma.id] || []).length}
                </span>
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden bg-background">
            <WetworkTable items={itemsByDma[activeDmaTab] || []} dmas={dmas} />
          </div>
        </div>
      )}
    </div>
  );
}