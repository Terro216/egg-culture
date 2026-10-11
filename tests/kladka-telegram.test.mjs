import test from 'node:test';
import assert from 'node:assert/strict';
import { sendModerationRequest, isAdminCallback } from '../src/shared/utils/kladkaTelegram.ts';
const post = { id: 'a', name: 'Test', text: 'Breakfast', ipHash: 'test', createdAt: '2026-10-01T12:00:00Z', status: 'pending', image: { ext: 'jpg', type: 'image/jpeg' } };
function setup(t, callback) {
  const fetch = globalThis.fetch, previous = Object.fromEntries(['KLADKA_BOT_TOKEN', 'KLADKA_ADMIN_CHAT_ID', 'KLADKA_ADMIN_USER_IDS'].map(key => [key, process.env[key]]));
  process.env.KLADKA_BOT_TOKEN = 'test-token'; process.env.KLADKA_ADMIN_CHAT_ID = '123'; delete process.env.KLADKA_ADMIN_USER_IDS;
  globalThis.fetch = callback;
  t.after(() => { globalThis.fetch = fetch; for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}
test('network failures reach media fallback; failure of every method rejects delivery', async t => {
  let calls = 0;
  setup(t, async () => { if (++calls === 1) throw new TypeError('simulated network failure'); return Response.json({ ok: true }); });
  await sendModerationRequest(post, Buffer.from([255, 216])); assert.equal(calls, 2);
  calls = 0; globalThis.fetch = async () => { calls++; return Response.json({ ok: false }, { status: 503 }); };
  await assert.rejects(sendModerationRequest(post, Buffer.from([255, 216])));
  assert.equal(calls, 3);
});
test('private moderation verifies the sender and groups use administrator status without mandatory configuration', async t => {
  let calls = 0, status = 'administrator';
  setup(t, async () => { calls++; return Response.json({ ok: true, result: { status } }); });
  const callback = (chat, user) => ({ message: { chat: { id: chat } }, from: { id: user } });
  assert.equal(await isAdminCallback(callback(123, 456)), false);
  assert.equal(await isAdminCallback(callback(123, 123)), true); assert.equal(calls, 0);
  process.env.KLADKA_ADMIN_CHAT_ID = '-123';
  assert.equal(await isAdminCallback(callback(-123, 456)), true);
  status = 'member'; assert.equal(await isAdminCallback(callback(-123, 456)), false);
  globalThis.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(isAdminCallback(callback(-123, 456)), /authorization unavailable/);
});

test('moderator sees the selected audience in text and photo submissions', async t => {
  const messages = [];
  setup(t, async (_url, options) => { messages.push(options.body instanceof FormData ? options.body.get('caption') : JSON.parse(options.body).text); return Response.json({ ok: true }); });
  await sendModerationRequest({ ...post, visibility: 'adepts' }, Buffer.from([255, 216]));
  await sendModerationRequest({ ...post, visibility: 'public', image: undefined }, null);
  assert.match(messages[0], /Кто увидит: Только адептам/);
  assert.match(messages[1], /Кто увидит: Для всех/);
});
