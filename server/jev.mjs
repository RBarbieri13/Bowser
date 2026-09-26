// Server/CLI only. Never import this module into src/ or expose it as a public proxy.
import { Buffer } from 'node:buffer';

export const JEV_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
export const JEV_MODEL = 'typesafe/jev-1.13';
export class JevError extends Error {
  constructor(code, message, status = null) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new JevError(code, message, status); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const probability = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const nonempty = v => typeof v === 'string' && v.trim().length > 0;

export function jevStatus(env = process.env) {
  return { configured: nonempty(env.OPENROUTER_API_KEY), model: env.JEV_MODEL || JEV_MODEL, endpoint: JEV_ENDPOINT };
}

function requestBody({ state, questions }, model) {
  if (!/^typesafe\/jev-\d+(?:\.\d+)*$/.test(model)) fail('invalid_model', 'Use a pinned typesafe/jev version for structured decisions.');
  if (!(nonempty(state) || object(state) || Array.isArray(state))) fail('invalid_request', 'State must be nonempty text, a JSON object, or an array.');
  if (!object(questions) || Object.keys(questions).length < 1 || Object.keys(questions).length > 16) fail('invalid_request', 'Supply between 1 and 16 questions.');
  for (const [key, q] of Object.entries(questions)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/i.test(key) || !object(q) || !nonempty(q.instructions) || !['choice', 'noul', 'score'].includes(q.type)) fail('invalid_request', 'Each named question needs instructions and a choice, noul, or score type.');
    if (q.type === 'choice' && (!object(q.criteria) || Object.keys(q.criteria).length < 2 || !Object.values(q.criteria).every(nonempty))) fail('invalid_request', 'Choice questions need at least two named criteria.');
    if (q.type === 'score' && (!Array.isArray(q.criteria) || q.criteria.length < 2 || !q.criteria.every(nonempty))) fail('invalid_request', 'Score questions need at least two ordered descriptions.');
    if (q.type === 'noul' && q.criteria !== undefined && (!object(q.criteria) || !nonempty(q.criteria.true) || !nonempty(q.criteria.false) || Object.keys(q.criteria).length !== 2)) fail('invalid_request', 'Noul criteria must describe true and false.');
  }
  let body;
  try { body = JSON.stringify({ model, state, questions }); }
  catch { fail('invalid_request', 'Request must be JSON serializable.'); }
  if (Buffer.byteLength(body) > 65536) fail('request_too_large', 'Split the input into requests smaller than 64 KiB.');
  return body;
}

function validateResult(data, questions) {
  if (!object(data) || data.error || !object(data.answers) || !nonempty(data.model)) fail('invalid_response', 'Jev returned an incomplete decision response.');
  for (const [key, q] of Object.entries(questions)) {
    const answer = data.answers[key];
    if (!object(answer) || answer.type !== q.type) fail('invalid_response', 'Jev did not answer each question with its requested type.');
    if (q.type === 'noul') {
      if (!probability(answer.noul)) fail('invalid_response', 'Jev returned an invalid probability.');
    } else {
      const labels = q.type === 'choice' ? Object.keys(q.criteria) : q.criteria.map((_, i) => String(i));
      if (!probability(answer.confidence) || !object(answer.probabilities) || Object.keys(answer.probabilities).length !== labels.length || !labels.every(label => probability(answer.probabilities[label]))) fail('invalid_response', 'Jev returned incomplete probabilities or confidence.');
      const total = Object.values(answer.probabilities).reduce((a, b) => a + b, 0);
      if (Math.abs(total - 1) > 0.02) fail('invalid_response', 'Jev probabilities do not sum to one.');
      if (q.type === 'choice' && !labels.includes(answer.choice)) fail('invalid_response', 'Jev returned a choice outside the supplied criteria.');
      if (q.type === 'score' && !(Number.isFinite(answer.score) && answer.score >= 0 && answer.score <= q.criteria.length - 1)) fail('invalid_response', 'Jev returned a score outside the supplied scale.');
    }
  }
  return data;
}

export async function decideWithJev(request, { env = process.env, fetcher = fetch, timeoutMs = 20000 } = {}) {
  const { configured, model } = jevStatus(env);
  if (!configured) fail('not_configured', 'Set OPENROUTER_API_KEY in the server environment or ignored .env.local file.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) fail('invalid_request', 'Timeout must be between 1 and 60000 milliseconds.');
  const body = requestBody(request, model);
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetcher(JEV_ENDPOINT, {
      method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY.trim()}`, 'Content-Type': 'application/json' }, body,
    });
  } catch {
    fail(signal.aborted ? 'timeout' : 'network_error', 'Jev request could not complete. No automatic retry was made.');
  }
  // Do not expose provider error bodies: they may echo credentials or input text.
  if (!response.ok) {
    const messages = { 401: 'OpenRouter rejected the API key.', 402: 'OpenRouter reports insufficient credits.', 403: 'OpenRouter denied access to this model.', 429: 'OpenRouter rate limit reached.' };
    fail('provider_error', messages[response.status] || 'OpenRouter could not complete the Jev request.', response.status);
  }
  let data;
  try { data = await response.json(); }
  catch { fail('invalid_response', 'Jev returned unreadable or interrupted JSON.'); }
  return validateResult(data, request.questions);
}
