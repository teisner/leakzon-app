import { useState, useEffect, useMemo } from "react";
import { format, parseISO } from "date-fns";

const WEATHER_EMOJIS = {
  sunny: "☀️",
  partly_cloudy: "⛅",
  cloudy: "☁️",
  rainy: "🌧️",
  snowy: "❄️",
  stormy: "⛈️",
  windy: "💨",
  foggy: "🌫️",
};

export function getWeatherEmoji(condition) {
  return WEATHER_EMOJIS[condition] || "☁️";
}

// Identify indices of the single highest and single lowest consumption peaks.
// Only 2 points total — the absolute max and absolute min.
export function identifyPeaks(values) {
  if (values.length < 2) return { highs: new Set(), lows: new Set() };

  let maxIdx = 0;
  let minIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[maxIdx]) maxIdx = i;
    if (values[i] < values[minIdx]) minIdx = i;
  }

  return {
    highs: new Set([maxIdx]),
    lows: new Set([minIdx]),
  };
}

// WMO weather codes (used by Open-Meteo) mapped to our condition set.
function conditionFromWeatherCode(code, maxWindKmh) {
  if (maxWindKmh >= 40 && [0, 1, 2].includes(code)) return "windy";
  if (code === 0 || code === 1) return "sunny";
  if (code === 2) return "partly_cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "foggy";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rainy";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snowy";
  if ([95, 96, 99].includes(code)) return "stormy";
  return "cloudy";
}

const geocodeCache = new Map();

// Nominatim (OpenStreetMap) — same geocoding provider already used by
// getCityBoundary/reverseGeocodeAddress, kept consistent here too.
async function geocodeCity(city, country) {
  const cacheKey = `${city}|${country || ""}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  const params = new URLSearchParams({ q: country ? `${city}, ${country}` : city, format: "json", limit: "1" });
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  const json = await res.json();
  const match = json?.[0];
  const coords = match ? { latitude: parseFloat(match.lat), longitude: parseFloat(match.lon) } : null;
  geocodeCache.set(cacheKey, coords);
  return coords;
}

export async function fetchWeatherForDate(dateStr, city, country) {
  try {
    const coords = await geocodeCity(city, country);
    if (!coords) return { key: dateStr, data: null };

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${coords.latitude}&longitude=${coords.longitude}&start_date=${dateStr}&end_date=${dateStr}&daily=weathercode,temperature_2m_mean,windspeed_10m_max&timezone=auto`;
    const res = await fetch(url);
    const json = await res.json();

    const code = json?.daily?.weathercode?.[0];
    const temp = json?.daily?.temperature_2m_mean?.[0];
    const wind = json?.daily?.windspeed_10m_max?.[0];
    if (code === undefined || code === null) return { key: dateStr, data: null };

    let key = json?.daily?.time?.[0] || dateStr;
    try {
      const parsed = parseISO(key);
      if (!isNaN(parsed.getTime())) key = format(parsed, "yyyy-MM-dd");
    } catch {}

    return {
      key,
      data: {
        date: key,
        condition: conditionFromWeatherCode(code, wind ?? 0),
        temperature_c: temp ?? null,
      },
    };
  } catch {
    return { key: dateStr, data: null };
  }
}

export async function fetchWeatherForDates(dates, city, country) {
  if (!dates.length || !city) return {};
  const dateStrs = [...new Set(dates.map((d) => format(d, "yyyy-MM-dd")))];

  const results = await Promise.all(
    dateStrs.map((ds) => fetchWeatherForDate(ds, city, country))
  );

  const result = {};
  results.forEach(({ key, data }) => {
    if (data) result[key] = data;
  });
  return result;
}

// Custom hook: identifies peaks in filtered readings and fetches weather for them.
export function useWeatherPeaks(filtered, city, country) {
  const [weatherData, setWeatherData] = useState({});
  const [loadingWeather, setLoadingWeather] = useState(false);

  const peaks = useMemo(() => {
    if (!filtered || filtered.length < 3) return { highs: new Set(), lows: new Set() };
    return identifyPeaks(filtered.map((r) => r.consumption));
  }, [filtered]);

  useEffect(() => {
    if (!filtered || filtered.length < 3 || !city) {
      setWeatherData({});
      return;
    }

    const peakDates = [];
    [...peaks.highs, ...peaks.lows].forEach((i) => {
      if (filtered[i]?._date) peakDates.push(filtered[i]._date);
    });

    if (peakDates.length === 0) {
      setWeatherData({});
      return;
    }

    const dateStrs = [...new Set(peakDates.map((d) => format(d, "yyyy-MM-dd")))];
    let cancelled = false;
    setLoadingWeather(true);
    setWeatherData({});

    // Fetch each peak date in parallel — update progressively as each resolves
    Promise.all(
      dateStrs.map((ds) =>
        fetchWeatherForDate(ds, city, country).then(({ key, data }) => {
          if (!cancelled && data) {
            setWeatherData((prev) => ({ ...prev, [key]: data }));
          }
        })
      )
    )
      .catch(() => { if (!cancelled) setWeatherData({}); })
      .finally(() => { if (!cancelled) setLoadingWeather(false); });

    return () => { cancelled = true; };
  }, [peaks, filtered, city, country]);

  return { peaks, weatherData, loadingWeather };
}