import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'egg-legacy-api-'));
process.env.KLADKA_DATA_DIR = directory;
process.env.KLADKA_BOT_TOKEN = ''; process.env.KLADKA_ADMIN_CHAT_ID = '';
process.env.FONIN_ACCESS_WORD = 'A test access phrase'; process.env.FONIN_GIFT_TOKEN_SECRET = 'test-only-secret';
const { POST: kladka } = await import('../src/pages/api/kladka-post.ts');
const { POST: access } = await import('../src/pages/api/fonin-access.ts');
const { POST: gifts } = await import('../src/pages/api/fonin-gifts.ts');
let ip = 0;
const context = request => ({ request, clientAddress: `192.0.2.${++ip}` });
const json = body => new Request('https://egg.example/api/fonin-gifts', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
test.after(() => rm(directory, { recursive: true, force: true }));

test('Kladka bounds the whole multipart body and rejects unused and duplicate parts', async () => {
  const large = new FormData(); large.set('text', 'Test'); large.set('unused', new Blob([new Uint8Array(6 * 1024 * 1024)]), 'unused.bin');
  assert.equal((await kladka(context(new Request('https://egg.example/api/kladka-post', { method: 'POST', body: large })))).status, 413);
  for (const duplicate of [false, true]) {
    const body = new FormData(); body.set('text', 'Test'); body.append(duplicate ? 'text' : 'unused', 'extra');
    assert.equal((await kladka(context(new Request('https://egg.example/api/kladka-post', { method: 'POST', body })))).status, 400);
  }
  const valid = new FormData(); valid.set('text', 'Test');
  const response = await kladka(context(new Request('https://egg.example/api/kladka-post', { method: 'POST', body: valid })));
  assert.equal(response.status, 200); assert.equal((await response.json()).status, 'approved');
});

test('gift endpoints reject null and oversized JSON, and do not accept inherited gift names', async () => {
  for (const route of [access, gifts]) {
    assert.equal((await route(context(json('null')))).status, 400);
    assert.equal((await route(context(json(JSON.stringify({ unused: 'a'.repeat(9000) }))))).status, 413);
  }
  assert.equal((await access(context(json(JSON.stringify({ accessWord: 'A test access phrase' }))))).status, 200);
  const response = await gifts(context(json(JSON.stringify({ accessWord: 'A test access phrase', giftId: '__proto__', ritual: { score: 100 } }))));
  assert.equal(response.status, 404);
  assert.equal((await gifts(context(json(JSON.stringify({ accessWord: 'A test access phrase', giftId: 'first-steep', ritual: { stage: 1, score: 101 } }))))).status, 422);
});
