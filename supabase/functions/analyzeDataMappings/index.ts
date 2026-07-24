// Replaces the base44.integrations.Core.InvokeLLM call in
// src/lib/fileOptimizer.js's analyzeAllFiles(). This is the one genuine
// LLM-reasoning use in the whole app (inferring ambiguous column-name
// mappings, including non-English headers) — every other former InvokeLLM
// call site read raw Excel files, which SheetJS parses deterministically
// client-side now instead (no LLM needed, more reliable, no per-call cost).
import { getCallerUser, json, CORS_HEADERS } from '../_shared/authz.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MODEL = 'claude-sonnet-5';

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fileIndex: { type: 'number' },
          uidColumn: { type: 'string' },
          hasMeterData: { type: 'boolean' },
          hasConsumptionData: { type: 'boolean' },
          addressColumn: { type: 'string' },
          dateColumn: { type: 'string' },
          consumptionColumns: { type: 'array', items: { type: 'string' } },
          readingFrequency: { type: 'string' },
          latitudeColumn: { type: 'string' },
          longitudeColumn: { type: 'string' },
        },
        required: [
          'fileIndex', 'uidColumn', 'hasMeterData', 'hasConsumptionData',
          'addressColumn', 'dateColumn', 'consumptionColumns',
          'readingFrequency', 'latitudeColumn', 'longitudeColumn',
        ],
      },
    },
    detectedCountry: { type: 'string' },
  },
  required: ['files', 'detectedCountry'],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const user = await getCallerUser(req);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'ANTHROPIC_API_KEY is not configured' }, 500);
    }

    const { files } = await req.json();
    if (!Array.isArray(files)) return json({ error: 'files array is required' }, 400);

    const prompt = `You are analyzing water utility data files for a meter optimization platform. For each file, identify the column mappings.

For each file determine:
1. uidColumn: The column containing the unique meter identifier (meter number, serial, ID, account number)
2. hasMeterData: true ONLY if the file contains meter inventory data — one row per meter with metadata like address, customer name, provider, diameter, GPS coordinates, active status, or main/sub marker. Do NOT mark a file as hasMeterData if it only has consumption readings (multiple rows per meter with dates and values) unless each meter also has a single metadata row.
3. hasConsumptionData: true if the file contains consumption readings (date columns with numeric values, or a date column + consumption values)
4. addressColumn: If hasMeterData, which column is the street address. If multiple address-like columns exist, pick the most complete street address. Empty string if none.
5. dateColumn: If hasConsumptionData and dates are in a column (long format), which column. Empty string if dates are in column headers (wide format).
6. consumptionColumns: If hasConsumptionData, which columns contain the numeric consumption values. Empty array if none.
7. readingFrequency: "daily" if readings are ~1 day apart (AMI network), "monthly" if ~30 days apart (AMR network), "unknown" otherwise
8. detectedCountry: The country this data appears to be from. Look at city names, state codes, postal codes, address formats, language of column headers. Return "United States" for US data, "Israel" for Israeli data, or the country name for others. Return empty string ONLY if truly impossible to determine.
9. latitudeColumn: If hasMeterData, the column containing latitude values (lat, latitude, y-coord, northing). Empty string if none.
10. longitudeColumn: If hasMeterData, the column containing longitude values (lng, lon, long, longitude, x-coord, easting). Empty string if none.

Files to analyze:
${JSON.stringify(files, null, 2)}`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ name: 'return_analysis', description: 'Return the column-mapping analysis.', input_schema: RESULT_SCHEMA }],
        tool_choice: { type: 'tool', name: 'return_analysis' },
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return json({ error: `Anthropic API error (${anthropicRes.status}): ${errText}` }, 502);
    }

    const anthropicData = await anthropicRes.json();
    const toolUse = anthropicData.content?.find((b: { type: string }) => b.type === 'tool_use');
    if (!toolUse) return json({ error: 'No structured result returned by model' }, 502);

    return json(toolUse.input);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
