import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digestToken } from '../src/server/roadPasswords.ts';
import { incubatorDay, validIncubatorState } from '../src/features/Incubator/rules.ts';
import { INITIATION_ANSWERS, validInitiationAnswers } from '../src/features/Portal/initiation.ts';

test('Moscow day boundaries and malformed calendar dates are consistent on every device', () => {
  assert.equal(incubatorDay(new Date('2026-10-02T20:59:59Z')), '2026-10-02');
  assert.equal(incubatorDay(new Date('2026-10-02T21:00:00Z')), '2026-10-03');
  const egg = { startedAt:'2026-02-31', lastWarm:'2026-03-03', streak:1, qi:1, burns:0, totalWarmed:1 };
  assert.equal(validIncubatorState(egg, '2026-03-04'), false);
  for (const value of [null, [], {}, {...egg, startedAt:'2026-03-03', qi:NaN}]) assert.equal(validIncubatorState(value), false);
  assert.equal(validInitiationAnswers([...INITIATION_ANSWERS]), true);
  assert.equal(validInitiationAnswers([...INITIATION_ANSWERS, 0]), false);
  assert.equal(validInitiationAnswers(INITIATION_ANSWERS.map(() => 0)), false);
});

test('stale account requests cannot import or warm another egg, and initiation follows the account', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'egg-owner-isolation-'));
  const original = process.env.EGG_ROAD_DATA_DIR;
  process.env.EGG_ROAD_DATA_DIR = directory;
  const { roadRecordStore } = await import('../src/server/roadRecords.ts');
  const { GET, POST } = await import('../src/pages/api/incubator.ts');
  const { POST: profilePost } = await import('../src/pages/api/portal-profile.ts');
  const { ROAD_SESSION_COOKIE } = await import('../src/server/roadHttp.ts');
  const store = roadRecordStore();
  const tokenA = 'a'.repeat(64), tokenB = 'b'.repeat(64);
  const origin = 'https://egg.test';
  const context = (token, body, expectedName) => {
    const url = new URL('/api/incubator', origin);
    if (expectedName) url.searchParams.set('expectedName', expectedName);
    return { url, site:new URL(origin), clientAddress:'127.0.0.1', cookies:{get:key => key === ROAD_SESSION_COOKIE ? {value:token} : undefined},
      request:new Request(url, body ? {method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)} : {}) };
  };
  try {
    store.register('guest-a','Alpha','test-hash','test-recovery',digestToken(tokenA));
    store.register('guest-b','Beta','test-hash','test-recovery',digestToken(tokenB));
    const a = store.credentials('Alpha').player, b = store.credentials('Beta').player;
    assert.equal((await POST(context(tokenA,{action:'lay',expectedName:'Alpha'}))).status, 200);
    const egg = store.incubator(a);
    assert.equal((await POST(context(tokenB,{action:'import',state:egg,expectedName:'Alpha'}))).status, 409);
    assert.equal((await POST(context(tokenB,{action:'warm',expectedName:'Alpha'}))).status, 409);
    assert.equal(store.incubator(b), null);
    assert.equal((await GET(context(tokenB,null,'Alpha'))).status, 409);
    assert.deepEqual((await (await GET(context(tokenA,null,'Alpha'))).json()).state, egg);
    assert.equal((await profilePost(context(tokenB,{action:'initiation',expectedName:'Alpha',answers:[...INITIATION_ANSWERS]}))).status, 409);
    assert.equal((await profilePost(context(tokenA,{action:'initiation',expectedName:'Alpha',answers:[0]}))).status, 400);
    for (let i=0;i<2;i++) assert.equal((await profilePost(context(tokenA,{action:'initiation',expectedName:'Alpha',answers:[...INITIATION_ANSWERS]}))).status, 200);
    assert.equal(store.ownProfile(a).initiated, true);
    assert.equal(store.ownProfile(b).initiated, false);
    const secondDevice = 'c'.repeat(64);
    store.login(store.credentials('Alpha'), digestToken(secondDevice));
    assert.deepEqual((await (await GET(context(secondDevice,null,'Alpha'))).json()).state, egg);
    assert.equal(store.ownProfile(store.session(digestToken(secondDevice))).initiated, true);
  } finally {
    store.close();
    if (original === undefined) delete process.env.EGG_ROAD_DATA_DIR; else process.env.EGG_ROAD_DATA_DIR = original;
    await rm(directory,{recursive:true,force:true});
  }
});
