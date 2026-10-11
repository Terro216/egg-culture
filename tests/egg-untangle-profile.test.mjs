import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRoadRecordStore, PortalGuestClaimedError, PortalResultInvalidError } from '../src/server/roadRecords.ts';
import { validatePortalRun } from '../src/features/Portal/model.ts';
import { analyzeBoard, campaignSeed, dailySeed, formatSeed, generatePuzzle, isSlotPermutation, moscowDay } from '../src/features/EggUntangle/engine.ts';

function result(seed = campaignSeed(1), mode = 'campaign', extra = {}) {
  const puzzle = generatePuzzle(seed);
  return { id: randomUUID(), game: 'untangle', score: String(puzzle.level), peak: String(puzzle.level), seconds: 60,
    sector: 0, losses: 0, jackpot: false, dodged: 0, swaps: 0,
    untangle: { seed, level: puzzle.level, mode, moves: 12, hints: 0, positions: puzzle.solution, ...extra } };
}
async function fixture(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'egg-untangle-profile-'));
  let store = createRoadRecordStore(directory);
  const add = (name, guest = name) => {
    store.register(guest, name, 'unused-test-password', 'unused-test-recovery', `${name}-session`);
    return store.credentials(name).player;
  };
  const player = add('Alpha');
  try { await callback({ get store() { return store; }, player, add, restart() { store.close(); store = createRoadRecordStore(directory); } }); }
  finally { store.close(); await rm(directory, { recursive: true, force: true }); }
}
const dayOffset = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);

test('untangle wire format preserves bounded coordinates and rejects malformed or cross-game metadata', () => {
  const good = result();
  assert.deepEqual(validatePortalRun(good), good);
  const change = fields => ({ ...good, untangle: { ...good.untangle, ...fields } });
  for (const bad of [
    change({ positions: Array(25).fill({ x: 300, y: 300 }) }), change({ positions: [] }),
    change({ positions: good.untangle.positions.map((p, i) => i ? p : { x: NaN, y: 5 }) }),
    change({ positions: good.untangle.positions.map((p, i) => i ? p : { x: 1001, y: 5 }) }),
    change({ moves: 0 }), change({ moves: 1.5 }), change({ hints: -1 }), change({ level: 25 }),
    change({ mode: 'fake' }), change({ mode: 'daily' }), change({ day: moscowDay() }),
    { ...good, score: '2' }, { ...good, peak: '10' }, { ...good, losses: 1 }, { ...good, game: 'oracle' },
    { ...good, guestImport: false }, { ...good, game: 'oracle', guestImport: true },
  ]) assert.equal(validatePortalRun(bad), null);
  assert.ok(JSON.stringify(result(campaignSeed(24))).length < 8192, 'largest board fits existing API limit');
});

test('server verifies graph, canonical identity and complete geometry before committing any progress', async () => fixture(({ store, player }) => {
  const good = result(), initial = generatePuzzle(good.untangle.seed).initial;
  const invalid = fields => ({ ...good, untangle: { ...good.untangle, ...fields } });
  for (const bad of [
    invalid({ positions: initial }), invalid({ positions: good.untangle.positions.slice(1) }),
    invalid({ positions: good.untangle.positions.map(() => ({ x: 400, y: 400 })) }),
    invalid({ seed: good.untangle.seed.toLowerCase() }), invalid({ seed: formatSeed(1, 42) }),
    invalid({ level: 2 }), invalid({ mode: 'daily', day: moscowDay() }),
  ]) assert.throws(() => store.portalResult(player, bad), PortalResultInvalidError);
  assert.equal(store.ownProfile(player).untangle.totalSolved, 0);
  assert.equal(store.ownProfile(player).stats.some(stat => stat.game === 'untangle'), false);
  const accepted = store.portalResult(player, good);
  assert.equal(accepted.untangle.totalSolved, 1, 'invalid attempts did not consume the same UUID');
  assert.ok(accepted.achievements.includes('untangle.first'));
  assert.ok(accepted.achievements.includes('untangle.clean'));
}));

