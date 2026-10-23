import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, canAppeal, canFile, currentCase, newRun, parseAction, replay, restoreRun } from '../src/features/Commission/engine.ts';
import { casesFor } from '../src/features/Commission/cases.ts';
import { claims, tools } from '../src/features/Commission/content.ts';
import { actualProfile, airDepth, archiveRecords, certificate, crackSide, declaredOrigin, expectedAnswer, hasException, minutes, scaleOffset } from '../src/features/Commission/examination.ts';

function harness() {
  const run = newRun('campaign', '2026-10-23', '12345678-1234-4234-8234-123456789abc');
  let state = replay(run);
  return { run, get state() { return state; }, act(action) { state = applyAction(state, action); run.actions.push(action); return state; } };
}
function exam(item, tool, patch = {}) {
  return { type: 'examine', tool, answer: expectedAnswer(item, tool), sample: tool === 'inspect' ? 15 : tool === 'scale' ? item.mass : tool === 'light' ? airDepth(item) : 0, record: tool === 'archive' ? `${item.id}:current` : tool === 'plate' ? actualProfile(item) : '', ...patch };
}
function check(h, tool, patch) {
  if (tool !== 'inspect') h.act({ type: 'prepare', tool });
  h.act(exam(currentCase(h.state), tool, patch));
}
function finish(h, legacy = false) {
  const item = currentCase(h.state);
  for (const tool of item.mandatory) if (!h.state.observed.includes(tool)) legacy ? h.act({ type: 'tool', tool }) : check(h, tool);
  h.act({ type: 'decide', decision: item.defect === 'none' ? 'admit' : 'reject', reason: item.defect });
  return h.state.receipt;
}
function reach(h, day, legacy = false) {
  while (h.state.day < day) {
    h.act({ type: 'start' });
    while (h.state.phase === 'desk') { assert.equal(finish(h, legacy).correct, true); h.act({ type: 'next' }); }
    if (canAppeal(h.state)) h.act({ type: 'appeal' });
    h.act({ type: 'evening' }); h.act({ type: 'choice', option: 0 }); h.act({ type: 'advance' });
  }
}
test('starting a tool pays once and records neither a finding nor an exhibit', () => {
  const h = harness(); reach(h, 3); h.act({ type: 'start' });
  const before = h.state.time;
  h.act({ type: 'prepare', tool: 'archive' });
  assert.equal(h.state.time, before - tools.archive.cost);
  assert.deepEqual(h.state.observed, []); assert.deepEqual(h.state.findings, {});
  assert.throws(() => h.act({ type: 'prepare', tool: 'archive' }), /already_checked/);
  assert.deepEqual(restoreRun(JSON.parse(JSON.stringify(h.run))).state, h.state);
  h.act(exam(currentCase(h.state), 'archive'));
  assert.equal(h.state.time, before - tools.archive.cost);
  assert.throws(() => h.act(exam(currentCase(h.state), 'archive')), /already_checked/);
});
test('a partial shell turn is explicit; all four sides are required before recording', () => {
  const h = harness(); h.act({ type: 'start' });
  assert.throws(() => h.act(exam(currentCase(h.state), 'inspect', { sample: 3 })), /incomplete_inspection/);
  check(h, 'inspect'); assert.ok(h.state.observed.includes('inspect'));
  const sides = new Set();
  for (let i = 0; i < 100; i++) for (const item of casesFor(`shell-seed-${i}`, 2)) { assert.notEqual(crackSide(item), 0); sides.add(crackSide(item)); }
  assert.equal(sides.size, 3);
});
test('recording an inaccurate observation does not reveal the answer; signing incurs a finding', () => {
  const h = harness(); h.act({ type: 'start' });
  check(h, 'inspect', { answer: 'shell' }); check(h, 'scale');
  assert.equal(h.state.receipt, null);
  h.act({ type: 'decide', decision: 'admit', reason: 'none' });
  assert.equal(h.state.receipt.factual, true); assert.equal(h.state.receipt.correct, false);
});
test('candling requires an accurate measured depth as well as the right conclusion', () => {
  const h = harness(); reach(h, 2); h.act({ type: 'start' });
  check(h, 'inspect'); check(h, 'scale'); check(h, 'light', { sample: 0 });
  h.act({ type: 'decide', decision: 'reject', reason: 'age' });
  assert.equal(h.state.receipt.factual, true); assert.equal(h.state.receipt.supported, false);
  for (const item of casesFor('air-cell-measurements', 12)) assert.equal(airDepth(item) > 6, item.defect === 'age' || item.style === 'aged');
});
test('miscalibrated scales cannot support approval even if the number looks plausible', () => {
  const h = harness(); reach(h, 5); h.act({ type: 'start' });
  const item = currentCase(h.state);
  check(h, 'inspect'); check(h, 'scale', { sample: item.mass + 1 }); check(h, 'archive');
  h.act({ type: 'decide', decision: 'guarantee', reason: 'permit' });
  assert.equal(h.state.receipt.correct, false);
  assert.ok(casesFor('scale-calibration', 6).some(item => scaleOffset(item) !== 0));
});
test('the wrong archive revision is retained as an error, not silently corrected', () => {
  const h = harness(); reach(h, 3); h.act({ type: 'start' });
  const item = currentCase(h.state);
  const rows = archiveRecords(item); assert.equal(rows.length, 3);
  const correct = rows.find(r => r.id.endsWith(':current'));
  assert.notEqual(correct.signature, certificate(item).signature);
  assert.notEqual(correct.seal, certificate(item).seal);
  check(h, 'archive', { record: `${item.id}:old` });
  h.act({ type: 'decide', decision: 'reject', reason: 'seal' });
  assert.equal(h.state.receipt.correct, false);
});
test('the day-five letter names one batch; Asya still needs renewal or guarantee', () => {
  const [asya, arkady] = casesFor('exception-check', 5);
  assert.equal(hasException(asya), false); assert.equal(hasException(arkady), true);
  assert.equal(certificate(asya).until, 4); assert.equal(certificate(arkady).until, 4);
  assert.equal(expectedAnswer(asya, 'archive'), 'permit'); assert.equal(expectedAnswer(arkady, 'archive'), 'none');
  assert.equal(archiveRecords(arkady).filter(r => r.exception).length, 1);
  for (const item of casesFor('origin-check', 6)) if (item.defect === 'origin') assert.notEqual(declaredOrigin(item).ru, archiveRecords(item).find(r => r.id.endsWith(':current')).origin.ru);
});
test('bad measured findings survive deferral and cannot be laundered into approval', () => {
  const h = harness(); reach(h, 3); h.act({ type: 'start' });
  check(h, 'scale', { sample: 0 });
  h.act({ type: 'decide', decision: 'hold', reason: 'none' }); h.act({ type: 'next' });
  while (h.state.phase === 'desk') { finish(h); h.act({ type: 'next' }); }
  h.act({ type: 'evening' }); h.act({ type: 'choice', option: 0 }); h.act({ type: 'advance' });
  assert.equal(h.state.queue[0].returned, true); assert.equal(h.state.findings.scale.valid, false);
  assert.deepEqual(replay(h.run), h.state);
});
test('old fifth-shift saves continue with new examinations without resetting history or money', () => {
  const h = harness(); reach(h, 5, true);
  const snapshot = structuredClone(h.state), restored = restoreRun(JSON.parse(JSON.stringify(h.run)));
  assert.equal(restored.state.day, 5); assert.equal(restored.state.budget, snapshot.budget);
  assert.deepEqual(restored.state.reports, snapshot.reports);
  h.act({ type: 'start' }); assert.equal(finish(h).correct, true);
  assert.deepEqual(h.state.reports, snapshot.reports);
});
test('two selected dossier documents must support the same conclusion and be owned', () => {
  const h = harness(); reach(h, 7); h.act({ type: 'start' });
  while (h.state.phase === 'desk') { finish(h); h.act({ type: 'next' }); }
  h.act({ type: 'evening' });
  assert.throws(() => h.act({ type: 'connect', claim: 'source', exhibits: ['source1', 'standard1'] }), /missing_proof/);
  assert.throws(() => h.act({ type: 'connect', claim: 'source', exhibits: ['source1', 'source1'] }), /missing_proof/);
  h.act({ type: 'connect', claim: 'source', exhibits: ['source1', 'source2'] });
  assert.deepEqual(h.state.claims, ['source']);
});
test('all twelve shifts and the open ending remain playable with hands-on checks', () => {
  const h = harness();
  for (let day = 1; day <= 12; day++) {
    h.act({ type: 'start' });
    while (h.state.phase === 'desk') { assert.equal(finish(h).correct, true, `${day}/${h.state.index}`); h.act({ type: 'next' }); }
    if (canAppeal(h.state)) h.act({ type: 'appeal' });
    h.act({ type: 'evening' }); h.act({ type: 'choice', option: 0 });
    for (const id of Object.keys(claims)) if (canFile(h.state, id) && !h.state.claims.includes(id)) h.act({ type: 'connect', claim: id, exhibits: claims[id].required.filter(p => h.state.proofs.includes(p)).slice(0, 2) });
    h.act({ type: 'advance' });
  }
  h.act({ type: 'end', ending: 'open' });
  assert.equal(h.state.score, 7200); assert.deepEqual(replay(h.run), h.state);
  assert.equal(h.state.proofs.length, 9); assert.equal(h.state.ending, 'open');
  assert.ok(h.run.actions.length < 2500);
});
test('examination payloads are bounded and time display keeps old economics', () => {
  assert.equal(parseAction({ type: 'examine', tool: 'light', answer: 'seal', sample: 4, record: '' }), null);
  assert.equal(parseAction({ type: 'examine', tool: 'light', answer: 'none', sample: Infinity, record: '' }), null);
  assert.equal(parseAction({ type: 'examine', tool: 'light', answer: 'none', sample: 4, record: 'x'.repeat(101) }), null);
  assert.equal(parseAction({ type: 'connect', claim: 'source', exhibits: ['source1', '__proto__'] }), null);
  assert.equal(minutes(24), 120); assert.equal(minutes(4), 20);
});
