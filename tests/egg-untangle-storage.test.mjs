import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { campaignSeed, dailySeed, formatSeed, generatePuzzle, parseSeed } from '../src/features/EggUntangle/engine.ts';
import { guestNestResults, markGuestNestClaimed, nestKey, mergeNestProgress, readNestProgress, readNestSession, saveNestRecord, saveNestSession } from '../src/features/EggUntangle/storage.ts';

const values = new Map();
globalThis.localStorage = { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
const session = owner => { const seed = campaignSeed(3); return { seed, mode: 'campaign', points: generatePuzzle(seed).initial, moves: 4, hints: 1, seconds: 12, ticket: { id: randomUUID(), game: 'untangle', owner }, done: false }; };
const record = (level, moves = 12, seconds = 40) => ({ seed: campaignSeed(level), level, mode: 'campaign', moves, seconds, hints: 0 });

test('unfinished layouts and result records stay isolated by account and guest', () => {
  const first = session('first'); saveNestSession(first); saveNestRecord('first', record(3));
  assert.deepEqual(readNestSession('first'), first);
  assert.equal(readNestSession('second', first.seed), null);
  assert.equal(readNestSession(null, first.seed), null);
  assert.deepEqual(readNestProgress('second').campaign, []);
  assert.deepEqual(readNestProgress('first').campaign, [3]);
});
test('cloud progress unions campaign completion and tracks independent move and time minima', () => {
  saveNestRecord('merge', record(1, 9, 50));
  const merged = mergeNestProgress('merge', { campaignVersion: 2, campaign: [1, 2], puzzles: [record(1, 12, 30), record(2)], dailySolved: 4, totalSolved: 6 });
  assert.deepEqual(merged.campaign, [1, 2]);
  assert.equal(merged.puzzles.find(p => p.level === 1).moves, 9);
  assert.equal(merged.puzzles.find(p => p.level === 1).seconds, 30);
  assert.equal(merged.dailySolved, 4);
});
test('corrupt coordinates, forged solved flag and wrong context are rejected on restore', () => {
  const value = session('corrupt'), key = nestKey('corrupt', `session:${value.seed}`);
  for (const broken of [{ ...value, points: [{ x: null, y: 20 }] }, { ...value, done: true }, { ...value, mode: 'daily', day: '2026-02-31' }, { ...value, seconds: -1 }, { ...value, ticket: { ...value.ticket, owner: 'other' } }]) {
    localStorage.setItem(key, JSON.stringify(broken));
    assert.equal(readNestSession('corrupt', value.seed), null);
  }
});
test('browser storage failure retains current-tab progress and truthfully reports nondurable saves', () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  try { const s = session('memory-only'); assert.equal(saveNestSession(s), false); assert.deepEqual(readNestSession('memory-only'), s); assert.equal(saveNestRecord('memory-only', record(3)).durable, false); assert.deepEqual(readNestProgress('memory-only').campaign, [3]); }
  finally { globalThis.localStorage = previous; }
});

test('cloud aggregates survive reloads and later local records, while expired current streak can reset', () => {
  const owner = 'aggregate-retention';
  mergeNestProgress(owner, { campaignVersion: 2, campaign: [1], puzzles: [record(1)], totalSolved: 261, dailySolved: 40, dailyStreak: 7, bestDailyStreak: 12 });
  assert.equal(readNestProgress(owner).totalSolved, 261);
  saveNestRecord(owner, record(2));
  const saved = readNestProgress(owner);
  assert.equal(saved.totalSolved, 261);
  assert.equal(saved.dailySolved, 40);
  assert.equal(saved.dailyStreak, 7);
  assert.equal(saved.bestDailyStreak, 12);
  const incoming = mergeNestProgress(owner, { campaignVersion: 2, campaign: [], puzzles: [], totalSolved: 200, dailySolved: 30, dailyStreak: 0, bestDailyStreak: 8 });
  assert.equal(incoming.totalSolved, 261, 'an older cloud response cannot lower cumulative totals');
  assert.equal(incoming.dailySolved, 40);
  assert.equal(incoming.bestDailyStreak, 12);
  assert.equal(incoming.dailyStreak, 0, 'the current streak is allowed to expire');
});

