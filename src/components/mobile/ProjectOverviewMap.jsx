import React, { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import { Loader2, Mountain, Satellite, Waves, CircleDot, MapPin } from "lucide-react";
import { callFunction } from "@/lib/publicFunction";
import { getPipeStyle } from "@/lib/pipeStyling";
import "leaflet/dist/leaflet.css";
import MapKeyboardNav from "@/components/project/MapKeyboardNav";

function MapResize() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => { clearTimeout(timer); ro.disconnect(); };
  }, [map]);
  return null;
}

function FitBounds({ meters }) {
  const map = useMap();
  useEffect(() => {
    const points = meters
      .filter((m) => m.latitude && m.longitude)
      .map((m) => [m.latitude, m.longitude]);
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [meters]);
  return null;
}

export default function ProjectOverviewMap({ projectId, project }) {
  const [layers, setLayers] = useState([]);
  const [meters, setMeters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mapType, setMapType] = useState("satellite");
  const [geoJsonCache, setGeoJsonCache] = useState({});
  const [toggles, setToggles] = useState({
    waterLines: true,
    valves: true,
    mainMeters: true,
    subMeters: true,
  });

  useEffect(() => {
    callFunction("getProjectMapData", { project_id: projectId })
      .then((res) => {
        setLayers(res?.layers || []);
        setMeters(res?.meters || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    const toFetch = layers.filter((l) => l.file_url && !geoJsonCache[l.id]);
    if (toFetch.length === 0) return;
    Promise.all(
      toFetch.map((l) =>
        fetch(l.file_url).then((r) => r.json()).then((gj) => ({ id: l.id, gj }))
      )
    )
      .then((results) => {
        setGeoJsonCache((prev) => {
          const next = { ...prev };
          results.forEach((r) => { next[r.id] = r.gj; });
          return next;
        });
      })
      .catch(() => {});
  }, [layers]);

  const waterLineLayers = useMemo(
    () => layers.filter((l) => l.geometry_types?.some((t) => t === "LineString" || t === "MultiLineString")),
    [layers]
  );

  const valveLayers = useMemo(
    () => layers.filter((l) => /valve/i.test(l.category || "")),
    [layers]
  );

  const mainMetersGeoJSON = useMemo(() => ({
    type: "FeatureCollection",
    features: meters
      .filter((m) => m.is_main && m.latitude && m.longitude)
      .map((m) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [m.longitude, m.latitude] },
        properties: { uid: m.uid },
      })),
  }), [meters]);

  const subMetersGeoJSON = useMemo(() => ({
    type: "FeatureCollection",
    features: meters
      .filter((m) => !m.is_main && m.latitude && m.longitude)
      .map((m) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [m.longitude, m.latitude] },
        properties: { uid: m.uid },
      })),
  }), [meters]);

  const getLineLayerStyle = (layer) => (feature) => {
    if (layer.pipe_config) {
      const style = getPipeStyle(feature, layer.pipe_config);
      if (style && style.opacity > 0) return style;
    }
    return { color: layer.color || "#3388ff", weight: 3, opacity: 0.8 };
  };

  const valveStyle = (layer) => (feature) => ({
    color: layer.color || "#64748b",
    weight: 2,
    opacity: 0.8,
  });

  const valvePointToLayer = (layer) => (feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 4,
      fillColor: layer.color || "#64748b",
      color: "#fff",
      weight: 1,
      fillOpacity: 1,
    });

  const meterPointToLayer = (color) => (feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 3,
      fillColor: color,
      color: "#fff",
      weight: 0.5,
      fillOpacity: 0.9,
    });

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center bg-slate-100 rounded-lg">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin mb-2" />
        <p className="text-xs text-slate-500">Loading project map…</p>
      </div>
    );
  }

  const center = [project?.latitude || 0, project?.longitude || 0];

  const ToggleButton = ({ active, onClick, color, icon, label }) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
        active
          ? "bg-slate-900 text-white"
          : "bg-slate-100 text-slate-400"
      }`}
    >
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: active ? color : "#cbd5e1" }} />
      {label}
    </button>
  );

  return (
    <div>
      <div className="relative h-[60vh] rounded-lg overflow-hidden border border-slate-200">
        <MapContainer center={center} zoom={14} className="h-full w-full" zoomControl={false} scrollWheelZoom>
          <MapKeyboardNav />
          {mapType === "satellite" ? (
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="&copy; Esri"
            />
          ) : (
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
              attribution="&copy; Esri"
            />
          )}
          <MapResize />
          <FitBounds meters={meters} />

          {toggles.waterLines && waterLineLayers.map((layer) =>
            geoJsonCache[layer.id] ? (
              <GeoJSON key={`wl-${layer.id}`} data={geoJsonCache[layer.id]} style={getLineLayerStyle(layer)} />
            ) : null
          )}

          {toggles.valves && valveLayers.map((layer) =>
            geoJsonCache[layer.id] ? (
              <GeoJSON
                key={`vl-${layer.id}`}
                data={geoJsonCache[layer.id]}
                style={valveStyle(layer)}
                pointToLayer={valvePointToLayer(layer)}
              />
            ) : null
          )}

          {toggles.mainMeters && mainMetersGeoJSON.features.length > 0 && (
            <GeoJSON key="main-meters" data={mainMetersGeoJSON} pointToLayer={meterPointToLayer("#2563eb")} />
          )}

          {toggles.subMeters && subMetersGeoJSON.features.length > 0 && (
            <GeoJSON key="sub-meters" data={subMetersGeoJSON} pointToLayer={meterPointToLayer("#f97316")} />
          )}
        </MapContainer>

        {/* Map type toggle */}
        <div className="absolute top-2 right-2 z-[1000] flex rounded-lg overflow-hidden border border-white/40 shadow-md">
          <button
            onClick={() => setMapType("satellite")}
            className={`flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${mapType === "satellite" ? "bg-blue-600 text-white" : "bg-white/90 text-slate-700"}`}
          >
            <Satellite className="w-3 h-3" /> Sat
          </button>
          <button
            onClick={() => setMapType("terrain")}
            className={`flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${mapType === "terrain" ? "bg-blue-600 text-white" : "bg-white/90 text-slate-700"}`}
          >
            <Mountain className="w-3 h-3" /> Terrain
          </button>
        </div>
      </div>

      {/* Layer toggles */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <ToggleButton
          active={toggles.waterLines}
          onClick={() => setToggles((t) => ({ ...t, waterLines: !t.waterLines }))}
          color="#3388ff"
          icon={<Waves className="w-3 h-3" />}
          label="Water Lines"
        />
        <ToggleButton
          active={toggles.valves}
          onClick={() => setToggles((t) => ({ ...t, valves: !t.valves }))}
          color="#64748b"
          icon={<CircleDot className="w-3 h-3" />}
          label="Valves"
        />
        <ToggleButton
          active={toggles.mainMeters}
          onClick={() => setToggles((t) => ({ ...t, mainMeters: !t.mainMeters }))}
          color="#2563eb"
          icon={<MapPin className="w-3 h-3" />}
          label="Main Meters"
        />
        <ToggleButton
          active={toggles.subMeters}
          onClick={() => setToggles((t) => ({ ...t, subMeters: !t.subMeters }))}
          color="#f97316"
          icon={<MapPin className="w-3 h-3" />}
          label="Sub Meters"
        />
      </div>
    </div>
  );
}