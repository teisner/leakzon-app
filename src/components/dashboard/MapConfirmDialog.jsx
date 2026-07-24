import React, { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { MapPin, Check, Move } from "lucide-react";
import "leaflet/dist/leaflet.css";
import MapKeyboardNav from "@/components/project/MapKeyboardNav";
import L from "leaflet";

// Fix default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

export default function MapConfirmDialog({ open, onOpenChange, city, state, country, onConfirm }) {
  const [coords, setCoords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !city) return;
    setLoading(true);
    setError(null);
    const query = [city, state, country].filter(Boolean).join(", ");
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.length > 0) {
          setCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name });
        } else {
          setError("Location not found. Please check the city name.");
        }
      })
      .catch(() => setError("Failed to look up location."))
      .finally(() => setLoading(false));
  }, [open, city, state, country]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            Confirm Location
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-64 text-sm text-red-500">{error}</div>
        )}

        {!loading && !error && coords && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{coords.display}</p>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Lat: {coords.lat.toFixed(6)}, Lng: {coords.lng.toFixed(6)}
              </p>
              <span className="flex items-center gap-1 text-xs text-blue-600">
                <Move className="w-3 h-3" /> Drag the pin to adjust
              </span>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-200 h-64">
              <MapContainer
                center={[coords.lat, coords.lng]}
                zoom={11}
                className="h-full w-full"
                scrollWheelZoom={false}
                >
                <MapKeyboardNav />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker
                  position={[coords.lat, coords.lng]}
                  draggable={true}
                  eventHandlers={{
                    dragend: (e) => {
                      const ll = e.target.getLatLng();
                      setCoords((prev) => ({ ...prev, lat: ll.lat, lng: ll.lng }));
                    },
                  }}
                />
              </MapContainer>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!coords}
            onClick={() => {
              onConfirm({ latitude: coords.lat, longitude: coords.lng });
              onOpenChange(false);
            }}
            className="gap-1.5"
          >
            <Check className="w-4 h-4" /> Confirm Location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}