test('per-seed personal bests, distinct completions, idempotency and campaign credit survive restart and stay private', async () => fixture(f => {
  const first = result(campaignSeed(12), 'free', { moves: 20, hints: 2 });
  f.store.portalResult(f.player, first);
  f.store.portalResult(f.player, first);
  const second = { ...result(campaignSeed(12), 'campaign', { moves: 9, hints: 1 }), seconds: 80 };
  f.store.portalResult(f.player, second);
  f.store.portalResult(f.player, { ...result(campaignSeed(12), 'free', { moves: 30, hints: 0 }), seconds: 40 });
  let own = f.store.ownProfile(f.player), stat = own.stats.find(stat => stat.game === 'untangle');
  assert.deepEqual(own.untangle.campaign, [12]);
  assert.equal(own.untangle.totalSolved, 1);
  assert.deepEqual(own.untangle.puzzles[0], { seed: first.untangle.seed, level: 12, mode: 'campaign', moves: 9, hints: 0, seconds: 40, solves: 3 });
  assert.equal(stat.runs, 3); assert.equal(stat.best, '12'); assert.equal(stat.solved, 1); assert.equal(stat.completedLevels, 1);
  assert.ok(own.achievements.includes('untangle.master'));
  const other = f.add('Beta');
  assert.equal(f.store.ownProfile(other).untangle.totalSolved, 0);
  const publicProfile = f.store.publicProfile(own.id);
  assert.equal('untangle' in publicProfile, false);
  assert.equal(JSON.stringify(publicProfile).includes(first.untangle.seed), false);
  assert.equal(publicProfile.stats.find(stat => stat.game === 'untangle').solved, 1);
  f.restart();
  own = f.store.ownProfile(f.player);
  assert.deepEqual(own.untangle.campaign, [12]); assert.equal(own.untangle.puzzles[0].solves, 3);
  f.store.updateProfile(f.player, false, 0);
  assert.equal(f.store.publicProfile(own.id), null);
}));

test('all 24 verified canonical campaign stages award the atlas once without trusting a claimed max level', async () => fixture(({ store, player }) => {
  store.portalResult(player, result(campaignSeed(24)));
  assert.equal(store.ownProfile(player).achievements.includes('untangle.campaign'), false);
  for (let level = 1; level < 24; level++) store.portalResult(player, result(campaignSeed(level)));
  const own = store.ownProfile(player);
  assert.deepEqual(own.untangle.campaign, Array.from({ length: 24 }, (_, i) => i + 1));
  assert.equal(own.untangle.totalSolved, 24);
  assert.equal(own.achievements.filter(id => id === 'untangle.campaign').length, 1);
  assert.equal(own.achievementRarity['untangle.campaign'], 100);
}));

test('daily puzzle dates, delayed receipts, unique days and Moscow streaks are derived from canonical seeds', async () => fixture(({ store, player }) => {
  const today = moscowDay(), tomorrow = dayOffset(today, 1);
  const future = result(dailySeed(tomorrow), 'daily', { day: tomorrow });
  assert.throws(() => store.portalResult(player, future), PortalResultInvalidError);
  const todayRun = result(dailySeed(today), 'daily', { day: today });
  assert.throws(() => store.portalResult(player, { ...todayRun, untangle: { ...todayRun.untangle, day: '2026-02-30' } }), PortalResultInvalidError);
  for (const offset of [-7, -5, -6, -2, -3, -1, -4]) {
    const day = dayOffset(today, offset);
    const run = result(dailySeed(day), 'daily', { day });
    store.portalResult(player, run); store.portalResult(player, run);
  }
  let own = store.ownProfile(player);
  assert.equal(own.untangle.dailySolved, 7); assert.equal(own.untangle.dailyStreak, 7); assert.equal(own.untangle.bestDailyStreak, 7);
  assert.ok(own.achievements.includes('untangle.week')); assert.ok(own.achievements.includes('untangle.streak'));
  store.portalResult(player, todayRun);
  store.portalResult(player, result(dailySeed(today), 'daily', { day: today }));
  own = store.ownProfile(player);
  assert.equal(own.untangle.dailySolved, 8); assert.equal(own.untangle.dailyStreak, 8); assert.equal(own.untangle.totalSolved, 8);
  const oldDay = dayOffset(today, -20);
  store.portalResult(player, result(dailySeed(oldDay), 'daily', { day: oldDay }));
  assert.equal(store.ownProfile(player).untangle.dailyStreak, 8, 'an older offline receipt cannot reset the current run of days');
}));

test('cloud receipts remain bounded while retaining campaign and durable historical totals', async () => fixture(f => {
  for (const [mechanics, version] of [['drag', 'NEST1'], ['drag', 'NEST2'], ['swap', 'KNOT1']]) {
    for (let level = 1; level <= 24; level++) f.store.portalResult(f.player, result(campaignSeed(level, mechanics, version)));
  }
  for (const mechanics of ['drag','swap']) for (let level=1;level<=3;level++) f.store.portalResult(f.player,result(campaignSeed(level,mechanics)));
  for (let seed = 1; seed <= 260; seed++) f.store.portalResult(f.player, result(formatSeed(1, seed), 'free'));
  const own = f.store.ownProfile(f.player);
  assert.equal(own.untangle.totalSolved, 338); assert.equal(own.untangle.puzzles.length, 256);
  assert.equal(own.untangle.campaign.length, 24); assert.equal(own.untangle.hardCampaign.length, 24); assert.equal(own.untangle.legacyCampaign.length, 24);
  assert.equal(own.untangle.puzzles.filter(puzzle => puzzle.mode === 'campaign').length, 78);
  assert.ok(own.untangle.puzzles.some(puzzle => puzzle.seed === campaignSeed(1)));
  f.restart();
  assert.equal(f.store.ownProfile(f.player).untangle.totalSolved, 338);
}));

