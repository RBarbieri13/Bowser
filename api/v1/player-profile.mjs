import { queryPlayerProfile } from "../../server/stats-store.mjs";
import { runQuery, sendJson } from "../../server/vercel-response.mjs";

export default function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "read_only", message: "This API is read-only" } });
    return;
  }
  const url = new URL(request.url, "https://local.invalid");
  runQuery(response, () => queryPlayerProfile(url.searchParams));
}
