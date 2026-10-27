import test from "node:test";
import assert from "node:assert/strict";

process.env.YOUCAM_API_KEY = "sk-test";
const yc = await import("../api/_youcam.js");
const weather = await import("../api/weather.js");

function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    for (const [match, reply] of routes) {
      if (url.includes(match) && (!reply.method || reply.method === (init.method || "GET"))) {
        return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
      }
    }
    return new Response("{}", { status: 404 });
  };
  f.calls = calls;
  return f;
}

test("upload: init, then PUT bytes to the pre-signed URL with YouCam's headers", async () => {
  const f = fakeFetch([
    ["/s2s/v2.0/file", { method: "POST", body: { status: 200, data: { files: [{ file_id: "F1", requests: [{ url: "https://s3.example/put", method: "PUT", headers: { "Content-Type": "image/jpeg", "Content-Length": 3 } }] }] } } }],
    ["s3.example/put", { method: "PUT", body: {} }],
  ]);
  const id = await yc.uploadImage(Buffer.from([1, 2, 3]), "image/jpeg", f);
  assert.equal(id, "F1");
  const init = JSON.parse(f.calls[0].init.body);
  assert.deepEqual(init.files[0], { content_type: "image/jpeg", file_name: "scan.jpg", file_size: 3 });
  assert.equal(f.calls[0].init.headers.Authorization, "Bearer sk-test");
  assert.equal(f.calls[1].init.method, "PUT");
  assert.equal(f.calls[1].init.headers["Content-Type"], "image/jpeg");
  assert.ok(!("Content-Length" in f.calls[1].init.headers));
});

test("skin task body uses SD actions only", async () => {
  const f = fakeFetch([["/task/skin-analysis", { method: "POST", body: { data: { task_id: "T1" } } }]]);
  assert.equal(await yc.startTask("skin-analysis", ["F1"], f), "T1");
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.src_file_id, "F1");
  assert.ok(body.dst_actions.every((a) => !a.startsWith("hd_")));
  assert.equal(body.format, "json");
});

test("hair frizz needs exactly three photos", async () => {
  await assert.rejects(() => yc.startTask("hair-frizziness-detection", ["a"], fakeFetch([])), /3 photo/);
  const f = fakeFetch([["/task/hair-frizziness-detection", { method: "POST", body: { data: { task_id: "H1" } } }]]);
  assert.equal(await yc.startTask("hair-frizziness-detection", ["a", "b", "c"], f), "H1");
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { src_file_ids: ["a", "b", "c"] });
});

test("normalize skin + hair results and errors", () => {
  const skin = yc.normalize("skin-analysis", { data: { task_status: "success", results: { output: [
    { type: "moisture", ui_score: 41, raw_score: 38.2, mask_urls: ["https://m/1.png"] },
    { type: "redness", ui_score: 63, raw_score: 60.1, mask_urls: [] },
    { type: "resize_image", mask_urls: ["https://m/base.jpg"] },
  ] } } });
  assert.equal(skin.base, "https://m/base.jpg");
  assert.deepEqual(skin.scores, { moisture: 41, redness: 63 });
  assert.deepEqual(skin.masks, { moisture: ["https://m/1.png"] });
  const hair = yc.normalize("hair-frizziness-detection", { data: { task_status: "success", results: { hair_frizziness: { mapping: 2, term: "Frizzy" } } } });
  assert.equal(hair.frizz, 2);
  const err = yc.normalize("skin-analysis", { data: { task_status: "error", error: "error_lighting_dark" } });
  assert.equal(err.error, "error_lighting_dark");
});

test("API errors surface the YouCam error code", async () => {
  const f = fakeFetch([["/task/skin-analysis", { method: "POST", status: 400, body: { error_code: "InvalidParameters", message: "cannot mix HD and SD dst_actions" } }]]);
  await assert.rejects(() => yc.startTask("skin-analysis", ["F1"], f), (e) => e.code === "InvalidParameters" && e.status === 400);
});

test("weather is normalized from Open-Meteo", async () => {
  const f = fakeFetch([["open-meteo", { body: {
    current: { temperature_2m: -14, relative_humidity_2m: 78, apparent_temperature: -23.1, wind_speed_10m: 9, uv_index: 0.8, time: "2026-12-01T08:00" },
    daily: { time: ["2026-12-01", "2026-12-02"], temperature_2m_min: [-16, -21], temperature_2m_max: [-9, -14], wind_speed_10m_max: [10, 8], uv_index_max: [1.1, 0.9] },
  } }]]);
  const res = await weather.GET(new Request("http://x/api/weather"), f);
  const w = await res.json();
  assert.equal(w.now.feels, -23.1);
  assert.equal(w.days[1].tmin, -21);
  assert.ok(f.calls[0].url.includes("wind_speed_unit=ms"));
});