test('bounded records retain all campaign personal bests after hundreds of free nests', () => {
  const owner = 'bounded';
  for (let level = 1; level <= 24; level++) saveNestRecord(owner, record(level));
  for (let seed = 0; seed < 280; seed++) saveNestRecord(owner, { seed: formatSeed(8, seed), level: 8, mode: 'free', moves: 20, seconds: 30, hints: 0 });
  const saved = readNestProgress(owner);
  assert.equal(saved.puzzles.length, 256);
  assert.equal(saved.campaign.length, 24);
  assert.equal(saved.puzzles.filter(value => value.mode === 'campaign').length, 24);
  assert.equal([...values.keys()].filter(key => key.startsWith(nestKey(owner, 'record:'))).length, 256);
  mergeNestProgress(owner, { campaignVersion: 2, campaign: [1], puzzles: [record(1, 8, 20)] });
  assert.equal(readNestProgress(owner).puzzles.find(value => value.seed === campaignSeed(1)).moves, 8);
});

test('individual seed records recover different tabs completions even when their summary writes race', () => {
  const owner = 'concurrent-tabs';
  saveNestRecord(owner, record(1));
  const staleSummary = localStorage.getItem(nestKey(owner, 'progress'));
  saveNestRecord(owner, record(2));
  // A second tab finishes a write based on its older summary after the first tab.
  localStorage.setItem(nestKey(owner, 'progress'), staleSummary);
  assert.deepEqual(readNestProgress(owner).campaign, [1, 2]);
  assert.equal(readNestProgress(owner).puzzles.length, 2);
});

test('quota failure cannot make stale durable data hide newer current-tab records', () => {
  const owner = 'quota-with-old-data';
  saveNestRecord(owner, record(1, 20, 30));
  const previous = globalThis.localStorage;
  globalThis.localStorage = { ...previous, setItem() { throw Error('quota exceeded'); } };
  try {
    assert.equal(saveNestRecord(owner, record(1, 5, 10)).durable, false);
    assert.equal(readNestProgress(owner).puzzles[0].moves, 5);
    assert.equal(readNestProgress(owner).puzzles[0].seconds, 10);
  } finally { globalThis.localStorage = previous; }
});

test('merging free results cannot downgrade canonical context or discard cloud solve counts', () => {
  const owner = 'canonical-context';
  mergeNestProgress(owner, { campaignVersion: 2, campaign: [3], puzzles: [{ ...record(3), solves: 8 }] });
  saveNestRecord(owner, { ...record(3, 7, 12), mode: 'free' });
  const best = readNestProgress(owner).puzzles[0];
  assert.equal(best.mode, 'campaign');
  assert.equal(best.solves, 8);
  assert.equal(best.moves, 7);
  const seed = dailySeed('2026-10-03'), daily = { seed, level: parseSeed(seed).level, mode: 'daily', day: '2026-10-03', moves: 5, seconds: 10, hints: 0 };
  saveNestRecord(owner, daily);
  saveNestRecord(owner, { ...daily, mode: 'free', day: undefined });
  assert.equal(readNestProgress(owner).puzzles.find(value => value.seed === seed).mode, 'daily');
  assert.throws(() => saveNestRecord(owner, { ...daily, day: '2026-02-31' }), RangeError);
  assert.throws(() => saveNestRecord(owner, { ...daily, mode: 'campaign' }), RangeError);
});

