// Aua app: screens, state, camera and API calls. No framework, no build step.
import { homeRH, heatedRH, stress, routine, neededTags, weekPlan, dayClass, compare, winterNumbers } from "./rules.js";
import { makeT, LANGS } from "./i18n.js";
import { faceSVG, esc } from "./face.js";
import { PEOPLE, pickProducts, kaspiUrl, FALLBACK_WEATHER, sampleHistory } from "./data.js";

/* ---------------- state ---------------- */
const KEY = "aua.v1";
const today = () => new Date().toISOString().slice(0, 10);
const defaults = () => ({ lang: "en", onboarded: false, profile: { heating: "central", humidifier: "some", hygrometer: 22, hasHygro: true }, demo: null, day: null, history: [] });
let S = load();
const session = { weather: null, weatherSample: false, live: false, photo: null, masks: {}, mapLayer: "moisture", hairShots: [], deleteArmed: false };

function load() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return defaults(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: keep in memory */ }
}
function day() {
  if (!S.day || S.day.date !== today()) {
    const prev = S.day;
    S.day = { date: today(), morning: null, evening: null, done: [], humidifierTonight: null, prevHumidifier: prev ? prev.humidifierTonight : null };
    save();
  }
  return S.day;
}
let t = makeT(S.lang);

/* ---------------- helpers ---------------- */
const $app = document.getElementById("app");
const deg = (x) => (x == null ? "–" : `${x < 0 ? "−" : x > 0 ? "+" : ""}${Math.abs(Math.round(x))}°`);
const num = (x) => (x == null ? "–" : String(Math.round(x)));
const timeNow = () => new Date().toTimeString().slice(0, 5);
const locale = () => ({ en: "en-GB", ru: "ru-RU", kk: "kk-KZ" }[S.lang] || "en-GB");
// Own weekday names: Intl support for Kazakh is patchy across browsers (falls back to English).
const WD = {
  en: { short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], long: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] },
  ru: { short: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"], long: ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"] },
  kk: { short: ["Жс", "Дс", "Сс", "Ср", "Бс", "Жм", "Сн"], long: ["жексенбі", "дүйсенбі", "сейсенбі", "сәрсенбі", "бейсенбі", "жұма", "сенбі"] },
};
const wd = (iso, style = "short") => (WD[S.lang] || WD.en)[style === "long" ? "long" : "short"][new Date(iso + "T12:00:00").getDay()];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const city = (w) => (!w.place || w.place === "Astana" ? t("astana") : w.place);
const person = () => PEOPLE.find((p) => p.id === S.demo) || null;
const INFO = `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="#8E83C0"/><path d="M9 8v4.5M9 5.2v.2" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const HORN = (w = 28, h = 17, c = "currentColor") => `<svg width="${w}" height="${h}" style="color:${c}" aria-hidden="true"><use href="#horn"/></svg>`;

function snow(n = 40, seed = 7, W = 180, H = 300) {
  let s = seed, out = "";
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) out += `<circle cx="${(r() * W).toFixed(1)}" cy="${(r() * H).toFixed(1)}" r="${(0.8 + r() * 2.1).toFixed(1)}" fill="#fff" opacity="${(0.2 + r() * 0.55).toFixed(2)}"/>`;
  return `<svg class="snow" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${out}</svg>`;
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg; el.setAttribute("role", "status");
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || "Request failed"), { code: data.error || `http_${res.status}` });
  return data;
}

/* ---------------- data ---------------- */
async function loadWeather() {
  try {
    session.weather = await api("/api/weather");
    session.weatherSample = false;
    try { localStorage.setItem("aua.weather", JSON.stringify(session.weather)); } catch {}
  } catch {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem("aua.weather") || "null"); } catch {}
    session.weather = cached || FALLBACK_WEATHER;
    session.weatherSample = true;
  }
}
async function loadHealth() {
  try { session.live = (await api("/api/health")).youcam; } catch { session.live = false; }
}

function ctx() {
  const w = session.weather || FALLBACK_WEATHER;
  const d = day();
  const p = person();
  const morning = p ? { time: "8:13", scores: p.scores, frizz: p.frizz, demo: true } : d.morning;
  const home = homeRH(S.profile, w.now);
  const tomorrow = w.days[1] || null;
  const st = stress({ wind: w.now.wind, feels: w.now.feels, home: home.value, moisture: morning?.scores?.moisture ?? null });
  const rt = routine({ now: w.now, tomorrow, home: home.value, scores: morning?.scores || {}, frizz: morning?.frizz ?? null });
  return { w, d, p, morning, home, tomorrow, st, rt };
}

/* ---------------- shell ---------------- */
const TABS = [["today", "i-today"], ["skin", "i-skin"], ["routine", "i-routine"], ["week", "i-week"], ["me", "i-me"]];
function tabbar(on) {
  return `<nav class="tabbar" aria-label="Main">${TABS.map(([r, i]) => `<button class="tab${r === on ? " on" : ""}" data-go="${r}" ${r === on ? 'aria-current="page"' : ""}><svg aria-hidden="true"><use href="#${i}"/></svg>${t("tab_" + r)}</button>`).join("")}</nav>`;
}
function page(html, tab) {
  return `<main class="page${tab ? "" : " notabs"}">${html}</main>${tab ? tabbar(tab) : ""}`;
}
function langSwitch() {
  return `<div class="langs" role="group" aria-label="${t("language")}">${LANGS.map(([c]) => `<button data-lang="${c}" class="${S.lang === c ? "on" : ""}">${c === "kk" ? "ҚАЗ" : c.toUpperCase()}</button>`).join("")}</div>`;
}

/* ---------------- screens ---------------- */
const screens = {
  welcome() {
    return `<section class="welcome">${snow(110, 21, 400, 860)}
      <div class="wel">${HORN(96, 58, "#F2C38B")}<h1>Aua</h1><p class="wsub">${t("w_sub")}</p><p class="wtxt">${t("w_text")}</p>
      <div class="wlang">${LANGS.map(([c, n]) => `<button data-lang="${c}" class="${S.lang === c ? "on" : ""}">${n}</button>`).join("")}</div></div>
      <div class="wfoot"><button class="cta light" data-go="home">${t("start")}</button><button class="linkbtn" style="color:var(--ink)" data-go="demo">${t("try_demo")}</button></div></section>`;
  },

  home() {
    const pr = S.profile, w = session.weather || FALLBACK_WEATHER;
    const est = Math.round(heatedRH(w.now.temp, w.now.rh));
    const opt = (k, v, label) => `<button data-set="${k}:${v}" class="${pr[k] === v ? "on" : ""}">${t(label)}</button>`;
    return page(`<div class="dots3"><i class="on"></i><i class="on"></i><i></i></div>
      <div class="hello"><div><small>${t("step", { n: 2 })}</small><h2>${t("home_title")}</h2></div></div>
      <p class="insight" style="margin-top:0">${t("home_lead")}</p>
      <div class="panel">
        <h3 class="q">${t("q_heating")}</h3><div class="opts">${opt("heating", "central", "h_central")}${opt("heating", "gas", "h_gas")}${opt("heating", "unsure", "h_unsure")}</div>
        <h3 class="q">${t("q_humid")}</h3><div class="opts">${opt("humidifier", "daily", "hu_daily")}${opt("humidifier", "some", "hu_some")}${opt("humidifier", "no", "hu_no")}</div>
        <h3 class="q">${t("q_hygro")}</h3>
        <div class="opts"><button data-hygro="1" class="${pr.hasHygro ? "on" : ""}">${t("hygro_have")}</button><button data-hygro="0" class="${pr.hasHygro ? "" : "on"}">${t("hygro_none")}</button></div>
        ${pr.hasHygro ? `<label class="row-h" style="margin-top:12px"><span class="muted">${t("hygro_have")}</span><b class="disp" id="hygv" style="font-size:18px">${pr.hygrometer}%</b></label>
        <input type="range" min="5" max="70" value="${pr.hygrometer}" id="hygro" aria-label="${t("q_hygro")}">` : ""}
      </div>
      <div class="trust">${INFO}<span>${t("hygro_note", { t: deg(w.now.temp).replace("°", ""), rh: est })}</span></div>
      <button class="cta" data-go="${S.onboarded ? "me" : "privacy"}">${t("save_home")}</button>`);
  },

  privacy() {
    return page(`<div class="dots3"><i class="on"></i><i class="on"></i><i class="on"></i></div>
      <div class="hello"><div><small>${t("step", { n: 3 })}</small><h2>${t("priv_title")}</h2></div></div>
      <div class="panel kept">
        <div class="krow"><i class="ok">✓</i><p><b>${t("keep")}</b> ${t("keep_t")}</p></div>
        <div class="krow"><i class="no">✕</i><p><b>${t("nokeep")}</b> ${t("nokeep_t")}</p></div>
        <div class="krow"><i class="no">✕</i><p><b>${t("never")}</b> ${t("never_t")}</p></div>
      </div>
      <button class="tog panel" style="margin-top:12px;padding:14px 18px" data-act="ics"><span><p>${t("add_reminders")}</p><small>${t("add_reminders_t")}</small></span><span class="go">.ics</span></button>
      <p class="small-note">${t("not_medical")}</p>
      <button class="cta" data-act="finish-onboarding">${t("allow_camera")}</button>
      <button class="linkbtn" data-go="demo">${t("try_demo")}</button>`);
  },

  demo() {
    const ppl = PEOPLE.map((p) => `<button class="person" data-demo="${p.id}"><div class="ava">${faceSVG({ skin: p.skin, hair: p.hair, sweater: p.sweater })}</div>
      <div><p>${esc(p.name)}</p><small>${esc(p.desc[S.lang] || p.desc.en)}</small></div><span class="go">${t("try_btn")}</span></button>`).join("");
    return page(`<div class="hello"><div><small>${t("try_demo")}</small><h2>${t("demo_title")}</h2></div></div>
      <p class="insight" style="margin-top:0">${t("demo_lead")}</p><div class="people">${ppl}</div>
      <div class="trust">${INFO}<span>${t("demo_note")}</span></div>
      <button class="cta" data-act="leave-demo">${t("scan_own")}</button>`);
  },

  today() {
    const { w, d, morning, home, st, rt } = ctx();
    const swing = w.now.temp != null ? Math.round(24 - w.now.temp) : null;
    const insightKey = st.level === "low" ? "ins_low" : `ins_${st.main}`;
    const parts = st.parts.map((p) => p.value == null ? "" : `<div><span>${t("p_" + p.key)}</span><i><b style="width:${Math.round(p.value * 100)}%"></b></i></div>`).join("");
    const after4 = new Date().getHours() >= 16;
    const firstBefore = rt.before.find((s) => s.id !== "lukewarm") || rt.before[0], firstEve = rt.evening[0];
    return page(`${session.weatherSample ? `<div class="banner">${t("weather_off")}</div>` : ""}
      <div class="hello"><div><small>${t("hello")}</small><h2>${!w.place || w.place === "Astana" ? t("today_astana") : t("today_in", { city: esc(w.place) })}</h2></div>${langSwitch()}</div>
      <div class="swing">
        <div class="outside">${snow()}<div class="place">${t("outside")}</div><div class="temp">${deg(w.now.temp)}</div>
          <div class="facts">${t("wind", { x: num(w.now.wind) })}<br>${t("feels", { x: deg(w.now.feels).replace("°", "") })}</div></div>
        <div class="inside"><div class="place">${t("at_home")}</div><div class="temp">+24°</div>
          <div class="facts">${t("heating_on")}<br><b>${t(home.source === "estimate" ? "air_est" : "air", { x: num(home.value) })}</b></div></div>
        ${swing != null ? `<div class="bridge">${HORN()}<b>${swing}°</b><span>${t("swing")}</span></div>` : ""}
      </div>
      <p class="insight"><b>${t(insightKey)}</b></p>
      <div class="panel">
        <div class="row-h"><h3>${t("stress_title")}</h3><span class="chip ${st.level}">${t("lv_" + st.level)}, ${t("of5", { n: st.score })}</span></div>
        <div class="why3">${parts}</div>
        ${morning && after4 && !d.evening ? `<button class="cta" data-go="evening">${t("eve_card")}</button>`
          : `<button class="cta" data-act="scan">${morning ? t("scan_again") : t("scan_btn")}</button>`}
      </div>
      <div class="minis">
        <div style="background:var(--warms)"><small>${t("before_out")}</small><p>${t("st_" + firstBefore.id)}</p></div>
        <div style="background:var(--accs)"><small>${t("tonight")}</small><p>${firstEve ? t("st_" + firstEve.id) : t("st_light_moist")}</p></div>
      </div>`, "today");
  },

  skin() {
    const { morning, p } = ctx();
    if (!morning) return page(`<div class="hello"><div><small>${t("tab_skin")}</small><h2>${t("no_scan")}</h2></div></div>
      <p class="insight" style="margin-top:0">${t("no_scan_t")}</p>${mapBlock(null)}<button class="cta" data-act="scan">${t("scan_btn")}</button>`, "skin");
    const s = morning.scores;
    const note = (k) => k === "redness" ? t("n_hint") : (s[k] != null && s[k] < 50 ? t("n_low") : t("n_ok"));
    const rows = [["moisture", "#7FD3F5"], ["redness", "#E2405F"], ["oiliness", "#C9BEDD"], ["texture", "#F2C38B"]]
      .filter(([k]) => s[k] != null).map(([k, c]) => `<div class="metric"><span><i style="background:${c}"></i>${t("m_" + k)}</span><b>${num(s[k])}</b><em>${note(k)}</em></div>`).join("");
    const hair = morning.frizz != null ? `<div class="metric"><span><i style="background:var(--good)"></i>${t("hair_frizz")}</span><b>${morning.frizz}/3</b><em>${t("frizz_" + morning.frizz)}</em></div>` : "";
    return page(`<div class="hello"><div><small>${t("scanned_at", { time: morning.time })}</small><h2>${t("map_title")}</h2></div></div>
      ${mapBlock(morning, p)}
      <div class="panel" style="padding:4px 18px;margin-top:10px">${rows}${hair}</div>
      <p class="small-note">${t("higher_better")} ${t("redness_note")}</p>
      <button class="eve" data-go="evening"><div><b>${t("eve_card")}</b><span>${t("eve_card_t")}</span></div><em>${t("do_it")}</em></button>
      <button class="linkbtn" data-go="doctor">${t("doc_title")}</button>`, "skin");
  },

  routine() {
    const { d, rt, morning } = ctx();
    const all = [...rt.before, ...rt.evening];
    const done = all.filter((s) => d.done.includes(s.id)).length;
    const step = (s) => `<button class="step${d.done.includes(s.id) ? " done" : ""}" data-done="${s.id}" aria-pressed="${d.done.includes(s.id)}">
      <span class="box">${d.done.includes(s.id) ? "✓" : ""}</span><span><p>${t("st_" + s.id)}</p><span class="because">${because(s.because)}</span></span></button>`;
    const prods = pickProducts(neededTags(rt)).map((p) => `<div class="prod"><div class="jar" style="background:${p.color}"></div>
      <div><p>${esc(p.name[S.lang] || p.name.en)}</p><small>${p.price.toLocaleString("ru-RU")} ₸</small></div>
      <a class="kaspi" href="${kaspiUrl(p.q)}" target="_blank" rel="noopener">${t("kaspi")}</a></div>`).join("");
    const w = session.weather || FALLBACK_WEATHER;
    return page(`<div class="hello"><div><small>${t("rt_done", { d: done, n: all.length })}</small><h2>${t("rt_title")}</h2></div></div>
      ${morning ? "" : `<div class="banner">${t("no_scan_t")}</div>`}
      <div class="when"><h4>${t("before_out")}</h4><span>${deg(w.now.temp)}, ${t("wind", { x: num(w.now.wind) }).toLowerCase()}</span></div>
      ${rt.before.map(step).join("")}
      ${rt.evening.length ? `<div class="when"><h4>${t("eve_home")}</h4><span>${t("air", { x: num(ctx().home.value) }).toLowerCase()}</span></div>${rt.evening.map(step).join("")}` : ""}
      ${prods ? `<div class="when"><h4>${t("fits")}</h4><span>${t("demo_shop")}</span></div>${prods}` : ""}`, "routine");
  },

  evening() {
    const { d, morning, p } = ctx();
    const eve = p ? (d.eveDemo ? { time: "18:40", scores: p.evening, demo: true } : null) : d.evening;
    if (!morning) return page(`<div class="hello"><div><small>${t("eve_card")}</small><h2>${t("eve_title")}</h2></div></div><p class="insight">${t("need_morning")}</p><button class="cta" data-act="scan">${t("scan_btn")}</button>`, "skin");
    if (!eve) return page(`<div class="hello"><div><small>${t("eve_card")}</small><h2>${t("eve_title")}</h2></div></div>
      <p class="insight" style="margin-top:0">${t("eve_card_t")}</p><div class="smap">${miniFace(morning, p, false)}</div>
      <button class="cta" data-act="scan-evening">${t("scan_btn")}</button>`, "skin");
    const c = compare(morning.scores.moisture, eve.scores.moisture);
    const yn = (v) => `<button data-humid="${v}" class="${d.humidifierTonight === v ? "on" : ""}">${t(v ? "yes" : "no")}</button>`;
    return page(`<div class="hello"><div><small>${t("eve_card")}, ${eve.time}</small><h2>${t("eve_title")}</h2></div></div>
      <div class="evc">
        <div class="ec"><div class="ef2">${miniFace(morning, p, false)}</div><b>${num(morning.scores.moisture)}</b><span>${t("morning", { time: morning.time })}</span></div>
        <div class="ed">${c.delta > 0 ? "+" : c.delta < 0 ? "−" : ""}${Math.abs(c.delta)}</div>
        <div class="ec"><div class="ef2 b">${miniFace(eve, p, true)}</div><b class="${c.delta < 0 ? "lo" : ""}">${num(eve.scores.moisture)}</b><span>${t("evening", { time: eve.time })}</span></div>
      </div>
      <div class="panel" style="margin-top:12px"><h3>${t("real_t")}</h3><p class="muted" style="margin-top:6px">${t(c.real ? "real_yes" : "real_no", { d: Math.abs(c.delta) })}</p></div>
      <div class="panel" style="margin-top:10px"><h3>${t("q_humid_tonight")}</h3><div class="yn">${yn(true)}${yn(false)}</div></div>
      <button class="cta" data-act="save-evening">${t("save_log")}</button>`, "skin");
  },

  week() {
    const w = session.weather || FALLBACK_WEATHER;
    const color = { hard: "var(--alert)", care: "var(--warm)", gentle: "var(--good)" };
    const strip = w.days.map((x, i) => `<div class="d${i === 0 ? " now" : ""}"><small>${wd(x.date)}</small><b>${num(x.tmin).replace("-", "−")}</b><i style="background:${color[dayClass(x)]}"></i></div>`).join("");
    const plan = weekPlan(w.days).map((p) => {
      if (p.type === "hardest") return planRow(wd(p.day), deg(p.tmin), t("pl_hardest"), t("pl_hardest_t", { tmin: deg(p.tmin).replace("°", ""), wind: num(p.wind) }));
      if (p.type === "calm_night") return planRow(wd(p.day), t("evening_l"), t("pl_calm"), t("pl_calm_t", { day: wd(p.before, "long") }));
      return planRow(wd(p.day), deg(p.tmin), t("pl_mask"), t("pl_mask_t"));
    }).join("");
    return page(`<div class="hello"><div><small>${t("forecast", { city: esc(city(w)) })}</small><h2>${t("week_title")}</h2></div></div>
      <div class="strip">${strip}</div>
      <div class="legend"><span><i style="background:var(--alert)"></i>${t("hard")}</span><span><i style="background:var(--warm)"></i>${t("care")}</span><span><i style="background:var(--good)"></i>${t("gentle")}</span></div>
      ${plan}<button class="pv" data-go="numbers">${t("see_numbers")}</button>`, "week");
  },

  numbers() {
    const h = S.demo ? sampleHistory() : S.history;
    const wn = winterNumbers(h);
    return page(`<div class="hello"><div><small>${t("num_scans", { n: wn.n })}</small><h2>${t("num_title")}</h2></div></div>
      <div class="panel"><h3>${t("num_chart")}</h3><p class="muted" style="margin-top:4px">${t("num_dots")}</p>${scatter(h)}</div>
      <div class="facts2">
        <div class="panel"><b class="disp">${wn.coldDelta == null ? "–" : (wn.coldDelta > 0 ? "+" : "−") + Math.abs(wn.coldDelta)}</b><span>${wn.coldDelta == null ? t("num_need") : t("num_cold")}</span></div>
        <div class="panel"><b class="disp">${wn.humidifierDelta == null ? "–" : (wn.humidifierDelta >= 0 ? "+" : "−") + Math.abs(wn.humidifierDelta)}</b><span>${wn.humidifierDelta == null ? t("num_need") : t("num_hum")}</span></div>
      </div><p class="small-note">${t("num_note")}</p>`, "week");
  },

  doctor() {
    return page(`<div class="hello"><div><small>${t("not_medical")}</small><h2>${t("doc_title")}</h2></div></div>
      <p class="insight" style="margin-top:0">${t("doc_lead")}</p>
      <div class="panel signs">${[1, 2, 3, 4, 5].map((i) => `<div class="sign"><i></i><p>${t("sign" + i)}</p></div>`).join("")}</div>
      <div class="panel" style="margin-top:10px;background:var(--alerts)"><h3 style="color:var(--alert)">${t("doc_notice")}</h3><p class="muted" style="margin-top:6px">${t("doc_notice_t")}</p></div>
      <a class="cta ghost" style="text-decoration:none" href="https://2gis.kz/astana/search/%D0%B4%D0%B5%D1%80%D0%BC%D0%B0%D1%82%D0%BE%D0%BB%D0%BE%D0%B3" target="_blank" rel="noopener">${t("doc_find")}</a>`, "me");
  },

  me() {
    const pr = S.profile, home = homeRH(pr, (session.weather || FALLBACK_WEATHER).now);
    const heat = { central: "h_central", gas: "h_gas", unsure: "h_unsure" }[pr.heating];
    const langName = LANGS.find(([c]) => c === S.lang)[1];
    return page(`<div class="hello"><div><small>${esc(city(session.weather || FALLBACK_WEATHER))}</small><h2>${t("me_title")}</h2></div></div>
      <div class="panel melist">
        <button class="mrow" data-go="home"><p>${t("my_home")}</p><span>${t("heating", { h: t(heat), rh: num(home.value) })}</span></button>
        <button class="mrow" data-act="cycle-lang"><p>${t("language")}</p><span>${langName}</span></button>
        <button class="mrow" data-go="numbers"><p>${t("my_scans")}</p><span>${S.history.length}</span></button>
        <button class="mrow" data-act="ics"><p>${t("add_reminders")}</p><span>7:30, 18:30</span></button>
        <button class="mrow" data-act="toggle-demo"><p>${t("demo_mode")}</p><span>${S.demo ? t("on") + ": " + esc(person().name) : t("off")}</span></button>
      </div>
      <div class="panel melist" style="margin-top:10px">
        <button class="mrow" data-go="doctor"><p>${t("doc_title")}</p><span>›</span></button>
        <button class="mrow" data-act="how"><p>${t("how_works")}</p><span>›</span></button>
        <div id="how" hidden><p class="muted" style="padding:0 0 12px">${t("how_t")}</p></div>
        <button class="mrow" data-act="delete"><p style="color:var(--alert)">${session.deleteArmed ? t("delete_confirm") : t("delete_data")}</p><span></span></button>
      </div>
      <div class="madeby">${HORN(40, 24, "#8E83C0")}<p>${t("made_by")}<br>${t("not_medical")}</p></div>`, "me");
  },
};

/* ---------------- screen parts ---------------- */
function because(b) {
  const p = { ...b };
  if (p.feels != null) p.feels = deg(p.feels).replace("°", "");
  if (p.tmin != null) p.tmin = deg(p.tmin).replace("°", "");
  return t("b_" + b.key, p);
}
function planRow(dayName, sub, title, text) {
  return `<div class="plan"><div class="day">${esc(dayName)}<small>${esc(sub)}</small></div><div><p>${title}</p><span>${text}</span></div></div>`;
}
function intensities(scores) {
  return { dryness: scores?.moisture != null ? (100 - scores.moisture) / 100 : 0, redness: scores?.redness != null ? (100 - scores.redness) / 100 : 0 };
}
function miniFace(scan, p, evening) {
  const look = p || { skin: "#E9C3A6", hair: "#2B1E1C", sweater: "#8E83C0" };
  const i = intensities(scan?.scores);
  return faceSVG({ ...look, dryness: evening ? Math.min(1, i.dryness + 0.05) : i.dryness, redness: i.redness });
}
function mapBlock(scan, p) {
  // Live scan with the photo still in memory: show the user's photo with YouCam's masks.
  if (scan && !scan.demo && session.photo) {
    const layers = Object.keys(session.masks);
    const mask = session.masks[session.mapLayer]?.[0];
    return `<div class="photo-map"><span class="maptag"><i></i>${t("m_" + session.mapLayer)}</span><img src="${session.photo}" alt="">
      ${mask ? `<img class="mask" src="${esc(mask)}" alt="">` : ""}</div>
      ${layers.length ? `<div class="mapbtns">${layers.map((k) => `<button data-layer="${k}" class="${k === session.mapLayer ? "on" : ""}">${t("m_" + k)}</button>`).join("")}</div>` : ""}`;
  }
  const look = p || { skin: "#E9C3A6", hair: "#2B1E1C", sweater: "#8E83C0" };
  const i = intensities(scan?.scores);
  const labels = scan ? { dry: [t("m_moisture"), num(scan.scores.moisture)], red: [t("m_redness"), `${num(scan.scores.redness)}, ${t("n_hint").toLowerCase()}`] } : false;
  return `<div class="smap">${faceSVG({ ...look, ...i, labels })}</div>`;
}
function scatter(h) {
  const pts = (h || []).filter((x) => x.moisture != null && x.tmin != null);
  const X = (v) => 20 + ((v + 30) / 30) * 300, Y = (m) => 150 - ((m - 30) / 30) * 130;
  let line = "";
  if (pts.length >= 3) {
    const n = pts.length, mx = pts.reduce((s, p) => s + p.tmin, 0) / n, my = pts.reduce((s, p) => s + p.moisture, 0) / n;
    const b = pts.reduce((s, p) => s + (p.tmin - mx) * (p.moisture - my), 0) / (pts.reduce((s, p) => s + (p.tmin - mx) ** 2, 0) || 1);
    const a = my - b * mx;
    line = `<path d="M${X(-30)} ${Y(a + b * -30)} L${X(0)} ${Y(a)}" stroke="#B5455F" stroke-width="2.5" stroke-dasharray="6 5" stroke-linecap="round"/>`;
  }
  return `<svg viewBox="0 0 340 180" width="100%" style="margin-top:8px" role="img" aria-label="${t("num_chart")}">
    <line x1="20" y1="150" x2="330" y2="150" stroke="#E0DDEA" stroke-width="1.5"/><line x1="20" y1="20" x2="20" y2="150" stroke="#E0DDEA" stroke-width="1.5"/>
    ${line}${pts.map((p) => `<circle cx="${X(Math.max(-30, Math.min(0, p.tmin))).toFixed(0)}" cy="${Y(Math.max(30, Math.min(60, p.moisture))).toFixed(0)}" r="5" fill="#8E83C0" opacity=".85"/>`).join("")}
    <g font-family="Onest, sans-serif" font-size="11" fill="#9A94AE"><text x="20" y="168">−30°</text><text x="306" y="168">0°</text><text x="26" y="30">${t("m_moisture").toLowerCase()}</text></g></svg>`;
}

/* ---------------- camera ---------------- */
const SHOTS = { face: ["s_face", "look_front"], front: ["s_front", "look_front"], right: ["s_right", "turn_right"], left: ["s_left", "turn_left"] };
let cam = { stream: null, timer: null, mode: "morning", step: "face" };

function cameraScreen(step) {
  const order = ["face", "front", "right", "left"];
  const chips = order.map((k) => `<span class="${k === step ? "on" : order.indexOf(k) < order.indexOf(step) ? "done" : ""}">${t(SHOTS[k][0])}</span>`).join("");
  const isHair = step !== "face";
  return `<section class="cam">
    <div class="camtop"><span>${isHair ? t("hair_title") : t("face_scan")}</span><b id="camtitle">${t(SHOTS[step][1])}</b></div>
    <div class="viewport"><video id="video" class="mirror" playsinline muted autoplay></video><div class="oval" id="oval"></div>
      ${isHair ? `<div class="camhint">${t("hats_off")}</div>` : ""}</div>
    <div class="lightbox" aria-live="polite"><div class="row-h"><span>${t("light")}</span><b id="lightlabel">…</b></div><div class="lb"><i id="lightbar" style="width:0"></i></div>
      <p id="lightnote">${t("photo_private")}</p></div>
    ${cam.mode === "morning" ? `<div class="steps3">${chips}</div>` : ""}
    <div class="camactions">
      <label class="linkbtn" style="text-align:left;cursor:pointer">${t("upload_photo")}<input type="file" accept="image/*" id="filepick" hidden></label>
      <button class="shutter" id="shutter" aria-label="${t("take_photo")}" data-act="shoot"></button>
      ${isHair ? `<button class="linkbtn" style="text-align:right" data-act="skip-hair">${t("skip_hair")}</button>` : `<button class="linkbtn" style="text-align:right" data-act="cancel-scan">${t("back")}</button>`}</div>
  </section>`;
}

async function startCamera() {
  stopCamera();
  const video = document.getElementById("video");
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    video.srcObject = cam.stream;
    await video.play().catch(() => {});
    const c = document.createElement("canvas"); c.width = 48; c.height = 48;
    const g = c.getContext("2d", { willReadFrequently: true });
    cam.timer = setInterval(() => {
      if (!video.videoWidth) return;
      const s = Math.min(video.videoWidth, video.videoHeight) * 0.4;
      g.drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, 48, 48);
      const d = g.getImageData(0, 0, 48, 48).data;
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      showLight(sum / (d.length / 4));
    }, 350);
  } catch {
    document.getElementById("lightnote").textContent = t("cam_denied");
    document.getElementById("lightlabel").textContent = "";
  }
}
function showLight(luma) {
  const state = luma < 55 ? "dark" : luma > 215 ? "bright" : "good";
  const bar = document.getElementById("lightbar"), lab = document.getElementById("lightlabel"), oval = document.getElementById("oval"), shutter = document.getElementById("shutter");
  if (!bar) return;
  bar.style.width = `${Math.round((luma / 255) * 100)}%`;
  bar.style.background = state === "good" ? "#86CDA8" : "#FFB4A6";
  lab.textContent = t(state === "good" ? "good" : state === "dark" ? "too_dark" : "too_bright");
  lab.style.color = state === "good" ? "#86CDA8" : "#FFB4A6";
  oval.className = `oval ${state === "good" ? "ok" : "bad"}`;
  shutter.disabled = state !== "good";
  if (state === "dark") document.getElementById("lightnote").textContent = t("dark_note");
  else document.getElementById("lightnote").textContent = t("photo_private");
}
function stopCamera() {
  clearInterval(cam.timer); cam.timer = null;
  if (cam.stream) cam.stream.getTracks().forEach((tr) => tr.stop());
  cam.stream = null;
}

/** Crop the centre to a 3:4 portrait and export a JPEG (short side 720 px, within YouCam SD limits). */
function toJpeg(source, sw, sh) {
  const h = sh, w = Math.min(sw, Math.round(sh * 0.75));
  const c = document.createElement("canvas"); c.width = 720; c.height = 960;
  c.getContext("2d").drawImage(source, (sw - w) / 2, 0, w, h, 0, 0, 720, 960);
  return c.toDataURL("image/jpeg", 0.86);
}
function grabFrame() {
  const v = document.getElementById("video");
  return v && v.videoWidth ? toJpeg(v, v.videoWidth, v.videoHeight) : null;
}
function readFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(toJpeg(img, img.naturalWidth, img.naturalHeight));
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function busy(text) {
  const el = document.createElement("div");
  el.className = "busy"; el.id = "busy"; el.setAttribute("role", "status");
  el.innerHTML = `<div class="spinner"></div><p>${text}</p>`;
  document.body.appendChild(el);
  return () => el.remove();
}
const ERR = { error_lighting_dark: "err_dark", error_src_face_too_small: "err_small", error_src_face_out_of_bound: "err_bound", error_no_face: "err_noface", error_pose: "err_pose", no_key: "err_nokey" };
const errText = (code) => t(ERR[code] || "err_generic");

async function runTask(feature, fileIds) {
  const { task_id } = await api("/api/task", { feature, file_ids: fileIds });
  for (let i = 0; i < 40; i++) {
    await sleep(i < 2 ? 2000 : 2500);
    const r = await api(`/api/task?feature=${feature}&id=${encodeURIComponent(task_id)}`);
    if (r.status === "success") return r;
    if (r.status === "error") throw Object.assign(new Error(r.message || r.error), { code: r.error });
  }
  throw Object.assign(new Error("timeout"), { code: "timeout" });
}

async function handleShot(dataUrl) {
  if (!dataUrl) return;
  const step = cam.step;
  if (step === "face") {
    stopCamera();
    const done = busy(t("analyzing"));
    try {
      const { file_id } = await api("/api/upload", { image: dataUrl });
      const r = await runTask("skin-analysis", [file_id]);
      session.photo = dataUrl; session.masks = r.masks || {};
      session.mapLayer = session.masks.moisture ? "moisture" : Object.keys(session.masks)[0] || "moisture";
      const d = day(), w = session.weather || FALLBACK_WEATHER;
      const rec = { time: timeNow(), scores: r.scores, frizz: d.morning?.frizz ?? null };
      if (cam.mode === "evening") { d.evening = rec; save(); done(); return go("evening"); }
      d.morning = rec;
      S.history = S.history.filter((x) => x.date !== d.date).concat({ date: d.date, moisture: r.scores.moisture ?? null, tmin: w.days[0]?.tmin ?? w.now.temp, humidifierNight: d.prevHumidifier });
      save(); done();
      cam.step = "front"; session.hairShots = []; render("camera");
    } catch (e) { done(); toast(errText(e.code)); render("camera"); }
    return;
  }
  session.hairShots.push(dataUrl);
  const next = { front: "right", right: "left", left: null }[step];
  if (next) { cam.step = next; render("camera"); return; }
  stopCamera();
  const done = busy(t("analyzing_hair"));
  try {
    const ids = [];
    for (const shot of session.hairShots) ids.push((await api("/api/upload", { image: shot })).file_id);
    const r = await runTask("hair-frizziness-detection", ids); // order: front, right, left
    const d = day(); if (d.morning) d.morning.frizz = r.frizz; save();
    done(); go("skin");
  } catch (e) { done(); toast(errText(e.code)); go("skin"); }
}

/* ---------------- calendar reminders (.ics) ---------------- */
function icsFile() {
  const d = new Date(); const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
  const ev = (uid, hm, title) => `BEGIN:VEVENT\r\nUID:${uid}-${ymd}@aua\r\nDTSTAMP:${ymd}T000000Z\r\nDTSTART;TZID=Asia/Almaty:${ymd}T${hm}00\r\nDURATION:PT10M\r\nRRULE:FREQ=DAILY\r\nSUMMARY:${title}\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:${title}\r\nTRIGGER:PT0M\r\nEND:VALARM\r\nEND:VEVENT\r\n`;
  const body = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Aua//EN\r\n${ev("morning", "0730", `Aua: ${t("tog_morning")}`)}${ev("evening", "1830", `Aua: ${t("tog_evening")}`)}END:VCALENDAR\r\n`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
  a.download = "aua-reminders.ics"; a.click();
}

