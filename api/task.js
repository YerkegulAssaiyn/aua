// POST /api/task  { feature, file_ids }  ->  { task_id }
// GET  /api/task?feature=...&id=...      ->  { status, scores?, masks?, frizz?, error? }
import { startTask, getTask, json, errorResponse } from "./_youcam.js";

export async function POST(request) {
  try {
    const { feature, file_ids } = await request.json();
    const task_id = await startTask(feature, file_ids);
    return json({ task_id });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const feature = url.searchParams.get("feature");
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "no_id" }, 400);
    return json(await getTask(feature, id), 200, { "Cache-Control": "no-store" });
  } catch (e) {
    return errorResponse(e);
  }
}
