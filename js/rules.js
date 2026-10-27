// Aua care rules. Pure functions, no DOM, no network.
// Used by the browser app and by the Node tests (node --test).
//
// Every number shown to the user comes from here, and every routine step
// carries a "because" that names the score or the weather that triggered it.

/** Saturation vapour pressure over water, hPa (Magnus formula). */
export function satVapour(tC) {
  return 6.112 * Math.exp((17.62 * tC) / (243.12 + tC));
}

/**
 * Relative humidity of outdoor air after it is heated indoors, with no
 * moisture added. Physics, not a guess: e.g. −14 °C at 78 % heated to
 * +24 °C ≈ 5.5 %. Real homes are a bit higher (cooking, breathing).
 */
export function heatedRH(tOut, rhOut, tIn = 24) {
  const e = satVapour(tOut) * (rhOut / 100);
  return Math.max(0, Math.min(100, (100 * e) / satVapour(tIn)));
}

/** Home humidity: the hygrometer reading if the user gave one, otherwise the physics estimate. */
export function homeRH(profile, now) {
  const h = profile && Number(profile.hygrometer);
  if (Number.isFinite(h) && h > 0) return { value: Math.round(h), source: "hygrometer" };
  if (!now) return { value: null, source: "unknown" };
  return { value: Math.round(heatedRH(now.temp, now.rh, 24)), source: "estimate" };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lin = (x, good, bad) => clamp01((x - good) / (bad - good));

/**
 * Skin stress today, 1–5, plus the parts it is made of (each 0–1),
 * so the screen can show *why*. Weights are deliberately simple.
 */
export function stress({ wind, feels, home, moisture }) {
  const parts = [
    { key: "wind", value: wind == null ? null : lin(wind, 2, 12), w: 0.3 },
    { key: "cold", value: feels == null ? null : lin(feels, 0, -25), w: 0.2 },
    { key: "home", value: home == null ? null : lin(home, 45, 15), w: 0.3 },
    { key: "moisture", value: moisture == null ? null : lin(moisture, 70, 35), w: 0.2 },
  ];
  const known = parts.filter((p) => p.value != null);
  const wsum = known.reduce((s, p) => s + p.w, 0) || 1;
  const mix = known.reduce((s, p) => s + p.value * p.w, 0) / wsum;
  const score = Math.max(1, Math.min(5, 1 + Math.round(mix * 4)));
  const level = score >= 4 ? "high" : score === 3 ? "medium" : "low";
  const main = known.slice().sort((a, b) => b.value * b.w - a.value * a.w)[0];
  return { score, level, parts: parts.map(({ key, value }) => ({ key, value })), main: main ? main.key : null };
}

/** Today's routine. Each step: { id, because: { key, ...params } }. */
export function routine({ now, tomorrow, home, scores = {}, frizz = null }) {
  const m = scores.moisture, r = scores.redness;
  const before = [], evening = [];

  if (m != null && m < 55) before.push({ id: "lukewarm", because: { key: "moisture", value: m } });
  if (now && (now.feels <= -10 || now.wind >= 7)) {
    before.push(r != null && r < 70
      ? { id: "barrier", because: { key: "wind_redness", wind: now.wind, redness: r } }
      : { id: "barrier", because: { key: "wind", wind: now.wind } });
  }
  if (now && now.feels <= -15) before.push({ id: "lips_scarf", because: { key: "feels", feels: now.feels } });
  if (now && now.uv != null && now.uv >= 3) before.push({ id: "spf", because: { key: "uv", uv: now.uv } });
  if ((frizz != null && frizz >= 2) || (home != null && home < 30)) {
    before.push(frizz != null && frizz >= 2
      ? { id: "leave_in", because: { key: "frizz", frizz } }
      : { id: "leave_in", because: { key: "home", home } });
  }

  if (tomorrow && (tomorrow.tmin <= -20 || tomorrow.wind >= 10))
    evening.push({ id: "no_acids", because: { key: "tomorrow", tmin: tomorrow.tmin } });
  if (m != null && m < 45) evening.push({ id: "rich_cream", because: { key: "moisture", value: m } });
  if (home != null && home < 40) evening.push({ id: "humidifier", because: { key: "home", home } });

  if (!before.length) before.push({ id: "light_moist", because: { key: "mild" } });
  return { before, evening };
}

/** Product tags that fit today's routine (for the shop block). */
export function neededTags(rt) {
  const map = { barrier: "barrier", rich_cream: "barrier", lukewarm: "gentle_cleanser", lips_scarf: "lip", leave_in: "antistatic", spf: "spf", humidifier: "humectant" };
  const tags = new Set();
  [...rt.before, ...rt.evening].forEach((s) => map[s.id] && tags.add(map[s.id]));
  if (tags.has("barrier")) tags.add("humectant");
  return [...tags];
}

/** How hard a forecast day is on skin, 0–1. */
export function daySeverity(d) {
  return 0.6 * lin(d.tmin, 0, -30) + 0.4 * lin(d.wind, 3, 14);
}
export function dayClass(d) {
  const s = daySeverity(d);
  return s >= 0.55 ? "hard" : s >= 0.3 ? "care" : "gentle";
}

/** Week plan: the hardest day, the calm night before it, and the best day for a mask. */
export function weekPlan(days) {
  if (!days || !days.length) return [];
  const idx = days.map((d, i) => ({ d, i, s: daySeverity(d) }));
  const hardest = idx.slice().sort((a, b) => b.s - a.s)[0];
  const plan = [{ type: "hardest", day: hardest.d.date, tmin: hardest.d.tmin, wind: hardest.d.wind }];
  if (hardest.i > 0) plan.push({ type: "calm_night", day: days[hardest.i - 1].date, before: hardest.d.date });
  const gentle = idx.filter((x) => x.i !== hardest.i && dayClass(x.d) === "gentle").sort((a, b) => a.s - b.s)[0];
  if (gentle) plan.push({ type: "mask", day: gentle.d.date, tmin: gentle.d.tmin });
  return plan;
}

/**
 * Morning vs evening scan. Changes smaller than the threshold are treated
 * as scan noise. Calibrate the threshold by scanning twice in a row.
 */
export const NOISE = 4;
export function compare(morning, evening, threshold = NOISE) {
  if (morning == null || evening == null) return null;
  const delta = Math.round(evening - morning);
  return { delta, real: Math.abs(delta) >= threshold };
}

/**
 * Personal patterns from the scan history. Needs at least 3 scans on each
 * side of a comparison, otherwise returns null for that pattern.
 * history item: { date, moisture, tmin, humidifierNight }
 */
export function winterNumbers(history, min = 3) {
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const withM = (history || []).filter((h) => h.moisture != null);
  const cold = withM.filter((h) => h.tmin != null && h.tmin <= -20).map((h) => h.moisture);
  const mild = withM.filter((h) => h.tmin != null && h.tmin > -20).map((h) => h.moisture);
  const hum = withM.filter((h) => h.humidifierNight === true).map((h) => h.moisture);
  const noHum = withM.filter((h) => h.humidifierNight === false).map((h) => h.moisture);
  return {
    n: withM.length,
    coldDelta: cold.length >= min && mild.length >= min ? Math.round(avg(cold) - avg(mild)) : null,
    humidifierDelta: hum.length >= min && noHum.length >= min ? Math.round(avg(hum) - avg(noHum)) : null,
  };
}
