import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRoadRecordStore } from '../src/server/roadRecords.ts';
import { advanceIncubator, incubatorAchievements, incubatorDay, incubatorMode, validIncubatorState } from '../src/server/incubatorRules.ts';

test('daily warmth, burns and void are determined by server date', () => {
  const first = advanceIncubator(null, 'lay', '2026-09-20');
  assert.equal(incubatorMode(first, '2026-09-20').mode, 'warmedToday');
  assert.equal(advanceIncubator(first, 'warm', '2026-09-20'), null);
  const second = advanceIncubator(first, 'warm', '2026-09-21');
  assert.equal(second.streak, 2);
  assert.equal(incubatorMode(second, '2026-09-23').mode, 'burned');
  const burned = advanceIncubator(second, 'warm', '2026-09-23');
  assert.equal(burned.streak, 1); assert.equal(burned.burns, 1); assert.equal(burned.qi, 1);
  assert.equal(incubatorMode(burned, '2026-10-01').mode, 'void');
  assert.equal(advanceIncubator(burned, 'lay', '2026-10-01').totalWarmed, 4);
});

test('registered incubator persists and legacy import never overwrites server progress', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'egg-incubator-')); let store;
  try {
    store = createRoadRecordStore(directory);
    store.register('guest', 'Warm Adept', 'hash', 'recovery', 'session');
    const player = store.credentials('Warm Adept').player;
    assert.equal(store.incubator(player), null);
    const today = incubatorDay();
    const legacy = { startedAt: today, lastWarm: today, streak: 1, qi: 1, burns: 0, totalWarmed: 1 };
    assert.equal(validIncubatorState(legacy), true);
    assert.deepEqual(store.incubatorAction(player, 'import', legacy).state, legacy);
    assert.deepEqual(store.incubatorAction(player, 'import', { ...legacy, qi: 999 }).state, legacy);
    assert.deepEqual(store.incubatorAction(player, 'warm').state, legacy, 'repeat warmth is idempotent');
    store.register('another-guest', 'Other Adept', 'hash', 'recovery', 'other-session');
    const other = store.credentials('Other Adept').player;
    assert.equal(store.incubator(other), null, 'a second account cannot read the first egg');
    assert.equal(store.incubatorAction(other, 'lay').state.totalWarmed, 1);
    assert.deepEqual(store.incubator(player), legacy);
    store.close(); store = createRoadRecordStore(directory);
    assert.deepEqual(store.incubator(player), legacy);
    assert.equal(store.incubator('guest'), null);
  } finally { store?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('incubator achievements follow warmed age and Egg Qi, including legacy imports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'egg-incubator-achievements-')); let store;
  try {
    store = createRoadRecordStore(directory);
    store.register('guest-a', 'First Adept', 'hash', 'recovery', 'session-a');
    store.register('guest-b', 'Second Adept', 'hash', 'recovery', 'session-b');
    const player = store.credentials('First Adept').player;
    const today = incubatorDay();
    const date = days => new Date(Date.parse(today) - days * 86400000).toISOString().slice(0,10);
    const legacy = { startedAt: date(29), lastWarm: today, streak: 30, qi: 30, burns: 0, totalWarmed: 30 };
    assert.deepEqual(incubatorAchievements(legacy), ['incubator.start','incubator.day3','incubator.day7','incubator.day14','incubator.perfect']);
    assert.equal(store.incubatorAction(player, 'import', legacy).unlocked.length, 5);
    assert.equal(store.incubatorAction(player, 'import', legacy).unlocked.length, 0);
    assert.equal(store.ownProfile(player).achievements.filter(id => id.startsWith('incubator.')).length, 5);
    assert.equal(store.ownProfile(player).achievementRarity['incubator.perfect'], 50);
    store.close(); store = createRoadRecordStore(directory);
    assert.equal(store.ownProfile(player).achievementRarity['incubator.perfect'], 50);
  } finally { store?.close(); await rm(directory, { recursive:true, force:true }); }
});

test('manifesto time counts only nearby active heartbeats and survives visits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'egg-manifesto-')); let store;
  try {
    store = createRoadRecordStore(directory);
    store.register('guest', 'Reader Adept', 'hash', 'recovery', 'session');
    const player = store.credentials('Reader Adept').player;
    let now = 1000000;
    assert.equal(store.manifestoVisit(player, true, now).elapsed, 0);
    now += 15000; assert.equal(store.manifestoVisit(player, true, now).elapsed, 15000);
    now += 15000; store.manifestoVisit(player, false, now);
    now += 600000; assert.equal(store.manifestoVisit(player, true, now).elapsed, 15000);
    for (let i = 0; i < 14; i++) { now += 15000; store.manifestoVisit(player, true, now); }
    now += 15000; const final = store.manifestoVisit(player, true, now);
    assert.equal(final.elapsed, 240000); assert.equal(final.unlocked, true);
    assert.equal(store.manifestoVisit(player, true, now + 15000).unlocked, false);
    assert.ok(store.ownProfile(player).achievements.includes('manifesto.scholar'));
    store.close(); store = createRoadRecordStore(directory);
    assert.equal(store.ownProfile(player).achievementRarity['manifesto.scholar'], 100);
  } finally { store?.close(); await rm(directory, { recursive:true, force:true }); }
});
