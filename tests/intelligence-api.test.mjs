import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { startIntelligenceRefresh } from "../server/intelligence-api.mjs";
import { createMemoryIntelligenceStore } from "../server/intelligence-db.mjs";

afterEach(() => { delete process.env.INTELLIGENCE_REFRESH_TOKEN; });

test("manual refresh requires a configured constant-time bearer token", async () => {
  await assert.rejects(() => startIntelligenceRefresh({}), (error) => error.code === "refresh_not_configured");
  process.env.INTELLIGENCE_REFRESH_TOKEN = "secret";
  await assert.rejects(() => startIntelligenceRefresh({ authorization: "Bearer wrong" }), (error) => error.code === "unauthorized");
  await assert.rejects(() => startIntelligenceRefresh({ authorization: "Bearer secret", store: createMemoryIntelligenceStore() }), (error) => error.code === "idempotency_required");
});
