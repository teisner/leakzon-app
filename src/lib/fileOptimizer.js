/**
 * File optimization utilities for analyzing, normalizing, and generating
 * template-ready CSV files from raw meter and consumption data.
 * Supports CSV (client-side) and XLS/XLSX (via LLM extraction).
 */
import { invokeFunction } from "@/api/functionsClient";
import { parseCSV, parseXLSX, detectIdColumns, splitCoordinates, parseActive, parseMainValue, detectMainColumn } from "./meterAnalysis";

export const METER_TEMPLATE_HEADERS = [
  "UID", "Meter ID", "Endpoint ID", "Account Name", "Account ID",
  "Address", "City", "State", "Country", "Latitude", "Longitude",
  "Altitude", "Diameter", "Meter Provider", "Active Status", "Is Main",
];

// --- Column detection ---

function suggestMappings(columns) {
  const find = (patterns) =>
    columns.find((c) => patterns.some((p) => new RegExp(p, "i").test(c))) || "";
  return {
    uid: find(["meter", "^id$", "serial", "number", "uid", "no$", "mat", "מונה", "זיהוי", "משדר", "מספר"]),
    endpoint_id: find(["endpoint", "^ep$|^ep_id$", "device.?id", "transmitter.?id"]),
    payer_name: find(["payer", "customer", "consumer", "name", "account", "full.?name", "צרכן", "שם"]),
    address: find(["address", "addr", "street", "location", "כתובת"]),
    city: find(["^city$", "city", "עיר"]),
    state: find(["^state$", "region", "province", "מדינה"]),
    country: find(["^country$", "country"]),
    provider: find(["provider", "supplier", "utility", "company", "water", "ספק", "חברה"]),
    is_active: find(["active", "status", "enabled", "פעיל", "סטטוס"]),
    coordinates: find(["coord", "geo.?point", "gps", "wgs", "lat.*lng", "lng.*lat", "position", "נ\\.?צ", "קואורדינטה"]),
    latitude: find(["(?:^|[_\\s-])lat", "רוחב"]),
    longitude: find(["(?:^|[_\\s-])(?:lng|lon|long)", "אורך"]),
    altitude: find(["elev", "altitude", "^alt$", "^z$", "height", "גובה"]),
    diameter: find(["diameter", "dia", "nominal", "meter.?size", "meter.?dia", "size", "קוטר"]),
  };
}

function findAddressColumns(columns) {
  return columns.filter((c) => /address|addr|street|location|כתובת/i.test(c));
}

function detectDateColumns(columns) {
  return columns.filter((c) => /date|period|month|year|time|reading/i.test(c));
}

function detectSumColumns(columns) {
  return columns.filter((c) => /sum|total/i.test(c));
}

function detectNumericColumns(rows, columns) {
  return columns.filter((col) => {
    const values = rows.map((r) => r[col]).filter((v) => v != null && String(v).trim() !== "");
    if (values.length === 0) return false;
    const numericCount = values.filter((v) => !isNaN(parseFloat(String(v).replace(/,/g, "")))).length;
    return numericCount / values.length > 0.5;
  });
}

// --- Date parsing ---

function parseDateFromString(str) {
  if (!str) return null;
  const s = String(str).trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const a = parseInt(m[1]), b = parseInt(m[2]);
    let y = parseInt(m[3]);
    if (y < 100) y += 2000;
    if (a > 12) return new Date(y, b - 1, a);
    if (b > 12) return new Date(y, a - 1, b);
    return new Date(y, b - 1, a);
  }
  return null;
}

export function isDateLike(str) {
  return parseDateFromString(str) !== null;
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// --- File capabilities detection ---

export function detectFileCapabilities(parsed) {
  const meterCols = parsed.columns.filter((c) =>
    /address|addr|street|payer|customer|name|provider|diameter|coord|lat|lon|gps|active|main|כתובת|שם|ספק|קוטר/i.test(c)
  );
  const dateLikeNumeric = (parsed.numericColumns || []).filter((c) => isDateLike(c));
  const hasMeterData = meterCols.length > 0;
  const hasConsumptionData =
    dateLikeNumeric.length > 0 ||
    ((parsed.dateColumns || []).length > 0 && (parsed.numericColumns || []).length > 0);
  return { hasMeterData, hasConsumptionData };
}

// --- File type detection ---

export function detectFileType(columns) {
  const meterIndicators = columns.filter((c) =>
    /address|addr|street|payer|customer|name|provider|diameter|coord|lat|lon|gps|active|main|כתובת|שם|ספק|קוטר/i.test(c)
  );
  const dateLikeCols = columns.filter((c) => isDateLike(c) || /period|month|reading/i.test(c));
  if (meterIndicators.length > 0) return "meter";
  if (dateLikeCols.length > 3) return "consumption";
  return "unknown";
}

// --- File parsing ---

function buildParsedResult(file, rows) {
  if (!rows || rows.length === 0) return null;
  const columns = Object.keys(rows[0]);
  return {
    file,
    name: file.name,
    rows,
    columns,
    rowCount: rows.length,
    detectedType: detectFileType(columns),
    idColumns: detectIdColumns(columns),
    addressColumns: findAddressColumns(columns),
    suggestions: suggestMappings(columns),
    mainColumn: detectMainColumn(columns),
    dateColumns: detectDateColumns(columns),
    numericColumns: detectNumericColumns(rows, columns),
    sumColumns: detectSumColumns(columns),
    preview: rows.slice(0, 3),
  };
}

export async function parseDataFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "csv") {
    const text = await file.text();
    const rows = parseCSV(text);
    return buildParsedResult(file, rows);
  }

  if (ext === "xls" || ext === "xlsx") {
    const rows = await parseXLSX(file);
    return buildParsedResult(file, rows);
  }

  return null;
}

