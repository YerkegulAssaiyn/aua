// Local server: static files + /api/* routes, same handlers as on Vercel.
//   node tools/dev-server.mjs          real YouCam + Open-Meteo (needs YOUCAM_API_KEY)
//   node tools/dev-server.mjs --mock   fake YouCam and weather, for offline testing
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const PORT = Number(process.env.PORT) || 3000;
const MOCK = process.argv.includes("--mock");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

// Mock masks: a coloured oval where a face would be, so the layer buttons can be tested offline.
const MOCK_MASK = (c) => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 4"><ellipse cx="1.5" cy="1.8" rx=".8" ry="1.05" fill="${c}"/></svg>`);
if (MOCK) {
  process.env.YOUCAM_API_KEY = process.env.YOUCAM_API_KEY || "mock";
  let n = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
    if (u.includes("open-meteo")) {
      const days = [[-16, -9, 10], [-21, -14, 8], [-27, -19, 12], [-18, -11, 6], [-9, -4, 4], [-6, -2, 3], [-11, -6, 5]];
      const start = new Date();
      return reply({
        current: { temperature_2m: -14, relative_humidity_2m: 78, apparent_temperature: -23, wind_speed_10m: 9, uv_index: 0.8, time: start.toISOString().slice(0, 16) },
        daily: {
          time: days.map((_, i) => new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10)),
          temperature_2m_min: days.map((d) => d[0]), temperature_2m_max: days.map((d) => d[1]),
          wind_speed_10m_max: days.map((d) => d[2]), uv_index_max: days.map(() => 1),
        },
      });
    }
    if (u.endsWith("/s2s/v2.0/file")) return reply({ data: { files: [{ file_id: `F${++n}`, requests: [{ url: "https://mock-upload/put", method: "PUT", headers: { "Content-Type": "image/jpeg" } }] }] } });
    if (u.includes("mock-upload")) return new Response("", { status: 200 });
    if (u.includes("/task/") && init.method === "POST") return reply({ data: { task_id: `T${++n}` } });
    if (u.includes("/task/skin-analysis/")) return reply({ data: { task_status: "success", results: { output: [
      { type: "moisture", ui_score: 41, mask_urls: [MOCK_MASK("#7FD3F5")] }, { type: "redness", ui_score: 63, mask_urls: [MOCK_MASK("#E2405F")] },
      { type: "oiliness", ui_score: 72, mask_urls: [MOCK_MASK("#F2C38B")] }, { type: "texture", ui_score: 66, mask_urls: [MOCK_MASK("#8E83C0")] },
      { type: "pore", ui_score: 70, mask_urls: [MOCK_MASK("#5F9479")] }, { type: "radiance", ui_score: 58, mask_urls: [MOCK_MASK("#FFFFFF")] },
    ] } } });
    if (u.includes("/task/hair-frizziness-detection/")) return reply({ data: { task_status: "success", results: { hair_frizziness: { mapping: 2, term: "Frizzy" } } } });
    return realFetch(url, init);
  };
}

async function toRequest(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5).replace(/[^a-z-]/g, "");
      const mod = await import(join(ROOT, "api", `${name}.js`));
      const handler = mod[req.method];
      if (!handler) { res.writeHead(405).end(); return; }
      const out = await handler(await toRequest(req));
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }
    let path = join(ROOT, decodeURIComponent(url.pathname));
    if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if ((await stat(path).catch(() => null))?.isDirectory()) path = join(path, "index.html");
    const data = await readFile(path);
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    res.writeHead(e.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain" }).end(String(e.message));
  }
}).listen(PORT, () => console.log(`Aua on http://localhost:${PORT}${MOCK ? " (mock mode)" : ""}`));
