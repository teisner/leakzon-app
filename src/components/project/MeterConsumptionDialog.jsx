import React, { useState, useEffect, useMemo } from "react";
import { invokeFunction } from "@/api/functionsClient";
import {
  detectSeriesGranularity, buildSeries, coverageSummary, defaultGranularity,
} from "@/lib/consumptionSeries";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, TrendingUp, CloudSun, CloudOff, Scissors, Table as TableIcon } from "lucide-react";
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

// A labelled cluster of controls. The caption is what tells you whether a
// button is choosing a view, a resolution or a period — without it the row is
// eight buttons in a line.
function Group({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export default function MeterConsumptionDialog({ open, onOpenChange, meter, project, onViewReadings }) {
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(false);
  // "all" spans exactly what the meter holds. It is the default whenever the
  // data does not fill the 30-day window, because a fixed window on two days of
  // readings is 28 days of blank chart.
  const [range, setRange] = useState("all");
  // Monthly is the bar chart that used to be the separate "AMR" view; every
  // other resolution is the detail line chart.
  const [viewMode, setViewMode] = useState("ami");
  // How the readings are bucketed, and whether the empty stretches are drawn.
  const [granularity, setGranularity] = useState(null);
  const [onlyWithData, setOnlyWithData] = useState(false);
  // Weather is fetched from an outside service and only annotates the peaks, so
  // it is off unless asked for — no call goes out until it is switched on.
  const [showWeather, setShowWeather] = useState(false);
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

  useEffect(() => {
    if (!granularity) return;
    setViewMode(granularity === "monthly" ? "amr" : "ami");
  }, [granularity]);
  const coverage = useMemo(() => coverageSummary(readings), [readings]);

  useEffect(() => {
    if (dated.length === 0) return;
    // AMR is the monthly roll-up, for meters read every so often. A meter that
    // reports hourly is never that, and neither is a project set to AMI — the
    // gap test alone would drop an AMI meter into the monthly view just because
    // a few days are missing.
    const isAmi = String(project?.project_type || "").toUpperCase() === "AMI";
    const continuous = hasContinuousDailyData(dated.map((r) => r._date), 7);
    // The project says how it is read; the data says whether that is possible.
    const g = detected.hourly || isAmi || continuous
      ? defaultGranularity(project?.project_type, detected)
      : "monthly";
    setGranularity(g);
    setViewMode(g === "monthly" ? "amr" : "ami");
    // Fit the window to the data unless there is genuinely a month of it.
    setRange(coverage.spanDays >= 30 ? "30d" : "all");
  }, [dated, detected, project?.project_type, coverage.spanDays]);

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
    if (range === "all") return { from: coverage.first, to: coverage.last };
    if (range === "7d") return { from: subDays(maxDate, 7), to: maxDate };
    if (range === "30d") return { from: subDays(maxDate, 30), to: maxDate };
    const f = customFrom ? new Date(customFrom) : null;
    const t = customTo ? new Date(customTo) : null;
    if (f) f.setHours(0, 0, 0, 0);
    if (t) t.setHours(23, 59, 59, 999);
    return { from: f, to: t };
  }, [hasDates, range, customFrom, customTo, maxDate, coverage.first, coverage.last]);

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

  const { peaks, weatherData, loadingWeather } = useWeatherPeaks(
    viewMode === "amr" || !showWeather ? [] : filtered,
    project?.city,
    project?.country
  );

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
          <div className="flex items-start justify-between gap-3 pe-6">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="w-5 h-5 text-blue-600 shrink-0" />
                <span className="truncate">Consumption — {meter.uid}</span>
              </DialogTitle>
              {/* The address says which meter this is far better than the UID,
                  and it was not on this screen at all. */}
              {(meter.address || meter.payer_name) && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {[meter.payer_name, meter.address].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            {onViewReadings && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 shrink-0" onClick={onViewReadings} title="See every reading as a table">
                <TableIcon className="w-3.5 h-3.5" /> Data
              </Button>
            )}
          </div>
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
            {/* Controls, in labelled groups. They arrived one at a time and had
                become an undifferentiated row of eight buttons where nothing
                said which choice belonged to what. */}
            {hasDates && (
              <div className="flex items-end gap-3 flex-wrap">
                {/* One idea, not two. The old AMI/AMR switch and this control
                    both ended in a "Monthly" button meaning the same thing —
                    the monthly bar chart. Resolution now owns it, and the view
                    follows from the choice. */}
                <Group label="Resolution">
                  <div className="flex items-center rounded-md border border-border overflow-hidden">
                    {detected.hourly && (
                      <Button size="sm" variant={granularity === "hourly" ? "default" : "ghost"} onClick={() => setGranularity("hourly")} className="rounded-none h-7 text-xs px-2.5">Hourly</Button>
                    )}
                    <Button size="sm" variant={granularity === "daily" ? "default" : "ghost"} onClick={() => setGranularity("daily")} className="rounded-none h-7 text-xs px-2.5">Daily</Button>
                    <Button size="sm" variant={granularity === "monthly" ? "default" : "ghost"} onClick={() => setGranularity("monthly")} className="rounded-none h-7 text-xs px-2.5">Monthly</Button>
                  </div>
                </Group>

                {viewMode === "ami" && (
                  <Group label="Period">
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center rounded-md border border-border overflow-hidden">
                        <Button size="sm" variant={range === "all" ? "default" : "ghost"} onClick={() => setRange("all")} className="rounded-none h-7 text-xs px-2.5" title="Exactly the period this meter has readings for">All data</Button>
                        <Button size="sm" variant={range === "7d" ? "default" : "ghost"} onClick={() => setRange("7d")} className="rounded-none h-7 text-xs px-2.5">7 days</Button>
                        <Button size="sm" variant={range === "30d" ? "default" : "ghost"} onClick={() => setRange("30d")} className="rounded-none h-7 text-xs px-2.5">30 days</Button>
                        <Button size="sm" variant={range === "custom" ? "default" : "ghost"} onClick={() => setRange("custom")} className="rounded-none h-7 text-xs px-2.5">Custom</Button>
                      </div>
                      {range === "custom" && (
                        <>
                          <input
                            type="date"
                            value={customFrom}
                            onChange={(e) => setCustomFrom(e.target.value)}
                            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                          />
                          <span className="text-xs text-muted-foreground">to</span>
                          <input
                            type="date"
                            value={customTo}
                            onChange={(e) => setCustomTo(e.target.value)}
                            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                          />
                        </>
                      )}
                    </div>
                  </Group>
                )}

                {/* The two switches are icons: they are on-or-off, not choices
                    between alternatives, and labelling them as buttons made them
                    read like more view modes. */}
                {viewMode === "ami" && (
                  <Group label="Show">
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant={onlyWithData ? "default" : "outline"}
                        onClick={() => setOnlyWithData((v) => !v)}
                        className="h-7 w-7 p-0"
                        title={onlyWithData
                          ? "Showing only the periods that hold a reading"
                          : "Leave out the periods with no reading, instead of drawing them as zero"}
                      >
                        <Scissors className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant={showWeather ? "default" : "outline"}
                        onClick={() => setShowWeather((v) => !v)}
                        className="h-7 w-7 p-0"
                        title={showWeather
                          ? "Weather is being fetched for the peak days"
                          : "Fetch the weather for the peak days — nothing is requested until you turn this on"}
                      >
                        {showWeather ? <CloudSun className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </Group>
                )}
              </div>
            )}

            {stats && (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: granularity === "hourly" ? "Total (period)" : "Total", value: stats.total, tone: "text-foreground" },
                  { label: granularity === "hourly" ? "Average / hour" : "Average / day", value: stats.avg, tone: "text-foreground" },
                  { label: "Lowest", value: stats.min, tone: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Highest", value: stats.max, tone: "text-amber-600 dark:text-amber-400" },
                ].map((tile) => (
                  <div key={tile.label} className="bg-muted/40 border border-border rounded-lg p-2.5 text-center">
                    <p className={`text-lg font-bold tabular-nums ${tile.tone}`}>{tile.value.toFixed(1)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{tile.label}</p>
                  </div>
                ))}
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