// Tests the Worker with a pretend AI. Run with: node test/worker.test.mjs
import assert from 'assert';
import worker from '../src/worker.js';

const ORIGIN = 'https://truecvfit.example.workers.dev';
let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('ok -', name); };

function env(aiRun) {
  return {
    AI: { run: aiRun },
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
  };
}
function req(body, headers = {}) {
  return new Request(ORIGIN + '/api/tailor', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const good = { jobTitle: 'Social Media Assistant', jd: 'Create content for Instagram.', bullets: [{ id: 'b1', text: 'Wrote captions for Instagram posts' }], profile: '' };

await t('returns rewrites from a Gemma-style (choices) response', async () => {
  const res = await worker.fetch(req(good), env(async () => ({ choices: [{ message: { content: '```json\n{"bullets":[{"id":"b1","text":"Wrote Instagram captions"}],"profile":""}\n```' } }] })));
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.deepStrictEqual(data.bullets, [{ id: 'b1', text: 'Wrote Instagram captions' }]);
});

await t('returns rewrites from a Llama-style (response) answer', async () => {
  const res = await worker.fetch(req(good), env(async () => ({ response: { bullets: [{ id: 'b1', text: 'x' }], profile: '' } })));
  assert.strictEqual((await res.json()).bullets[0].text, 'x');
});

await t('drops ids the browser never sent', async () => {
  const res = await worker.fetch(req(good), env(async () => ({ response: '{"bullets":[{"id":"b1","text":"a"},{"id":"b99","text":"invented"}],"profile":""}' })));
  const data = await res.json();
  assert.strictEqual(data.bullets.length, 1);
});

await t('falls back to the backup model if the first reply is unreadable', async () => {
  let calls = 0;
  const res = await worker.fetch(req(good), env(async (model) => { calls++; return calls === 1 ? { response: 'sorry' } : { response: '{"bullets":[],"profile":""}' }; }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(calls, 2);
});

await t('reports the daily limit clearly', async () => {
  const res = await worker.fetch(req(good), env(async () => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); }));
  assert.strictEqual(res.status, 429);
  assert.strictEqual((await res.json()).error, 'daily_limit');
});

await t('blocks other websites', async () => {
  const res = await worker.fetch(req(good, { Origin: 'https://evil.example' }), env(async () => { throw new Error('should not run'); }));
  assert.strictEqual(res.status, 403);
});

await t('rejects oversized requests', async () => {
  const big = { ...good, jd: 'x'.repeat(70_000) };
  const res = await worker.fetch(req(big), env(async () => { throw new Error('should not run'); }));
  assert.strictEqual(res.status, 413);
});

await t('rejects GET and junk', async () => {
  assert.strictEqual((await worker.fetch(new Request(ORIGIN + '/api/tailor'), env(async () => ({})))).status, 405);
  assert.strictEqual((await worker.fetch(req('not json'), env(async () => ({})))).status, 400);
});

await t('serves the website for other paths', async () => {
  const res = await worker.fetch(new Request(ORIGIN + '/'), env(async () => ({})));
  assert.strictEqual(await res.text(), 'asset');
});

await t('never sends the AI anything outside the allowed fields', async () => {
  let seen;
  await worker.fetch(req({ ...good, email: 'secret@x.com', name: 'Secret Name' }), env(async (m, input) => { seen = JSON.stringify(input); return { response: '{"bullets":[],"profile":""}' }; }));
  assert.ok(!seen.includes('secret@x.com') && !seen.includes('Secret Name'));
});

console.log(`\n${passed} tests passed`);
