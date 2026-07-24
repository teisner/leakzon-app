import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, MapPin } from "lucide-react";

// Formats a coordinate value to 6 decimal places
function fmtCoord(v) {
  return v != null ? Number(v).toFixed(6) : "—";
}

// Picks a display name/id from feature properties
function getDisplayName(item) {
  if (item.type === "insertion_meter") return item.properties?.uid || "—";
  const p = item.properties || {};
  return p.name || p.NAME || p.Name || p.id || p.ID || p.Id || p.valve_number || p.VALVE_NUMBER || item.name || "—";
}

const DIAMETER_FIELD_RE = /diameter|dn|dia|size|pipe_?size/i;

// Extracts the diameter value from feature properties
function getDiameter(props) {
  if (!props) return null;
  for (const key of Object.keys(props)) {
    if (DIAMETER_FIELD_RE.test(key)) {
      const val = props[key];
      if (val != null && val !== "") return val;
    }
  }
  return null;
}

// Parses a diameter value to a number for sorting (e.g. "DN100" → 100)
function parseDiameter(d) {
  if (d == null) return 0;
  const num = parseFloat(String(d).replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : num;
}

// Formats a length in meters to a readable string
function formatLength(meters) {
  if (!meters) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

// Renders a compact properties table for a component
function PropertiesView({ properties }) {
  const entries = Object.entries(properties || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .filter(([k]) => !/^(name|NAME|Name|geometry|type)$/i.test(k));
  if (entries.length === 0) return <span className="text-xs text-muted-foreground/50 italic">No properties</span>;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-1">
          <span className="text-muted-foreground shrink-0">{k}:</span>
          <span className="text-foreground font-medium truncate">{String(v)}</span>
        </div>
      ))}
    </div>
  );
}

export default function WetworkTable({ items, dmas, itemType }) {
  const [expandedId, setExpandedId] = useState(null);
  const isWaterLines = itemType === "water_line";

  // Default sort: water lines by diameter (thickest first); otherwise by name
  const [sortBy, setSortBy] = useState(isWaterLines ? "diameter" : "name");
  const [sortDir, setSortDir] = useState(isWaterLines ? "desc" : "asc");

  const dmaName = (id) => dmas.find((d) => d.id === id)?.name || "?";
  const dmaColor = (id) => dmas.find((d) => d.id === id)?.color || "#94a3b8";

  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      let cmp;
      if (sortBy === "name") cmp = getDisplayName(a).localeCompare(getDisplayName(b));
      else if (sortBy === "diameter") cmp = parseDiameter(getDiameter(a.properties)) - parseDiameter(getDiameter(b.properties));
      else if (sortBy === "length") cmp = (a.length || 0) - (b.length || 0);
      else if (sortBy === "dma") {
        const an = a.dmaIds.map(dmaName).join(", ");
        const bn = b.dmaIds.map(dmaName).join(", ");
        cmp = an.localeCompare(bn);
      } else if (sortBy === "layer") cmp = (a.layerName || "").localeCompare(b.layerName || "");
      else cmp = 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [items, sortBy, sortDir, dmas]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir(col === "diameter" ? "desc" : "asc"); }
  };

  const sortIcon = (col) => sortBy === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MapPin className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No components in this category</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card border-b border-border z-10">
          <tr className="text-left text-xs text-muted-foreground">
            <th className="w-8 py-2 px-2"></th>
            <th className="py-2 px-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort("name")}>
              Name / ID{sortIcon("name")}
            </th>
            {isWaterLines && (
              <th className="py-2 px-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort("diameter")}>
                Diameter{sortIcon("diameter")}
              </th>
            )}
            {isWaterLines && (
              <th className="py-2 px-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort("length")}>
                Length{sortIcon("length")}
              </th>
            )}
            <th className="py-2 px-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort("dma")}>
              DMA(s){sortIcon("dma")}
            </th>
            <th className="py-2 px-3 cursor-pointer hover:text-foreground hidden md:table-cell" onClick={() => toggleSort("layer")}>
              Layer{sortIcon("layer")}
            </th>
            <th className="py-2 px-3 hidden lg:table-cell">Latitude</th>
            <th className="py-2 px-3 hidden lg:table-cell">Longitude</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const isExpanded = expandedId === item.id;
            const name = getDisplayName(item);
            const diameter = isWaterLines ? getDiameter(item.properties) : null;
            return (
              <React.Fragment key={item.id}>
                <tr
                  className={`border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors ${isExpanded ? "bg-muted/40" : ""}`}
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <td className="py-2 px-2 text-muted-foreground">
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </td>
                  <td className="py-2 px-3 font-medium text-foreground">{name}</td>
                  {isWaterLines && (
                    <td className="py-2 px-3 text-xs text-foreground font-medium">
                      {diameter != null ? `⌀${diameter}` : <span className="text-muted-foreground/50 italic">—</span>}
                    </td>
                  )}
                  {isWaterLines && (
                    <td className="py-2 px-3 text-xs text-foreground font-medium">
                      {formatLength(item.length) || <span className="text-muted-foreground/50 italic">—</span>}
                    </td>
                  )}
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {item.dmaIds.length === 0 ? (
                        <span className="text-xs text-muted-foreground/50 italic">Not assigned</span>
                      ) : (
                        item.dmaIds.map((id) => (
                          <span key={id} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: dmaColor(id) + "22", color: dmaColor(id) }}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dmaColor(id) }} />
                            {dmaName(id)}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground hidden md:table-cell">{item.layerName || "—"}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground font-mono hidden lg:table-cell">{fmtCoord(item.lat)}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground font-mono hidden lg:table-cell">{fmtCoord(item.lng)}</td>
                </tr>
                {isExpanded && (
                  <tr className="bg-muted/20">
                    <td colSpan={isWaterLines ? 8 : 6} className="px-4 pb-3 pt-1">
                      <PropertiesView properties={item.properties} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}