import test from "node:test";
import assert from "node:assert/strict";
import { heatedRH, homeRH, stress, routine, neededTags, weekPlan, dayClass, compare, winterNumbers } from "../js/rules.js";

test("heated frosty air is very dry", () => {
  assert.equal(Math.round(heatedRH(-14, 78) * 10) / 10, 5.5);
  assert.ok(heatedRH(-27, 80) < 2.5);
});

test("hygrometer reading wins over the estimate", () => {
  assert.deepEqual(homeRH({ hygrometer: 22 }, { temp: -14, rh: 78 }), { value: 22, source: "hygrometer" });
  assert.deepEqual(homeRH({}, { temp: -14, rh: 78 }), { value: 5, source: "estimate" });
});

test("stress: Astana frost morning is high, mild day is low", () => {
  const hard = stress({ wind: 9, feels: -23, home: 18, moisture: 41 });
  assert.equal(hard.level, "high");
  assert.ok(hard.score >= 4);
  assert.equal(hard.parts.length, 4);
  const mild = stress({ wind: 2, feels: 2, home: 50, moisture: 75 });
  assert.equal(mild.score, 1);
});

test("stress works without a scan", () => {
  const s = stress({ wind: 9, feels: -23, home: 18, moisture: null });
  assert.ok(s.score >= 4);
  assert.equal(s.parts.find((p) => p.key === "moisture").value, null);
});

test("routine: every step has a because", () => {
  const rt = routine({
    now: { temp: -14, feels: -23, wind: 9, uv: 1 },
    tomorrow: { tmin: -21, wind: 8 },
    home: 18, scores: { moisture: 41, redness: 63 }, frizz: 2,
  });
  const ids = rt.before.map((s) => s.id);
  assert.deepEqual(ids, ["lukewarm", "barrier", "lips_scarf", "spf", "leave_in"]);
  assert.deepEqual(rt.evening.map((s) => s.id), ["no_acids", "rich_cream", "humidifier", "hair_heat"]);
  [...rt.before, ...rt.evening].forEach((s) => assert.ok(s.because && s.because.key));
  assert.ok(neededTags(rt).includes("barrier"));
});

test("routine on a mild day still gives one step", () => {
  const rt = routine({ now: { temp: 5, feels: 4, wind: 2, uv: 1 }, tomorrow: { tmin: 0, wind: 3 }, home: 45, scores: { moisture: 70 } });
  assert.equal(rt.before[0].id, "light_moist");
  assert.equal(rt.evening.length, 0);
});

test("dermatologist rules: SPF in winter, rest the barrier, oily but dehydrated", () => {
  const dull = routine({ now: { temp: -5, feels: -8, wind: 3, uv: 0.5 }, tomorrow: { tmin: -6, wind: 4 }, home: 45, scores: { moisture: 40, redness: 50, oiliness: 45 } });
  const spf = dull.before.find((s) => s.id === "spf");
  assert.equal(spf.because.key, "spf_winter");
  const ev = dull.evening.map((s) => s.id);
  assert.deepEqual(ev, ["no_acids", "light_barrier"]);
  assert.equal(dull.evening[0].because.key, "barrier");
  const dry = routine({ now: { temp: -5, feels: -8, wind: 3, uv: 0.5 }, home: 45, scores: { moisture: 40, oiliness: 80 } });
  assert.ok(dry.evening.some((s) => s.id === "rich_cream"));
});

test("week plan finds the hardest day, the night before and a mask day", () => {
  const days = [
    { date: "2026-12-01", tmin: -14, wind: 9 }, { date: "2026-12-02", tmin: -21, wind: 8 },
    { date: "2026-12-03", tmin: -27, wind: 12 }, { date: "2026-12-04", tmin: -18, wind: 6 },
    { date: "2026-12-05", tmin: -9, wind: 4 }, { date: "2026-12-06", tmin: -6, wind: 3 },
    { date: "2026-12-07", tmin: -11, wind: 5 },
  ];
  const plan = weekPlan(days);
  assert.deepEqual(plan.map((p) => [p.type, p.day]), [["hardest", "2026-12-03"], ["calm_night", "2026-12-02"], ["mask", "2026-12-06"]]);
  assert.equal(dayClass(days[2]), "hard");
  assert.equal(dayClass(days[5]), "gentle");
});

test("compare: small changes are noise", () => {
  assert.deepEqual(compare(44, 38), { delta: -6, real: true });
  assert.deepEqual(compare(44, 42), { delta: -2, real: false });
  assert.equal(compare(null, 40), null);
});

test("winter numbers need enough scans", () => {
  assert.equal(winterNumbers([{ moisture: 40, tmin: -25 }]).coldDelta, null);
  const h = [
    ...[37, 36, 39].map((m) => ({ moisture: m, tmin: -24, humidifierNight: false })),
    ...[46, 47, 44].map((m) => ({ moisture: m, tmin: -9, humidifierNight: true })),
  ];
  const w = winterNumbers(h);
  assert.equal(w.coldDelta, -8);
  assert.equal(w.humidifierDelta, 8);
});
