import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyAction, availableEndings, canAppeal, canFile, currentCase, dailyResult, dailySeed, moscowDay, newRun, parseRun, replay, restoreRun, retryShift } from '../src/features/Commission/engine.ts';
import { casesFor, observation } from '../src/features/Commission/cases.ts';
import { claims, shifts, tools } from '../src/features/Commission/content.ts';

const id = '12345678-1234-4234-8234-123456789abc';
function harness(mode = 'campaign', seed = id) {
  let run = newRun(mode, '2026-10-22', id);
  if (mode === 'campaign') run.seed = `COMMISSION1-${seed}`;
  let state = initialState(run);
  return { get state() { return state; }, get run() { return run; }, act(action) { state = applyAction(state, action); run.actions.push(action); return state; } };
}
function checkItem(h, decision) {
  const item = currentCase(h.state);
  for (const tool of item.mandatory) if (!h.state.observed.includes(tool)) h.act({ type: 'tool', tool });
  h.act({ type: 'decide', decision: decision ?? (item.defect === 'none' ? 'admit' : 'reject'), reason: item.defect });
}
function work(h) {
  h.act({ type: 'start' });
  while (h.state.phase === 'desk') { checkItem(h); h.act({ type: 'next' }); }
}
function campaign(path = 'open', seed = id) {
  const h = harness('campaign', seed);
  for (let day = 1; day <= 12; day++) {
    work(h);
    if (canAppeal(h.state)) h.act({ type: 'appeal' });
    h.act({ type: 'evening' });
    assert.equal(h.state.phase, 'evening', `unexpected dismissal on day ${day}`);
    h.act({ type: 'choice', option: path === 'private' || path === 'approved' ? 1 : 0 });
    for (const claim of Object.keys(claims)) if (canFile(h.state, claim) && !h.state.claims.includes(claim)) h.act({ type: 'file', claim });
    h.act({ type: 'advance' });
  }
  return h;
}

