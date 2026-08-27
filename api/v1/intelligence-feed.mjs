import { queryIntelligenceFeed, IntelligenceQueryError } from "../../server/intelligence-store.mjs";
import { scanWithXai, IntelligenceProviderError } from "../../server/intelligence-provider-xai.mjs";

export default async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: { code: "read_only", message: "This API is read-only" } });
  try {
    const url = new URL(request.url, "https://local.invalid");
    if (url.searchParams.get("live") === "1") {
      const payload = await scanWithXai({
        lookbackHours: Number(url.searchParams.get("hours") || 24),
        positions: String(url.searchParams.get("position") || "QB,RB,WR,TE").split(",").filter(Boolean),
        teams: String(url.searchParams.get("team") || "").split(",").filter(Boolean),
        query: url.searchParams.get("search") || "",
      });
      response.setHeader("Cache-Control", "no-store");
      return response.status(200).json(payload);
    }
    response.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return response.status(200).json(queryIntelligenceFeed(url.searchParams));
  } catch (error) {
    response.setHeader("Cache-Control", "no-store");
    if (error instanceof IntelligenceQueryError) return response.status(400).json({ error: { code: "invalid_query", field: error.field, message: error.message } });
    if (error instanceof IntelligenceProviderError) return response.status(error.status || 503).json({ error: { code: error.code, message: error.message } });
    return response.status(500).json({ error: { code: "intelligence_error", message: error instanceof Error ? error.message : "Unknown intelligence error" } });
  }
}
