import React, { useState } from "react";
import { AlertTriangle, Check, Loader2, Trash2 } from "lucide-react";
import { callFunction } from "@/lib/publicFunction";

// Somewhere for "I could not do this, and here is why".
//
// The Mobile Locator could previously only report success, so a technician who
// walked to an address and found no meter — or found it under a new driveway —
// had no way to say so. The meter stayed on the list looking untouched and the
// next person walked the same street.
//
// A few common reasons are one tap each, because typing at the roadside on a
// phone is the thing least likely to happen.
const QUICK_REASONS = [
  "Meter not found at this address",
  "No access — locked or gated",
  "Buried or paved over",
  "Address appears to be wrong",
  "Meter removed / no longer in service",
];

export default function FieldNoteForm({ meter, token, onSaved }) {
  const [text, setText] = useState(meter.field_note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const save = async (value) => {
    setSaving(true);
    setError("");
    try {
      const res = await callFunction("saveMeterFieldNote", {
        meter_id: meter.id,
        token,
        note: value,
      });
      if (res?.error) throw new Error(res.error);
      setDone(true);
      onSaved?.(meter.id, value);
      setTimeout(() => setDone(false), 2000);
    } catch (e) {
      setError(e?.message || "Could not save the note. Check your signal and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
        <AlertTriangle className="w-3.5 h-3.5" /> Report an issue with this meter
      </p>
      <p className="text-[11px] text-amber-700 mt-0.5">
        The office sees this against the meter. It stays on the list either way.
      </p>

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {QUICK_REASONS.map((reason) => (
          <button
            key={reason}
            onClick={() => setText(reason)}
            className={`px-2 py-1 rounded-md text-[11px] border active:scale-95 transition-transform ${
              text === reason
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-white text-amber-900 border-amber-200"
            }`}
          >
            {reason}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Add anything else that would help — a landmark, which side of the road, who to call…"
        className="w-full mt-2.5 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
      />

      {error && <p className="text-[11px] text-red-600 mt-1.5">{error}</p>}

      <div className="flex gap-2 mt-2">
        <button
          onClick={() => save(text)}
          disabled={saving || !text.trim()}
          className="flex-[2] flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium text-white bg-amber-600 active:bg-amber-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {saving ? "Sending…" : done ? "Sent" : meter.field_note ? "Update note" : "Send note"}
        </button>
        {meter.field_note && (
          <button
            onClick={() => { setText(""); save(""); }}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium text-amber-800 bg-white border border-amber-200 active:bg-amber-100 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
