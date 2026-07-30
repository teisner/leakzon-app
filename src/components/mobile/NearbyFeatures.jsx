import React, { useEffect, useState } from "react";
import { CircleMarker, Polyline, Tooltip } from "react-leaflet";
import { callFunction } from "@/lib/publicFunction";

// What is around the pin: the located meters and the visible map layers within a
// radius. This is what lets someone standing in the street work out which house
// the unlocated meter belongs to — the valve on the corner and the main running
// down the road are the landmarks, not the address.
//
// Fetched from the server rather than by pulling whole layer files onto the
// phone: a project's valve layer alone runs to hundreds of features.
export default function NearbyFeatures({ projectId, token, centre, excludeMeterId, radius = 250, onLoaded }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!centre) return undefined;
    let cancelled = false;
    // Round the centre so nudging the map by a metre doesn't refetch. Roughly
    // 10 m of latitude, which is well inside the radius.
    const key = [centre[0].toFixed(4), centre[1].toFixed(4)].join(",");
    const timer = setTimeout(() => {
      callFunction("getNearbyFeatures", {
        project_id: projectId,
        token,
        latitude: centre[0],
        longitude: centre[1],
        radius,
        exclude_meter_id: excludeMeterId,
      })
        .then((res) => {
          if (cancelled) return;
          setData(res);
          onLoaded?.(res);
        })
        .catch(() => { if (!cancelled) setData(null); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token, radius, excludeMeterId,
      centre && centre[0].toFixed(4), centre && centre[1].toFixed(4)]);

  if (!data) return null;

  return (
    <>
      {/* Layer features. Lines draw as lines so a water main reads as a main; a
          point layer draws as a small ring in the layer's own colour, which is
          the same colour the office sees on the desktop map. */}
      {(data.layers || []).map((layer) =>
        layer.features.map((f, i) => {
          const g = f.geometry;
          if (!g) return null;
          const key = `${layer.id}-${i}`;
          if (g.type === "Point") {
            const [lng, lat] = g.coordinates;
            return (
              <CircleMarker
                key={key}
                center={[lat, lng]}
                radius={5}
                pathOptions={{ color: layer.color, weight: 2, fillColor: layer.color, fillOpacity: 0.7 }}
              >
                <Tooltip direction="top">{layer.name}{f.label ? ` · ${f.label}` : ""} · {f.distance} m</Tooltip>
              </CircleMarker>
            );
          }
          const lines = g.type === "LineString" ? [g.coordinates]
            : g.type === "MultiLineString" ? g.coordinates
            : g.type === "Polygon" ? g.coordinates
            : g.type === "MultiPolygon" ? g.coordinates.flat()
            : [];
          return lines.map((line, j) => (
            <Polyline
              key={`${key}-${j}`}
              positions={line.map(([lng, lat]) => [lat, lng])}
              pathOptions={{ color: layer.color, weight: 3, opacity: 0.75 }}
            >
              <Tooltip sticky>{layer.name}{f.label ? ` · ${f.label}` : ""}</Tooltip>
            </Polyline>
          ));
        })
      )}

      {/* Meters that already have a position. Their UID is the useful label —
          the technician is often reading the neighbouring meter to work out
          which one is missing. */}
      {(data.meters || []).map((m) => (
        <CircleMarker
          key={m.id}
          center={[m.latitude, m.longitude]}
          radius={m.is_main ? 7 : 5}
          pathOptions={{
            color: m.is_main ? "#1d4ed8" : "#475569",
            weight: 2,
            fillColor: m.is_main ? "#3b82f6" : "#94a3b8",
            fillOpacity: 0.85,
          }}
        >
          <Tooltip direction="top">
            {m.is_main ? "Main " : ""}#{m.uid} · {m.distance} m
            {m.address ? <><br />{m.address}</> : null}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}
