import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const registry = JSON.parse(readFileSync(fileURLToPath(new URL("../data/intelligence-x-handles.json", import.meta.url)), "utf8"));
const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

export function priorityXRegistry() {
  const handles = registry.handles.filter((item) => HANDLE_PATTERN.test(item.handle));
  if (handles.length !== registry.handles.length || handles.length > 20) throw new Error("Invalid priority X handle registry");
  return { ...registry, handles };
}

export function priorityXHandles() {
  return priorityXRegistry().handles.map((item) => item.handle);
}

export function priorityXPrompt() {
  return priorityXRegistry().handles.map((item) => `@${item.handle} (${item.tier.replaceAll("_", " ")})`).join(", ");
}
