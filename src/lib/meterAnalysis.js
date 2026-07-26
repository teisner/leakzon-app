import * as XLSX from "xlsx";

// Reads an .xls/.xlsx file client-side (SheetJS) into the same row-object
// shape parseCSV/parseJSONData produce — first sheet with data, headers as
// keys, values as trimmed strings.
export async function parseXLSX(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  let sheetName = workbook.SheetNames[0];
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: "", raw: false });
    if (rows.length > 0) {
      sheetName = name;
      break;
    }
  }

  const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
  return json.map((row) => {
    const obj = {};
    for (const [k, v] of Object.entries(row)) obj[k] = String(v ?? "").trim();
    return obj;
  });
}

export function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        currentRow.push(currentField);
        currentField = "";
        rows.push(currentRow);
        currentRow = [];
      } else {
        currentField += char;
      }
    }
  }
  if (currentField || currentRow.length) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((v) => v.trim()))
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = (row[i] || "").trim();
      });
      return obj;
    });
}

export function parseJSONData(text) {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null) {
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return [];
}

export function splitCoordinates(value) {
  if (!value) return { latitude: null, longitude: null };
  const cleaned = String(value)
    .replace(/[°]/g, "")
    .replace(/[NSEWnsew]/g, "")
    .trim();
  const parts = cleaned.split(/[,;\s]+/).filter((p) => p);
  if (parts.length >= 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng)) return { latitude: lat, longitude: lng };
  }
  return { latitude: null, longitude: null };
}

export function parseActive(value) {
  if (!value) return null;
  const v = String(value).toLowerCase().trim();
  const blankPatterns = ["", "n/a", "na", "none", "null", "-", "—"];
  if (blankPatterns.includes(v)) return null;
  const inactivePatterns = ["inactive", "no", "false", "0", "not active", "disabled", "off", "dead"];
  return !inactivePatterns.includes(v);
}

export function detectMainColumn(columns) {
  return (columns || []).find((c) => /is.?main|\bmain\b/i.test(c)) || "";
}

export function parseMainValue(value) {
  if (!value) return false;
  const v = String(value).toLowerCase().trim();
  const truePatterns = ["main", "yes", "true", "1", "primary", "master"];
  return truePatterns.includes(v);
}

function suggestMappings(columns) {
  const find = (patterns) =>
    columns.find((c) => patterns.some((p) => new RegExp(p, "i").test(c))) || "";

  const suggestions = {
    uid: find(["meter", "^id$", "serial", "number", "uid", "no$", "mat", "מונה", "זיהוי", "משדר", "מספר"]),
    endpoint_id: find(["endpoint", "^ep$|^ep_id$", "device.?id", "transmitter.?id"]),
    payer_name: find(["payer", "customer", "consumer", "name", "account", "full.?name", "צרכן", "שם"]),
    address: find(["address", "addr", "street", "location", "כתובת"]),
    city: find(["^city$", "city", "עיר"]),
    state: find(["^state$", "region", "province", "מדינה"]),
    country: find(["^country$", "country"]),
    provider: find(["provider", "supplier", "utility", "company", "water", "ספק", "חברה"]),
    communication_type: find(["communication", "comm", "tech", "module", "sim", "^type$", "תקשורת", "משדר"]),
    is_active: find(["active", "status", "enabled", "פעיל", "סטטוס"]),
    dma_name: find(["dma", "zone", "district", "sector", "אזור", "מתחם"]),
    coordinates: find(["coord", "geo", "point", "gps", "wgs", "lat.*lng", "lng.*lat", "location", "position", "נ\\.?צ", "קואורדינטה"]),
    latitude: find(["^lat", "latitude", "\\blat\\b", "קו רוחב", "רוחב"]),
    longitude: find(["^lng$", "^lon$|^long", "longitude", "\\blng\\b|\\blon\\b", "קו אורך", "אורך"]),
    altitude: find(["elev", "altitude", "^alt$", "^z$", "height", "גובה"]),
    diameter: find(["diameter", "dia", "nominal", "size", "קוטר"]),
  };

  // Enforce mutual exclusivity: separate lat/long columns OR a combined coordinates column — not both
  if (suggestions.latitude && suggestions.longitude) {
    suggestions.coordinates = "";
  } else if (suggestions.coordinates) {
    suggestions.latitude = "";
    suggestions.longitude = "";
  }

  return suggestions;
}

