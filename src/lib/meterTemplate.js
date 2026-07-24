/**
 * CSV template generators for meter and consumption data imports.
 * Column names are chosen to match the auto-detection patterns in meterAnalysis.js
 * so the import wizard maps them correctly without manual configuration.
 */

function downloadCSV(filename, headers, rows) {
  const escapeCell = (cell) => {
    const v = String(cell ?? "");
    return v.includes(",") || v.includes('"') || v.includes("\n")
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  };

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\n");

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

export function downloadMeterTemplate() {
  const headers = [
    "UID",
    "Meter ID",
    "Endpoint ID",
    "Account Name",
    "Account ID",
    "Address",
    "City",
    "State",
    "Country",
    "Latitude",
    "Longitude",
    "Altitude",
    "Diameter",
    "Meter Provider",
    "Active Status",
    "Is Main",
    "DMA Name",
  ];

  const sampleRows = [
    ["24001612", "M-001", "EP-7891", "John Smith", "ACC-1001", "123 Main Street", "Jerusalem", "Jerusalem", "Israel", "31.76062291", "35.00555183", "250", "15", "Mei Shemesh", "Yes", "Yes", "North Zone"],
    ["20001565", "M-002", "EP-7892", "Jane Doe", "ACC-1002", "45 Oak Avenue", "Tel Aviv", "Tel Aviv", "Israel", "31.71787235", "35.00900022", "245", "20", "Mei Shemesh", "Yes", "No", "Central Zone"],
    ["23004478", "M-003", "EP-7893", "Bob Wilson", "ACC-1003", "78 Pine Road", "Be'er Sheva", "Be'er Sheva", "Israel", "", "", "", "25", "Mei Shemesh", "No", "No", "South Zone"],
  ];

  downloadCSV("meter_data_template.csv", headers, sampleRows);
}

export function downloadConsumptionTemplate() {
  const days = 30;
  const today = new Date();
  const dateHeaders = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dateHeaders.push(`${y}-${m}-${day}`);
  }

  const headers = ["UID", ...dateHeaders];

  const sampleRows = [
    ["24001612", ...dateHeaders.map((_, i) => String(5 + i * 0.3))],
    ["20001565", ...dateHeaders.map((_, i) => String(3 + i * 0.2))],
  ];

  downloadCSV("consumption_data_template.csv", headers, sampleRows);
}