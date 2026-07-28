import * as XLSX from "xlsx";

// Multi-sheet XLSX export of all data within each DMA.
// One sheet per DMA containing stacked tables: Sub Meters, Main Meters, and one table per layer
// (valves, hydrants, water lines, etc.) whose features fall within the DMA polygon.

function escapeXML(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeSheetName(name, idx) {
  let s = String(name || `DMA ${idx + 1}`).replace(/[:\\/?*[\]]/g, "_").trim();
  if (s.length > 31) s = s.slice(0, 31);
  return s || `DMA ${idx + 1}`;
}

const METER_COLS = [
  { key: "uid", label: "UID" },
  { key: "payer_name", label: "Account Name" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "provider", label: "Provider" },
  { key: "communication_type", label: "Communication" },
  { key: "diameter", label: "Diameter (mm)" },
  { key: "is_active", label: "Status" },
  { key: "endpoint_id", label: "Endpoint ID" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
];

function meterRow(m) {
  return {
    ...m,
    is_active: m.is_active === true ? "Active" : m.is_active === false ? "Inactive" : "N/A",
    diameter: m.diameter ?? "",
  };
}

function cellValue(val) {
  if (typeof val === "number" && !isNaN(val)) return val;
  let v = val;
  if (v !== null && typeof v === "object") {
    try { v = JSON.stringify(v); } catch { v = String(v); }
  }
  return v ?? "";
}

// A stacked block: bold-ish title row, header row, data rows, blank separator.
// Returned as arrays so the sheet can be assembled with SheetJS.
function buildTable(title, columns, rows) {
  return [
    [title],
    columns.map((c) => c.label),
    ...rows.map((r) => columns.map((c) => cellValue(r[c.key]))),
    [],
  ];
}

export function buildDmaDataXLS(dmas) {
  const worksheets = dmas
    .map((dma, idx) => {
      const tables = [];

      if (dma.subMeters?.length) {
        tables.push(
          buildTable(`Sub Meters (${dma.subMeters.length})`, METER_COLS, dma.subMeters.map(meterRow))
        );
      }
      if (dma.mainMeters?.length) {
        tables.push(
          buildTable(`Main Meters (${dma.mainMeters.length})`, METER_COLS, dma.mainMeters.map(meterRow))
        );
      }

      for (const g of dma.layerGroups || []) {
        // Derive columns from the union of property keys across features
        const keySet = new Set();
        for (const f of g.features) {
          for (const k of Object.keys(f)) {
            if (k !== "_geometry_type") keySet.add(k);
          }
        }
        const keys = ["_geometry_type", ...[...keySet].sort()];
        const cols = keys.map((k) => ({
          key: k,
          label: k === "_geometry_type" ? "Geometry" : k,
        }));
        const label = `${g.layerName} — ${g.category} (${g.features.length})`;
        tables.push(buildTable(label, cols, g.features));
      }

      const sheetName = sanitizeSheetName(dma.name, idx);
      const aoa = tables.length ? tables.flat() : [["No objects found in this DMA."]];
      return { sheetName, aoa };
    });

  // Real .xlsx. This was SpreadsheetML 2003 (XML) written as .xls, which makes
  // Excel warn the file "could be corrupted or unsafe" before opening it.
  const wb = XLSX.utils.book_new();
  for (const { sheetName, aoa } of worksheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

export function downloadDmaDataXLS(dmas, filename) {
  const wbArray = buildDmaDataXLS(dmas);
  const blob = new Blob([wbArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const name = (filename || "dma_data").replace(/\.xlsx?$/i, "") + ".xlsx";
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}