/* ---------------- router & events ---------------- */
let current = null;
function go(name) { location.hash = `#/${name}`; }
function render(name) {
  if (name !== "camera") stopCamera();
  current = name;
  if (name === "camera") { $app.innerHTML = cameraScreen(cam.step); startCamera(); return; }
  const fn = screens[name] || screens.today;
  $app.innerHTML = fn();
  document.documentElement.lang = S.lang === "kk" ? "kk" : S.lang;
  window.scrollTo(0, 0);
}
function route() {
  const name = (location.hash.replace(/^#\//, "") || (S.onboarded || S.demo ? "today" : "welcome")).split("?")[0];
  render(name);
}

function startScan(mode) {
  cam.mode = mode; cam.step = "face";
  if (S.demo) {
    const done = busy(t("analyzing"));
    setTimeout(() => { done(); const d = day(); if (mode === "evening") { d.eveDemo = true; save(); go("evening"); } else go("skin"); }, 1200);
    return;
  }
  if (!session.live) { toast(t("err_nokey")); go("demo"); return; }
  go("camera");
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-go],[data-act],[data-lang],[data-set],[data-hygro],[data-demo],[data-done],[data-layer],[data-humid]");
  if (!el) return;
  const ds = el.dataset;
  if (ds.go) return go(ds.go);
  if (ds.lang) { S.lang = ds.lang; t = makeT(S.lang); save(); return render(current); }
  if (ds.set) { const [k, v] = ds.set.split(":"); S.profile[k] = v; save(); return render(current); }
  if (ds.hygro) { S.profile.hasHygro = ds.hygro === "1"; save(); return render(current); }
  if (ds.demo) { S.demo = ds.demo; S.onboarded = true; save(); return go("today"); }
  if (ds.done) { const d = day(); d.done = d.done.includes(ds.done) ? d.done.filter((x) => x !== ds.done) : [...d.done, ds.done]; save(); return render(current); }
  if (ds.layer) { session.mapLayer = ds.layer; return render(current); }
  if (ds.humid) { day().humidifierTonight = ds.humid === "true"; save(); return render(current); }
  switch (ds.act) {
    case "finish-onboarding": S.onboarded = true; save(); return startScan("morning");
    case "leave-demo": S.demo = null; save(); return S.onboarded ? startScan("morning") : go("home");
    case "scan": return startScan("morning");
    case "scan-evening": return startScan("evening");
    case "cancel-scan": stopCamera(); return go("today");
    case "skip-hair": stopCamera(); return go("skin");
    case "shoot": return handleShot(grabFrame());
    case "save-evening": save(); toast(t("saved")); return go("today");
    case "toggle-demo": S.demo = S.demo ? null : PEOPLE[0].id; save(); return render(current);
    case "cycle-lang": { const i = LANGS.findIndex(([c]) => c === S.lang); S.lang = LANGS[(i + 1) % LANGS.length][0]; t = makeT(S.lang); save(); return render(current); }
    case "how": { const h = document.getElementById("how"); h.hidden = !h.hidden; return; }
    case "ics": return icsFile();
    case "delete":
      if (!session.deleteArmed) { session.deleteArmed = true; render(current); setTimeout(() => { session.deleteArmed = false; }, 5000); return; }
      try { localStorage.removeItem(KEY); localStorage.removeItem("aua.weather"); } catch {}
      S = defaults(); t = makeT(S.lang); session.photo = null; session.masks = {}; session.deleteArmed = false;
      toast(t("deleted")); return go("welcome");
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "hygro") { S.profile.hygrometer = Number(e.target.value); document.getElementById("hygv").textContent = `${e.target.value}%`; save(); }
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "filepick" && e.target.files[0]) handleShot(await readFile(e.target.files[0]));
});
window.addEventListener("hashchange", route);

/* ---------------- start ---------------- */
(async () => {
  await Promise.all([loadWeather(), loadHealth()]);
  route();
})();
