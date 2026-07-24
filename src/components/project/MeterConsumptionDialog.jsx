import React, { useState, useEffect, useMemo } from "react";
import { invokeFunction } from "@/api/functionsClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, TrendingUp, Wand2, AlertCircle } from "lucide-react";
import { subDays, format, parseISO } from "date-fns";
import {
  BarChart, Bar, AreaChart, Area, ComposedChart, Line, ReferenceArea, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useWeatherPeaks } from "@/lib/weatherData";
import { WeatherTooltip, renderWeatherDot } from "./WeatherPeakDot";
import { hasContinuousDailyData } from "@/lib/consumptionAnalysis";
import CompletionDetails from "./CompletionDetails";

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

export default function MeterConsumptionDialog({ open, onOpenChange, meter, project, onViewReadings }) {
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState("30d");
  const [viewMode, setViewMode] = useState("ami");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [completionEnabled, setCompletionEnabled] = useState(false);
  const [completionData, setCompletionData] = useState(null);
  const [completionLoading, setCompletionLoading] = useState(false);
  const [completionError, setCompletionError] = useState(null);

  useEffect(() => {
    if (!open || !meter) return;
    setLoading(true);
    setReadings([]);
    setCompletionEnabled(false);
    setCompletionData(null);
    setCompletionError(null);
    invokeFunction("getMeterConsumption", { meter_id: meter.id })
      .then((res) => setReadings(res.data?.readings || []))
      .catch(() => setReadings([]))
      .finally(() => setLoading(false));
  }, [open, meter]);

  const dated = useMemo(() => {
    return readings
      .map((r) => ({ ...r, _date: getReadingDate(r) }))
      .filter((r) => r._date);
  }, [readings]);

  const hasDates = dated.length > 0;

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
    const inRange = dated
      .filter((r) => {
        if (from && r._date < from) return false;
        if (to && r._date > to) return false;
        return true;
      })
      .sort((a, b) => a._date - b._date);

    if (from && to && inRange.length > 0) {
      const byDay = {};
      inRange.forEach((r) => {
        const key = format(r._date, "yyyy-MM-dd");
        if (!byDay[key]) byDay[key] = r;
      });
      const filled = [];
      const cursor = new Date(from);
      cursor.setHours(0, 0, 0, 0);
      const endLimit = new Date(to);
      endLimit.setHours(23, 59, 59, 999);
      while (cursor <= endLimit) {
        const key = format(cursor, "yyyy-MM-dd");
        if (byDay[key]) {
          filled.push(byDay[key]);
        } else {
          filled.push({
            _date: new Date(cursor),
            consumption: 0,
            isMissing: true,
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return filled;
    }

    return inRange;
  }, [readings, dated, hasDates, range, customFrom, customTo, maxDate]);

  const { peaks, weatherData, loadingWeather } = useWeatherPeaks(viewMode === "amr" ? [] : filtered, project?.city, project?.country);

  // ─── Completion eligibility detection ──────────────────────────
  // Condition 1: Blank/missing data readings (days with no data)
  // Condition 2: Zero values followed by very high consumption (accumulated reading)
  const { isEligible, eligibleDates, highlightRanges } = useMemo(() => {
    const labels = filtered.map(r => r._date ? format(r._date, "MMM dd, yyyy") : getReadingLabel(r));
    const nonZeroVals = filtered.filter(r => !r.isMissing && r.consumption > 0).map(r => r.consumption);
    const sorted = [...nonZeroVals].sort((a, b) => a - b);
    const median = sorted.length >= 3 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const threshold = median * 3;
    const pairs = [];
    for (let i = 0; i < filtered.length - 1; i++) {
      const curr = filtered[i];
      const next = filtered[i + 1];
      if (curr._date && next._date && curr.consumption === 0 && !curr.isMissing && threshold > 0 && next.consumption >= threshold) {
        pairs.push({ zeroIndex: i, highIndex: i + 1 });
      }
    }
    const dateSet = new Set();
    filtered.forEach(r => { if (r.isMissing && r._date) dateSet.add(format(r._date, "yyyy-MM-dd")); });
    pairs.forEach((_, idx) => {
      const zeroIdx = pairs[idx].zeroIndex;
      const highIdx = pairs[idx].highIndex;
      if (filtered[zeroIdx]?._date) dateSet.add(format(filtered[zeroIdx]._date, "yyyy-MM-dd"));
      if (filtered[highIdx]?._date) dateSet.add(format(filtered[highIdx]._date, "yyyy-MM-dd"));
    });
    const ranges = [];
    filtered.forEach((r, i) => {
      if (r.isMissing && r._date) {
        const label = labels[i];
        const nextLabel = i < labels.length - 1 ? labels[i + 1] : label;
        ranges.push({ x1: label, x2: nextLabel, color: "#f59e0b", type: "zero" });
      }
    });
    pairs.forEach(p => {
      const zeroLabel = labels[p.zeroIndex];
      const zeroNext = p.zeroIndex < labels.length - 1 ? labels[p.zeroIndex + 1] : zeroLabel;
      ranges.push({ x1: zeroLabel, x2: zeroNext, color: "#f59e0b", type: "zero" });
      const highLabel = labels[p.highIndex];
      const highNext = p.highIndex < labels.length - 1 ? labels[p.highIndex + 1] : highLabel;
      ranges.push({ x1: highLabel, x2: highNext, color: "#a855f7", type: "non-zero" });
    });
    const hasBlank = filtered.some(r => r.isMissing);
    return { isEligible: hasBlank || pairs.length > 0, eligibleDates: Array.from(dateSet), highlightRanges: ranges };
  }, [filtered]);

  const eligibleDatesKey = eligibleDates.join(",");

  useEffect(() => {
    if (!completionEnabled || eligibleDates.length === 0 || !meter || meter.is_main) {
      setCompletionData(null);
      setCompletionError(null);
      return;
    }
    setCompletionLoading(true);
    setCompletionError(null);
    setCompletionData(null);
    invokeFunction("calculateConsumptionCompletion", {
      meter_id: meter.id,
      project_id: project?.id || meter.project_id,
      missing_dates: eligibleDates,
      radius_yards: project?.completion_radius_yards ?? 500,
    })
      .then((res) => {
        const data = res.data || res;
        if (data?.error) throw new Error(data.error);
        setCompletionData(data);
      })
      .catch((err) => {
        setCompletionData(null);
        const msg = err?.message || err?.error || (typeof err === "string" ? err : "Unknown error");
        setCompletionError(msg);
      })
      .finally(() => setCompletionLoading(false));
  }, [completionEnabled, eligibleDatesKey, meter, project]);

  const completionLookup = useMemo(() => {
    const lookup = {};
    if (!completionData?.results) return lookup;
    for (const r of completionData.results) { if (r.final != null) lookup[r.date] = r.final; }
    return lookup;
  }, [completionData]);

  const spreadAdjustments = useMemo(() => completionData?.spread_adjustments || {}, [completionData]);

  // ─── Chart data ─────────────────────────────────────────────────
  const chartData = useMemo(() => {
    return filtered.map((r, i) => {
      const dateStr = r._date ? format(r._date, "yyyy-MM-dd") : null;
      const spreadVal = dateStr ? spreadAdjustments[dateStr] : null;
      const completionVal = dateStr ? completionLookup[dateStr] : null;
      let completed = null;
      if (completionEnabled) {
        if (spreadVal != null) completed = spreadVal;
        else if (completionVal != null && (r.isMissing || r.consumption === 0)) completed = completionVal;
        else completed = r.consumption;
      }
      return {
        label: r._date ? format(r._date, "MMM dd, yyyy") : getReadingLabel(r),
        consumption: r.consumption,
        completed,
        dateStr,
        peakType: peaks.highs.has(i) ? "high" : peaks.lows.has(i) ? "low" : null,
        weather: dateStr ? weatherData[dateStr] : null,
      };
    });
  }, [filtered, peaks, weatherData, completionEnabled, completionLookup, spreadAdjustments]);

  const monthlyChartData = useMemo(() => {
    if (!hasDates) return [];
    const monthMap = {};
    dated.forEach((r) => {
      const key = format(r._date, "yyyy-MM");
      if (!monthMap[key]) {
        monthMap[key] = { label: format(r._date, "MMM yyyy"), consumption: 0, count: 0 };
      }
      monthMap[key].consumption += r.consumption || 0;
      monthMap[key].count += 1;
    });
    return Object.keys(monthMap).sort().map((k) => monthMap[k]);
  }, [dated, hasDates]);

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

  if (!meter) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Consumption — {meter.uid}
            {onViewReadings && (
              <Button variant="outline" size="sm" className="h-7 ml-1 text-xs" onClick={onViewReadings} title="View consumption readings">
                Data
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <p className="text-sm text-slate-500">Loading consumption data...</p>
          </div>
        ) : readings.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
            <TrendingUp className="w-10 h-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No consumption readings found</p>
            <p className="text-xs">Upload consumption data to see charts for this meter.</p>
          </div>
        ) : (
          <div className="space-y-4">
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
                {viewMode === "ami" && isEligible && (
                  <Button
                    size="icon"
                    variant={completionEnabled ? "default" : "outline"}
                    onClick={() => setCompletionEnabled(!completionEnabled)}
                    disabled={meter.is_main || completionLoading}
                    className="h-8 w-8 ml-auto"
                    title="Data Completion"
                  >
                    {completionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  </Button>
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
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {viewMode === "amr" && hasDates ? (
                    <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={20} angle={-30} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="consumption" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : hasDates ? (
                    <ComposedChart data={chartData} margin={{ top: 30, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="consumptionGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="completionGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={30} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<WeatherTooltip />} />
                      {highlightRanges.map((range, i) => (
                        <ReferenceArea key={i} x1={range.x1} x2={range.x2} fill={range.color} fillOpacity={0.12} stroke={range.color} strokeOpacity={0.3} strokeDasharray="3 3" />
                      ))}
                      <Area type="monotone" dataKey="consumption" stroke="#3b82f6" strokeWidth={2} fill="url(#consumptionGradient)" dot={renderWeatherDot} activeDot={{ r: 6 }} />
                      {completionEnabled && completionData && (
                        <Line type="monotone" dataKey="completed" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={true} />
                      )}
                    </ComposedChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={20} angle={-30} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="consumption" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-slate-400">
                No readings in the selected range.
              </div>
            )}

            {completionEnabled && completionLoading && (
              <div className="border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/10">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Calculating completion values…
                </p>
              </div>
            )}

            {completionEnabled && completionError && !completionLoading && (
              <div className="border border-red-200 dark:border-red-800/50 rounded-lg p-3 bg-red-50/50 dark:bg-red-950/10">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Completion calculation failed
                </p>
                <p className="text-[10px] text-red-600 dark:text-red-400 mt-1 font-mono break-all">{completionError}</p>
              </div>
            )}

            {viewMode === "ami" && isEligible && highlightRanges.length > 0 && (
              <div className="flex items-center gap-3 text-xs flex-wrap">
                {highlightRanges.some(r => r.type === "zero") && (
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500" /> Zero values
                  </span>
                )}
                {highlightRanges.some(r => r.type === "non-zero") && (
                  <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                    <span className="w-3 h-3 rounded bg-purple-500/30 border border-purple-500" /> Non-zero values (high spikes)
                  </span>
                )}
              </div>
            )}

            {completionEnabled && completionData && !completionLoading && (
              <CompletionDetails data={completionData} />
            )}

            {viewMode === "ami" && loadingWeather && (
              <p className="text-xs text-blue-500 text-center flex items-center justify-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Fetching weather data for peak consumption days…
              </p>
            )}
            <p className="text-xs text-slate-400 text-center">{viewMode === "amr" ? monthlyChartData.length : filtered.length} of {readings.length} {viewMode === "amr" ? "months" : "readings"} shown</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}