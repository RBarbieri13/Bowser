import test from 'node:test';
import assert from 'node:assert/strict';
import { decideWithJev, jevStatus, JEV_ENDPOINT } from '../server/jev.mjs';

const env = { OPENROUTER_API_KEY: 'test-only-not-a-real-key' };
const input = { state: { text: 'Synthetic football text' }, questions: {
  topic: { type: 'choice', instructions: 'Select a topic.', criteria: { injury: 'Injury news', other: 'Other news' } },
  relevant: { type: 'noul', instructions: 'Is it relevant?' },
  urgency: { type: 'score', instructions: 'Rate urgency.', criteria: ['Low', 'High'] },
} };
const result = () => ({ model: 'typesafe/jev-1.13', answers: {
  topic: { type: 'choice', choice: 'other', confidence: 0.9, probabilities: { injury: 0.1, other: 0.9 } },
  relevant: { type: 'noul', noul: 0.8 },
  urgency: { type: 'score', score: 0.2, confidence: 0.8, probabilities: { 0: 0.8, 1: 0.2 } },
}, usage: { input_tokens: 100, output_tokens: 20, cost: 0.00001 } });
const response = data => new Response(JSON.stringify(data), { status: 200 });

test('missing key stops before network and status never contains a key', async () => {
  let calls = 0;
  await assert.rejects(decideWithJev(input, { env: {}, fetcher: () => { calls++; } }), { code: 'not_configured' });
  assert.equal(calls, 0);
  assert.equal(JSON.stringify(jevStatus(env)).includes(env.OPENROUTER_API_KEY), false);
});
test('sends the documented decision protocol and preserves typed answers and cost', async () => {
  const data = await decideWithJev(input, { env, fetcher: async (url, init) => {
    assert.equal(url, JEV_ENDPOINT);
    assert.equal(init.headers.Authorization, `Bearer ${env.OPENROUTER_API_KEY}`);
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(init.body), { model: 'typesafe/jev-1.13', ...input });
    return response(result());
  } });
  assert.deepEqual(data, result());
});
test('rejects malformed questions, oversized state, and router model before spending', async () => {
  let calls = 0; const fetcher = async () => { calls++; return response(result()); };
  for (const bad of [ { ...input, questions: {} }, { ...input, state: 'x'.repeat(65537) }, { ...input, questions: { q: { type: 'score', instructions: 'rate', criteria: ['one'] } } } ]) {
    await assert.rejects(decideWithJev(bad, { env, fetcher }));
  }
  await assert.rejects(decideWithJev(input, { env: { ...env, JEV_MODEL: 'typesafe/jev-router' }, fetcher }), { code: 'invalid_model' });
  assert.equal(calls, 0);
});
test('provider failures are sanitized and never automatically retried', async () => {
  for (const status of [401, 402, 403, 429, 500]) {
    let calls = 0;
    await assert.rejects(decideWithJev(input, { env, fetcher: async () => { calls++; return new Response('private input and secret', { status }); } }), error => error.status === status && !error.message.includes('secret'));
    assert.equal(calls, 1);
  }
});
test('rejects missing answers, wrong types, out-of-range values and invalid distributions', async () => {
  const mutations = [d => delete d.answers.topic, d => d.answers.topic.choice = 'invented', d => d.answers.relevant.noul = 3, d => d.answers.urgency.score = -1, d => d.answers.topic.type = 'score', d => d.answers.topic.probabilities.other = 0.1];
  for (const mutate of mutations) {
    const data = result(); mutate(data);
    await assert.rejects(decideWithJev(input, { env, fetcher: async () => response(data) }), { code: 'invalid_response' });
  }
});
test('timeouts, transport failures and unreadable JSON fail closed without leaking raw errors', async () => {
  await assert.rejects(decideWithJev(input, { env, fetcher: async () => { throw new Error(env.OPENROUTER_API_KEY); } }), { code: 'network_error' });
  await assert.rejects(decideWithJev(input, { env, fetcher: async () => new Response('not json') }), { code: 'invalid_response' });
  await assert.rejects(decideWithJev(input, { env, timeoutMs: 5, fetcher: async (_, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 200);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  }) }), { code: 'timeout' });
});