// --- Reading frequency detection ---

export function detectReadingFrequency(rows, uidColumn, dateColumn, consumptionColumns) {
  const dateHeaders = (consumptionColumns || []).filter((c) => parseDateFromString(c));
  if (dateHeaders.length >= 2) {
    const dates = dateHeaders.map((h) => parseDateFromString(h)).filter(Boolean).sort((a, b) => a - b);
    if (dates.length >= 2) {
      const gaps = [];
      for (let i = 1; i < dates.length; i++) {
        gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (avgGap <= 2) return { frequency: "daily", avgGap: Math.round(avgGap * 10) / 10, format: "wide" };
      if (avgGap >= 20) return { frequency: "monthly", avgGap: Math.round(avgGap), format: "wide" };
      return { frequency: "unknown", avgGap: Math.round(avgGap), format: "wide" };
    }
  }

  if (dateColumn && rows.length >= 2) {
    const dates = rows
      .map((r) => parseDateFromString(String(r[dateColumn] || "")))
      .filter(Boolean)
      .sort((a, b) => a - b);
    if (dates.length >= 2) {
      const gaps = [];
      for (let i = 1; i < dates.length; i++) {
        const gap = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        if (gap > 0 && gap < 400) gaps.push(gap);
      }
      if (gaps.length > 0) {
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        if (avgGap <= 2) return { frequency: "daily", avgGap: Math.round(avgGap * 10) / 10, format: "long" };
        if (avgGap >= 20) return { frequency: "monthly", avgGap: Math.round(avgGap), format: "long" };
        return { frequency: "unknown", avgGap: Math.round(avgGap), format: "long" };
      }
    }
  }

  return { frequency: "unknown", avgGap: null, format: "unknown" };
}

// --- Unified AI analysis of all files together ---

export async function analyzeAllFiles(parsedFiles) {
  const summaries = parsedFiles.map((f, i) => ({
    fileIndex: i,
    fileName: f.name,
    rowCount: f.rowCount,
    columns: f.columns,
    sampleRows: f.rows.slice(0, 3).map((r) => {
      const trimmed = {};
      for (const [k, v] of Object.entries(r)) trimmed[k] = String(v || "").slice(0, 50);
      return trimmed;
    }),
  }));

  try {
    const res = await invokeFunction("analyzeDataMappings", { files: summaries });
    return res.data;
  } catch {
    // Fallback to regex-based detection
    const fallbackResults = parsedFiles.map((f, i) => {
      const caps = detectFileCapabilities(f);
      const dateLikeNumeric = (f.numericColumns || []).filter((c) => isDateLike(c));
      const isWide = dateLikeNumeric.length > 0;
      const uidCol = f.suggestions?.uid || f.idColumns?.[0] || "";
      const dateCol = isWide ? "" : (f.dateColumns?.[0] || "");
      const consCols = isWide ? dateLikeNumeric : (f.numericColumns || []).filter((c) => c !== uidCol && c !== dateCol && !(f.sumColumns || []).includes(c));
      return {
        fileIndex: i,
        uidColumn: uidCol,
        hasMeterData: caps.hasMeterData,
        hasConsumptionData: caps.hasConsumptionData,
        addressColumn: f.suggestions?.address || "",
        dateColumn: dateCol,
        consumptionColumns: consCols,
        readingFrequency: "unknown",
        latitudeColumn: f.suggestions?.latitude || "",
        longitudeColumn: f.suggestions?.longitude || "",
      };
    });
    return { files: fallbackResults, detectedCountry: "" };
  }
}

// --- UID consistency check ---

export function checkUidConsistency(meterUids, consumptionUids) {
  const meterSet = new Set(meterUids.map((u) => String(u).trim()));
  const consumptionSet = new Set(consumptionUids.map((u) => String(u).trim()));
  let matched = 0;
  for (const uid of consumptionSet) {
    if (meterSet.has(uid)) matched++;
  }
  const matchRate = consumptionSet.size > 0 ? matched / consumptionSet.size : 0;
  return {
    matched,
    total: consumptionSet.size,
    matchRate: Math.round(matchRate * 100),
    isConsistent: matchRate >= 0.5,
  };
}

// --- Meter data generation ---

function validateCoordinates(lat, lng) {
  const la = parseFloat(lat);
  const ln = parseFloat(lng);
  if (isNaN(la) || isNaN(ln)) return { lat: "", lng: "" };
  const latValid = la >= -90 && la <= 90;
  const lngValid = ln >= -180 && ln <= 180;
  if (latValid && lngValid) return { lat: la, lng: ln };
  // Try swapped (lat/lng columns may be reversed)
  if (ln >= -90 && ln <= 90 && la >= -180 && la <= 180) return { lat: ln, lng: la };
  return { lat: "", lng: "" };
}

export function generateMeterRows(rows, mappings, mainColumn) {
  return rows
    .map((row) => {
      let lat = "", lng = "";
      if (mappings.latitude && mappings.longitude) {
        lat = parseFloat(row[mappings.latitude]);
        lng = parseFloat(row[mappings.longitude]);
      } else if (mappings.coordinates) {
        const coords = splitCoordinates(row[mappings.coordinates]);
        lat = coords.latitude ?? "";
        lng = coords.longitude ?? "";
      }
      const validated = validateCoordinates(lat, lng);
      lat = validated.lat;
      lng = validated.lng;
      const isActive = mappings.is_active ? parseActive(row[mappings.is_active]) : null;
      const isMain = mainColumn ? parseMainValue(row[mainColumn]) : false;
      return [
        mappings.uid ? String(row[mappings.uid] || "").trim() : "",
        "",
        mappings.endpoint_id ? String(row[mappings.endpoint_id] || "").trim() : "",
        mappings.payer_name ? String(row[mappings.payer_name] || "").trim() : "",
        "",
        mappings.address ? String(row[mappings.address] || "").trim() : "",
        mappings.city ? String(row[mappings.city] || "").trim() : "",
        mappings.state ? String(row[mappings.state] || "").trim() : "",
        mappings.country ? String(row[mappings.country] || "").trim() : "",
        lat, lng,
        mappings.altitude ? String(row[mappings.altitude] || "") : "",
        mappings.diameter ? String(row[mappings.diameter] || "") : "",
        mappings.provider ? String(row[mappings.provider] || "").trim() : "",
        isActive === null ? "" : isActive ? "Yes" : "No",
        isMain ? "Yes" : "No",
      ];
    })
    .filter((r) => r[0]);
}

export function deduplicateMeterRows(rows) {
  const uidMap = new Map();
  for (const row of rows) {
    const uid = String(row[0] || "").trim();
    if (!uid) continue;
    const key = uid.toLowerCase();
    if (!uidMap.has(key)) {
      uidMap.set(key, row);
    } else {
      const existing = uidMap.get(key);
      const existingFilled = existing.filter((v) => v !== "" && v != null).length;
      const newFilled = row.filter((v) => v !== "" && v != null).length;
      if (newFilled > existingFilled) uidMap.set(key, row);
    }
  }
  return [...uidMap.values()];
}

// --- Consumption data generation ---

export function generateConsumptionData(rows, uidColumn, dateColumn, consumptionColumns) {
  const byUid = new Map();
  const dates = new Set();

  for (const row of rows) {
    const uid = String(row[uidColumn] || "").trim();
    if (!uid) continue;
    if (!byUid.has(uid)) byUid.set(uid, new Map());

    if (dateColumn) {
      const date = parseDateFromString(String(row[dateColumn] || ""));
      if (date) {
        const dateKey = formatDateISO(date);
        dates.add(dateKey);
        for (const col of consumptionColumns) {
          const val = parseFloat(String(row[col] || "").replace(/,/g, ""));
          if (!isNaN(val)) byUid.get(uid).set(dateKey, val);
        }
      }
    } else {
      for (const col of consumptionColumns) {
        const val = parseFloat(String(row[col] || "").replace(/,/g, ""));
        if (!isNaN(val)) {
          const date = parseDateFromString(col);
          const dateKey = date ? formatDateISO(date) : col;
          dates.add(dateKey);
          byUid.get(uid).set(dateKey, val);
        }
      }
    }
  }

  return { byUid, dates: [...dates].sort() };
}

export function buildConsumptionCSV(byUid, sortedDates) {
  const headers = ["UID", ...sortedDates];
  const rows = [];
  for (const [uid, readings] of byUid) {
    rows.push([uid, ...sortedDates.map((d) => readings.get(d) ?? "")]);
  }
  return { headers, rows };
}

// --- CSV download ---

export function downloadCSV(filename, headers, rows) {
  const escapeCell = (cell) => {
    const v = String(cell ?? "");
    return v.includes(",") || v.includes('"') || v.includes("\n")
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  };
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}