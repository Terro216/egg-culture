import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createManifestoTracker } from '../src/features/Portal/manifestoTracking.ts';
const progress = (elapsed = 0, unlocked = false) => Response.json({ elapsed, unlocked });

function fixture(fetchImpl, extra = {}) {
  let owner = 'Alpha', unlocked = 0, mismatch = 0;
  const tracker = createManifestoTracker({ owner: 'Alpha', currentOwner: () => owner, onUnlock: () => unlocked++, onAccountMismatch: () => { mismatch++; }, fetchImpl, ...extra });
  return { tracker, switchOwner(value) { owner = value; }, counts: () => ({ unlocked, mismatch }) };
}

test('completed reading belongs to one owner and does not suppress another account', async () => {
  const bodies = [];
  const f = fixture(async (_, init) => { bodies.push(JSON.parse(init.body)); return progress(240000, true); });
  await f.tracker.visit(true); await f.tracker.visit(true);
  assert.equal(bodies.length, 1); assert.equal(bodies[0].expectedName, 'Alpha'); assert.equal(f.counts().unlocked, 1);
  f.switchOwner('Beta'); await f.tracker.dispose();
  const beta = createManifestoTracker({ owner: 'Beta', currentOwner: () => 'Beta', onUnlock() {}, onAccountMismatch() {}, fetchImpl: async (_, init) => { bodies.push(JSON.parse(init.body)); return progress(240000); } });
  await beta.visit(true); await beta.dispose(); assert.equal(bodies.at(-1).expectedName, 'Beta');
});

test('late response from a previous account neither announces achievements nor sends cleanup as the new owner', async () => {
  let finish, calls = 0;
  const f = fixture(async () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const pending = f.tracker.visit(true);
  f.switchOwner('Beta'); finish(progress(240000, true)); await pending; await f.tracker.dispose();
  assert.equal(f.counts().unlocked, 0); assert.equal(calls, 1);
});

test('blur queued during a request sends an inactive heartbeat after it settles', async () => {
  let finish; const requests = [];
  const f = fixture(async (_, init) => {
    requests.push({ body: JSON.parse(init.body), keepalive: init.keepalive });
    return requests.length === 1 ? new Promise(resolve => { finish = resolve; }) : progress();
  });
  const active = f.tracker.visit(true); await f.tracker.visit(false); finish(progress(15000)); await active;
  assert.deepEqual(requests.slice(0, 2).map(request => request.body.active), [true, false]);
  assert.equal(requests[1].keepalive, true);
  await f.tracker.dispose();
});

test('focus returning during an in-flight heartbeat first pauses the old interval and then resumes', async () => {
  let finish; const activeStates = [];
  const f = fixture(async (_, init) => {
    activeStates.push(JSON.parse(init.body).active);
    return activeStates.length === 1 ? new Promise(resolve => { finish = resolve; }) : progress();
  });
  const active = f.tracker.visit(true);
  await f.tracker.visit(false); await f.tracker.visit(true);
  finish(progress(15000)); await active;
  assert.deepEqual(activeStates, [true, false, true]);
  await f.tracker.dispose();
});

test('a second blur while the pause is in flight cancels its queued resume', async () => {
  let finishActive, finishPause; const activeStates = [];
  const f = fixture(async (_, init) => {
    activeStates.push(JSON.parse(init.body).active);
    if (activeStates.length === 1) return new Promise(resolve => { finishActive = resolve; });
    if (activeStates.length === 2) return new Promise(resolve => { finishPause = resolve; });
    return progress();
  });
  const active = f.tracker.visit(true);
  await f.tracker.visit(false); await f.tracker.visit(true); finishActive(progress());
  while (!finishPause) await new Promise(resolve => setImmediate(resolve));
  await f.tracker.visit(false); finishPause(progress()); await active;
  assert.ok(activeStates.slice(1).every(value => value === false));
  await f.tracker.dispose();
});

test('request timeout and a 401 do not permanently disable future reading', async () => {
  let calls = 0;
  const f = fixture(async (_, init) => {
    if (++calls === 1) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    return calls === 2 ? new Response('{}', { status: 401 }) : progress(240000);
  }, { timeoutMs: 5 });
  await f.tracker.visit(true); await f.tracker.visit(true); await f.tracker.visit(true);
  assert.equal(calls, 3); assert.equal(f.counts().mismatch, 1);
  await f.tracker.dispose();
});

test('dispose aborts unfinished reading and sends an account-checked keepalive pause', async () => {
  const bodies = [];
  const f = fixture(async (_, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    if (body.active) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    return progress();
  });
  const active = f.tracker.visit(true); await f.tracker.dispose(); await active;
  assert.deepEqual(bodies.map(body => body.active), [true, false]);
  await f.tracker.visit(true); assert.equal(bodies.length, 2);
});

test('manifesto API refuses stale owners without resetting the current account reading interval', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'egg-manifesto-api-'));
  const previousDirectory = process.env.EGG_ROAD_DATA_DIR;
  process.env.EGG_ROAD_DATA_DIR = directory;
  let store;
  try {
    const { roadRecordStore } = await import('../src/server/roadRecords.ts');
    const { digestToken } = await import('../src/server/roadPasswords.ts');
    const { ROAD_SESSION_COOKIE } = await import('../src/server/roadHttp.ts');
    const { POST } = await import('../src/pages/api/manifesto-progress.ts');
    store = roadRecordStore();
    const token = 'b'.repeat(64), origin = 'https://egg.test';
    store.register('guest-beta', 'Beta', 'test-hash', 'test-recovery', digestToken(token));
    const player = store.credentials('Beta').player, now = Date.now();
    store.manifestoVisit(player, true, now - 15000);
    const request = (body, session = token) => POST({
      url: new URL('/api/manifesto-progress', origin), site: new URL(origin), clientAddress: '127.0.0.42',
      cookies: { get: key => key === ROAD_SESSION_COOKIE && session ? { value: session } : undefined },
      request: new Request(`${origin}/api/manifesto-progress`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    assert.equal((await request({ active: false, expectedName: 'Alpha' })).status, 409);
    assert.equal((await request({ active: false })).status, 409);
    assert.equal(store.manifestoVisit(player, true, now).elapsed, 15000);
    assert.equal((await request({ active: true, expectedName: 'Beta' }, null)).status, 401);
    for (const value of [null, [], { active: 'true', expectedName: 'Beta' }]) assert.equal((await request(value)).status, 400);
    const valid = await request({ active: false, expectedName: 'beta' });
    assert.equal(valid.status, 200); assert.equal((await valid.json()).elapsed, 15000);
  } finally {
    store?.close();
    if (previousDirectory === undefined) delete process.env.EGG_ROAD_DATA_DIR; else process.env.EGG_ROAD_DATA_DIR = previousDirectory;
    await rm(directory, { recursive: true, force: true });
  }
});