test('old local and delayed cloud campaigns migrate to the legacy scroll without completing new stages', () => {
  const owner='edition-migration',oldRecord={...record(3),seed:campaignSeed(3,'drag','NEST1')};
  localStorage.setItem(nestKey(owner,'progress'),JSON.stringify({campaign:[3,4],puzzles:[oldRecord],totalSolved:2}));
  let progress=readNestProgress(owner);
  assert.deepEqual(progress.campaign,[]);assert.deepEqual(progress.legacyCampaign,[3,4]);assert.equal(progress.campaignVersion,2);
  saveNestRecord(owner,record(5));
  progress=mergeNestProgress(owner,{campaign:[1,2],puzzles:[],totalSolved:2});
  assert.deepEqual(progress.campaign,[5],'an unversioned old cloud response is never promoted to NEST2');
  assert.deepEqual(progress.legacyCampaign,[1,2,3,4]);
  progress=mergeNestProgress(owner,{campaignVersion:2,campaign:[6],hardCampaign:[7],legacyCampaign:[8],puzzles:[],hardSolved:1});
  assert.deepEqual(progress.campaign,[5,6]);assert.deepEqual(progress.hardCampaign,[7]);
  assert.deepEqual(progress.legacyCampaign,[1,2,3,4,8]);assert.equal(readNestProgress(owner).hardSolved,1);
});

test('swap-only sessions restore fixed slots and keep progress separate from ordinary campaign', () => {
  const owner='swap-restoration',seed=campaignSeed(12,'swap'),puzzle=generatePuzzle(seed);
  const value={seed,mode:'campaign',points:puzzle.initial,moves:4,hints:1,seconds:12,ticket:{id:randomUUID(),game:'untangle',owner},done:false};
  saveNestSession(value);assert.deepEqual(readNestSession(owner),value);
  saveNestRecord(owner,{seed,level:12,mode:'campaign',moves:9,seconds:33,hints:0});
  assert.deepEqual(readNestProgress(owner).hardCampaign,[12]);assert.deepEqual(readNestProgress(owner).campaign,[]);
  const key=nestKey(owner,`session:${seed}`);
  for(const points of [puzzle.initial.map(point=>({x:point.x+0.125,y:point.y+0.125})),puzzle.initial.map(()=>puzzle.initial[0])]) {
    localStorage.setItem(key,JSON.stringify({...value,points}));assert.equal(readNestSession(owner,seed),null);
  }
  localStorage.setItem(key,JSON.stringify({...value,points:puzzle.solution,done:true}));
  assert.equal(readNestSession(owner,seed).done,true);
});

test('completed guest proofs survive new attempts, legacy sessions and explicit one-owner claims', () => {
  const seed=campaignSeed(4,'drag','NEST1'),puzzle=generatePuzzle(seed);
  const first={seed,mode:'campaign',points:puzzle.solution,moves:8,hints:0,seconds:45,ticket:{id:randomUUID(),game:'untangle',owner:null},done:true};
  // A first-release terminal session has no separate guest receipt yet.
  localStorage.setItem(nestKey(null,`session:${seed}`),JSON.stringify(first));
  assert.ok(guestNestResults().some(result=>result.ticket.id===first.ticket.id));
  saveNestSession(first);
  const second={...first,ticket:{...first.ticket,id:randomUUID()},moves:6};saveNestSession(second);
  saveNestSession({...second,ticket:{...second.ticket,id:randomUUID()},points:puzzle.initial,done:false,moves:0});
  assert.ok(guestNestResults().some(result=>result.ticket.id===first.ticket.id));
  assert.ok(guestNestResults().some(result=>result.ticket.id===second.ticket.id));
  markGuestNestClaimed(first.ticket.id,'alpha');
  assert.equal(guestNestResults().some(result=>result.ticket.id===first.ticket.id),false);
  assert.equal(JSON.parse(localStorage.getItem(nestKey(null,`claimed:${first.ticket.id}`))),'alpha');
  assert.ok(guestNestResults().some(result=>result.ticket.id===second.ticket.id));
  const bad={...second,ticket:{...second.ticket,id:randomUUID()},points:puzzle.initial};
  localStorage.setItem(nestKey(null,`receipt:${bad.ticket.id}`),JSON.stringify(bad));
  assert.equal(guestNestResults().some(result=>result.ticket.id===bad.ticket.id),false,'a forged terminal flag is not an importable proof');
});

