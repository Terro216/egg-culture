import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNewsCache } from '../src/shared/utils/newsCache.ts';
const old = { link: 'https://example.invalid/old', title: 'Saved news', pubDate: '2026-01-01 12:00:00' };
async function directory(t) { const value = await mkdtemp(join(tmpdir(), 'egg-news-test-')); t.after(() => rm(value, { recursive: true, force: true })); return value; }

test('stale content renders without waiting; failed refresh cooldown survives restart', async t => {
  const dir = await directory(t); let now = 1800000000000, calls = 0, finish;
  await writeFile(join(dir, 'news.json'), JSON.stringify({ lastFetch: { ru: 1 }, news: { ru: [old] } }));
  const cache = createNewsCache(dir, { now: () => now, fetchImpl: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  assert.deepEqual(await cache.get('ru'), [old]);
  for (let i = 0; i < 100 && !finish; i++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(calls, 1);
  assert.deepEqual(await cache.get('ru'), [old]);
  finish(new Response('{}', { status: 503 })); await cache.settled();
  const reopened = createNewsCache(dir, { now: () => now, fetchImpl: async () => { calls++; return new Response('{}', { status: 503 }); } });
  await reopened.get('ru'); await reopened.settled(); assert.equal(calls, 1);
  now += 60001; await reopened.get('ru'); await reopened.settled(); assert.equal(calls, 2);
  now += 60001; await reopened.get('ru'); await reopened.settled(); assert.equal(calls, 2, 'second failure doubles cooldown');
});

test('successful empty feeds observe the full TTL instead of refetching every visit', async t => {
  const dir = await directory(t); let calls = 0;
  const cache = createNewsCache(dir, { fetchImpl: async () => { calls++; return Response.json({ results: [] }); } });
  assert.deepEqual(await cache.get('en'), []);
  await cache.get('en'); await cache.settled(); await cache.get('en');
  assert.equal(calls, 1);
});

test('simultaneous languages preserve both feeds and malformed cache is recoverable', async t => {
  const dir = await directory(t);
  await writeFile(join(dir, 'news.json'), '{}');
  const cache = createNewsCache(dir, { fetchImpl: async url => Response.json({ results: [{ ...old, title: new URL(url).searchParams.get('language') }] }) });
  const result = await Promise.all([cache.get('ru'), cache.get('en')]);
  assert.equal(result[0][0].title, 'ru'); assert.equal(result[1][0].title, 'en');
  assert.equal((await cache.get('ru'))[0].title, 'ru'); assert.equal((await cache.get('en'))[0].title, 'en');
});
