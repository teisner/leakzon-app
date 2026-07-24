import React, { useState, useEffect, useMemo } from "react";
import { invokeFunction } from "@/api/functionsClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarDays, TrendingUp } from "lucide-react";
import { subDays, format, parseISO } from "date-fns";

function getReadingDate(r) {
  if (r.reading_date) {
    let d = new Date(r.reading_date);
    if (!isNaN(d.getTime())) return d;
    try { d = parseISO(r.reading_date); if (!isNaN(d.getTime())) return d; } catch {}
  }
  if (r.period_label) {
    const pl = r.period_label.trim();
    let m = pl.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
      if (!isNaN(d.getTime())) return d;
    }
    m = pl.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      if (!isNaN(d.getTime())) return d;
    }
    m = pl.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const d = new Date(parseInt(m[2]), parseInt(m[1]) - 1, 1);
      if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(pl);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function getReadingLabel(r) {
  if (r.period_label) return r.period_label;
  if (r.reading_date) {
    try { return format(parseISO(r.reading_date), "dd/MM/yyyy"); } catch { return r.reading_date; }
  }
  return "—";
}

export default function MeterConsumptionTableDialog({ open, onOpenChange, meter, project }) {
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (!open || !meter) return;
    setLoading(true);
    setReadings([]);
    invokeFunction("getMeterConsumption", { meter_id: meter.id })
      .then((res) => setReadings(res.data?.readings || []))
      .catch(() => setReadings([]))
      .finally(() => setLoading(false));
  }, [open, meter]);

  const dated = useMemo(() => {
    return readings.map((r) => ({ ...r, _date: getReadingDate(r) }));
  }, [readings]);

  const hasDates = dated.some((r) => r._date);

  const maxDate = useMemo(() => {
    const dates = dated.map((r) => r._date).filter(Boolean);
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }, [dated]);

  useEffect(() => {
    if (maxDate && !customTo) {
      setCustomTo(format(maxDate, "yyyy-MM-dd"));
      setCustomFrom(format(subDays(maxDate, 30), "yyyy-MM-dd"));
    }
  }, [maxDate]);

  const filtered = useMemo(() => {
    if (!hasDates) return readings.map((r) => ({ ...r, _date: null, _label: getReadingLabel(r) }));
    let from = null, to = null;
    if (range === "7d") { to = maxDate; from = subDays(to, 7); }
    else if (range === "30d") { to = maxDate; from = subDays(to, 30); }
    else {
      if (customFrom) { from = new Date(customFrom); from.setHours(0, 0, 0, 0); }
      if (customTo) { to = new Date(customTo); to.setHours(23, 59, 59, 999); }
    }

    // Build a per-date map of actual readings (normalized to midnight)
    const byDay = {};
    for (const r of dated) {
      if (!r._date) continue;
      if (from && r._date < from) continue;
      if (to && r._date > to) continue;
      const key = format(r._date, "yyyy-MM-dd");
      if (!byDay[key]) byDay[key] = r;
    }

    // If we have explicit from/to bounds, fill in every day in the range —
    // missing days show as 0 consumption
    if (from && to) {
      const result = [];
      const cursor = new Date(from);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= to) {
        const key = format(cursor, "yyyy-MM-dd");
        const r = byDay[key];
        if (r) {
          result.push({ ...r, _label: format(cursor, "dd/MM/yyyy") });
        } else {
          result.push({
            _date: new Date(cursor),
            _label: format(cursor, "dd/MM/yyyy"),
            consumption: 0,
            source_file_name: "—",
            isMissing: true,
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return result;
    }

    // No custom range bounds — just list existing readings in range
    return Object.values(byDay)
      .sort((a, b) => a._date - b._date)
      .map((r) => ({ ...r, _label: format(r._date, "dd/MM/yyyy") }));
  }, [readings, dated, hasDates, range, customFrom, customTo, maxDate]);

  const total = useMemo(() => filtered.reduce((sum, r) => sum + (r.consumption || 0), 0), [filtered]);
  const unit = project?.water_unit === "Gallons" ? "gal" : "m³";

  if (!meter) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            {meter.uid} — Consumption Readings
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading consumption data...</p>
          </div>
        ) : readings.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground/70">
            <TrendingUp className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No consumption readings found</p>
            <p className="text-xs">Upload consumption data to see readings for this meter.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {hasDates && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant={range === "7d" ? "default" : "outline"} onClick={() => setRange("7d")}>Last 7 days</Button>
                <Button size="sm" variant={range === "30d" ? "default" : "outline"} onClick={() => setRange("30d")}>Last 30 days</Button>
                <Button size="sm" variant={range === "custom" ? "default" : "outline"} onClick={() => setRange("custom")}>Custom range</Button>
                {range === "custom" && (
                  <div className="flex items-center gap-2 ml-2">
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Consumption ({unit})</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Source File</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No readings in the selected range.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r, i) => (
                      <tr key={i} className={r.isMissing ? "bg-amber-50/50 dark:bg-amber-950/10" : "hover:bg-muted/50"}>
                        <td className="px-4 py-2 text-foreground/90 font-mono text-xs">{r._label}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums">
                          {r.isMissing ? (
                            <span className="text-amber-600 inline-flex items-center gap-1.5">
                              <span className="opacity-50">—</span>
                              <span className="text-[10px] font-normal">no data</span>
                            </span>
                          ) : r.consumption === 0 ? (
                            <span className="text-slate-400 inline-flex items-center gap-1.5">
                              0.00
                              <span className="text-[10px] font-normal text-slate-400">zero</span>
                            </span>
                          ) : (
                            <span className="text-foreground">{r.consumption.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-[200px]">
                          {r.source_file_name || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot className="bg-muted border-t border-border">
                    <tr className="text-xs font-semibold">
                      <td className="px-4 py-2.5 text-muted-foreground">Total ({filtered.length} readings)</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-primary">
                        {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              {filtered.length} of {readings.length} readings shown
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}