test('blocked storage retains a completed guest receipt and its claim within the current tab', () => {
  const previous=globalThis.localStorage,seed=campaignSeed(5,'swap'),puzzle=generatePuzzle(seed);
  const proof={seed,mode:'campaign',points:puzzle.solution,moves:8,hints:0,seconds:45,ticket:{id:randomUUID(),game:'untangle',owner:null},done:true};
  globalThis.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},get length(){throw Error('blocked');}};
  try {
    assert.equal(saveNestSession(proof),false);assert.ok(guestNestResults().some(result=>result.ticket.id===proof.ticket.id));
    markGuestNestClaimed(proof.ticket.id,'alpha');
    assert.equal(guestNestResults().some(result=>result.ticket.id===proof.ticket.id),false);
  } finally {globalThis.localStorage=previous;}
});

test('old and tutorial campaign seeds share stage credit while retaining separate personal bests',()=>{
  const owner='tutorial-family-progress';
  for(const mechanics of ['drag','swap'])for(let level=1;level<=3;level++) {
    const oldSeed=campaignSeed(level,mechanics,mechanics==='drag'?'NEST2':'KNOT1');
    saveNestRecord(owner,{seed:oldSeed,level,mode:'campaign',moves:20,seconds:60,hints:1});
  }
  const before=readNestProgress(owner);
  assert.deepEqual(before.campaign,[1,2,3]);assert.deepEqual(before.hardCampaign,[1,2,3]);
  for(const mechanics of ['drag','swap'])for(let level=1;level<=3;level++) {
    saveNestRecord(owner,{seed:campaignSeed(level,mechanics),level,mode:'campaign',moves:level,seconds:10,hints:0});
  }
  let progress=readNestProgress(owner);
  assert.equal(progress.campaignVersion,2);assert.deepEqual(progress.campaign,[1,2,3]);assert.deepEqual(progress.hardCampaign,[1,2,3]);
  assert.equal(progress.puzzles.length,12);assert.deepEqual(progress.legacyCampaign,[]);
  for(const previous of before.puzzles)assert.deepEqual(progress.puzzles.find(record=>record.seed===previous.seed),previous);
  progress=mergeNestProgress(owner,{campaignVersion:2,campaign:[4],hardCampaign:[4],puzzles:[],totalSolved:14,hardSolved:7});
  assert.deepEqual(progress.campaign,[1,2,3,4]);assert.deepEqual(progress.hardCampaign,[1,2,3,4]);
  assert.equal(readNestProgress(owner).puzzles.length,12);assert.equal(progress.hardSolved,7);
});

test('partial quota failure in any session write reports nondurable while retaining the complete current-tab proof', () => {
  const previous = globalThis.localStorage;
  for (const [index, failure] of ['session', 'receipt', 'last'].entries()) {
    const seed = formatSeed(3, 0xc000 + index, 'swap'), puzzle = generatePuzzle(seed);
    const proof = { seed, mode: 'free', points: puzzle.solution, moves: 8, hints: 0, seconds: 45,
      ticket: { id: randomUUID(), game: 'untangle', owner: null }, done: true };
    const keys = { session: nestKey(null, `session:${seed}`), receipt: nestKey(null, `receipt:${proof.ticket.id}`), last: nestKey(null, 'last') };
    const attempted = [];
    globalThis.localStorage = {
      ...previous,
      get length() { return values.size; },
      setItem(key, value) {
        attempted.push(key);
        if (key === keys[failure]) throw Error('quota exceeded for one write');
        return previous.setItem(key, value);
      },
    };
    try {
      assert.equal(saveNestSession(proof), false, `${failure} write must participate in the durability result`);
      assert.deepEqual(attempted, [keys.session, keys.receipt, keys.last], 'a failure must not skip later writes');
      assert.deepEqual(readNestSession(null), proof, 'the current tab can still resume its latest layout');
      assert.ok(guestNestResults().some(result => result.ticket.id === proof.ticket.id), 'the current tab keeps its importable proof');
    } finally { globalThis.localStorage = previous; }
    assert.equal(saveNestSession(proof), true, 'retry reports durable only after all writes succeed');
    assert.equal(JSON.parse(localStorage.getItem(keys.receipt)).ticket.id, proof.ticket.id);
  }
});
