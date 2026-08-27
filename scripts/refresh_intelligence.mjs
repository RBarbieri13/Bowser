import { mkdir, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { scanWithXai } from "../server/intelligence-provider-xai.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.join(root, "data", "intelligence-feed.json");
const temporary = `${target}.tmp`;
const hours = Number(process.argv.find((argument) => argument.startsWith("--hours="))?.split("=")[1] || 24);
const result = await scanWithXai({ lookbackHours: hours });
const payload = { version: 1, generatedAt: result.meta.generatedAt, lookbackHours: hours, mode: "xai_x_and_web_search", events: result.events };
await mkdir(path.dirname(target), { recursive: true });
await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await rename(temporary, target);
console.log(JSON.stringify({ ok: true, generatedAt: payload.generatedAt, eventCount: payload.events.length, output: target }));
