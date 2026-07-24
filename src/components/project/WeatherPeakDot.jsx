import React from "react";
import { getWeatherEmoji } from "@/lib/weatherData";

// SVG dot rendered at peak points on the chart — shows weather emoji + temperature.
export function WeatherPeakDot({ cx, cy, payload }) {
  if (!payload?.weather) return null;

  const emoji = getWeatherEmoji(payload.weather.condition);
  const temp = payload.weather.temperature_c;
  const ringColor = payload.peakType === "high" ? "#f59e0b" : "#3b82f6";

  return (
    <g>
      <circle cx={cx} cy={cy} r={15} fill="white" stroke={ringColor} strokeWidth={2} opacity={0.95} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fontSize="13">
        {emoji}
      </text>
      <text x={cx} y={cy - 22} textAnchor="middle" fontSize="10" fill={ringColor} fontWeight="700">
        {temp}°
      </text>
    </g>
  );
}

// Custom tooltip showing consumption + weather context.
export function WeatherTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs max-w-[240px]">
      <p className="font-semibold text-slate-900 mb-1">{label}</p>
      <p className="text-slate-600">
        Consumption: <span className="font-bold text-slate-900">{Number(item.consumption).toFixed(1)}</span>
      </p>
      {item.weather ? (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2">
          <span className="text-lg">{getWeatherEmoji(item.weather.condition)}</span>
          <div>
            <p className="font-medium text-slate-700 capitalize">{item.weather.condition.replace(/_/g, " ")}</p>
            <p className="text-slate-500">{item.weather.temperature_c}°C</p>
            {item.peakType && (
              <p className="text-[10px] mt-0.5 font-medium" style={{ color: item.peakType === "high" ? "#f59e0b" : "#3b82f6" }}>
                {item.peakType === "high" ? "↑ High consumption peak" : "↓ Low consumption peak"}
              </p>
            )}
          </div>
        </div>
      ) : item.peakType ? (
        <p className="text-[10px] mt-1" style={{ color: item.peakType === "high" ? "#f59e0b" : "#3b82f6" }}>
          {item.peakType === "high" ? "↑ High consumption peak" : "↓ Low consumption peak"}
        </p>
      ) : null}
    </div>
  );
}

// Recharts dot renderer — shows weather icon at peaks, nothing otherwise.
export function renderWeatherDot(props) {
  const { cx, cy, payload, index } = props;
  if (cx == null || cy == null || !payload?.weather) return null;
  return <WeatherPeakDot key={`peak-${index}`} cx={cx} cy={cy} payload={payload} />;
}