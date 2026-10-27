// GET /api/weather?lat=..&lon=..  ->  current weather + 7 days, from Open-Meteo (free, no key).
import { json } from "./_youcam.js";

const ASTANA = { lat: 51.1694, lon: 71.4491, name: "Astana" };

export function openMeteoUrl(lat, lon) {
  const p = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,uv_index",
    daily: "temperature_2m_min,temperature_2m_max,wind_speed_10m_max,uv_index_max",
    wind_speed_unit: "ms", timezone: "auto", forecast_days: "7",
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

export function normalizeWeather(w, name) {
  const c = w.current || {};
  const d = w.daily || {};
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  return {
    place: name,
    now: {
      temp: r1(c.temperature_2m), rh: c.relative_humidity_2m ?? null, feels: r1(c.apparent_temperature),
      wind: r1(c.wind_speed_10m), uv: r1(c.uv_index), time: c.time || null,
    },
    days: (d.time || []).map((date, i) => ({
      date, tmin: r1(d.temperature_2m_min?.[i]), tmax: r1(d.temperature_2m_max?.[i]),
      wind: r1(d.wind_speed_10m_max?.[i]), uv: r1(d.uv_index_max?.[i]),
    })),
  };
}

export async function GET(request, fetchImpl = fetch) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat")) || ASTANA.lat;
  const lon = Number(url.searchParams.get("lon")) || ASTANA.lon;
  const name = url.searchParams.get("name") || ASTANA.name;
  try {
    const res = await fetchImpl(openMeteoUrl(lat, lon));
    if (!res.ok) return json({ error: "weather_unavailable", message: `Open-Meteo HTTP ${res.status}` }, 502);
    return json(normalizeWeather(await res.json(), name), 200, { "Cache-Control": "s-maxage=900, stale-while-revalidate=3600" });
  } catch (e) {
    return json({ error: "weather_unavailable", message: e.message }, 502);
  }
}
