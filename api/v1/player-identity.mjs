import { queryPlayerIdentity } from '../../server/stats-store.mjs';
import { runQuery,sendJson } from '../../server/vercel-response.mjs';
export default function handler(request,response) {
  if (request.method !== 'GET') return sendJson(response,405,{error:{code:'read_only',message:'This API is read-only'}});
  return runQuery(response,() => queryPlayerIdentity(new URL(request.url,'https://local.invalid').searchParams));
}
