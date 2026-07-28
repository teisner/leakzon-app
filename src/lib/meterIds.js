// Meter ID and Account ID aren't columns on `meter` — they arrive as free-form
// label/value pairs in additional_ids, whatever the source file called them.
// The meter table and the XLS export both need to pull them out, and must agree
// on how, so the matching lives here rather than being duplicated.
export function findAdditionalId(meter, patterns) {
  const ids = meter?.additional_ids || [];
  const found = ids.find((id) => patterns.some((p) => new RegExp(p, "i").test(id.label || "")));
  return found ? found.value : "";
}

export const METER_ID_PATTERNS = ["^meter.?id$", "^meter$", "meter"];
export const ACCOUNT_ID_PATTERNS = ["account.?id", "^account$", "account"];

export const meterIdOf = (m) => findAdditionalId(m, METER_ID_PATTERNS);
export const accountIdOf = (m) => findAdditionalId(m, ACCOUNT_ID_PATTERNS);
