import React, { useState, useEffect, useMemo } from "react";
import { invokeFunction } from "@/api/functionsClient";
import {
  detectSeriesGranularity, buildSeries, coverageSummary, defaultGranularity,
} from "@/lib/consumptionSeries";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, TrendingUp } from "lucide-react";
import { subDays, format, parseISO } from "date-fns";
import { BarChart, Bar, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useWeatherPeaks } from "@/lib/weatherData";
import { WeatherTooltip, renderWeatherDot } from "./WeatherPeakDot";
import { hasContinuousDailyData } from "@/lib/consumptionAnalysis";

function getReadingDate(r) {
  // reading_at carries the time of day; reading_date is the same moment
  // truncated, kept for everything written before hourly data existed.
  if (r.reading_at) {
    const t = new Date(r.reading_at);
    if (!isNaN(t.getTime())) return t;
  }
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
  // How the readings are bucketed, and whether the empty stretches are drawn.
  const [granularity, setGranularity] = useState(null);
  const [onlyWithData, setOnlyWithData] = useState(false);
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
    return readings
      .map((r) => ({ ...r, _date: getReadingDate(r) }))
      .filter((r) => r._date);
  }, [readings]);

  const hasDates = dated.length > 0;

  // What the data actually is, and where it lives.
  const detected = useMemo(() => detectSeriesGranularity(readings), [readings]);
  const coverage = useMemo(() => coverageSummary(readings), [readings]);

  useEffect(() => {
    if (dated.length === 0) return;
    // AMR is the monthly roll-up, for meters read every so often. A meter that
    // reports hourly is never that, and neither is a project set to AMI — the
    // gap test alone would drop an AMI meter into the monthly view just because
    // a few days are missing.
    const isAmi = String(project?.project_type || "").toUpperCase() === "AMI";
    const continuous = hasContinuousDailyData(dated.map((r) => r._date), 7);
    setViewMode(detected.hourly || isAmi || continuous ? "ami" : "amr");
    // The project says how it is read; the data says whether that is possible.
    setGranularity(defaultGranularity(project?.project_type, detected));
  }, [dated, detected, project?.project_type]);

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

  // The window being charted. Hourly keeps the clock time; daily and monthly
  // roll up into whole days and months.
  const { from, to } = useMemo(() => {
    if (!hasDates) return { from: null, to: null };
    if (range === "7d") return { from: subDays(maxDate, 7), to: maxDate };
    if (range === "30d") return { from: subDays(maxDate, 30), to: maxDate };
    const f = customFrom ? new Date(customFrom) : null;
    const t = customTo ? new Date(customTo) : null;
    if (f) f.setHours(0, 0, 0, 0);
    if (t) t.setHours(23, 59, 59, 999);
    return { from: f, to: t };
  }, [hasDates, range, customFrom, customTo, maxDate]);

  // Points to plot. Readings are summed within each bucket — with hourly data a
  // day is the sum of its 24 readings, where this used to take the first one and
  // report a whole day as a single hour of it.
  const series = useMemo(() => {
    if (!hasDates) return [];
    return buildSeries(readings, {
      granularity: granularity || "daily",
      from,
      to,
      // "Only periods with data" simply stops emitting the empty ones.
      fillGaps: !onlyWithData,
    });
  }, [readings, hasDates, granularity, from, to, onlyWithData]);

  // The weather overlay and the stats below still work off a flat list.
  const filtered = useMemo(
    () => series.map((p) => ({ ...p, _date: p.at })),
    [series]
  );

  const { peaks, weatherData, loadingWeather } = useWeatherPeaks(viewMode === "amr" ? [] : filtered, project?.city, project?.country);

  // Main/insertion meters read blue, sub-meters green — matching the DMA chart.
  const seriesColor = meter?.is_main ? "#3b82f6" : "#22c55e";

  // ─── Chart data ─────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const fmt = granularity === "hourly" ? "MMM dd HH:mm"
      : granularity === "monthly" ? "MMM yyyy"
      : "MMM dd, yyyy";
    return series.map((p, i) => {
      const dateStr = format(p.at, "yyyy-MM-dd");
      return {
        label: format(p.at, fmt),
        consumption: p.consumption,
        dateStr,
        readings: p.count,
        peakType: peaks.highs.has(i) ? "high" : peaks.lows.has(i) ? "low" : null,
        weather: weatherData[dateStr] || null,
      };
    });
  }, [series, granularity, peaks, weatherData]);

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
                {viewMode === "ami" && detected.hourly && (
                  // Only offered when the meter really holds several readings a
                  // day — otherwise hourly and daily would draw the same line.
                  <div className="flex items-center rounded-md border border-border overflow-hidden">
                    <Button size="sm" variant={granularity === "hourly" ? "default" : "ghost"} onClick={() => setGranularity("hourly")} className="rounded-none">Hourly</Button>
                    <Button size="sm" variant={granularity === "daily" ? "default" : "ghost"} onClick={() => setGranularity("daily")} className="rounded-none">Daily</Button>
                    <Button size="sm" variant={granularity === "monthly" ? "default" : "ghost"} onClick={() => setGranularity("monthly")} className="rounded-none">Monthly</Button>
                  </div>
                )}
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
                <Button
                  size="sm"
                  variant={onlyWithData ? "default" : "outline"}
                  onClick={() => setOnlyWithData((v) => !v)}
                  title="Leave out the periods that hold no reading, instead of drawing them as zero"
                >
                  Only periods with data
                </Button>
                </>)}
              </div>
            )}

            {/* Where the data actually is. A meter with a month of readings in
                the middle of a year looks like a flat line otherwise, and the
                question "which dates do I have?" had no answer on this screen. */}
            {hasDates && coverage.first && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-lg px-3 py-2">
                <span>
                  <span className="font-medium text-foreground">{coverage.readings.toLocaleString()}</span> readings
                </span>
                <span>·</span>
                <span>
                  <span className="font-medium text-foreground">{coverage.daysWithData.toLocaleString()}</span> day{coverage.daysWithData === 1 ? "" : "s"} with data
                  {coverage.emptyDays > 0 && (
                    <span className="text-amber-600 dark:text-amber-400"> · {coverage.emptyDays.toLocaleString()} empty</span>
                  )}
                </span>
                <span>·</span>
                <span>
                  {format(coverage.first, "dd/MM/yyyy")} — {format(coverage.last, "dd/MM/yyyy")}
                </span>
                {detected.hourly && (
                  <>
                    <span>·</span>
                    <span className="text-blue-600 dark:text-blue-400">
                      hourly, up to {detected.maxPerDay} readings a day
                    </span>
                  </>
                )}
                {project?.project_type && (
                  <>
                    <span>·</span>
                    <span>project set to <span className="font-medium text-foreground">{project.project_type}</span></span>
                  </>
                )}
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
                      <Bar dataKey="consumption" fill={seriesColor} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : hasDates ? (
                    <ComposedChart data={chartData} margin={{ top: 30, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="consumptionGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={seriesColor} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={seriesColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={30} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<WeatherTooltip />} />
                      <Area type="monotone" dataKey="consumption" stroke={seriesColor} strokeWidth={2} fill="url(#consumptionGradient)" dot={renderWeatherDot} activeDot={{ r: 6 }} />
                    </ComposedChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={20} angle={-30} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="consumption" fill={seriesColor} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-slate-400">
                No readings in the selected range.
              </div>
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