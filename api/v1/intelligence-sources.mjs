import { getIntelligenceRegistry } from "../../server/intelligence-store.mjs";

export default function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: { code: "read_only", message: "This API is read-only" } });
  response.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return response.status(200).json(getIntelligenceRegistry());
}
