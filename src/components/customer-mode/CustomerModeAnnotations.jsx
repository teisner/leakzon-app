import React, { useEffect, useRef } from "react";
import { useMap, Polyline, Marker, CircleMarker, Popup } from "react-leaflet";
import L from "leaflet";
import { Trash2 } from "lucide-react";

function calculateBearing(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function createCommentIcon(color, text) {
  const display = text || "Click to edit...";
  return L.divIcon({
    className: "cm-comment-marker",
    html: `
      <div style="position:relative; transform:translate(-50%, -100%); display:flex; flex-direction:column; align-items:center; cursor:pointer;">
        <div style="background:${color}; color:white; padding:4px 10px; border-radius:8px; font-size:11px; font-weight:600; max-width:220px; overflow:hidden; text-overflow:ellipsis; box-shadow:0 2px 6px rgba(0,0,0,0.5); white-space:nowrap;">${display}</div>
        <div style="width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-top:7px solid ${color}; margin-top:-1px;"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function createArrowIcon(color, width, bearing) {
  const size = Math.max(16, width * 4);
  // SVG arrow points East (bearing 90°); rotate so it aligns with the line's bearing
  const rotation = (bearing + 270) % 360;
  return L.divIcon({
    className: "cm-arrow-head",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" style="display:block; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4)); transform:rotate(${rotation}deg);"><path d="M2 2 L14 8 L2 14 L5 8 Z" fill="${color}" stroke="rgba(0,0,0,0.5)" stroke-width="0.5"/></svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function AnnotationHandler({ mode, color, width, arrowStart, onArrowClick, onDrawingComplete, onPlaceComment }) {
  const map = useMap();
  const isDrawingRef = useRef(false);
  const liveLineRef = useRef(null);
  const propsRef = useRef({ mode, color, width, arrowStart, onArrowClick, onDrawingComplete, onPlaceComment });
  propsRef.current = { mode, color, width, arrowStart, onArrowClick, onDrawingComplete, onPlaceComment };

  useEffect(() => {
    if (mode === "draw") {
      map.dragging.disable();
      map.getContainer().style.cursor = "crosshair";
    } else {
      map.dragging.enable();
      map.getContainer().style.cursor = "";
    }

    const handleClick = (e) => {
      const p = propsRef.current;
      if (p.mode === "arrow") {
        p.onArrowClick(e.latlng.lat, e.latlng.lng);
      } else if (p.mode === "comment") {
        p.onPlaceComment(e.latlng.lat, e.latlng.lng);
      }
    };

    const handleMouseDown = (e) => {
      const p = propsRef.current;
      if (p.mode !== "draw") return;
      isDrawingRef.current = true;
      liveLineRef.current = L.polyline([[e.latlng.lat, e.latlng.lng]], {
        color: p.color,
        weight: p.width,
        opacity: 0.8,
      }).addTo(map);
    };

    const handleMouseMove = (e) => {
      if (!isDrawingRef.current || !liveLineRef.current) return;
      liveLineRef.current.addLatLng([e.latlng.lat, e.latlng.lng]);
    };

    const handleMouseUp = () => {
      if (!isDrawingRef.current || !liveLineRef.current) return;
      isDrawingRef.current = false;
      const pts = liveLineRef.current.getLatLngs().map((ll) => [ll.lat, ll.lng]);
      map.removeLayer(liveLineRef.current);
      liveLineRef.current = null;
      if (pts.length >= 2) propsRef.current.onDrawingComplete(pts);
    };

    map.on("click", handleClick);
    map.on("mousedown", handleMouseDown);
    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);

    return () => {
      map.off("click", handleClick);
      map.off("mousedown", handleMouseDown);
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
      if (liveLineRef.current) {
        map.removeLayer(liveLineRef.current);
        liveLineRef.current = null;
      }
      isDrawingRef.current = false;
      map.dragging.enable();
      map.getContainer().style.cursor = "";
    };
  }, [mode, map]);

  return null;
}

export function AnnotationLayer({ annotations, arrowStart, annotationMode, onDeleteAnnotation, onEditComment }) {
  return (
    <>
      {/* Comments */}
      {annotations.filter((a) => a.type === "comment").map((comment) => (
        <Marker
          key={comment.id}
          position={[comment.lat, comment.lng]}
          icon={createCommentIcon(comment.color, comment.text)}
          eventHandlers={{ click: () => onEditComment(comment) }}
        />
      ))}

      {/* Arrows */}
      {annotations.filter((a) => a.type === "arrow").map((arrow) => {
        const bearing = calculateBearing(arrow.start_lat, arrow.start_lng, arrow.end_lat, arrow.end_lng);
        return (
          <React.Fragment key={arrow.id}>
            <Polyline
              positions={[[arrow.start_lat, arrow.start_lng], [arrow.end_lat, arrow.end_lng]]}
              pathOptions={{ color: arrow.color, weight: arrow.width, opacity: 0.9 }}
              eventHandlers={{ click: (e) => L.DomEvent.stopPropagation(e) }}
            >
              <Popup>
                <button
                  onClick={() => onDeleteAnnotation(arrow.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Arrow
                </button>
              </Popup>
            </Polyline>
            <Marker
              position={[arrow.end_lat, arrow.end_lng]}
              icon={createArrowIcon(arrow.color, arrow.width, bearing)}
              interactive={false}
            />
          </React.Fragment>
        );
      })}

      {/* Free-style drawings */}
      {annotations.filter((a) => a.type === "drawing").map((drawing) => (
        <Polyline
          key={drawing.id}
          positions={drawing.points}
          pathOptions={{ color: drawing.color, weight: drawing.width, opacity: 0.9 }}
          eventHandlers={{ click: (e) => L.DomEvent.stopPropagation(e) }}
        >
          <Popup>
            <button
              onClick={() => onDeleteAnnotation(drawing.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Drawing
            </button>
          </Popup>
        </Polyline>
      ))}

      {/* Arrow start point preview */}
      {annotationMode === "arrow" && arrowStart && (
        <CircleMarker
          center={[arrowStart.lat, arrowStart.lng]}
          radius={5}
          pathOptions={{ color: "#ffffff", fillColor: "#3b82f6", fillOpacity: 1, weight: 2 }}
        />
      )}
    </>
  );
}