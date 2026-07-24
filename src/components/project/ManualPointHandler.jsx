import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { useMap, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { reverseGeocode } from "@/lib/reverseGeocode";

const genId = () =>
  crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);

const createIcon = (color) =>
  L.divIcon({
    className: "manual-point-icon",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.5);cursor:move;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });

function ManualMarker({ point, color, onUpdate, onDelete, autoOpen, isMeterLayer, onMeterClick }) {
  const markerRef = useRef(null);
  const [localName, setLocalName] = useState(point.name || "");

  useEffect(() => {
    if (autoOpen && markerRef.current) {
      setTimeout(() => markerRef.current.openPopup(), 80);
    }
  }, [autoOpen]);

  const handleChange = (e) => {
    const val = e.target.value;
    setLocalName(val);
    onUpdate(point.id, { name: val });
  };

  return (
    <Marker
      ref={markerRef}
      position={[point.lat, point.lng]}
      icon={createIcon(color)}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const pos = e.target.getLatLng();
          onUpdate(point.id, { lat: pos.lat, lng: pos.lng });
          // Re-fetch nearest address for meter points that already have a suggested address
          if (isMeterLayer && point.address) {
            reverseGeocode(pos.lat, pos.lng).then((result) => {
              if (result) onUpdate(point.id, { address: result });
            });
          }
        },
        ...(isMeterLayer ? { click: () => onMeterClick?.(point.id) } : {}),
      }}
    >
      {!isMeterLayer && (
      <Popup>
        <div className="space-y-2 p-1" style={{ minWidth: 200 }}>
          <input
            value={localName}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                markerRef.current?.closePopup();
              }
            }}
            placeholder="Point name (e.g. Pump Station 1)"
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-mono">
              {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
            </span>
            <button
              onClick={() => onDelete(point.id)}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Delete
            </button>
          </div>
        </div>
      </Popup>
      )}
    </Marker>
  );
}

const MemoMarker = memo(ManualMarker);

export default function ManualPointHandler({ active, points, setPoints, color, isMeterLayer, onMeterPointPlaced }) {
  const map = useMap();
  const [newlyAddedId, setNewlyAddedId] = useState(null);

  useEffect(() => {
    if (!active) return;
    map.getContainer().style.cursor = "crosshair";

    const handleClick = (e) => {
      // Ignore clicks that originate from popups or markers (e.g. the "Delete" button
      // inside a point's popup) — otherwise deleting a point also adds a new one.
      const target = e.originalEvent?.target;
      if (target && (target.closest(".leaflet-popup") || target.closest(".leaflet-marker-icon") || target.closest(".manual-point-icon"))) {
        return;
      }
      const id = genId();
      setPoints((prev) => [
        ...prev,
        { id, name: "", lat: e.latlng.lat, lng: e.latlng.lng, ...(isMeterLayer ? { endpoint_id: "", account_name: "", address: "" } : {}) },
      ]);
      if (isMeterLayer) {
        onMeterPointPlaced?.(id);
      } else {
        setNewlyAddedId(id);
      }
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
      map.getContainer().style.cursor = "";
    };
  }, [active, map, setPoints, isMeterLayer, onMeterPointPlaced]);

  const updatePoint = useCallback(
    (id, updates) => {
      setPoints((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
      setNewlyAddedId((prev) => (prev === id ? null : prev));
    },
    [setPoints]
  );

  const deletePoint = useCallback(
    (id) => {
      setPoints((prev) => prev.filter((p) => p.id !== id));
    },
    [setPoints]
  );

  if (!active) return null;

  return (
    <>
      {points.map((p) => (
        <MemoMarker
          key={p.id}
          point={p}
          color={color}
          onUpdate={updatePoint}
          onDelete={deletePoint}
          autoOpen={!isMeterLayer && p.id === newlyAddedId}
          isMeterLayer={isMeterLayer}
          onMeterClick={onMeterPointPlaced}
        />
      ))}
    </>
  );
}