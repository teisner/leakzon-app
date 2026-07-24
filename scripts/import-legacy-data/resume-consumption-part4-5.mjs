// One-time recovery script: the corrected import-consumption.mjs run
// (PAGE=10000, table truncated first) successfully inserted part1 (493186),
// part2 (500000), and part3 (387234) = 1,380,420 rows, then crashed on part4
// with a transient Cloudflare 520 mid-batch. Since consumption_reading has no
// unique constraint, re-running part4 from scratch would duplicate whatever
// batches already landed. This script computes exactly how many part4 rows
// already made it in (current table count - the known part1-3 total, which
// must land on an exact multiple of 5000 since inserts are batched and each
// batch either fully succeeds or fully fails), skips exactly that many
// already-inserted rows from part4's filtered readings array, and processes
// part5 normally.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node resume-consumption-part4-5.mjs

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

const KNOWN_PART_1_3_TOTAL = 493186 + 500000 + 387234; // 1,380,420, from import4.log

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

function buildReadings(rows, projectByName, meterByProjectUid, counters) {
  const readings = [];
  for (const row of rows) {
    const projectName = row['Project'];
    const projectId = projectByName.get(projectName);
    if (!projectId) {
      counters.skippedDeletedProject++;
      counters.unresolvedProjectNames.add(projectName);
      continue;
    }
    const meterId = meterByProjectUid.get(`${projectId}::${row['Meter UID']}`);
    if (!meterId) {
      counters.skippedNoMeterMatch++;
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
  return readings;
}

async function run() {
  console.log('Checking current consumption_reading row count...');
  const { count: currentCount, error: countErr } = await supabase
    .from('consumption_reading')
    .select('*', { count: 'exact', head: true });
  if (countErr) throw new Error(`Count check failed: ${countErr.message}`);
  console.log(`  current count: ${currentCount}`);

  const part4AlreadyInserted = currentCount - KNOWN_PART_1_3_TOTAL;
  if (part4AlreadyInserted < 0 || part4AlreadyInserted % 5000 !== 0) {
    throw new Error(
      `Unexpected row count. current=${currentCount}, expected part1-3 total=${KNOWN_PART_1_3_TOTAL}, ` +
      `diff=${part4AlreadyInserted} (expected a non-negative multiple of 5000). Aborting — investigate before resuming.`
    );
  }
  console.log(`  part4 rows already inserted (inferred): ${part4AlreadyInserted}`);

  console.log('Loading project + meter lookups...');
  const { data: projects } = await supabase.from('project').select('id, name');
  const projectByName = new Map(projects.map((p) => [p.name, p.id]));

  const meterByProjectUid = new Map();
  let from = 0;
  const PAGE = 10000;
  let hasMore = true;
  while (hasMore) {
    const { data: batch } = await supabase.from('meter').select('id, project_id, uid').range(from, from + PAGE - 1);
    for (const m of batch || []) meterByProjectUid.set(`${m.project_id}::${m.uid}`, m.id);
    hasMore = (batch?.length || 0) === PAGE;
    from += PAGE;
  }
  console.log(`  ${projectByName.size} projects, ${meterByProjectUid.size} meters loaded.`);

  const counters = { skippedDeletedProject: 0, skippedNoMeterMatch: 0, unresolvedProjectNames: new Set() };
  let totalInserted = 0;
  let totalRows = 0;

  console.log('=== ConsumptionReading_export_part4.csv (resuming) ===');
  const part4Rows = loadCsv('ConsumptionReading_export_part4.csv');
  totalRows += part4Rows.length;
  const part4Readings = buildReadings(part4Rows, projectByName, meterByProjectUid, counters);
  console.log(`  parsed ${part4Rows.length}, filtered to ${part4Readings.length} valid readings, skipping first ${part4AlreadyInserted} (already inserted)`);
  if (part4Readings.length < part4AlreadyInserted) {
    throw new Error(
      `part4's filtered readings (${part4Readings.length}) is smaller than the inferred already-inserted count ` +
      `(${part4AlreadyInserted}) — the resume math doesn't add up. Aborting without inserting anything.`
    );
  }
  const part4Remaining = part4Readings.slice(part4AlreadyInserted);
  await insertBatch(part4Remaining);
  totalInserted += part4Remaining.length;
  console.log(`  inserted remaining ${part4Remaining.length} rows`);

  console.log('=== ConsumptionReading_export_part5.csv ===');
  const part5Rows = loadCsv('ConsumptionReading_export_part5.csv');
  totalRows += part5Rows.length;
  const part5Readings = buildReadings(part5Rows, projectByName, meterByProjectUid, counters);
  await insertBatch(part5Readings);
  totalInserted += part5Readings.length;
  console.log(`  parsed ${part5Rows.length}, inserted ${part5Readings.length}`);

  console.log('\n=== Done ===');
  console.log(`Rows parsed (parts 4-5): ${totalRows}`);
  console.log(`Newly inserted this run: ${totalInserted}`);
  console.log(`Skipped (deleted/unresolved project): ${counters.skippedDeletedProject}`);
  console.log(`Skipped (no matching meter uid): ${counters.skippedNoMeterMatch}`);
  console.log('Unresolved project references:', [...counters.unresolvedProjectNames]);

  const { count: finalCount } = await supabase
    .from('consumption_reading')
    .select('*', { count: 'exact', head: true });
  console.log(`Final consumption_reading count: ${finalCount}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
