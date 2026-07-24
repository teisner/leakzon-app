import { invokeFunction } from "@/api/functionsClient";

const parsePolygon = (dma) => {
  try {
    // The canonical column is `polygon_json` (raw `dma` table select, e.g. on
    // the export page). ProjectDetail aliases it to `polygon`; some legacy
    // rows may use either — accept all so exports work from every screen.
    const raw = dma.polygon_json ?? dma.polygon;
    const poly = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(poly) && poly.length >= 3 ? poly : null;
  } catch {
    return null;
  }
};

const safeName = (project) => (project?.name || "project").replace(/\s+/g, "_");

// Triggers a browser download for a Blob. Appends the anchor to the DOM and
// defers URL revocation — required for downloads initiated after an `await`
// (e.g. the SHP export waits on an Edge Function first), which some browsers
// silently drop if the anchor isn't in the document.
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

export function exportDmasJson(dmas, project) {
  const exportData = (dmas || []).map(({ id, created_date, updated_date, created_by_id, ...rest }) => ({
    ...rest,
    polygon: parsePolygon(rest) || rest.polygon,
  }));
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${safeName(project)}_dmas.json`);
}

export async function exportDmasShp(dmas, project) {
  const validDmas = (dmas || []).filter((d) => parsePolygon(d));
  if (validDmas.length === 0) {
    throw new Error("No DMAs with a valid polygon to export.");
  }

  const response = await invokeFunction("exportDmaShp", { dmas: validDmas });
  const base64Zip = response.data?.zip;
  if (!base64Zip) throw new Error("Failed to generate shapefile (empty response).");

  const bytes = Uint8Array.from(atob(base64Zip), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/zip" });
  downloadBlob(blob, `${safeName(project)}_dmas.zip`);
}