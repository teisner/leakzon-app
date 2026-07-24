import React from "react";
import { CircleMarker, Tooltip, Popup } from "react-leaflet";
import { Shield, Trash2, MapPin } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

const VALVE_NO_KEYS = [
  "valve_no", "valveno", "valve_id", "valveid", "valve_number", "valvenumber",
  "vnum", "v_num", "valvenum", "valve_no_", "valve", "no", "number", "num",
  "id", "fid", "objectid", "gid", "ref", "code", "asset_id", "assetid",
  "facility_id", "facilityid", "equip_id", "equipid",
];

function getValveNumber(properties) {
  if (!properties) return null;
  const props = typeof properties === "string" ? JSON.parse(properties) : properties;
  const keys = Object.keys(props || {});
  for (const candidate of VALVE_NO_KEYS) {
    const match = keys.find((k) => k.toLowerCase().replace(/[\s_-]/g, "") === candidate);
    if (match && props[match] != null && String(props[match]).trim() !== "") {
      return String(props[match]);
    }
  }
  return null;
}

export default function IsolatedPointMarkers({ isolatedPoints, dmas, onDelete }) {
  const { t } = useLanguage();

  if (!isolatedPoints || isolatedPoints.length === 0) return null;

  const getDmaName = (id) => (dmas || []).find((d) => d.id === id)?.name || "—";
  const getDmaColor = (id) => (dmas || []).find((d) => d.id === id)?.color || "#6b7280";

  return (
    <>
      {isolatedPoints.map((ip) => {
        const dma1Color = getDmaColor(ip.dma1_id);
        return (
          <CircleMarker
            key={ip.id}
            center={[ip.latitude, ip.longitude]}
            radius={11}
            pathOptions={{
              color: "#000000",
              weight: 3,
              fillColor: dma1Color,
              fillOpacity: 0.9,
            }}
          >
            <Tooltip permanent={false} direction="top">
              <span className="text-xs font-medium flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {getDmaName(ip.dma1_id)} ↔ {getDmaName(ip.dma2_id)}
              </span>
            </Tooltip>
            <Popup>
              <div className="text-xs space-y-2 p-1">
                <div className="flex items-center gap-1.5 font-semibold text-sm">
                  <Shield className="w-3.5 h-3.5 text-amber-600" />
                  {t('dma.isolatedPoint')}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dma1Color }} />
                  <span>{getDmaName(ip.dma1_id)}</span>
                  <span className="text-muted-foreground">↔</span>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getDmaColor(ip.dma2_id) }} />
                  <span>{getDmaName(ip.dma2_id)}</span>
                </div>
                {(() => {
                  const valveNo = getValveNumber(ip.feature_properties);
                  return (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      {valveNo && (
                        <>
                          <span className="font-semibold text-foreground">#{valveNo}</span>
                          <span className="text-border">|</span>
                        </>
                      )}
                      <MapPin className="w-3 h-3" />
                      <span className="font-mono">{ip.latitude?.toFixed(5)}, {ip.longitude?.toFixed(5)}</span>
                    </div>
                  );
                })()}
                {onDelete && (
                  <button
                    onClick={() => onDelete(ip.id)}
                    className="flex items-center gap-1 text-red-600 hover:text-red-800 font-medium mt-1"
                  >
                    <Trash2 className="w-3 h-3" /> {t('dma.deleteIsolatedPoint')}
                  </button>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}