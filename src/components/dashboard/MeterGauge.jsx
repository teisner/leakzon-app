import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

// Three-stop color interpolation: #2453a1 → #3fbee5 → #92c141
const COLOR_STOPS = [
  { r: 0x24, g: 0x53, b: 0xa1 }, // #2453a1 (low)
  { r: 0x3f, g: 0xbe, b: 0xe5 }, // #3fbee5 (mid)
  { r: 0x92, g: 0xc1, b: 0x41 }, // #92c141 (high)
];

const getGaugeColor = (pct) => {
  const t = Math.max(0, Math.min(100, pct)) / 100;
  const seg = t < 0.5 ? 0 : 1;
  const localT = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const from = COLOR_STOPS[seg];
  const to = COLOR_STOPS[seg + 1];
  const r = Math.round(from.r + (to.r - from.r) * localT);
  const g = Math.round(from.g + (to.g - from.g) * localT);
  const b = Math.round(from.b + (to.b - from.b) * localT);
  return `rgb(${r}, ${g}, ${b})`;
};

const TILT = 0.5; // scaleY — flattens the circle into a tilted ellipse
const STACK_LAYERS = 6;

const PieFace = ({ data, imported, gaugeColor, outerRadius, size, withGloss }) => (
  <>
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          outerRadius={outerRadius}
          startAngle={90}
          endAngle={-270}
          paddingAngle={0}
          stroke="none"
        >
          {imported > 0 ? (
            <>
              <Cell fill={gaugeColor} />
              <Cell fill="hsl(var(--muted))" />
            </>
          ) : (
            <Cell fill="hsl(var(--muted))" />
          )}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
    {withGloss && (
      <div
        className="absolute pointer-events-none rounded-full"
        style={{
          width: outerRadius * 2,
          height: outerRadius * 2,
          left: (size - outerRadius * 2) / 2,
          top: (size - outerRadius * 2) / 2,
          background:
            "radial-gradient(circle at 35% 28%, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.08) 38%, rgba(0,0,0,0) 62%)",
        }}
      />
    )}
  </>
);

export default function MeterGauge({ imported = 0, assigned = 0, size = 110 }) {
  const ratio = imported > 0 ? Math.min(assigned / imported, 1) : 0;
  const pct = Math.round(ratio * 1000) / 10;
  const remaining = Math.max(imported - assigned, 0);
  const gaugeColor = getGaugeColor(pct);

  const data = imported > 0
    ? [{ value: assigned }, { value: remaining }]
    : [{ value: 1 }];

  const outerRadius = size * 0.48;
  const stackOffset = Math.max(2, Math.round(size * 0.022));
  const visualHeight = size * TILT;
  const totalHeight = visualHeight + stackOffset * (STACK_LAYERS - 1);

  return (
    <div className="flex flex-col items-center shrink-0" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: totalHeight }}>
        {/* Extrusion side layers — peek out below the top face */}
        {Array.from({ length: STACK_LAYERS - 1 }).map((_, i) => {
          const layer = i + 1;
          return (
            <div
              key={`side-${i}`}
              className="absolute left-0 top-0"
              style={{
                width: size,
                height: size,
                transform: `translateY(${layer * stackOffset}px) scaleY(${TILT})`,
                transformOrigin: "center top",
                opacity: 0.6,
                filter: "saturate(0.6) brightness(0.55)",
                zIndex: 1,
              }}
            >
              <PieFace
                data={data}
                imported={imported}
                gaugeColor={gaugeColor}
                outerRadius={outerRadius}
                size={size}
                withGloss={false}
              />
            </div>
          );
        })}

        {/* Top face — the visible pie */}
        <div
          className="absolute left-0 top-0"
          style={{
            width: size,
            height: size,
            transform: `scaleY(${TILT})`,
            transformOrigin: "center top",
            filter: "drop-shadow(2px 3px 3px rgba(0,0,0,0.16))",
            zIndex: 2,
          }}
        >
          <PieFace
            data={data}
            imported={imported}
            gaugeColor={gaugeColor}
            outerRadius={outerRadius}
            size={size}
            withGloss
          />
        </div>
      </div>

      {/* Label below the pie */}
      <div className="flex flex-col items-center mt-1">
        <span
          className="font-extrabold text-foreground tabular-nums leading-none"
          style={{ fontSize: Math.round(size * 0.17) }}
        >
          {pct}%
        </span>
        <span
          className="text-muted-foreground tabular-nums"
          style={{ fontSize: Math.round(size * 0.072) }}
        >
          {assigned}/{imported}
        </span>
      </div>
    </div>
  );
}