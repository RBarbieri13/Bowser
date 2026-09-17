import { queryPlayerProfile, queryPlayerIdentity, queryDfsArchive } from "../../server/stats-store.mjs";
import { runQuery, sendJson } from "../../server/vercel-response.mjs";

export default function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "read_only", message: "This API is read-only" } });
    return;
  }
  const url = new URL(request.url, "https://local.invalid");
  // Public research URLs share one function to stay within the existing hosting plan.
  const resource = request.query?.resource || url.searchParams.get('resource');
  const query = resource === 'identity' || url.pathname.endsWith('/player-identity') ? queryPlayerIdentity
    : resource === 'archive' || url.pathname.endsWith('/dfs-archive') ? queryDfsArchive : queryPlayerProfile;
  runQuery(response, () => query(url.searchParams));
}
