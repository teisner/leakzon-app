import React, { useState } from "react";
import { ChevronDown, Calendar, Layers, MapPin, Clock, Calculator } from "lucide-react";

export default function CompletionDetails({ data }) {
  const [expanded, setExpanded] = useState(true);
  if (!data) return null;

  const { results = [], spread_patterns = [], dma_name, dma_meter_count, nearby_meter_count, radius_yards, weights } = data;

  const completed = results.filter((r) => r.final != null);
  if (completed.length === 0) return null;

  return (
    <div className="border border-amber-200 dark:border-amber-800/50 rounded-lg bg-amber-50/40 dark:bg-amber-950/5">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <span className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400">
          <Calculator className="w-4 h-4" />
          Calculation Breakdown ({completed.length} days)
        </span>
        <ChevronDown className={`w-4 h-4 text-amber-600 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* General params */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            {dma_name && <span>DMA: <strong className="text-foreground">{dma_name}</strong> ({dma_meter_count} meters)</span>}
            <span>Nearby: <strong className="text-foreground">{nearby_meter_count}</strong> meters within {radius_yards} yd</span>
            {spread_patterns.length > 0 && <span>High threshold: <strong className="text-foreground">{data.high_threshold?.toFixed(1)}</strong> (median × 3)</span>}
          </div>

          {/* Spread patterns */}
          {spread_patterns.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                <Layers className="w-3 h-3" /> Spread Patterns (Accumulated Reading)
              </p>
              {spread_patterns.map((sp, i) => (
                <div key={i} className="rounded-md bg-purple-50 dark:bg-purple-950/10 border border-purple-200 dark:border-purple-800/30 p-2.5 text-[11px]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Calendar className="w-3 h-3 text-purple-500" />
                    <span className="font-mono text-purple-700 dark:text-purple-300">
                      {sp.affected_dates[0]} → {sp.affected_dates[sp.affected_dates.length - 1]}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span>High reading: <strong className="text-foreground">{sp.high_reading.toFixed(2)}</strong></span>
                    <span>Blank/zero days: <strong className="text-foreground">{sp.zero_missing_count}</strong></span>
                    <span className="col-span-2">Formula: <span className="font-mono text-purple-600 dark:text-purple-400">{sp.formula}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Per-date breakdown */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> Daily Breakdown
            </p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {completed.map((r) => (
                <DateRow key={r.date} r={r} weights={weights} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DateRow({ r, weights }) {
  const isSpread = r.source === "spread";
  const isWeighted = r.source === "weighted";

  return (
    <div className={`rounded-md border p-2.5 text-[11px] ${
      isSpread
        ? "bg-purple-50 dark:bg-purple-950/10 border-purple-200 dark:border-purple-800/30"
        : "bg-amber-50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800/30"
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono font-semibold text-foreground">{r.date}</span>
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
          isSpread ? "bg-purple-200 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300"
          : "bg-amber-200 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
        }`}>
          {isSpread ? "Spread" : "Weighted Avg"}
        </span>
      </div>

      {r.original_value != null && (
        <p className="text-[10px] text-muted-foreground mb-1">
          Original: <span className="font-mono">{r.original_value.toFixed(2)}</span> → Final: <span className="font-mono font-bold text-foreground">{r.final.toFixed(2)}</span>
        </p>
      )}
      {r.original_value == null && (
        <p className="text-[10px] text-muted-foreground mb-1">
          Missing → Final: <span className="font-mono font-bold text-foreground">{r.final.toFixed(2)}</span>
        </p>
      )}

      {/* Spread detail */}
      {isSpread && r.spread_detail && (
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          <p>High reading: <span className="font-mono text-foreground">{r.spread_detail.high_reading.toFixed(2)}</span> on {r.spread_detail.high_reading_date}</p>
          <p>Divided by: <span className="font-mono text-foreground">{r.spread_detail.zero_missing_count + 1}</span> ({r.spread_detail.zero_missing_count} blank + 1 high day)</p>
          <p className="font-mono text-purple-600 dark:text-purple-400">{r.spread_detail.formula}</p>
        </div>
      )}

      {/* Weighted detail */}
      {isWeighted && r.weighted_detail && (
        <WeightedBreakdown r={r} />
      )}
    </div>
  );
}

function WeightedBreakdown({ r }) {
  const wd = r.weighted_detail;
  const components = wd.components || [];
  const totalWeight = wd.total_weight || components.reduce((s, c) => s + c.weight, 0) || 1;
  const equalWeights = components.every((c) => c.weight === components[0].weight);

  const factorMeta = {
    "DMA": {
      icon: Layers,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-950/10",
      border: "border-blue-200 dark:border-blue-800/30",
      desc: "Average consumption of all meters in the same DMA on this day",
    },
    "Nearby": {
      icon: MapPin,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-950/10",
      border: "border-emerald-200 dark:border-emerald-800/30",
      desc: "Average of meters within the configured radius on this day",
    },
    "Same Day": {
      icon: Clock,
      color: "text-violet-500",
      bg: "bg-violet-50 dark:bg-violet-950/10",
      border: "border-violet-200 dark:border-violet-800/30",
      desc: "This meter's own average on the same weekday ±1-2 weeks",
    },
  };

  const subDetail = (name) => {
    if (name === "DMA" && r.dma_detail) {
      return `${r.dma_detail.total.toFixed(1)} total ÷ ${r.dma_detail.meter_count} meters`;
    }
    if (name === "Nearby" && r.nearby_detail) {
      const denom = r.nearby_detail.count || r.nearby_detail.readings_found || 1;
      return `${r.nearby_detail.total.toFixed(1)} total ÷ ${denom} readings`;
    }
    if (name === "Same Day" && r.same_day_detail?.readings?.length) {
      const readings = r.same_day_detail.readings;
      const parts = readings.map((rd) => `${rd.consumption.toFixed(2)}`).join(" + ");
      return `${parts} ÷ ${readings.length} = ${(readings.reduce((s, rd) => s + rd.consumption, 0) / readings.length).toFixed(2)}`;
    }
    return null;
  };

  return (
    <div className="space-y-2 text-[10px]">
      <p className="text-muted-foreground">
        We estimate this day using {components.length} factor{components.length > 1 ? "s" : ""}, then average them{equalWeights ? "" : " by weight"}:
      </p>

      {/* Factor cards */}
      <div className="space-y-1.5">
        {components.map((c, i) => {
          const meta = factorMeta[c.name] || {};
          const Icon = meta.icon;
          const sub = subDetail(c.name);
          return (
            <div key={i} className={`rounded-md border p-2 ${meta.bg || "bg-muted/30"} ${meta.border || "border-border"}`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className={`flex items-center gap-1.5 font-semibold ${meta.color || "text-foreground"}`}>
                  {Icon && <Icon className="w-3 h-3" />}
                  {c.name}
                </span>
                <span className="font-mono font-bold text-foreground text-xs">{c.value.toFixed(2)}</span>
              </div>
              {meta.desc && <p className="text-[9px] text-muted-foreground leading-tight mb-0.5">{meta.desc}</p>}
              {sub && <p className="text-[9px] text-muted-foreground/70 font-mono leading-tight">{sub}</p>}
            </div>
          );
        })}
      </div>

      {/* Final calculation */}
      <div className="rounded-md border border-amber-300 dark:border-amber-700/40 bg-amber-100/50 dark:bg-amber-950/20 p-2">
        {equalWeights ? (
          <>
            <p className="text-[9px] text-muted-foreground mb-0.5">Final = average of all factors:</p>
            <p className="font-mono text-amber-700 dark:text-amber-400 text-[11px] font-bold">
              ({components.map((c) => c.value.toFixed(2)).join(" + ")}) ÷ {components.length}
            </p>
          </>
        ) : (
          <>
            <p className="text-[9px] text-muted-foreground mb-0.5">Final = weighted average:</p>
            <p className="font-mono text-amber-700 dark:text-amber-400 text-[10px]">
              ({components.map((c) => `${c.value.toFixed(2)}×${c.weight}`).join(" + ")}) ÷ {totalWeight}
            </p>
          </>
        )}
        <p className="text-right text-[11px] mt-0.5">
          = <span className="font-mono font-bold text-foreground">{r.final.toFixed(2)}</span>
        </p>
      </div>
    </div>
  );
}