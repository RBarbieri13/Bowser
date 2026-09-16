import { IntelligenceApiError, intelligenceRunStatus, startIntelligenceRefresh } from "../../server/intelligence-api.mjs";

function header(request, name) {
  return request.headers?.[name] || request.headers?.[name.toLowerCase()] || request.headers?.get?.(name) || request.headers?.get?.(name.toLowerCase());
}

export default async function handler(request, response) {
  try {
    if (request.method === "POST") {
      const result = await startIntelligenceRefresh({
        authorization: header(request, "authorization"),
        idempotencyKey: header(request, "idempotency-key"),
        body: typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {},
      });
      response.setHeader("Cache-Control", "no-store");
      return response.status(200).json(result);
    }
    if (request.method === "GET") {
      const url = new URL(request.url, "https://local.invalid");
      const result = await intelligenceRunStatus({ authorization: header(request, "authorization"), runId: url.searchParams.get("runId"), latest: url.searchParams.get("latest") === "1" });
      response.setHeader("Cache-Control", "no-store");
      return response.status(200).json(result);
    }
    return response.status(405).json({ error: { code: "method_not_allowed", message: "Use GET or POST" } });
  } catch (error) {
    if (error instanceof IntelligenceApiError) return response.status(error.status).json({ error: { code: error.code, message: error.message } });
    console.error("Intelligence run failed", { name: error?.name, code: error?.code });
    return response.status(500).json({ error: { code: "intelligence_error", message: "The intelligence refresh could not be completed." } });
  }
}
