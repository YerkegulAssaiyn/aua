// Server-side YouCam S2S client. The API key never reaches the browser.
// Files in /api that start with "_" are helpers, not routes, on Vercel.
//
// Flow (docs.perfectcorp.com/reference/ai_skin_analysis):
//   1. POST /s2s/v2.0/file            -> file_id + pre-signed upload URL
//   2. PUT bytes to that URL
//   3. POST /s2s/v2.0/task/<feature>  -> task_id
//   4. GET  /s2s/v2.0/task/<feature>/<task_id> until success or error
// Units are only spent on "success".

export const BASE = process.env.YOUCAM_BASE_URL || "https://yce-api-01.makeupar.com";

// SD concerns cannot be mixed with HD ones. 6 SD concerns = 12 units per scan.
export const SKIN_ACTIONS = ["moisture", "redness", "oiliness", "texture", "pore", "radiance"];

export const FEATURES = {
  "skin-analysis": {
    files: 1,
    body: (ids) => ({ src_file_id: ids[0], dst_actions: SKIN_ACTIONS, miniserver_args: { enable_mask_overlay: false }, format: "json" }),
  },
  // Three photos, in this order: front, right, left. 2 units.
  "hair-frizziness-detection": {
    files: 3,
    body: (ids) => ({ src_file_ids: ids }),
  },
};

export class YouCamError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function apiKey() {
  const k = process.env.YOUCAM_API_KEY;
  if (!k) throw new YouCamError("no_key", "YOUCAM_API_KEY is not set on the server", 500);
  return k;
}

async function call(path, { method = "GET", body, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const code = json?.error_code || json?.data?.error || json?.error || `http_${res.status}`;
    throw new YouCamError(String(code), json?.message || json?.error_message || text.slice(0, 200), res.status);
  }
  return json;
}

export async function uploadImage(bytes, contentType = "image/jpeg", fetchImpl = fetch) {
  const fileName = contentType === "image/png" ? "scan.png" : "scan.jpg";
  const init = await call("/s2s/v2.0/file", {
    method: "POST",
    body: { files: [{ content_type: contentType, file_name: fileName, file_size: bytes.length }] },
    fetchImpl,
  });
  const file = init?.data?.files?.[0];
  const req = file?.requests?.[0];
  if (!file?.file_id || !req?.url) throw new YouCamError("bad_file_response", "Unexpected File API response");

  // Use the headers YouCam returns. fetch sets Content-Length itself for a Buffer body.
  const headers = { ...(req.headers || {}) };
  for (const k of Object.keys(headers)) if (k.toLowerCase() === "content-length") delete headers[k];
  if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = contentType;

  const put = await fetchImpl(req.url, { method: req.method || "PUT", headers, body: bytes });
  if (!put.ok) throw new YouCamError("upload_failed", `Upload failed with HTTP ${put.status}`);
  return file.file_id;
}

export async function startTask(feature, fileIds, fetchImpl = fetch) {
  const f = FEATURES[feature];
  if (!f) throw new YouCamError("bad_feature", `Unknown feature ${feature}`, 400);
  if (!Array.isArray(fileIds) || fileIds.length !== f.files)
    throw new YouCamError("bad_files", `${feature} needs ${f.files} photo(s)`, 400);
  const json = await call(`/s2s/v2.0/task/${feature}`, { method: "POST", body: f.body(fileIds), fetchImpl });
  const id = json?.data?.task_id;
  if (!id) throw new YouCamError("bad_task_response", "No task_id in response");
  return id;
}

/** Turn a task status response into what the app needs. Keeps the raw JSON for debugging. */
export function normalize(feature, json) {
  const d = json?.data || {};
  const status = d.task_status || "unknown";
  const out = { status };
  if (status === "error") {
    out.error = d.error || "unknown_error";
    out.message = d.error_message || "";
  }
  if (status === "success") {
    if (feature === "skin-analysis") {
      const list = d.results?.output || [];
      out.scores = {};
      out.masks = {};
      for (const o of list) {
        if (!o?.type) continue;
        out.scores[o.type] = o.ui_score ?? null;
        if (Array.isArray(o.mask_urls) && o.mask_urls.length) out.masks[o.type] = o.mask_urls;
      }
    }
    if (feature === "hair-frizziness-detection") {
      const h = d.results?.hair_frizziness || {};
      out.frizz = h.mapping ?? null;
      out.term = h.term ?? null;
    }
  }
  if (process.env.AUA_DEBUG_RAW === "1") out.raw = json;
  return out;
}

export async function getTask(feature, taskId, fetchImpl = fetch) {
  if (!FEATURES[feature]) throw new YouCamError("bad_feature", `Unknown feature ${feature}`, 400);
  const json = await call(`/s2s/v2.0/task/${feature}/${encodeURIComponent(taskId)}`, { fetchImpl });
  return normalize(feature, json);
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...extra } });
}

export function errorResponse(e) {
  const status = e instanceof YouCamError ? e.status : 500;
  return json({ error: e.code || "server_error", message: e.message || "Something went wrong" }, status);
}
