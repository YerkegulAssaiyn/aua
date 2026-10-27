// POST /api/upload  { image: "data:image/jpeg;base64,..." }  ->  { file_id }
import { uploadImage, json, errorResponse } from "./_youcam.js";

const MAX_BYTES = 3_500_000; // Vercel request bodies are capped near 4.5 MB; the app sends ~300 KB.

export async function POST(request) {
  try {
    const { image } = await request.json();
    const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(image || "");
    if (!m) return json({ error: "bad_image", message: "Send a JPEG or PNG data URL" }, 400);
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > MAX_BYTES) return json({ error: "too_big", message: "Photo is too large" }, 413);
    const file_id = await uploadImage(bytes, m[1]);
    return json({ file_id });
  } catch (e) {
    return errorResponse(e);
  }
}
