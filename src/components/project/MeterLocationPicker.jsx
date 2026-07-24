import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, Satellite, Mountain, MapPin } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import "leaflet/dist/leaflet.css";
import MapKeyboardNav from "@/components/project/MapKeyboardNav";

// Draggable pin icon (no external image needed)
const pinIcon = L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="#2563eb" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#ffffff"/></svg>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// Invalidate map size after mount + dialog animation
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 200);
    const t2 = setTimeout(() => map.invalidateSize(), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [map]);
  return null;
}

// Fly to a position when it changes (triggered by address search)
function FlyTo({ position }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(position, Math.max(map.getZoom(), 17), { duration: 0.8 });
  }, [position[0], position[1]]);
  return null;
}

// Forward geocode via Nominatim (OpenStreetMap) — no API key needed
async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

export default function MeterLocationPicker({ latitude, longitude, onChange, defaultCenter }) {
  const { t } = useLanguage();
  const [mapType, setMapType] = useState("satellite");
  const [addressQuery, setAddressQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [flyTarget, setFlyTarget] = useState(null);

  const hasCoords = latitude != null && longitude != null && !isNaN(latitude) && !isNaN(longitude);
  const pos = hasCoords ? [latitude, longitude] : (defaultCenter || [0, 0]);

  const handleDragEnd = (e) => {
    const latlng = e.target.getLatLng();
    onChange(latlng.lat, latlng.lng);
  };

  const handleSearch = async () => {
    if (!addressQuery.trim()) return;
    setSearching(true);
    setSearchError("");
    try {
      const result = await geocodeAddress(addressQuery);
      if (result) {
        onChange(result.lat, result.lng);
        setFlyTarget([result.lat, result.lng]);
      } else {
        setSearchError(t("meterEdit.addressNotFound"));
      }
    } catch {
      setSearchError(t("meterEdit.searchFailed"));
    } finally {
      setSearching(false);
    }
  };

  const satelliteUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const terrainUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  return (
    <div className="space-y-2">
      {/* Address search */}
      <div className="flex gap-2">
        <Input
          value={addressQuery}
          onChange={(e) => setAddressQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
          placeholder={t("meterEdit.searchAddress")}
          className="flex-1 h-8"
        />
        <Button type="button" size="sm" onClick={handleSearch} disabled={searching} className="gap-1.5 h-8">
          {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          {t("meterEdit.search")}
        </Button>
      </div>
      {searchError && <p className="text-xs text-destructive">{searchError}</p>}

      {/* Map type toggle */}
      <div className="flex gap-1">
        <Button type="button" size="sm" variant={mapType === "satellite" ? "default" : "outline"} onClick={() => setMapType("satellite")} className="gap-1 h-7">
          <Satellite className="w-3 h-3" /> {t("map.satellite")}
        </Button>
        <Button type="button" size="sm" variant={mapType === "terrain" ? "default" : "outline"} onClick={() => setMapType("terrain")} className="gap-1 h-7">
          <Mountain className="w-3 h-3" /> {t("map.terrain")}
        </Button>
      </div>

      {/* Map with draggable marker */}
      <div className="relative h-[280px] rounded-lg overflow-hidden border border-border">
        <MapContainer center={pos} zoom={hasCoords ? 17 : 12} className="h-full w-full" zoomControl={false}>
          <MapResizer />
          <MapKeyboardNav />
          {flyTarget && <FlyTo position={flyTarget} />}
          <TileLayer url={mapType === "satellite" ? satelliteUrl : terrainUrl} />
          <Marker
            position={pos}
            icon={pinIcon}
            draggable
            eventHandlers={{ dragend: handleDragEnd }}
          />
        </MapContainer>
      </div>

      {/* Current coordinates + drag hint */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          <span className="font-mono">
            {hasCoords ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : "—"}
          </span>
        </div>
        <span>{t("meterEdit.dragMarker")}</span>
      </div>
    </div>
  );
}