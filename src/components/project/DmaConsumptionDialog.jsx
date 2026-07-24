import React, { useState, useEffect, useMemo } from "react";
import { invokeFunction } from "@/api/functionsClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, TrendingUp } from "lucide-react";
import { subDays, format, parseISO } from "date-fns";
import {
  BarChart, Bar, AreaChart, Area, Line, Legend, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { hasContinuousDailyData } from "@/lib/consumptionAnalysis";

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
    m = pl.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const d = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
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
    m = pl.match(/^(\d{4})-(\d{1,2})$/);
    if (m) {
      const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, 1);
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
    try {
      return format(parseISO(r.reading_date), "dd/MM/yyyy");
    } catch {
      return r.reading_date;
    }
  }
  return "—";
}

export default function DmaConsumptionDialog({ open, onOpenChange, dma, project }) {
  const [readings, setReadings] = useState([]);
  const [meterCount, setMeterCount] = useState(0);
  const [mainMeterReadings, setMainMeterReadings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState("30d");
  const [viewMode, setViewMode] = useState("ami"); // "ami" | "amr"
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (!open || !dma) return;
    setLoading(true);
    setReadings([]);
    let polygon;
    try {
      polygon = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
    } catch {
      polygon = null;
    }
    if (!polygon || polygon.length < 3) {
      setLoading(false);
      return;
    }
    invokeFunction("getDmaConsumption", { project_id: dma.project_id, polygon, main_meter_id: dma.main_meter_id })
      .then((res) => {
        setReadings(res.data?.readings || []);
        setMeterCount(res.data?.meter_count || 0);
        setMainMeterReadings(res.data?.main_meter_readings || []);
      })
      .catch(() => setReadings([]))
      .finally(() => setLoading(false));
  }, [open, dma]);

  const dated = useMemo(() => {
    return readings
      .map((r) => ({ ...r, _date: getReadingDate(r) }))
      .filter((r) => r._date);
  }, [readings]);

  const hasDates = dated.length > 0;

  // Auto-detect default view mode: AMI if ≥7 consecutive days of data, else AMR
  useEffect(() => {
    if (dated.length === 0) return;
    setViewMode(hasContinuousDailyData(dated.map((r) => r._date), 7) ? "ami" : "amr");
  }, [dated]);

  const maxDate = useMemo(() => {
    if (dated.length === 0) return null;
    return new Date(Math.max(...dated.map((r) => r._date.getTime())));
  }, [dated]);

  useEffect(() => {
    if (maxDate && !customTo) {
      setCustomTo(format(maxDate, "yyyy-MM-dd"));
      setCustomFrom(format(subDays(maxDate, 30), "yyyy-MM-dd"));
    }
  }, [maxDate]);

  const filtered = useMemo(() => {
    if (!hasDates) {
      return readings.map((r) => ({ ...r, _date: null }));
    }
    let from = null, to = null;
    if (range === "7d") {
      to = maxDate;
      from = subDays(to, 7);
    } else if (range === "30d") {
      to = maxDate;
      from = subDays(to, 30);
    } else {
      if (customFrom) { from = new Date(customFrom); from.setHours(0, 0, 0, 0); }
      if (customTo) { to = new Date(customTo); to.setHours(23, 59, 59, 999); }
    }
    return dated
      .filter((r) => {
        if (from && r._date < from) return false;
        if (to && r._date > to) return false;
        return true;
      })
      .sort((a, b) => a._date - b._date);
  }, [readings, dated, hasDates, range, customFrom, customTo, maxDate]);

  // Build a lookup map for main meter consumption by date key
  const mainMeterMap = useMemo(() => {
    const map = {};
    mainMeterReadings.forEach((r) => {
      const d = getReadingDate(r);
      const key = d ? format(d, "yyyy-MM-dd") : (r.period_label || r.reading_date || "");
      map[key] = r.consumption;
    });
    return map;
  }, [mainMeterReadings]);

  const hasMainMeter = mainMeterReadings.length > 0;

  // Date-filtered main meter readings (same range as sub-meters)
  const filteredMain = useMemo(() => {
    if (!hasMainMeter || !hasDates) {
      return mainMeterReadings.map((r) => ({ ...r, _date: null }));
    }
    let from = null, to = null;
    if (range === "7d") {
      to = maxDate;
      from = subDays(to, 7);
    } else if (range === "30d") {
      to = maxDate;
      from = subDays(to, 30);
    } else {
      if (customFrom) { from = new Date(customFrom); from.setHours(0, 0, 0, 0); }
      if (customTo) { to = new Date(customTo); to.setHours(23, 59, 59, 999); }
    }
    return mainMeterReadings
      .map((r) => ({ ...r, _date: getReadingDate(r) }))
      .filter((r) => {
        if (from && r._date && r._date < from) return false;
        if (to && r._date && r._date > to) return false;
        return true;
      })
      .sort((a, b) => (a._date?.getTime() || 0) - (b._date?.getTime() || 0));
  }, [mainMeterReadings, hasMainMeter, hasDates, range, customFrom, customTo, maxDate]);

  // Sub-meter lookup by date key for unified chart
  const subMeterMap = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const key = r._date ? format(r._date, "yyyy-MM-dd") : getReadingLabel(r);
      map[key] = r.consumption;
    });
    return map;
  }, [filtered]);

  // Build a unified date axis combining sub-meter and main meter dates
  const chartData = useMemo(() => {
    const allKeys = new Set();
    filtered.forEach((r) => {
      const key = r._date ? format(r._date, "yyyy-MM-dd") : getReadingLabel(r);
      allKeys.add(key);
    });
    filteredMain.forEach((r) => {
      const key = r._date ? format(r._date, "yyyy-MM-dd") : getReadingLabel(r);
      allKeys.add(key);
    });

    const sortedKeys = [...allKeys].sort((a, b) => {
      const da = parseISO(a);
      const db = parseISO(b);
      const ta = !isNaN(da.getTime()) ? da.getTime() : 0;
      const tb = !isNaN(db.getTime()) ? db.getTime() : 0;
      return ta - tb;
    });

    return sortedKeys.map((key) => {
      const d = parseISO(key);
      const isDate = !isNaN(d.getTime());
      return {
        label: isDate ? format(d, "MMM dd, yyyy") : key,
        dateStr: isDate ? key : null,
        consumption: subMeterMap[key] ?? null,
        mainConsumption: hasMainMeter ? (mainMeterMap[key] ?? null) : null,
      };
    });
  }, [filtered, filteredMain, subMeterMap, mainMeterMap, hasMainMeter]);

  const monthlyChartData = useMemo(() => {
    if (!hasDates) return [];
    const monthMap = {};
    dated.forEach((r) => {
      const key = format(r._date, "yyyy-MM");
      if (!monthMap[key]) {
        monthMap[key] = { label: format(r._date, "MMM yyyy"), consumption: 0, mainConsumption: null };
      }
      monthMap[key].consumption += r.consumption || 0;
    });
    if (hasMainMeter) {
      mainMeterReadings.forEach((r) => {
        const d = getReadingDate(r);
        if (!d) return;
        const key = format(d, "yyyy-MM");
        if (!monthMap[key]) {
          monthMap[key] = { label: format(d, "MMM yyyy"), consumption: 0, mainConsumption: 0 };
        }
        if (monthMap[key].mainConsumption == null) monthMap[key].mainConsumption = 0;
        monthMap[key].mainConsumption += r.consumption || 0;
      });
    }
    return Object.keys(monthMap).sort().map((k) => monthMap[k]);
  }, [dated, mainMeterReadings, hasDates, hasMainMeter]);

  const stats = useMemo(() => {
    if (filtered.length === 0) return null;
    const vals = filtered.map((r) => r.consumption);
    return {
      total: vals.reduce((a, b) => a + b, 0),
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
      count: vals.length,
    };
  }, [filtered]);

  if (!dma) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            DMA Consumption — {dma.name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <p className="text-sm text-slate-500">Aggregating consumption data...</p>
          </div>
        ) : readings.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
            <TrendingUp className="w-10 h-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No consumption readings found</p>
            <p className="text-xs">{meterCount} sub-meters in this DMA — upload consumption data to see charts.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Aggregated from <span className="font-medium">{meterCount}</span> sub-meters within this DMA{hasMainMeter ? " + main meter overlay" : ""}
            </p>

            {hasDates && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center rounded-md border border-border overflow-hidden">
                  <Button size="sm" variant={viewMode === "ami" ? "default" : "ghost"} onClick={() => setViewMode("ami")} className="rounded-none">AMI</Button>
                  <Button size="sm" variant={viewMode === "amr" ? "default" : "ghost"} onClick={() => setViewMode("amr")} className="rounded-none">AMR</Button>
                </div>
                {viewMode === "ami" && (<>
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
                    <span className="text-xs text-slate-400">to</span>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    />
                  </div>
                )}
                </>)}
              </div>
            )}

            {stats && (
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-slate-900">{stats.total.toFixed(1)}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Total</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-slate-900">{stats.avg.toFixed(1)}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Average</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-emerald-600">{stats.min.toFixed(1)}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Min</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-amber-600">{stats.max.toFixed(1)}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Max</p>
                </div>
              </div>
            )}

            {(viewMode === "amr" ? monthlyChartData : chartData).length > 0 ? (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {viewMode === "amr" && hasDates ? (
                    <BarChart data={monthlyChartData} margin={{ top: 10, right: hasMainMeter ? 50 : 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={20} angle={-30} textAnchor="end" height={60} />
                      <YAxis yAxisId="subs" tick={{ fontSize: 10, fill: "#3b82f6" }} />
                      {hasMainMeter && <YAxis yAxisId="mains" orientation="right" tick={{ fontSize: 10, fill: "#f59e0b" }} />}
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar yAxisId="subs" dataKey="consumption" name="Sub-Meters" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      {hasMainMeter && (
                        <Bar yAxisId="mains" dataKey="mainConsumption" name="Main Meter" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      )}
                    </BarChart>
                  ) : hasDates ? (
                    <AreaChart data={chartData} margin={{ top: 10, right: hasMainMeter ? 50 : 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dmaConsumptionGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="dmaMainGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={30} />
                      <YAxis yAxisId="subs" tick={{ fontSize: 10, fill: "#3b82f6" }} />
                      {hasMainMeter && <YAxis yAxisId="mains" orientation="right" tick={{ fontSize: 10, fill: "#f59e0b" }} />}
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Area yAxisId="subs" type="monotone" dataKey="consumption" name="Sub-Meters" stroke="#3b82f6" strokeWidth={2} fill="url(#dmaConsumptionGradient)" activeDot={{ r: 5 }} connectNulls />
                      {hasMainMeter && (
                        <Area yAxisId="mains" type="monotone" dataKey="mainConsumption" name="Main Meter" stroke="#f59e0b" strokeWidth={2} fill="url(#dmaMainGradient)" activeDot={{ r: 5 }} connectNulls />
                      )}
                    </AreaChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 10, right: hasMainMeter ? 50 : 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={20} angle={-30} textAnchor="end" height={60} />
                      <YAxis yAxisId="subs" tick={{ fontSize: 10, fill: "#3b82f6" }} />
                      {hasMainMeter && <YAxis yAxisId="mains" orientation="right" tick={{ fontSize: 10, fill: "#f59e0b" }} />}
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar yAxisId="subs" dataKey="consumption" name="Sub-Meters" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      {hasMainMeter && (
                        <Bar yAxisId="mains" dataKey="mainConsumption" name="Main Meter" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      )}
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