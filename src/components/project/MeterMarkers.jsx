import React, { useMemo } from "react";
import { CircleMarker, Popup, Marker } from "react-leaflet";
import L from "leaflet";
import { createShapeIcon } from "@/lib/shapeIcons";

export default function MeterMarkers({ meters, layerConfig, highlightedUid, highlightedMeterIds, onToggleMain }) {
  const validMeters = useMemo(
    () => (meters || []).filter((m) => m.latitude != null && m.longitude != null),
    [meters]
  );

  const color = layerConfig?.color || "#2563eb";
  const radius = layerConfig?.point_config?.radius || 5;
  const fillStyle = layerConfig?.point_config?.fill_style || "filled";
  const shape = layerConfig?.point_config?.shape || "circle";
  const iconUrl = layerConfig?.icon_url;
  const isOutline = fillStyle === "outline";

  const buildPopup = (m) => (
    <Popup>
      <div className="feature-popup">
        <table>
          <tbody>
            <tr><td className="popup-key">UID</td><td className="popup-val font-semibold">{m.uid}</td></tr>
            <tr><td className="popup-key">Type</td><td className="popup-val">{m.is_main ? "Main" : "Sub-meter"}</td></tr>
            <tr><td className="popup-key">DMA</td><td className="popup-val">{m.dma_name || "N/A"}</td></tr>
            <tr><td className="popup-key">Status</td><td className="popup-val">{m.is_active == null ? "N/A" : m.is_active ? "Active" : "Inactive"}</td></tr>
            {m.payer_name && <tr><td className="popup-key">Payer</td><td className="popup-val">{m.payer_name}</td></tr>}
            {m.address && <tr><td className="popup-key">Address</td><td className="popup-val">{m.address}</td></tr>}
            {m.provider && <tr><td className="popup-key">Provider</td><td className="popup-val">{m.provider}</td></tr>}
            {m.communication_type && <tr><td className="popup-key">Comm Type</td><td className="popup-val">{m.communication_type}</td></tr>}
            <tr><td className="popup-key">Latitude</td><td className="popup-val">{m.latitude?.toFixed(6)}</td></tr>
            <tr><td className="popup-key">Longitude</td><td className="popup-val">{m.longitude?.toFixed(6)}</td></tr>
            {m.location_source && (
              <tr>
                <td className="popup-key">Location</td>
                <td className="popup-val">
                  {m.location_source === "geocoded" ? "Google Maps geocoded" : "Estimated from street data"}
                </td>
              </tr>
            )}
            {m.additional_ids?.map((id, i) => (
              <tr key={i}><td className="popup-key">{id.label}</td><td className="popup-val">{id.value}</td></tr>
            ))}
          </tbody>
        </table>
        {onToggleMain && (
          <button
            onClick={() => onToggleMain(m.id, !m.is_main)}
            className="mt-2 w-full px-2 py-1.5 text-xs font-medium rounded-md border border-border bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {m.is_main ? "Switch to Sub-meter" : "Switch to Main"}
          </button>
        )}
      </div>
    </Popup>
  );

  const isHighlighted = (m) => highlightedUid && m.uid === highlightedUid;
  const isBulkHighlighted = (m) => highlightedMeterIds && highlightedMeterIds.has(m.id);

  const renderBulkHighlight = (m) => (
    <CircleMarker
      key={`bh-${m.id}`}
      center={[m.latitude, m.longitude]}
      radius={(radius || 5) + 8}
      pathOptions={{ color: "#f97316", weight: 3, fillColor: "#f97316", fillOpacity: 0.2, className: "meter-highlight-pulse" }}
    />
  );

  if (iconUrl) {
    return (
      <>
        {validMeters.map((m) => (
          <Marker
            key={m.id}
            position={[m.latitude, m.longitude]}
            icon={L.icon({ iconUrl, iconSize: [28, 28], iconAnchor: [14, 14] })}
          >
            {buildPopup(m)}
          </Marker>
        ))}
        {validMeters.filter(isBulkHighlighted).map(renderBulkHighlight)}
        {validMeters.filter(isHighlighted).map((m) => (
          <CircleMarker
            key={`hl-${m.id}`}
            center={[m.latitude, m.longitude]}
            radius={(radius || 5) + 6}
            pathOptions={{ color: "#fbbf24", weight: 3, fillColor: "transparent", fillOpacity: 0, dashArray: "4,2", className: "meter-highlight-pulse" }}
          />
        ))}
      </>
    );
  }

  if (shape !== "circle") {
    const icon = createShapeIcon(shape, color, radius, fillStyle);
    return (
      <>
        {validMeters.map((m) => (
          <Marker key={m.id} position={[m.latitude, m.longitude]} icon={icon}>
            {buildPopup(m)}
          </Marker>
        ))}
        {validMeters.filter(isBulkHighlighted).map(renderBulkHighlight)}
        {validMeters.filter(isHighlighted).map((m) => (
          <CircleMarker
            key={`hl-${m.id}`}
            center={[m.latitude, m.longitude]}
            radius={(radius || 5) + 6}
            pathOptions={{ color: "#fbbf24", weight: 3, fillColor: "transparent", fillOpacity: 0, dashArray: "4,2", className: "meter-highlight-pulse" }}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {validMeters.map((m) => {
        const hl = isHighlighted(m);
        const isEstimated = !!m.location_source;
        return (
          <CircleMarker
            key={m.id}
            center={[m.latitude, m.longitude]}
            radius={hl ? radius + 3 : radius}
            pathOptions={{
              color: hl ? "#fbbf24" : isEstimated ? "#000000" : color,
              weight: hl ? 3 : isEstimated ? 2.5 : 1.5,
              fillColor: isOutline ? "transparent" : color,
              fillOpacity: m.is_active === false ? 0.15 : (m.is_main ? 0.8 : 0.45),
            }}
          >
            {buildPopup(m)}
          </CircleMarker>
        );
      })}
      {validMeters.filter(isBulkHighlighted).map(renderBulkHighlight)}
      {validMeters.filter(isHighlighted).map((m) => (
        <CircleMarker
          key={`hl-ring-${m.id}`}
          center={[m.latitude, m.longitude]}
          radius={radius + 6}
          pathOptions={{ color: "#fbbf24", weight: 2, fillColor: "transparent", fillOpacity: 0, dashArray: "4,2", className: "meter-highlight-pulse" }}
        />
      ))}
    </>
  );
}