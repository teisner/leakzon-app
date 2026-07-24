import React from "react";
import { useMapEvents, Marker, Polyline, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet";

function createNoteIcon(highlighted) {
  return L.divIcon({
    className: "annotation-note-icon",
    html: `<div class="annotation-flag${highlighted ? " highlighted" : ""}"><svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 1V21" stroke="#64748b" stroke-width="2" stroke-linecap="round"/><path d="M3 2H16L13 6.5L16 11H3V2Z" fill="#ef4444" stroke="#dc2626" stroke-width="1.5" stroke-linejoin="round"/></svg></div>`,
    iconSize: [18, 22],
    iconAnchor: [3, 21],
  });
}

function createArrowHeadIcon(angle, highlighted) {
  return L.divIcon({
    className: "annotation-arrow-icon",
    html: `<div class="annotation-arrow-head${highlighted ? " highlighted" : ""}" style="transform: rotate(${angle}deg)">▶</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function getArrowAngle(lat1, lng1, lat2, lng2) {
  return -Math.atan2(lat2 - lat1, lng2 - lng1) * 180 / Math.PI;
}

function AnnotationClickHandler({ mode, onPlaceNote, onArrowFirstClick, onArrowSecondClick, arrowStart }) {
  useMapEvents({
    click: (e) => {
      if (mode === "note") {
        onPlaceNote(e.latlng.lat, e.latlng.lng);
      } else if (mode === "arrow") {
        if (!arrowStart) {
          onArrowFirstClick(e.latlng.lat, e.latlng.lng);
        } else {
          onArrowSecondClick(e.latlng.lat, e.latlng.lng);
        }
      }
    },
  });
  return null;
}

export default function MapAnnotations({ annotations, mode, onPlaceNote, onArrowFirstClick, onArrowSecondClick, arrowStart, highlightedId }) {
  return (
    <>
      {mode && (
        <AnnotationClickHandler
          mode={mode}
          onPlaceNote={onPlaceNote}
          onArrowFirstClick={onArrowFirstClick}
          onArrowSecondClick={onArrowSecondClick}
          arrowStart={arrowStart}
        />
      )}

      {mode === "arrow" && arrowStart && (
        <CircleMarker
          center={arrowStart}
          radius={5}
          pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 1 }}
        />
      )}

      {(annotations || []).map((ann) => {
        const highlighted = highlightedId === ann.id;
        if (ann.note_type === "arrow" && ann.end_lat != null && ann.end_lng != null) {
          const angle = getArrowAngle(ann.start_lat, ann.start_lng, ann.end_lat, ann.end_lng);
          return (
            <React.Fragment key={ann.id}>
              <Polyline
                positions={[[ann.start_lat, ann.start_lng], [ann.end_lat, ann.end_lng]]}
                pathOptions={{ color: highlighted ? "#f59e0b" : "#ef4444", weight: 3, dashArray: "8,6" }}
              />
              <Marker position={[ann.end_lat, ann.end_lng]} icon={createArrowHeadIcon(angle, highlighted)} interactive={true}>
                {ann.text && <Tooltip permanent direction="top">{ann.text}</Tooltip>}
              </Marker>
            </React.Fragment>
          );
        }
        return (
          <Marker key={ann.id} position={[ann.start_lat, ann.start_lng]} icon={createNoteIcon(highlighted)}>
            {ann.text && <Tooltip permanent direction="top">{ann.text}</Tooltip>}
          </Marker>
        );
      })}
    </>
  );
}