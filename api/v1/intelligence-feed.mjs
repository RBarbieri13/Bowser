import { queryPersistedIntelligenceFeed, IntelligenceQueryError } from "../../server/intelligence-store.mjs";

export default async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: { code: "read_only", message: "This API is read-only" } });
  try {
    const url = new URL(request.url, "https://local.invalid");
    if (url.searchParams.get("live") === "1") return response.status(405).json({ error: { code: "use_refresh_endpoint", message: "Use the authenticated intelligence-runs endpoint for live refreshes." } });
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json(await queryPersistedIntelligenceFeed(url.searchParams));
  } catch (error) {
    response.setHeader("Cache-Control", "no-store");
    if (error instanceof IntelligenceQueryError) return response.status(400).json({ error: { code: "invalid_query", field: error.field, message: error.message } });
    console.error("Intelligence feed read failed", { name: error?.name, code: error?.code });
    return response.status(500).json({ error: { code: "intelligence_error", message: "Unable to load the intelligence feed." } });
  }
}
