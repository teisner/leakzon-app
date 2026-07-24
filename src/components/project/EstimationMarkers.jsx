import React, { useEffect, useMemo, useState } from "react";
import { CircleMarker, Popup, Polyline, useMap, Marker } from "react-leaflet";
import L from "leaflet";

function FlyToTarget({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 18, { duration: 0.8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position[0], position[1]]);
  return null;
}

export default function EstimationMarkers({ target, onDragProposed }) {
  const proposedIcon = useMemo(() =>
    L.divIcon({
      className: "",
      html: `<div style="width:16px;height:16px;background:#fbbf24;border:3px solid #f59e0b;border-radius:50%;opacity:0.8;cursor:move;"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    }),
  []);

  const [streetPath, setStreetPath] = useState(null);

  const similarMeters = target?.similarMeters || [];

  // Sort reference meters by house number to trace the street in order
  const sortedRefs = useMemo(() => {
    return [...similarMeters].sort((a, b) => {
      const na = parseInt((a.address?.match(/\b(\d{1,5})\b/) || [])[1] || "0", 10);
      const nb = parseInt((b.address?.match(/\b(\d{1,5})\b/) || [])[1] || "0", 10);
      return na - nb;
    });
  }, [similarMeters]);

  // Fetch the actual street geometry following roads between reference meters
  useEffect(() => {
    setStreetPath(null);
    if (sortedRefs.length < 2) return;
    const coords = sortedRefs.map((m) => `${m.longitude},${m.latitude}`).join(";");
    const ctrl = new AbortController();
    fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
      .then((res) => res.json())
      .then((data) => {
        const route = data?.routes?.[0]?.geometry;
        if (route?.coordinates?.length >= 2) {
          setStreetPath(route.coordinates.map(([lng, lat]) => [lat, lng]));
        }
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [sortedRefs]);

  if (!target) return null;
  const { meter, proposed } = target;

  return (
    <>
      {proposed && (
        <FlyToTarget position={[proposed.latitude, proposed.longitude]} />
      )}

      {/* Street path — actual road geometry in orange (following roads via OSRM) */}
      {streetPath && streetPath.length >= 2 && (
        <Polyline
          positions={streetPath}
          pathOptions={{ color: "#fffd01", weight: 5, opacity: 0.85, lineCap: "round" }}
        />
      )}

      {/* Fallback: straight-line dashed path between reference meters in house-number order */}
      {!streetPath && sortedRefs.length >= 2 && (() => {
        const points = sortedRefs.map((m) => [m.latitude, m.longitude]);
        if (proposed) {
          const targetNum = parseInt((meter.address?.match(/\b(\d{1,5})\b/) || [])[1] || "0", 10);
          let insertIdx = points.length;
          for (let i = 0; i < sortedRefs.length; i++) {
            const num = parseInt((sortedRefs[i].address?.match(/\b(\d{1,5})\b/) || [])[1] || "0", 10);
            if (targetNum < num) { insertIdx = i; break; }
          }
          points.splice(insertIdx, 0, [proposed.latitude, proposed.longitude]);
        }
        return (
          <Polyline
            positions={points}
            pathOptions={{ color: "#fffd01", weight: 3, opacity: 0.6, dashArray: "6,4" }}
          />
        );
      })()}

      {/* Reference meters — blue highlight rings */}
      {similarMeters.map((m) => (
        <CircleMarker
          key={`sim-${m.id}`}
          center={[m.latitude, m.longitude]}
          radius={9}
          pathOptions={{
            color: "#3b82f6",
            weight: 3,
            fillColor: "#3b82f6",
            fillOpacity: 0.2,
          }}
        >
          <Popup>
            <div className="feature-popup">
              <table>
                <tbody>
                  <tr><td className="popup-key">UID</td><td className="popup-val font-semibold">{m.uid}</td></tr>
                  <tr><td className="popup-key">Address</td><td className="popup-val">{m.address}</td></tr>
                  <tr><td className="popup-key">Role</td><td className="popup-val">Reference meter</td></tr>
                </tbody>
              </table>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {/* Proposed location — draggable amber marker + pulsing ring */}
      {proposed && (
        <>
          <Marker
            position={[proposed.latitude, proposed.longitude]}
            icon={proposedIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const ll = e.target.getLatLng();
                onDragProposed?.(ll.lat, ll.lng);
              },
            }}
          >
            <Popup>
              <div className="feature-popup">
                <table>
                  <tbody>
                    <tr><td className="popup-key">UID</td><td className="popup-val font-semibold">{meter.uid}</td></tr>
                    <tr><td className="popup-key">Address</td><td className="popup-val">{meter.address}</td></tr>
                    <tr><td className="popup-key">Method</td><td className="popup-val capitalize">{proposed.method}</td></tr>
                    <tr><td className="popup-key">Status</td><td className="popup-val">Drag to adjust</td></tr>
                  </tbody>
                </table>
              </div>
            </Popup>
          </Marker>
          <CircleMarker
            center={[proposed.latitude, proposed.longitude]}
            radius={16}
            pathOptions={{
              color: "#f59e0b",
              weight: 2,
              fillColor: "transparent",
              fillOpacity: 0,
              dashArray: "4,2",
              className: "meter-highlight-pulse",
            }}
          />
        </>
      )}
    </>
  );
}