test('twelve authored shifts have two genuine choices and both locales', () => {
  assert.equal(shifts.length, 12);
  for (const shift of shifts) {
    for (const key of ['title', 'letter', 'rule', 'event']) for (const lang of ['ru', 'en']) assert.ok(shift[key][lang].length > 5);
    assert.equal(shift.options.length, 2);
    for (const option of shift.options) assert.ok(option.label.ru && option.label.en && option.effect.ru && option.effect.en);
  }
});
test('all campaign referrals are available and affordable, across seeds', () => {
  for (let seed = 0; seed < 100; seed++) for (let day = 1; day <= 12; day++) {
    const queue = casesFor(`valid-seed-${seed}`, day);
    assert.equal(queue.length, 6);
    assert.equal(new Set(queue.map(c => c.id)).size, queue.length);
    for (const item of queue) for (const tool of item.mandatory) assert.ok(tools[tool].day <= day, `${day}:${tool}`);
    assert.deepEqual(queue, casesFor(`valid-seed-${seed}`, day));
  }
});
test('legitimate fresh/aged specimens, mass and damaged shells have stable distinct observations', () => {
  const cases = Array.from({ length: 12 }, (_, i) => casesFor('test-content', i + 1)).flat();
  for (const item of cases) for (const tool of Object.keys(tools)) {
    const value = observation(item, tool);
    assert.ok(value.ru && value.en);
    assert.deepEqual(value, observation(structuredClone(item), tool));
  }
  const aged = cases.find(c => c.style === 'aged' && c.defect === 'none');
  assert.match(observation(aged, 'light').en, /admissible/);
});
test('all four endings are earned, reachable, replayable and terminal', () => {
  for (const ending of ['approved', 'open', 'free', 'private']) {
    const h = campaign(ending);
    assert.equal(h.state.day, 12);
    assert.ok(availableEndings(h.state).includes(ending), `${ending} unavailable`);
    h.act({ type: 'end', ending });
    assert.equal(h.state.ending, ending);
    assert.deepEqual(replay(h.run), h.state);
    assert.deepEqual(restoreRun(JSON.parse(JSON.stringify(h.run))).state, h.state);
    assert.throws(() => h.act({ type: 'start' }), /finished/);
  }
});
test('unsupported rejection and skipped mandatory checks count as errors', () => {
  const h = harness(); h.act({ type: 'start' });
  h.act({ type: 'decide', decision: 'admit', reason: 'none' });
  assert.equal(h.state.receipt.correct, false); assert.equal(h.state.receipt.procedural, false);
  h.act({ type: 'next' });
  h.act({ type: 'decide', decision: 'reject', reason: 'mass' });
  assert.equal(h.state.receipt.factual, true); assert.equal(h.state.receipt.supported, false); assert.equal(h.state.receipt.correct, false);
});
test('ordinary defects support their exact observed grounds; no trial-and-error tool rerolls', () => {
  const h = harness(); h.act({ type: 'start' }); checkItem(h); h.act({ type: 'next' });
  const before = structuredClone(h.state); h.act({ type: 'tool', tool: 'scale' });
  assert.equal(h.state.time, before.time - 1); assert.equal(before.observed.length, 0);
  assert.throws(() => h.act({ type: 'tool', tool: 'scale' }), /already_checked/);
  h.act({ type: 'decide', decision: 'reject', reason: 'shell' });
  assert.equal(h.state.receipt.correct, false);
});
test('political sanctions remain distinct from correct inspections and can be appealed', () => {
  const h = harness();
  for (let day = 1; day <= 8; day++) {
    work(h);
    if (day === 8) break;
    h.act({ type: 'evening' }); h.act({ type: 'choice', option: 0 }); h.act({ type: 'advance' });
  }
  const report = h.state.reports.at(-1);
  assert.equal(report.errors, 0); assert.equal(report.political, true); assert.equal(report.sanction, true);
  assert.equal(h.state.receipts.filter(r => r.political).every(r => r.correct), true);
  const count = h.state.strikes, money = h.state.budget;
  h.act({ type: 'appeal' }); assert.equal(h.state.strikes, count - 1); assert.equal(h.state.budget, money - 2);
  assert.throws(() => h.act({ type: 'appeal' }), /appeal_unavailable/);
});
test('three active sanctions genuinely dismiss; retry preserves specimen facts', () => {
  const h = harness();
  for (let day = 1; day <= 4; day++) {
    h.act({ type: 'start' }); h.act({ type: 'close' }); h.act({ type: 'evening' });
    if (day < 4) { h.act({ type: 'choice', option: 1 }); h.act({ type: 'advance' }); }
  }
  assert.equal(h.state.ending, 'dismissed'); assert.equal(h.state.strikes, 3);
  const retried = retryShift(h.run), restored = replay(retried);
  assert.equal(restored.phase, 'brief'); assert.equal(restored.day, 4);
  assert.deepEqual(restored.queue, h.state.queue); assert.notEqual(retried.id, h.run.id);
});
test('deferrals have two slots, return next shift and do not erase physical defects', () => {
  const h = harness();
  for (let day = 1; day < 3; day++) { work(h); h.act({ type: 'evening' }); h.act({ type: 'choice', option: 1 }); h.act({ type: 'advance' }); }
  h.act({ type: 'start' });
  h.act({ type: 'tool', tool: 'inspect' }); h.act({ type: 'tool', tool: 'scale' });
  h.act({ type: 'decide', decision: 'hold', reason: 'none' }); h.act({ type: 'next' });
  h.act({ type: 'decide', decision: 'hold', reason: 'none' }); h.act({ type: 'next' });
  assert.throws(() => h.act({ type: 'decide', decision: 'hold', reason: 'none' }), /hold_unavailable/);
  while (h.state.phase === 'desk') { checkItem(h); h.act({ type: 'next' }); }
  h.act({ type: 'evening' }); h.act({ type: 'choice', option: 1 }); h.act({ type: 'advance' });
  assert.equal(h.state.queue.length, 8); assert.equal(h.state.queue[0].returned, true); assert.equal(h.state.queue[0].defect, 'seal');
  assert.deepEqual(h.state.observed, ['inspect', 'scale']);
  h.act({ type: 'start' }); assert.throws(() => h.act({ type: 'decide', decision: 'hold', reason: 'none' }), /hold_unavailable/);
});
test('a guarantee only excuses expired paperwork, is bounded and requires checks', () => {
  const h = harness();
  for (let day = 1; day < 5; day++) { work(h); h.act({ type: 'evening' }); h.act({ type: 'choice', option: 0 }); h.act({ type: 'advance' }); }
  h.act({ type: 'start' }); checkItem(h, 'guarantee');
  assert.equal(h.state.receipt.correct, true); assert.ok(h.state.achievements.includes('guarantee'));
  h.act({ type: 'next' }); assert.throws(() => h.act({ type: 'decide', decision: 'guarantee', reason: 'none' }), /guarantee_unavailable/);
});
test('claims need corroboration; closed finale does not grant unearned branches', () => {
  const h = harness(); work(h); h.act({ type: 'evening' });
  assert.throws(() => h.act({ type: 'file', claim: 'source' }), /missing_proof/);
  const loyal = campaign('approved');
  assert.equal(availableEndings(loyal.state).includes('open'), false);
  assert.throws(() => loyal.act({ type: 'end', ending: 'open' }), /ending_locked/);
});
test('daily layout is stable across locales/timezones and every referral is affordable', () => {
  assert.equal(moscowDay(Date.parse('2026-10-21T21:00:00Z')), '2026-10-22');
  assert.equal(moscowDay(Date.parse('2026-10-21T20:59:59Z')), '2026-10-21');
  for (let date = 1; date <= 28; date++) {
    const run = newRun('daily', `2026-10-${String(date).padStart(2, '0')}`, id);
    let s = initialState(run); const allowance = s.time;
    s = applyAction(s, { type: 'start' });
    while (s.phase === 'desk') {
      const item = currentCase(s);
      for (const tool of item.mandatory) s = applyAction(s, { type: 'tool', tool });
      s = applyAction(s, { type: 'decide', decision: item.defect === 'none' ? 'admit' : 'reject', reason: item.defect });
      s = applyAction(s, { type: 'next' });
    }
    s = applyAction(s, { type: 'evening' });
    const result = dailyResult(s);
    assert.equal(result.correct, 8); assert.equal(result.score, 800); assert.ok(result.time >= 6 && result.time < allowance);
  }
});
test('reject-everything loses to substantiated daily decisions', () => {
  const h = harness('daily'); h.act({ type: 'start' });
  while (h.state.phase === 'desk') { h.act({ type: 'decide', decision: 'reject', reason: 'mass' }); h.act({ type: 'next' }); }
  h.act({ type: 'evening' }); assert.equal(dailyResult(h.state).score, 0);
});
test('corrupt, oversize, impossible, mismatched and future-version saves are rejected', () => {
  const valid = newRun('daily', '2026-10-22', id);
  for (const value of [null, {}, { ...valid, version: 2 }, { ...valid, date: '2026-02-30' }, { ...valid, seed: dailySeed('2026-10-21') }, { ...valid, actions: Array(2501).fill({ type: 'start' }) }, { ...valid, actions: [{ type: 'hack', score: 9e99 }] }, { ...valid, actions: [{ type: 'end', ending: 'open' }] }]) assert.equal(restoreRun(value), null);
  assert.equal(parseRun(valid).mode, 'daily');
});
