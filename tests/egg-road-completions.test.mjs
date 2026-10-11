import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRoadRecordStore, RoadAccountChangedError } from '../src/server/roadRecords.ts';
import { FUN_ROAD_CODES } from '../src/features/EggRoad/funRoads.ts';
import { saveRoadResult, roadHistory, markRoadPublished } from '../src/features/EggRoad/results.ts';
import { flushRoadRecords } from '../src/features/EggRoad/recordSync.ts';
import { selectRoadAccount } from '../src/features/EggRoad/storage.ts';
import { refreshPortal } from '../src/features/Portal/client.ts';

const result = (code, finished, score = 200) => ({ code, finished, score, name: 'Explorer', gates: 1, distance: 19, seconds: 10,
  mode: 'stunt', level: 8, skipped: 0, bestSkip: 0, breakdown: { gates: 100, edge: score - 100, speed: 0, rhythm: 0, drop: 0, shortcut: 0 } });

test('all six distinct finishes unlock the achievement independently of best scores, ownership and retries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'road-completions-')); let store = createRoadRecordStore(dir);
  try {
    store.register('guest', 'Explorer', 'hash', 'recovery', 'session');
    const player = store.credentials('Explorer').player;
    for (const code of FUN_ROAD_CODES) store.submit(player, result(code, false, 900));
    assert.deepEqual(store.read(FUN_ROAD_CODES[0], player).completedRoads, []);
    for (const code of FUN_ROAD_CODES.slice(0, -1)) store.submit(player, result(code, true));
    assert.ok(!store.ownProfile(player).achievements.includes('road.explorer'));
    store.submit(player, result(FUN_ROAD_CODES[0], true));
    assert.equal(store.read(FUN_ROAD_CODES[0], player).completedRoads.length, 5);
    assert.throws(() => store.submit(player, { ...result(FUN_ROAD_CODES.at(-1), true), expectedOwner: 'different' }), RoadAccountChangedError);
    assert.equal(store.read(FUN_ROAD_CODES[0], player).completedRoads.length, 5);
    const response = store.submit(player, result(FUN_ROAD_CODES.at(-1), true));
    assert.deepEqual(response.unlocked, ['road.explorer']);
    assert.equal(response.personal.score, 900); assert.equal(response.personal.finished, false);
    assert.equal(store.ownProfile(player).achievementRarity['road.explorer'], 100);
    assert.deepEqual(store.read(FUN_ROAD_CODES[0], 'someone-else').completedRoads, []);
    store.submit(player, result(FUN_ROAD_CODES[0], false, 1000));
    store.close(); store = createRoadRecordStore(dir);
    assert.equal(store.read(FUN_ROAD_CODES[0], player).completedRoads.length, 6);
    assert.equal(store.ownProfile(player).achievements.filter(id => id === 'road.explorer').length, 1);
    assert.deepEqual(store.submit(player, result(FUN_ROAD_CODES.at(-1), true)).unlocked, ['road.explorer']);
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('historic finished records are adopted idempotently and guest completions follow registration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'road-completion-adopt-')); let store = createRoadRecordStore(dir);
  try {
    for (const code of FUN_ROAD_CODES) store.submit('guest', result(code, true));
    store.register('guest', 'Explorer', 'hash', 'recovery', 'session');
    const player = store.credentials('Explorer').player;
    assert.equal(store.read(FUN_ROAD_CODES[0], player).completedRoads.length, 6);
    assert.deepEqual(store.read(FUN_ROAD_CODES[0], 'guest').completedRoads, []);
    assert.ok(store.ownProfile(player).achievements.includes('road.explorer'));
    store.close();
    const db = new DatabaseSync(join(dir, 'records.sqlite'));
    db.exec("DROP TABLE road_completions; DELETE FROM portal_achievements WHERE achievement = 'road.explorer'"); db.close();
    store = createRoadRecordStore(dir);
    assert.equal(store.read(FUN_ROAD_CODES[0], player).completedRoads.length, 6);
    assert.ok(store.ownProfile(player).achievements.includes('road.explorer'));
    store.close(); store = createRoadRecordStore(dir);
    assert.equal(store.read(FUN_ROAD_CODES[0], player).completedRoads.length, 6);
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('lower-scoring finishes survive history eviction, sync once, retry and announce one achievement', async () => {
  const previous = { fetch: globalThis.fetch, window: globalThis.window, storage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage') };
  const values = new Map(), posts = [], completed = new Set(), notifications = [];
  let fail = false, account = 'Finish Tester';
  globalThis.window = new EventTarget(); window.addEventListener('egg:achievements', e => notifications.push(...e.detail));
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k),
    key: i => [...values.keys()][i] ?? null, get length() { return values.size; },
  } });
  globalThis.fetch = async (url, options) => {
    if (url === '/api/portal-profile') return Response.json({ account: { name: account, registered: true }, profile: null });
    if (fail) throw Error('Offline');
    const body = JSON.parse(options.body); posts.push(body);
    if (body.finished) completed.add(body.code);
    return Response.json({ code: body.code, name: account, registered: true, completedRoads: [...completed], unlocked: completed.size === 6 ? ['road.explorer'] : [] });
  };
  const save = (code, finished, score) => saveRoadResult({ id: randomUUID(), owner: 'finish tester' }, result(code, finished, score)).run;
  try {
    await refreshPortal();
    for (const code of FUN_ROAD_CODES) { save(code, false, 900); save(code, true, 200); }
    // Mimic a finish acknowledged by the previous release, without completion tracking.
    const firstFinish = roadHistory().find(r => r.result.finished); markRoadPublished(firstFinish);
    for (let i = 0; i < 20; i++) save(FUN_ROAD_CODES[0], false, 300);
    assert.equal(roadHistory().filter(r => r.result.finished).length, 6);
    fail = true; await flushRoadRecords(); assert.equal(completed.size, 0);
    // Reconnect clears the retry delay through the same watcher used in the game.
    const { watchRoadRecordSync } = await import('../src/features/EggRoad/recordSync.ts');
    fail = false; const unwatch = watchRoadRecordSync(); window.dispatchEvent(new Event('online')); await flushRoadRecords(); unwatch();
    assert.equal(completed.size, 6); assert.equal(posts.length, 12);
    assert.deepEqual(notifications.filter(id => id === 'road.explorer'), ['road.explorer']);
    const count = posts.length; await flushRoadRecords(); assert.equal(posts.length, count);
    save(FUN_ROAD_CODES[0], true, 150); await flushRoadRecords(); assert.equal(posts.length, count);
    account = 'Other Tester'; await refreshPortal(); await flushRoadRecords(); assert.equal(posts.length, count);
    assert.equal(roadHistory().length, 0);
  } finally {
    selectRoadAccount(null); globalThis.fetch = previous.fetch; globalThis.window = previous.window;
    if (previous.storage) Object.defineProperty(globalThis, 'localStorage', previous.storage); else delete globalThis.localStorage;
  }
});
