import { getMeta, querySchedule } from "../../server/stats-store.mjs";
import { runQuery, sendJson } from "../../server/vercel-response.mjs";

export default function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "read_only", message: "This API is read-only" } });
    return;
  }
  const url = new URL(request.url, "https://local.invalid");
  // Public schedule reads share this function to fit the existing hosting plan.
  const resource = request.query?.resource || url.searchParams.get("resource");
  const schedule = resource === "schedule" || url.pathname.endsWith("/schedule");
  runQuery(response, () => schedule ? querySchedule(url.searchParams) : getMeta(undefined, url.searchParams));
}
