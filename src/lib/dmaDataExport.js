// Multi-sheet XLS export of all data within each DMA.
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

function buildCell(val) {
  if (typeof val === "number" && !isNaN(val)) {
    return `<Cell><Data ss:Type="Number">${escapeXML(val)}</Data></Cell>`;
  }
  let s = val;
  if (s !== null && typeof s === "object") {
    try { s = JSON.stringify(s); } catch { s = String(s); }
  }
  if (s === null || s === undefined) s = "";
  return `<Cell><Data ss:Type="String">${escapeXML(s)}</Data></Cell>`;
}

function buildTable(title, columns, rows) {
  const parts = [];
  // Title row (bold)
  parts.push(
    `<Row><Cell ss:StyleID="Title"><Data ss:Type="String">${escapeXML(title)}</Data></Cell></Row>`
  );
  // Header row
  const headerCells = columns
    .map((c) => `<Cell><Data ss:Type="String">${escapeXML(c.label)}</Data></Cell>`)
    .join("");
  parts.push(`<Row>${headerCells}</Row>`);
  // Data rows
  for (const r of rows) {
    const cells = columns.map((c) => buildCell(r[c.key])).join("");
    parts.push(`<Row>${cells}</Row>`);
  }
  // Blank separator row
  parts.push(`<Row></Row>`);
  return parts.join("");
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
      const content = tables.length
        ? tables.join("")
        : `<Row><Cell><Data ss:Type="String">No objects found in this DMA.</Data></Cell></Row>`;

      return `<Worksheet ss:Name="${escapeXML(sheetName)}"><Table>${content}</Table></Worksheet>`;
    })
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="12"/></Style>
 </Styles>
 ${worksheets}
</Workbook>`;
}

export function downloadDmaDataXLS(dmas, filename) {
  const xls = buildDmaDataXLS(dmas);
  const blob = new Blob([xls], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const name = filename && filename.endsWith(".xls") ? filename : `${filename || "dma_data"}.xls`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}