const ID_COLUMN_RE = /meter|id|serial|number|uid|no$|mat|account|ref|code|מונה|זיהוי|משדר|מספר|צרכן/i;

export function detectIdColumns(columns) {
  return columns.filter((c) => ID_COLUMN_RE.test(c));
}

export async function analyzeMeterData(file, fileUrl) {
  const ext = file.name.split(".").pop().toLowerCase();

  let rows;
  if (ext === "csv" || ext === "json" || ext === "geojson") {
    const text = await file.text();
    rows = ext === "csv" ? parseCSV(text) : parseJSONData(text);
  } else {
    // Excel — parsed client-side (SheetJS), same shape as CSV/JSON
    rows = await parseXLSX(file);
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const suggestions = suggestMappings(columns);
  const idColumns = detectIdColumns(columns);
  return { columns, suggestions, idColumns, preview: rows.slice(0, 5), rowCount: rows.length, rows };
}

// `meter` has no dma_name column — the DMA is a real FK (meter.dma_id), and
// getProjectMeters synthesizes dma_name on read. So the dma_name that
// extractMeterRecords carries (for preview + "imported with DMA names") has to
// be resolved to a dma_id and dropped before the rows are written, otherwise
// PostgREST rejects the whole batch with:
//   PGRST204 Could not find the 'dma_name' column of 'meter' in the schema cache
export function toMeterInsertRows(records, dmas) {
  const byName = new Map(
    (dmas || []).filter((d) => d?.name).map((d) => [d.name.trim().toLowerCase(), d.id])
  );
  return records.map(({ dma_name, ...rest }) => {
    const dmaId = dma_name ? byName.get(String(dma_name).trim().toLowerCase()) : null;
    return dmaId ? { ...rest, dma_id: dmaId } : rest;
  });
}

export async function extractMeterRecords(analysis, fileUrl, fileName, mappings, isMain, extraIdColumns, mainColumn) {
  const idCols = extraIdColumns || [];
  return analysis.rows
    .map((row) => {
      let coords = { latitude: null, longitude: null };
      if (mappings.coordinates) {
        coords = splitCoordinates(row[mappings.coordinates]);
      } else if (mappings.latitude && mappings.longitude) {
        const lat = parseFloat(row[mappings.latitude]);
        const lng = parseFloat(row[mappings.longitude]);
        coords = {
          latitude: !isNaN(lat) ? lat : null,
          longitude: !isNaN(lng) ? lng : null,
        };
      }
      const mappedCols = Object.values(mappings).filter(Boolean);
      const additionalIds = idCols
        .filter((c) => !mappedCols.includes(c))
        .map((c) => ({ label: c, value: String(row[c] || "").trim() }))
        .filter((id) => id.value);
      const altitude = mappings.altitude ? parseFloat(row[mappings.altitude]) : null;
      const diameter = mappings.diameter ? parseFloat(row[mappings.diameter]) : null;
      return {
        uid: mappings.uid ? String(row[mappings.uid] || "").trim() : "",
        endpoint_id: mappings.endpoint_id ? String(row[mappings.endpoint_id] || "").trim() : "",
        additional_ids: additionalIds,
        is_main: mainColumn ? parseMainValue(row[mainColumn]) : isMain,
        payer_name: mappings.payer_name ? String(row[mappings.payer_name] || "").trim() : "",
        address: mappings.address ? String(row[mappings.address] || "").trim() : "",
        city: mappings.city ? String(row[mappings.city] || "").trim() : "",
        state: mappings.state ? String(row[mappings.state] || "").trim() : "",
        country: mappings.country ? String(row[mappings.country] || "").trim() : "",
        provider: mappings.provider ? String(row[mappings.provider] || "").trim() : "",
        communication_type: mappings.communication_type ? String(row[mappings.communication_type] || "").trim() : "",
        is_active: mappings.is_active ? parseActive(row[mappings.is_active]) : null,
        dma_name: mappings.dma_name ? String(row[mappings.dma_name] || "").trim() : "",
        latitude: coords.latitude,
        longitude: coords.longitude,
        altitude: altitude != null && !isNaN(altitude) ? altitude : null,
        diameter: diameter != null && !isNaN(diameter) ? diameter : null,
      };
    })
    .filter((m) => m.uid);
}