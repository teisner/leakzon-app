// One-time import of ConsumptionReading_export_part{1..5}.csv — a
// human-readable export (Project name, Meter UID, Reading Date, Period
// Label, Consumption, Source File), NOT the raw Base44 entity dump shape
// used by import.mjs. Run once:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node import-consumption.mjs
//
// Rows referencing a project by a raw Base44 hex id instead of a name (or a
// name with no match) belong to deleted projects — consistent with the
// user-confirmed policy from the main import (skip rows tied to deleted
// projects). Rows whose (project, meter uid) has no match in the already-
// imported meter table are skipped and counted, not silently dropped.

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars before running.');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data_export');

function loadCsv(name) {
  const content = readFileSync(path.join(DATA_DIR, name), 'utf-8');
  return parse(content, { columns: true, skip_empty_lines: true, bom: true });
}

async function insertBatch(rows, batchSize = 5000) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('consumption_reading').insert(batch);
    if (error) throw new Error(`Insert failed: ${error.message}`);
  }
}

async function run() {
  console.log('Loading project + meter lookups...');
  const { data: projects } = await supabase.from('project').select('id, name');
  const projectByName = new Map(projects.map((p) => [p.name, p.id]));

  const meterByProjectUid = new Map();
  let from = 0;
  const PAGE = 10000; // matches this project's PostgREST max_rows setting
  let hasMore = true;
  while (hasMore) {
    const { data: batch } = await supabase.from('meter').select('id, project_id, uid').range(from, from + PAGE - 1);
    for (const m of batch || []) meterByProjectUid.set(`${m.project_id}::${m.uid}`, m.id);
    hasMore = (batch?.length || 0) === PAGE;
    from += PAGE;
  }
  console.log(`  ${projectByName.size} projects, ${meterByProjectUid.size} meters loaded.`);

  let totalRows = 0;
  let totalInserted = 0;
  let skippedDeletedProject = 0;
  let skippedNoMeterMatch = 0;
  const unresolvedProjectNames = new Set();

  for (let part = 1; part <= 5; part++) {
    const fileName = `ConsumptionReading_export_part${part}.csv`;
    console.log(`=== ${fileName} ===`);
    const rows = loadCsv(fileName);
    totalRows += rows.length;

    const readings = [];
    for (const row of rows) {
      const projectName = row['Project'];
      const projectId = projectByName.get(projectName);
      if (!projectId) {
        skippedDeletedProject++;
        unresolvedProjectNames.add(projectName);
        continue;
      }
      const meterId = meterByProjectUid.get(`${projectId}::${row['Meter UID']}`);
      if (!meterId) {
        skippedNoMeterMatch++;
        continue;
      }
      const consumption = parseFloat(String(row['Consumption'] ?? '').replace(/,/g, ''));
      if (isNaN(consumption)) continue;
      readings.push({
        project_id: projectId,
        meter_id: meterId,
        reading_date: row['Reading Date'] || null,
        period_label: row['Period Label'] || null,
        consumption,
        source_file_name: row['Source File'] || null,
      });
    }

    await insertBatch(readings);
    totalInserted += readings.length;
    console.log(`  parsed ${rows.length}, inserted ${readings.length}`);
  }

  console.log('\n=== Done ===');
  console.log(`Total rows parsed: ${totalRows}`);
  console.log(`Inserted: ${totalInserted}`);
  console.log(`Skipped (deleted/unresolved project): ${skippedDeletedProject}`);
  console.log(`Skipped (no matching meter uid): ${skippedNoMeterMatch}`);
  console.log('Unresolved project references:', [...unresolvedProjectNames]);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
