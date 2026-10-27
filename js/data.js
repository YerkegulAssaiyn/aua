// Demo shop and sample people. Prices and products are illustrative (demo shop).

export const PRODUCTS = [
  { id: "ceramide", name: { en: "Ceramide barrier cream", ru: "Крем с церамидами", kk: "Церамидті қорғаныш крем" }, price: 6900, tags: ["barrier"], color: "#E4E0F2", q: "крем с церамидами" },
  { id: "glycerin", name: { en: "Glycerin serum", ru: "Сыворотка с глицерином", kk: "Глицеринді сарысу" }, price: 4500, tags: ["humectant"], color: "#FBEDDC", q: "сыворотка глицерин гиалуроновая" },
  { id: "balm", name: { en: "Lip balm", ru: "Бальзам для губ", kk: "Ерін бальзамы" }, price: 1900, tags: ["lip"], color: "#F6E1E6", q: "бальзам для губ" },
  { id: "leavein", name: { en: "Anti-static leave-in", ru: "Несмываемый кондиционер", kk: "Жуылмайтын кондиционер" }, price: 3800, tags: ["antistatic"], color: "#E1EEE7", q: "несмываемый кондиционер для волос" },
  { id: "cleanser", name: { en: "Gentle cream cleanser", ru: "Мягкое кремовое умывание", kk: "Жұмсақ кремді жуғыш" }, price: 4200, tags: ["gentle_cleanser"], color: "#EEEDF3", q: "мягкое умывание для сухой кожи" },
  { id: "spf", name: { en: "SPF 50 cream", ru: "Крем SPF 50", kk: "SPF 50 крем" }, price: 5600, tags: ["spf"], color: "#FBEDDC", q: "солнцезащитный крем spf 50" },
];

export const kaspiUrl = (q) => `https://kaspi.kz/shop/search/?text=${encodeURIComponent(q)}`;

export function pickProducts(tags, max = 3) {
  return PRODUCTS.filter((p) => p.tags.some((t) => tags.includes(t))).slice(0, max);
}

// Drawn sample people with example scores. Not real YouCam output.
export const PEOPLE = [
  { id: "aigerim", name: "Aigerim", skin: "#F1D3BE", hair: "#3B2B26", sweater: "#8E83C0",
    desc: { en: "Dry skin, wavy hair", ru: "Сухая кожа, волнистые волосы", kk: "Құрғақ тері, толқынды шаш" },
    scores: { moisture: 41, redness: 63, oiliness: 72, texture: 66, pore: 70, radiance: 58 }, frizz: 2,
    evening: { moisture: 35, redness: 60, oiliness: 70, texture: 64, pore: 69, radiance: 55 } },
  { id: "dana", name: "Dana", skin: "#C99A78", hair: "#231A17", sweater: "#C9739A",
    desc: { en: "Oily skin, straight hair", ru: "Жирная кожа, прямые волосы", kk: "Майлы тері, тік шаш" },
    scores: { moisture: 58, redness: 71, oiliness: 48, texture: 62, pore: 55, radiance: 64 }, frizz: 1,
    evening: { moisture: 55, redness: 70, oiliness: 47, texture: 62, pore: 55, radiance: 62 } },
  { id: "malika", name: "Malika", skin: "#8A5A44", hair: "#1A1211", sweater: "#F2C38B",
    desc: { en: "Combination skin, curly hair", ru: "Комбинированная кожа, кудрявые волосы", kk: "Аралас тері, бұйра шаш" },
    scores: { moisture: 47, redness: 68, oiliness: 60, texture: 61, pore: 63, radiance: 60 }, frizz: 3,
    evening: { moisture: 41, redness: 66, oiliness: 59, texture: 60, pore: 62, radiance: 58 } },
];

// Used only when the weather service can't be reached.
export const FALLBACK_WEATHER = (() => {
  const d = new Date();
  const days = [[-16, -9, 10], [-21, -14, 8], [-27, -19, 12], [-18, -11, 6], [-9, -4, 4], [-6, -2, 3], [-11, -6, 5]];
  return {
    place: "Astana", sample: true,
    now: { temp: -14, rh: 78, feels: -23, wind: 9, uv: 0.8 },
    days: days.map(([tmin, tmax, wind], i) => ({ date: new Date(d.getTime() + i * 864e5).toISOString().slice(0, 10), tmin, tmax, wind, uv: 1 })),
  };
})();

// Example scan history for demo mode, so "Winter in numbers" has something to show.
export function sampleHistory() {
  const rows = [[-6, 49, true], [-9, 47, true], [-11, 46, true], [-14, 44, false], [-14, 41, false], [-18, 42, true], [-21, 39, false], [-21, 40, false], [-24, 37, false], [-27, 36, false], [-9, 48, true], [-17, 43, true]];
  const now = Date.now();
  return rows.map(([tmin, moisture, humidifierNight], i) => ({ date: new Date(now - (rows.length - i) * 864e5).toISOString().slice(0, 10), tmin, moisture, humidifierNight, sample: true }));
}
