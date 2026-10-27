// GET /api/health -> tells the app whether live scans are possible. Never returns the key.
import { json, BASE } from "./_youcam.js";

export function GET() {
  return json({ youcam: Boolean(process.env.YOUCAM_API_KEY), base: BASE });
}