test('legacy and current campaign credit remains independent, while either complete ordinary edition awards the atlas', async () => fixture(({ store, player }) => {
  for (let level = 1; level <= 12; level++) store.portalResult(player, result(campaignSeed(level, 'drag', 'NEST1')));
  for (let level = 13; level <= 24; level++) store.portalResult(player, result(campaignSeed(level)));
  let own = store.ownProfile(player);
  assert.equal(own.untangle.campaign.length, 12); assert.equal(own.untangle.legacyCampaign.length, 12);
  assert.equal(own.untangle.hardCampaign.length, 0);
  assert.equal(own.achievements.includes('untangle.campaign'), false, 'two incomplete editions cannot be combined into a full campaign');
  for (let level = 13; level <= 24; level++) store.portalResult(player, result(campaignSeed(level, 'drag', 'NEST1')));
  own = store.ownProfile(player);
  assert.ok(own.achievements.includes('untangle.campaign'));
  assert.equal(own.untangle.legacyCampaign.length, 24); assert.equal(own.untangle.campaign.length, 12);
  const stat = own.stats.find(stat => stat.game === 'untangle');
  assert.equal(stat.completedLevels, 12); assert.equal(stat.legacyCompletedLevels, 24); assert.equal(stat.hardCompletedLevels, 0);
}));

test('swap-only results require an exact slot permutation even when other coordinates solve the geometry', async () => fixture(({ store, player }) => {
  const good = result(campaignSeed(12, 'swap')), puzzle = generatePuzzle(good.untangle.seed);
  assert.equal(isSlotPermutation(puzzle, good.untangle.positions), true);
  const shifted = good.untangle.positions.map(point => ({ x: point.x + 0.125, y: point.y + 0.125 }));
  assert.equal(analyzeBoard(shifted, puzzle.edges).solved, true, 'translation preserves solved geometry');
  assert.equal(isSlotPermutation(puzzle, shifted), false);
  assert.throws(() => store.portalResult(player, { ...good, untangle: { ...good.untangle, positions: shifted } }), PortalResultInvalidError);
  const own = store.portalResult(player, good);
  assert.equal(own.untangle.totalSolved, 1); assert.equal(own.untangle.hardSolved, 1);
  assert.deepEqual(own.untangle.campaign, []); assert.deepEqual(own.untangle.hardCampaign, [12]);
  assert.ok(own.achievements.includes('untangle.hard.first')); assert.ok(own.achievements.includes('untangle.hard.master'));
  assert.equal(own.achievements.includes('untangle.hard.campaign'), false);
  assert.equal(own.stats.find(stat => stat.game === 'untangle').hardSolved, 1);
  for (let level = 1; level <= 24; level++) if (level !== 12) store.portalResult(player, result(campaignSeed(level, 'swap')));
  const completed = store.ownProfile(player);
  assert.equal(completed.untangle.hardCampaign.length, 24); assert.equal(completed.untangle.hardSolved, 24);
  assert.ok(completed.achievements.includes('untangle.hard.campaign'));
  assert.equal(completed.achievements.includes('untangle.campaign'), false, 'hard campaign is a separate achievement');
}));

test('daily receipts from all editions are accepted without triple-counting one Moscow day', async () => fixture(({ store, player }) => {
  const day = moscowDay();
  for (const [mechanics, version] of [['drag', 'NEST1'], ['drag', 'NEST2'], ['swap', 'KNOT1']]) {
    store.portalResult(player, result(dailySeed(day, mechanics, version), 'daily', { day }));
  }
  const own = store.ownProfile(player);
  assert.equal(own.untangle.totalSolved, 3); assert.equal(own.untangle.hardSolved, 1);
  assert.equal(own.untangle.dailySolved, 1); assert.equal(own.untangle.dailyStreak, 1);
  assert.deepEqual(own.untangle.campaign, []); assert.deepEqual(own.untangle.hardCampaign, []);
}));

