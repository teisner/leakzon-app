import React, { useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { Navigation, Check, Loader2, Satellite, Mountain, MapPin, Layers, Eye, EyeOff } from "lucide-react";
import { callFunction } from "@/lib/publicFunction";
import "leaflet/dist/leaflet.css";
import MapKeyboardNav from "@/components/project/MapKeyboardNav";
import NearbyFeatures from "@/components/mobile/NearbyFeatures";

function MapResize() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function FlyTo({ lat, lng, trigger }) {
  const map = useMap();
  useEffect(() => {
    if (trigger > 0) map.flyTo([lat, lng], 18, { duration: 0.5 });
  }, [trigger]);
  return null;
}

function MapCenterTracker({ onCenterChange }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => {
      const c = map.getCenter();
      onCenterChange([c.lat, c.lng]);
    };
    map.on("moveend", handler);
    return () => map.off("moveend", handler);
  }, [map, onCenterChange]);
  return null;
}

export default function MobileMeterMap({ meter, project, projectId, onSave, token }) {
  const [position, setPosition] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flyTrigger, setFlyTrigger] = useState(0);
  const [mapType, setMapType] = useState("satellite");
  // The surrounding network, so the pin can be placed by looking at the valves,
  // mains and neighbouring meters rather than guessing from the address.
  const [showNearby, setShowNearby] = useState(true);
  const [nearby, setNearby] = useState(null);
  const [radius, setRadius] = useState(250);

  useEffect(() => {
    if (!navigator.geolocation) {
      setPosition([project?.latitude || 0, project?.longitude || 0]);
      setGpsLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
        setGpsLoading(false);
        setFlyTrigger((t) => t + 1);
      },
      () => {
        setPosition([project?.latitude || 0, project?.longitude || 0]);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleCenterChange = useCallback((center) => {
    setPosition(center);
  }, []);

  const handleUseGps = () => {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
        setGpsLoading(false);
        setFlyTrigger((t) => t + 1);
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = async () => {
    if (!position) return;
    setSaving(true);
    try {
      await callFunction("updateMeterLocation", {
        meter_id: meter.id,
        latitude: position[0],
        longitude: position[1],
        token,
      });
      onSave?.(meter.id);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  if (gpsLoading) {
    return (
      <div className="h-[280px] flex flex-col items-center justify-center bg-slate-100 rounded-lg">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin mb-2" />
        <p className="text-xs text-slate-500">Getting GPS location…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative h-[280px] rounded-lg overflow-hidden border border-slate-200">
        <MapContainer center={position} zoom={18} className="h-full w-full" zoomControl={false} scrollWheelZoom={false}>
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
          <FlyTo lat={position[0]} lng={position[1]} trigger={flyTrigger} />
          <MapCenterTracker onCenterChange={handleCenterChange} />
          {showNearby && (
            <NearbyFeatures
              projectId={projectId || meter.project_id}
              token={token}
              centre={position}
              excludeMeterId={meter.id}
              radius={radius}
              onLoaded={setNearby}
            />
          )}
        </MapContainer>
        {/* Center pinpoint — tip marks the exact saved location */}
        <div
          className="absolute left-1/2 top-1/2 z-[999] pointer-events-none"
          style={{ transform: "translate(-50%, -100%)", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.45))" }}
        >
          <MapPin className="w-9 h-9 text-blue-600" fill="white" strokeWidth={2.5} />
        </div>
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
        {/* What is around the pin, and how far out to look */}
        <div className="absolute bottom-2 left-2 z-[1000] flex items-center gap-1.5">
          <button
            onClick={() => setShowNearby((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium shadow-md border border-white/40 ${showNearby ? "bg-blue-600 text-white" : "bg-white/90 text-slate-700"}`}
          >
            {showNearby ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <Layers className="w-3 h-3" /> Nearby
          </button>
          {showNearby && (
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="px-1.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/90 text-slate-700 shadow-md border border-white/40"
            >
              <option value={100}>100 m</option>
              <option value={250}>250 m</option>
              <option value={600}>600 m</option>
            </select>
          )}
        </div>
      </div>

      {/* Legend — names what the dots and lines are, with counts, so an empty
          result reads as "nothing mapped here" rather than "still loading". */}
      {showNearby && nearby && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: "#94a3b8" }} />
            {nearby.counts?.meters || 0} located meters
          </span>
          {(nearby.layers || []).map((l) => (
            <span key={l.id} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
              {l.name} ({l.features.length})
            </span>
          ))}
          {(nearby.counts?.meters || 0) === 0 && (nearby.layers || []).length === 0 && (
            <span>Nothing mapped within {radius} m</span>
          )}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleUseGps}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 active:bg-slate-200"
        >
          <Navigation className="w-4 h-4" /> GPS
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-[2] flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 active:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? "Saving…" : "Save Location"}
        </button>
      </div>
      <p className="text-[10px] text-slate-400 text-center mt-2">
        Drag the map to position the pin at the exact meter location.
      </p>
    </div>
  );
}