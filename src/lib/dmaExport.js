import { invokeFunction } from "@/api/functionsClient";

const parsePolygon = (dma) => {
  try {
    const poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
    return Array.isArray(poly) && poly.length >= 3 ? poly : null;
  } catch {
    return null;
  }
};

const safeName = (project) => (project?.name || "project").replace(/\s+/g, "_");

export function exportDmasJson(dmas, project) {
  const exportData = (dmas || []).map(({ id, created_date, updated_date, created_by_id, ...rest }) => ({
    ...rest,
    polygon: parsePolygon(rest) || rest.polygon,
  }));
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName(project)}_dmas.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportDmasShp(dmas, project) {
  const validDmas = (dmas || []).filter((d) => parsePolygon(d));
  if (validDmas.length === 0) return;

  const response = await invokeFunction("exportDmaShp", { dmas: validDmas });
  const base64Zip = response.data?.zip;
  if (!base64Zip) throw new Error("Failed to generate shapefile");

  const bytes = Uint8Array.from(atob(base64Zip), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName(project)}_dmas.zip`;
  a.click();
  URL.revokeObjectURL(url);
}