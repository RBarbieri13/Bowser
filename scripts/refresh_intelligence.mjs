import { randomUUID } from "node:crypto";
import { executeIntelligenceRun } from "../server/intelligence-ingest.mjs";
const hours = Number(process.argv.find((argument) => argument.startsWith("--hours="))?.split("=")[1] || 24);
const source = process.argv.find((argument) => argument.startsWith("--source="))?.split("=")[1] || "all";
const idempotencyKey = process.argv.find((argument) => argument.startsWith("--idempotency-key="))?.split("=")[1] || randomUUID();
const result = await executeIntelligenceRun({ lookbackHours: hours, source, idempotencyKey });
console.log(JSON.stringify({ ok: true, run: result.run, snapshot: result.snapshot, eventCount: result.events.length, quarantineCount: result.quarantineCount, source }));
