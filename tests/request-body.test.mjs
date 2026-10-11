import test from 'node:test';
import assert from 'node:assert/strict';
import { readLimitedBody, readJsonObject } from '../src/server/requestBody.ts';
const request = body => new Request('https://egg.example/api/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body });

test('limited reader bounds the actual stream with or without Content-Length', async () => {
  let cancelled = false, pulls = 0;
  const stream = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(1024)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  await assert.rejects(readLimitedBody(new Request('https://egg.example', { method: 'POST', body: stream, duplex: 'half' }), 2000), error => error.status === 413);
  assert.equal(cancelled, true); assert.ok(pulls <= 3);
  await assert.rejects(readLimitedBody(new Request('https://egg.example', { method: 'POST', headers: { 'content-length': '999999' }, body: '{}' }), 8192), error => error.status === 413);
});

test('slow request streams expire and release the reader slot', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(readLimitedBody(new Request('https://egg.example', { method: 'POST', body: stream, duplex: 'half' }), 8192, 5), error => error.status === 408);
  assert.equal(cancelled, true);
  assert.deepEqual(await readJsonObject(request('{"ok":true}')), { ok: true });
});

test('JSON endpoints reject null, arrays, primitives and excessive payloads', async () => {
  for (const body of ['null', '[]', '"value"', '{']) await assert.rejects(readJsonObject(request(body)), error => error.status === 400);
  await assert.rejects(readJsonObject(request(JSON.stringify({ unused: 'x'.repeat(9000) }))), error => error.status === 413);
});