test('explicit guest imports belong to one account across retries and restart without partial writes on rejection', async () => fixture(f => {
  const beta = f.add('Beta'), imported = { ...result(), guestImport: true };
  f.store.portalResult(f.player, imported); f.store.portalResult(f.player, imported);
  assert.equal(f.store.ownProfile(f.player).stats.find(stat => stat.game === 'untangle').runs, 1);
  assert.throws(() => f.store.portalResult(beta, imported), PortalGuestClaimedError);
  assert.equal(f.store.ownProfile(beta).untangle.totalSolved, 0);
  assert.deepEqual(f.store.ownProfile(beta).stats, []);
  f.restart();
  assert.throws(() => f.store.portalResult(beta, imported), PortalGuestClaimedError);
  assert.equal(f.store.portalResult(f.player, imported).untangle.totalSolved, 1);
  const retry = { ...result(campaignSeed(2)), guestImport: true }, unsolved = generatePuzzle(retry.untangle.seed).initial;
  assert.throws(() => f.store.portalResult(f.player, { ...retry, untangle: { ...retry.untangle, positions: unsolved } }), PortalResultInvalidError);
  assert.equal(f.store.portalResult(beta, retry).untangle.totalSolved, 1, 'a rejected solution never reserves its guest claim');
  const publicProfile = f.store.publicProfile(f.store.ownProfile(f.player).id);
  assert.equal(JSON.stringify(publicProfile).includes(imported.id), false);
  assert.equal(JSON.stringify(publicProfile).includes('guestImport'), false);
}));

test('tutorial replacements preserve old first-three credit and records without duplicating completed levels',async()=>fixture(f=>{
  for(const mechanics of ['drag','swap'])for(let level=1;level<=3;level++) {
    f.store.portalResult(f.player,result(campaignSeed(level,mechanics,mechanics==='drag'?'NEST2':'KNOT1')));
  }
  const before=f.store.ownProfile(f.player).untangle;
  assert.deepEqual(before.campaign,[1,2,3]);assert.deepEqual(before.hardCampaign,[1,2,3]);
  for(const mechanics of ['drag','swap'])for(let level=1;level<=3;level++) {
    const seed=campaignSeed(level,mechanics);
    assert.ok(seed.startsWith(mechanics==='drag'?'NEST3-':'KNOT2-'));
    f.store.portalResult(f.player,result(seed,'campaign',{moves:level}));
  }
  let profile=f.store.ownProfile(f.player),progress=profile.untangle;
  assert.equal(progress.campaignVersion,2);assert.deepEqual(progress.campaign,[1,2,3]);assert.deepEqual(progress.hardCampaign,[1,2,3]);
  assert.deepEqual(progress.legacyCampaign,[]);assert.equal(progress.totalSolved,12);assert.equal(progress.hardSolved,6);
  for(const previous of before.puzzles)assert.deepEqual(progress.puzzles.find(record=>record.seed===previous.seed),previous,'old per-seed bests are preserved verbatim');
  const stat=profile.stats.find(stat=>stat.game==='untangle');
  assert.equal(stat.completedLevels,3);assert.equal(stat.hardCompletedLevels,3);assert.equal(stat.hardSolved,6);
  f.restart();assert.deepEqual(f.store.ownProfile(f.player).untangle.campaign,[1,2,3]);
  for(const mechanics of ['drag','swap'])for(let level=4;level<=24;level++) f.store.portalResult(f.player,result(campaignSeed(level,mechanics)));
  profile=f.store.ownProfile(f.player);
  assert.equal(profile.untangle.campaign.length,24);assert.equal(profile.untangle.hardCampaign.length,24);
  assert.equal(profile.untangle.totalSolved,54);assert.equal(profile.untangle.hardSolved,27);
  assert.ok(profile.achievements.includes('untangle.campaign'));assert.ok(profile.achievements.includes('untangle.hard.campaign'));
}));

test('new swap tutorial awards existing hard-mode badges and still rejects off-slot solved layouts',async()=>fixture(({store,player})=>{
  const run=result(campaignSeed(1,'swap')),puzzle=generatePuzzle(run.untangle.seed);
  assert.ok(run.untangle.seed.startsWith('KNOT2-'));
  const translated=run.untangle.positions.map(point=>({x:point.x+0.125,y:point.y+0.125}));
  assert.ok(analyzeBoard(translated,puzzle.edges).solved);
  assert.throws(()=>store.portalResult(player,{...run,untangle:{...run.untangle,positions:translated}}),PortalResultInvalidError);
  const own=store.portalResult(player,run);
  assert.ok(own.achievements.includes('untangle.hard.first'));
  assert.equal(own.achievements.includes('untangle.hard.master'),false);
  assert.equal(own.untangle.hardSolved,1);assert.deepEqual(own.untangle.hardCampaign,[1]);
}));
