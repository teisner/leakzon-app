// Export meters to XLS — supports field selection, custom filename, and prepared rows
import * as XLSX from "xlsx";
import { findAdditionalId } from "@/lib/meterIds";

export const ALL_COLUMNS = [
  { key: "uid", label: "UID", type: "string" },
  { key: "meter_id", label: "Meter ID", type: "string" },
  { key: "endpoint_id", label: "Endpoint ID", type: "string" },
  { key: "payer_name", label: "Account Name", type: "string" },
  { key: "account_id", label: "Account ID", type: "string" },
  { key: "address", label: "Address", type: "string" },
  { key: "city", label: "City", type: "string" },
  { key: "state", label: "State", type: "string" },
  { key: "country", label: "Country", type: "string" },
  { key: "latitude", label: "Latitude", type: "number" },
  { key: "longitude", label: "Longitude", type: "number" },
  { key: "altitude", label: "Altitude", type: "number" },
  { key: "diameter", label: "Diameter", type: "number" },
  { key: "provider", label: "Meter Provider", type: "string" },
  { key: "active_status", label: "Active Status", type: "string" },
  { key: "is_main", label: "Is Main", type: "string" },
  { key: "dma_name", label: "DMA Name", type: "string" },
];

export function meterToRow(meter, dmaName) {
  const hasLoc = meter.latitude != null && meter.longitude != null;
  return {
    uid: meter.uid || "",
    meter_id: findAdditionalId(meter, ["^meter.?id$", "^meter$", "meter"]),
    endpoint_id: meter.endpoint_id || "",
    payer_name: meter.payer_name || "",
    account_id: findAdditionalId(meter, ["account.?id", "^account$", "account"]),
    address: meter.address || "",
    city: meter.city || "",
    state: meter.state || "",
    country: meter.country || "",
    latitude: hasLoc ? meter.latitude : "",
    longitude: hasLoc ? meter.longitude : "",
    altitude: meter.altitude ?? "",
    diameter: meter.diameter ?? "",
    provider: meter.provider || "",
    active_status: meter.is_active == null ? "" : meter.is_active ? "Yes" : "No",
    is_main: meter.is_main ? "Yes" : "No",
    dma_name: dmaName || meter.dma_name || "",
  };
}

export function getFieldValue(row, key) {
  return row[key];
}

function escapeXML(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildXLS(rows, columns) {
  // Real .xlsx via SheetJS. This used to emit SpreadsheetML 2003 (XML) named
  // .xls, which makes Excel warn that the file "could be corrupted or unsafe"
  // before it will open it.
  const aoa = [
    columns.map((c) => c.label),
    ...rows.map((r) => columns.map((c) => {
      const v = r[c.key];
      if (c.type === "number" && v !== "" && v != null) return Number(v);
      return v ?? "";
    })),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Meters");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportMetersXLS(rows, columns, filename) {
  const wbArray = buildXLS(rows, columns);
  const name = filename.replace(/\.xlsx?$/i, "") + ".xlsx";
  download(wbArray, name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function escapeCSV(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportMetersCSV(rows, columns, filename) {
  const header = columns.map((c) => escapeCSV(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => escapeCSV(r[c.key])).join(",")).join("\n");
  const csv = "\uFEFF" + header + "\n" + body;
  const name = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  download(csv, name, "text/csv;charset=utf-8");
}

// Keep backward-compatible signature for any other callers
export function exportMeters(meters, format, baseName = "meters") {
  if (format !== "xls") return;
  const rows = meters.map(meterToRow);
  exportMetersXLS(rows, ALL_COLUMNS, `${baseName}_${new Date().toISOString().slice(0, 10)}`);
}