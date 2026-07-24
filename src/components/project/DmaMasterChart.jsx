import React, { useState, useEffect, useMemo } from "react";
import { invokeFunction } from "@/api/functionsClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, BarChart3, TrendingUp } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import {
  BarChart, Bar, LineChart, Line, Legend, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

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

const parsePolygon = (dma) => {
  try {
    const poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
    return Array.isArray(poly) && poly.length >= 3 ? poly : null;
  } catch { return null; }
};

export default function DmaMasterChart({ open, onOpenChange, dmas, project }) {
  const [dmaReadings, setDmaReadings] = useState({});
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (!open || !dmas || dmas.length === 0) return;
    setLoading(true);
    setDmaReadings({});

    const promises = dmas.map(async (dma) => {
      const polygon = parsePolygon(dma);
      if (!polygon) return { dmaId: dma.id, readings: [] };
      try {
        const res = await invokeFunction("getDmaConsumption", {
          project_id: dma.project_id,
          polygon,
          main_meter_id: dma.main_meter_id,
        });
        return { dmaId: dma.id, readings: res.data?.readings || [] };
      } catch {
        return { dmaId: dma.id, readings: [] };
      }
    });

    Promise.all(promises)
      .then((results) => {
        const map = {};
        results.forEach((r) => { map[r.dmaId] = r.readings; });
        setDmaReadings(map);
      })
      .finally(() => setLoading(false));
  }, [open, dmas]);

  // Collect all dates across all DMAs
  const allDates = useMemo(() => {
    const dateSet = new Map(); // key -> Date
    Object.values(dmaReadings).forEach((readings) => {
      readings.forEach((r) => {
        const d = getReadingDate(r);
        if (d) {
          const key = format(d, "yyyy-MM-dd");
          if (!dateSet.has(key)) dateSet.set(key, d);
        }
      });
    });
    return [...dateSet.entries()].sort((a, b) => a[1] - b[1]);
  }, [dmaReadings]);

  const hasDates = allDates.length > 0;

  // Date range filtering
  const maxDate = useMemo(() => {
    if (allDates.length === 0) return null;
    return allDates[allDates.length - 1][1];
  }, [allDates]);

  useEffect(() => {
    if (maxDate && !customTo) {
      setCustomTo(format(maxDate, "yyyy-MM-dd"));
      setCustomFrom(format(subDays(maxDate, 30), "yyyy-MM-dd"));
    }
  }, [maxDate]);

  const filteredDates = useMemo(() => {
    if (!hasDates) return allDates;
    let from = null, to = null;
    if (range === "7d") {
      to = maxDate;
      from = subDays(to, 7);
    } else if (range === "30d") {
      to = maxDate;
      from = subDays(to, 30);
    } else if (range === "all") {
      return allDates;
    } else {
      if (customFrom) { from = new Date(customFrom); from.setHours(0, 0, 0, 0); }
      if (customTo) { to = new Date(customTo); to.setHours(23, 59, 59, 999); }
    }
    return allDates.filter(([, d]) => {
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [allDates, hasDates, range, customFrom, customTo, maxDate]);

  // Build chart data: one row per date, one column per DMA
  const chartData = useMemo(() => {
    if (hasDates) {
      return filteredDates.map(([key, d]) => {
        const row = { label: format(d, "MMM dd, yyyy"), dateStr: key };
        (dmas || []).forEach((dma) => {
          const readings = dmaReadings[dma.id] || [];
          const match = readings.find((r) => {
            const rd = getReadingDate(r);
            return rd && format(rd, "yyyy-MM-dd") === key;
          });
          row[dma.name] = match ? match.consumption : null;
        });
        return row;
      });
    }
    // No dates — use period labels
    const allLabels = new Set();
    Object.values(dmaReadings).forEach((readings) => {
      readings.forEach((r) => allLabels.add(getReadingLabel(r)));
    });
    return [...allLabels].map((label) => {
      const row = { label };
      (dmas || []).forEach((dma) => {
        const readings = dmaReadings[dma.id] || [];
        const match = readings.find((r) => getReadingLabel(r) === label);
        row[dma.name] = match ? match.consumption : null;
      });
      return row;
    });
  }, [filteredDates, dmaReadings, dmas, hasDates]);

  const hasData = Object.values(dmaReadings).some((r) => r.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            DMA Comparison — Master Chart
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <p className="text-sm text-slate-500">Aggregating consumption data for all DMAs...</p>
          </div>
        ) : !hasData ? (
          <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
            <TrendingUp className="w-10 h-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No consumption readings found</p>
            <p className="text-xs">Upload consumption data to see comparison charts.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Comparing <span className="font-medium">{(dmas || []).length}</span> DMAs
            </p>

            {hasDates && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setRange("7d")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border ${range === "7d" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                >Last 7 days</button>
                <button
                  onClick={() => setRange("30d")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border ${range === "30d" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                >Last 30 days</button>
                <button
                  onClick={() => setRange("all")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border ${range === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                >All data</button>
                <button
                  onClick={() => setRange("custom")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border ${range === "custom" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                >Custom</button>
                {range === "custom" && (
                  <div className="flex items-center gap-2 ml-2">
                    <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
                    <span className="text-xs text-slate-400">to</span>
                    <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
                  </div>
                )}
              </div>
            )}

            {chartData.length > 0 ? (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {hasDates ? (
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={30} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      {(dmas || []).map((dma) => (
                        <Line
                          key={dma.id}
                          type="monotone"
                          dataKey={dma.name}
                          stroke={dma.color || "#3b82f6"}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={20} angle={-30} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      {(dmas || []).map((dma) => (
                        <Bar
                          key={dma.id}
                          dataKey={dma.name}
                          fill={dma.color || "#3b82f6"}
                          radius={[4, 4, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-slate-400">
                No readings in the selected range.
              </div>
            )}
            <p className="text-xs text-slate-400 text-center">{chartData.length} periods shown</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}