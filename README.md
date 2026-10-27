# Aua: skin care for cold days

Aua checks your skin, today's frost and the dry air in your home, then turns them into one short morning routine.
Built for the **YouCam API Skin AI & eCommerce VTO Hackathon** (Devpost, 2026).

> In Astana it can be −27° outside. Heated to +24° indoors, that same air has a relative humidity of about 2%. Skin goes through that swing twice a day, all winter, and no skincare app accounts for it.

## What it does

| Screen | What happens |
|---|---|
| **Scan** | Takes a face photo in the browser (with a light meter and a framing guide), then sends it to **YouCam Skin Analysis**. Moisture, redness, oiliness, texture, pores and radiance come back with mask overlays. Optional: 3 hair photos for **YouCam Hair Frizziness**. |
| **Today** | Live Astana weather from Open-Meteo, plus an estimate of the humidity at home (Magnus formula, or your hygrometer reading). A 1–5 skin-stress score combines wind, frost, dry air at home and your moisture score. |
| **Routine** | Steps for "before you go out" and "evening at home". Every step says *why*: "because wind 9 m/s, redness 63". Below them are products matched to what the routine needs, each linking to a Kaspi.kz search. |
| **Evening** | A second scan in the evening. Morning vs evening, with a noise threshold so tiny changes aren't oversold. |
| **Week** | 7-day forecast: the hardest day, a calm night for actives and a good day for a mask. |
| **Numbers** | Your own scans plotted against the temperature outside. |
| **Doctor** | When to see a dermatologist instead of buying another cream. |
| **Demo** | Three sample people, for judges without a camera or a key. |

Languages: English, Русский, Қазақша.
Photos are never stored: only scores stay on the device, in localStorage.

## YouCam APIs used

- `POST /s2s/v2.0/file`: upload (the image is PUT to the returned URL)
- `POST /s2s/v2.0/task/skin-analysis`: 6 SD concerns + `enable_mask_overlay`
- `POST /s2s/v2.0/task/hair-frizziness-detection`: front, right and left photos
- `GET /s2s/v2.0/task/{feature}/{id}`: polling

The API key stays on the server (`/api/*` serverless functions) and never reaches the browser.

## Project layout

```
index.html, styles.css, icon.svg   static app (no build step)
js/app.js      screens, camera, routing
js/rules.js    weather → stress → routine logic (pure, tested)
js/i18n.js     en / ru / kk strings
js/face.js     illustrated face for demo mode
js/data.js     product list, demo people, sample weather
api/           Vercel functions: upload, task, weather, health
tools/dev-server.mjs   local server (+ --mock mode, no key needed)
test/          node:test
```

## Run locally

```bash
npm test                       # 17 tests
npm run dev -- --mock          # http://localhost:3000, fake YouCam + weather
YOUCAM_API_KEY=... npm run dev # real API
```

## Deploy from an iPad (no terminal needed)

1. **GitHub**: create a new repository, *Add file → Upload files*, and drag in the unzipped folder contents (not the folder itself). Commit.
2. **Vercel**: vercel.com → *Add New → Project* → import the repository. Framework preset: **Other**. Leave Build Command empty. Deploy.
3. **Key**: Vercel → Project → *Settings → Environment Variables*
   - `YOUCAM_API_KEY` = your key from the YouCam API console
   - optional `AUA_DEBUG_RAW` = `1` to see the raw YouCam JSON in responses
   Then *Deployments → ⋯ → Redeploy*.
4. Open the site in Safari, allow the camera, and run one scan. Without a key the app opens in demo mode.

The hackathon gives 1,000 free units after Devpost registration: redeem the code in the YouCam console.
Prices: 6 skin concerns = 12 units, hair frizziness = 2 units, so about 70 full scans.

## Before submission: check

- [ ] Kazakh text: have a native speaker check it.
- [ ] The "When to see a dermatologist" text: have a dermatologist check it.
- [ ] Noise threshold (`NOISE = 4` in `js/rules.js`): calibrate it by scanning twice in a row under the same light; the threshold should be bigger than the gap you see.
- [ ] Demo people (`js/data.js`): replace the sample scores with real saved YouCam outputs, or keep the "sample" label.
- [ ] Hair photos order: front, right, left.

## Limits (said plainly)

- Home humidity is an *estimate* unless you enter a hygrometer reading.
- The stress score is a heuristic, not a medical measurement.
- Aua gives care tips. It does not diagnose.
