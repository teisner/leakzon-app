import { uploadFile } from "@/api/storageClient";
import { invokeFunction } from "@/api/functionsClient";
import { supabase } from "@/api/supabaseClient";
import { resolveLayerTypeId } from "@/lib/layerType";
import { runBatchesInParallel } from "@/lib/parallelBatch";
import { componentPointConfig, componentColor } from "@/lib/componentDefaults";

function buildCSVString(headers, rows) {
  const escapeCell = (cell) => {
    const v = String(cell ?? "");
    return v.includes(",") || v.includes('"') || v.includes("\n")
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  };
  return [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
}

function buildUidLookup(meters) {
  const lookup = new Map();
  for (const meter of meters) {
    if (meter.uid) lookup.set(meter.uid.trim(), meter);
    if (meter.additional_ids) {
      for (const id of meter.additional_ids) {
        if (id.value) lookup.set(String(id.value).trim(), meter);
      }
    }
  }
  return lookup;
}

export function convertMeterRowsToRecords(rows, projectId, layerId, fileUrl) {
  return rows
    .map((row) => {
      const lat = parseFloat(row[9]);
      const lng = parseFloat(row[10]);
      const altitude = parseFloat(row[11]);
      const diameter = parseFloat(row[12]);
      const additionalIds = [
        { label: "Meter ID", value: String(row[1] || "").trim() },
        { label: "Account ID", value: String(row[4] || "").trim() },
      ].filter((id) => id.value);

      const activeStatus = String(row[14] || "").trim().toLowerCase();
      const isActive = activeStatus === "yes" ? true : activeStatus === "no" ? false : null;

      return {
        project_id: projectId,
        uid: String(row[0] || "").trim(),
        endpoint_id: String(row[2] || "").trim(),
        additional_ids: additionalIds,
        is_main: String(row[15] || "").trim().toLowerCase() === "yes",
        payer_name: String(row[3] || "").trim(),
        address: String(row[5] || "").trim(),
        city: String(row[6] || "").trim(),
        state: String(row[7] || "").trim(),
        country: String(row[8] || "").trim(),
        latitude: !isNaN(lat) ? lat : null,
        longitude: !isNaN(lng) ? lng : null,
        altitude: !isNaN(altitude) ? altitude : null,
        diameter: !isNaN(diameter) ? diameter : null,
        provider: String(row[13] || "").trim(),
        is_active: isActive,
        source_file_url: fileUrl,
        layer_id: layerId,
      };
    })
    .filter((m) => m.uid);
}

export async function importOptimizedMeterData(meterData, projectId, onProgress) {
  const isMainRow = (row) => String(row[15] || "").trim().toLowerCase() === "yes";

  const groups = [
    { rows: meterData.rows.filter(isMainRow), name: "Main Meters", category: "Main Meters" },
    { rows: meterData.rows.filter((r) => !isMainRow(r)), name: "Sub Meters", category: "Sub Meters" },
  ].filter((g) => g.rows.length > 0);

  const layers = [];
  let totalProcessed = 0;
  const totalRows = meterData.rows.length;

  for (const group of groups) {
    const csv = buildCSVString(meterData.headers, group.rows);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const fileName = `optimized_${group.name.toLowerCase().replace(/\s/g, "_")}.csv`;
    const file = new File([blob], fileName, { type: "text/csv" });
    const { file_url } = await uploadFile({ file });

    const layer_type_id = await resolveLayerTypeId(group.category);
    const { data: layer } = await supabase
      .from('project_layer')
      .insert({
        project_id: projectId,
        name: group.name,
        layer_type_id,
        layer_type: "data",
        file_url,
        color: componentColor(group.name, group.category) || undefined,
        visible: true,
        sort_order: 0,
        feature_count: group.rows.length,
        geometry_types: ["Point"],
        properties: meterData.headers,
        bounds: null,
        point_config: componentPointConfig(group.name, group.category) || undefined,
      })
      .select()
      .single();
    layers.push(layer);

    const records = convertMeterRowsToRecords(group.rows, projectId, layer.id, file_url);

    const result = await runBatchesInParallel(
      records,
      1000,
      4,
      (batch) => supabase.from('meter').insert(batch),
      (completedBatches, totalBatches, processed) => {
        onProgress?.({ phase: "meters", processed: totalProcessed + processed, total: totalRows });
      }
    );
    totalProcessed += result.processed;
  }

  return { layers, metersCreated: totalProcessed };
}

export async function importOptimizedConsumptionData(consumptionData, projectId, onProgress) {
  const csv = buildCSVString(consumptionData.headers, consumptionData.rows);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const file = new File([blob], "optimized_consumption_data.csv", { type: "text/csv" });
  const { file_url } = await uploadFile({ file });

  onProgress?.({ phase: "fetching_meters", processed: 0, total: 0 });
  const res = await invokeFunction("getProjectMeters", { project_id: projectId });
  const meters = res.data?.meters || [];
  const uidLookup = buildUidLookup(meters);

  const dates = consumptionData.headers.slice(1);
  const readings = [];
  const errorLogs = [];

  for (const row of consumptionData.rows) {
    const uid = String(row[0] || "").trim();
    const meter = uidLookup.get(uid);
    if (!meter) {
      errorLogs.push({
        project_id: projectId,
        import_type: "consumption",
        uid_value: uid,
        error_message: "UID not found in meter database",
      });
      continue;
    }
    for (let i = 0; i < dates.length; i++) {
      const val = parseFloat(String(row[i + 1] || "").replace(/,/g, ""));
      if (isNaN(val)) continue;
      readings.push({
        project_id: projectId,
        meter_id: meter.id,
        reading_date: dates[i],
        consumption: val,
        source_file_url: file_url,
        source_file_name: "optimized_consumption_data.csv",
      });
    }
  }

  const result = await runBatchesInParallel(
    readings,
    5000,
    4,
    (batch) => supabase.from('consumption_reading').insert(batch),
    (completedBatches, totalBatches, processed) => {
      onProgress?.({ phase: "readings", processed, total: readings.length });
    }
  );

  if (errorLogs.length > 0) {
    await runBatchesInParallel(
      errorLogs,
      150,
      4,
      (batch) => supabase.from('import_log').insert(batch),
      null
    );
  }

  return { fileUrl: file_url, readingsCreated: result.processed, errors: errorLogs.length };
}