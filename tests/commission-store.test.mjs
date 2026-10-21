import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createCommissionStore, CommissionConflict, CommissionInvalid } from '../src/server/commissionStore.ts';
import { applyAction, currentCase, initialState, moscowDay, newRun } from '../src/features/Commission/engine.ts';
import { reconcile, readLocal, writeLocal, storageKey } from '../src/features/Commission/storage.ts';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'commission-test-'));
  const db = new DatabaseSync(join(dir, 'records.sqlite'));
  db.exec("CREATE TABLE neighboring_data (id TEXT PRIMARY KEY, value TEXT) STRICT; INSERT INTO neighboring_data VALUES ('keep', 'untouched')"); db.close();
  const store = createCommissionStore(dir);
  t.after(() => { store.close(); const check = new DatabaseSync(join(dir, 'records.sqlite')); assert.equal(check.prepare('SELECT value FROM neighboring_data').get().value, 'untouched'); assert.equal(check.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); check.close(); rmSync(dir, { recursive: true }); });
  return store;
}
function daily() {
  const run = newRun('daily'), act = a => { state = applyAction(state, a); run.actions.push(a); };
  let state = initialState(run); act({ type: 'start' });
  while (state.phase === 'desk') {
    const item = currentCase(state);
    for (const tool of item.mandatory) act({ type: 'tool', tool });
    act({ type: 'decide', decision: item.defect === 'none' ? 'admit' : 'reject', reason: item.defect }); act({ type: 'next' });
  }
  act({ type: 'evening' }); return run;
}
test('private saves use account and slot identity; other tables are preserved', t => {
  const store = setup(t), run = newRun('campaign');
  const saved = store.save('alice', run, 0);
  assert.equal(saved.revision, 1); assert.equal(store.read('alice', 'campaign').run.id, run.id);
  assert.equal(store.read('bob', 'campaign').run, null); assert.equal(store.read('alice', `daily:${moscowDay()}`).run, null);
  assert.deepEqual(store.standings(moscowDay()), []); assert.deepEqual(store.badges('bob'), []);
});
test('CAS prevents stale-device overwrites; valid append and idempotent retry work', t => {
  const store = setup(t), run = newRun('campaign');
  store.save('alice', run, 0); assert.equal(store.save('alice', run, 1).revision, 1);
  run.actions.push({ type: 'start' }); store.save('alice', run, 1);
  assert.throws(() => store.save('alice', run, 1), CommissionConflict);
  const changed = { ...run, actions: [] };
  assert.throws(() => store.save('alice', changed, 2), CommissionConflict);
  assert.equal(store.save('alice', changed, 2, true).revision, 3);
});
test('a new campaign requires explicit replacement; malformed and impossible runs never save', t => {
  const store = setup(t), run = newRun('campaign'); store.save('alice', run, 0);
  assert.throws(() => store.save('alice', newRun('campaign'), 1), CommissionConflict);
  assert.throws(() => store.save('alice', { ...run, actions: [{ type: 'end', ending: 'open' }] }, 1, true), CommissionInvalid);
  assert.equal(store.read('alice', 'campaign').revision, 1);
});
test('standings require opt-in and completed replay; users can withdraw', t => {
  const store = setup(t), run = daily(), date = run.date;
  assert.throws(() => store.publish('alice', 'Alice', date, true), CommissionInvalid);
  store.save('alice', run, 0);
  assert.deepEqual(store.standings(date), []); assert.ok(store.badges('alice').includes('daily'));
  store.publish('alice', 'Alice', date, true);
  const rows = store.standings(date, 'alice'); assert.equal(rows[0].score, 800); assert.equal(rows[0].own, true);
  assert.equal('player' in rows[0], false); assert.equal('run' in rows[0], false);
  assert.equal(store.standings(date, 'bob')[0].own, false);
  store.publish('alice', 'Alice', date, false); assert.deepEqual(store.standings(date), []);
});
test('the server derives score from decisions, not submitted summary fields', t => {
  const store = setup(t), run = daily(); run.score = 999999;
  store.save('alice', run, 0); store.publish('alice', 'Alice', run.date, true);
  assert.equal(store.standings(run.date)[0].score, 800);
});
test('reconcile resumes cloud, merges a strict prefix and exposes true divergence', () => {
  const base = newRun('campaign'), longer = { ...base, actions: [{ type: 'start' }] };
  const envelope = { run: base, revision: 1, dirty: false, replace: false };
  assert.deepEqual(reconcile(envelope, { run: longer, revision: 2 }).value.run, longer);
  assert.equal(reconcile({ ...envelope, run: longer, dirty: true }, { run: base, revision: 1 }).value.dirty, true);
  assert.equal(reconcile({ ...envelope, dirty: true }, { run: newRun('campaign'), revision: 2 }).conflict, true);
});
test('local saves are account-scoped and blocked storage does not crash', () => {
  const map = new Map();
  globalThis.localStorage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  const run = newRun('campaign'), envelope = { run, revision: 0, dirty: true, replace: false };
  assert.equal(writeLocal('Alice', 'campaign', envelope), true);
  assert.equal(readLocal('alice', 'campaign').value.run.id, run.id);
  assert.equal(readLocal('Bob', 'campaign').value.run, null);
  assert.notEqual(storageKey('guest', 'campaign'), storageKey(null, 'campaign'));
  map.set(storageKey('Alice', 'campaign'), '{truncated');
  assert.equal(readLocal('Alice', 'campaign').corrupt, true);
  assert.equal(map.get(`${storageKey('Alice', 'campaign')}:recovery`), '{truncated');
  map.set(storageKey('Alice', 'campaign'), JSON.stringify({ ...envelope, run: { ...run, version: 99 } }));
  assert.equal(readLocal('Alice', 'campaign').corrupt, true);
  assert.ok(map.has(`${storageKey('Alice', 'campaign')}:recovery`));
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  assert.equal(readLocal(null, 'campaign').unavailable, true); assert.equal(writeLocal(null, 'campaign', envelope), false);
  delete globalThis.localStorage;
});
