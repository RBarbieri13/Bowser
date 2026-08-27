import { buildIntelligencePrompt } from "./intelligence-prompt.mjs";
import { consolidateEvents, INTELLIGENCE_RESPONSE_SCHEMA, normalizeExternalEvent } from "./intelligence-schema.mjs";

export class IntelligenceProviderError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "IntelligenceProviderError";
    this.code = code;
    this.status = status;
  }
}

function outputText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) if (content.type === "output_text" && content.text) return content.text;
  }
  return null;
}

export function xaiProviderStatus() {
  return {
    id: "xai-grok",
    configured: Boolean(process.env.XAI_API_KEY),
    model: process.env.XAI_MODEL || "grok-4.6",
    capabilities: ["x_search", "web_search", "structured_output", "citations"],
    message: process.env.XAI_API_KEY ? "Live X and web research is available." : "Add XAI_API_KEY to enable live X and web research.",
  };
}

export function buildXaiRequestBody(options = {}, now = new Date()) {
  const lookbackHours = Math.max(1, Math.min(168, Number(options.lookbackHours) || 24));
  const toDate = new Date(now);
  const fromDate = new Date(toDate.getTime() - lookbackHours * 60 * 60 * 1000);
  return {
    model: process.env.XAI_MODEL || "grok-4.6",
    input: [{ role: "user", content: buildIntelligencePrompt({ ...options, lookbackHours }) }],
    tools: [
      { type: "x_search", from_date: fromDate.toISOString().slice(0, 10), to_date: toDate.toISOString().slice(0, 10) },
      { type: "web_search" },
    ],
    max_turns: 2,
    include: ["no_inline_citations"],
    text: {
      format: { type: "json_schema", name: "bowser_fantasy_intelligence", strict: true, schema: INTELLIGENCE_RESPONSE_SCHEMA },
    },
  };
}

export async function scanWithXai(options = {}) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new IntelligenceProviderError("provider_not_configured", "XAI_API_KEY is not configured", 503);
  const lookbackHours = Math.max(1, Math.min(168, Number(options.lookbackHours) || 24));
  const requestBody = buildXaiRequestBody({ ...options, lookbackHours });
  let response;
  try {
    response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (error) {
    throw new IntelligenceProviderError("provider_unreachable", error instanceof Error ? error.message : "xAI request failed");
  }
  if (!response.ok) {
    const message = (await response.text()).slice(0, 500);
    throw new IntelligenceProviderError("provider_error", `xAI returned ${response.status}: ${message}`, response.status === 401 ? 503 : 502);
  }
  const payload = await response.json();
  const text = outputText(payload);
  if (!text) throw new IntelligenceProviderError("invalid_provider_response", "xAI returned no structured output");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new IntelligenceProviderError("invalid_provider_json", "xAI output was not valid JSON"); }
  const citations = Array.isArray(payload.citations) ? payload.citations : [];
  const events = consolidateEvents((parsed.events || []).map((event) => normalizeExternalEvent(event, citations)));
  return {
    meta: {
      version: 1,
      generatedAt: new Date(parsed.generated_at || Date.now()).toISOString(),
      snapshotMode: "live_xai",
      lookbackHours,
      total: events.length,
      returned: events.length,
      provider: { ...xaiProviderStatus(), citationsExamined: citations.length, responseId: payload.id || null },
      methodology: {
        confidence: "Source authority and corroboration only; social volume never increases factual confidence.",
        sentiment: "Fantasy-value direction from -100 to +100; distinct from factual confidence.",
        buzz: "Discussion velocity; distinct from sentiment and reporting confidence.",
      },
    },
    events,
  };
}
