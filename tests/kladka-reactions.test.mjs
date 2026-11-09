import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRoadRecordStore } from '../src/server/roadRecords.ts';
import { reactionNetwork } from '../src/server/kladkaReactions.ts';

const POST = '11111111-1111-4111-8111-111111111111';
const DAY = 86400000, NOW = Date.now();
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'egg-reactions-'));
  let store = createRoadRecordStore(directory), serial = 0;
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  return {
    get store() { return store; }, directory,
    account(initiated = true) {
      const name = `Adept ${++serial}`;
      store.register(`guest-${serial}`, name, 'test-password', 'test-recovery', `token-${serial}`);
      const player = store.credentials(name).player;
      if (initiated) store.completeInitiation(player);
      return player;
    },
    reopen() { store.close(); store = createRoadRecordStore(directory); },
  };
}

test('new accounts can react immediately after server initiation; guests and novices cannot', async t => {
  const f = await fixture(t), player = f.account(false);
  assert.deepEqual(f.store.reactionAccess(null), { reason: 'login' });
  assert.throws(() => f.store.setReaction(POST, 'guest', 'shell', 'network', NOW), { code: 'login' });
  assert.throws(() => f.store.setReaction(POST, player, 'shell', 'network', NOW), { code: 'initiation' });
  f.store.completeInitiation(player);
  assert.deepEqual(f.store.reactionAccess(player), { reason: 'ready' });
  assert.equal(f.store.setReaction(POST, player, 'shell', 'network').mine, 'shell');
});

test('set, replace, remove and lost-response retries give one vote across restarts and devices', async t => {
  const f = await fixture(t), player = f.account(), second = f.account();
  for (let n = 0; n < 100; n++) assert.deepEqual(f.store.setReaction(POST, player, 'shell', `device-${n}`, NOW), { counts: { shell: 1 }, mine: 'shell', selected: ['shell'] });
  f.store.setReaction(POST, second, 'shell', 'another-network', NOW);
  assert.deepEqual(f.store.setReaction(POST, player, 'yolk', 'another-device', NOW), { counts: { shell: 1, yolk: 1 }, mine: 'yolk', selected: ['yolk'] });
  f.reopen();
  assert.deepEqual(f.store.reactionSummaries([POST], player)[POST], { counts: { shell: 1, yolk: 1 }, mine: 'yolk', selected: ['yolk'] });
  assert.deepEqual(f.store.setReaction(POST, player, null, 'another-device', NOW), { counts: { shell: 1 }, mine: null, selected: [] });
  assert.deepEqual(f.store.setReaction(POST, player, null, 'another-device', NOW), { counts: { shell: 1 }, mine: null, selected: [] });
  assert.deepEqual(f.store.reactionSummaries([POST], null)[POST], { counts: { shell: 1 }, mine: null, selected: [] });
  assert.throws(() => f.store.setReaction(POST, player, 'invented', 'network', NOW), { code: 'invalid_body' });
});

test('persistent account budgets survive IP changes and process restart; duplicate retries do not consume them', async t => {
  const f = await fixture(t), player = f.account();
  for (let n = 0; n < 20; n++) f.store.setReaction(POST, player, n % 2 ? 'yolk' : 'shell', `network-${n}`, NOW);
  f.reopen();
  assert.equal(f.store.setReaction(POST, player, 'yolk', 'network-200', NOW).mine, 'yolk');
  assert.throws(() => f.store.setReaction(POST, player, 'warm', 'network-200', NOW), { code: 'rate_limit', status: 429, retryAfter: 60 });
  assert.equal(f.store.setReaction(POST, player, 'warm', 'network-200', NOW + 60000).mine, 'warm');
});

test('three distinct selections persist; retries and removals preserve the other choices', async t => {
  const f = await fixture(t), player = f.account(), second = f.account();
  const select = (reaction, selected = true) => f.store.selectReaction(POST, player, reaction, selected, 'network', NOW);
  select('shell'); select('yolk'); select('hatch');
  const three = { counts: { shell: 1, yolk: 1, hatch: 1 }, mine: 'shell', selected: ['shell', 'yolk', 'hatch'] };
  for (let n = 0; n < 30; n++) assert.deepEqual(select('yolk'), three);
  assert.throws(() => select('warm'), { code: 'reaction_limit', status: 409 });
  assert.deepEqual(select('fry', false), three, 'Removing an absent choice is idempotent even at the limit');
  f.reopen();
  assert.deepEqual(f.store.reactionSummaries([POST], player)[POST], three);
  assert.deepEqual(select('yolk', false).selected, ['shell', 'hatch']);
  assert.deepEqual(select('warm').selected, ['shell', 'hatch', 'warm']);
  assert.deepEqual(select('shell', false).selected, ['hatch', 'warm'], 'Removing the primary preserves the extras');
  f.store.selectReaction(POST, second, 'warm', true, 'second-network', NOW);
  assert.deepEqual(f.store.reactionSummaries([POST], player)[POST], { counts: { hatch: 1, warm: 2 }, mine: 'hatch', selected: ['hatch', 'warm'] });
  assert.deepEqual(f.store.reactionSummaries([POST], second)[POST].selected, ['warm']);
  assert.deepEqual(f.store.reactionSummaries([POST], null)[POST].selected, []);
  assert.throws(() => select('unknown'), { code: 'invalid_body' });
  assert.throws(() => select('shell', 'true'), { code: 'invalid_body' });
});

test('additive migration preserves old votes and old clients can replace or clear a multi-selection', async t => {
  const f = await fixture(t), player = f.account();
  f.store.setReaction(POST, player, 'shell', 'network', NOW);
  const db = new DatabaseSync(join(f.directory, 'records.sqlite'));
  t.after(() => db.close());
  // Simulate the deployed schema before the additive extension.
  db.exec('DROP TRIGGER kladka_reaction_extras_delete; DROP TRIGGER kladka_reaction_extras_replace; DROP TABLE kladka_reaction_extras;');
  const old = db.prepare('SELECT * FROM kladka_reactions').all();
  f.reopen();
  assert.deepEqual(db.prepare('SELECT * FROM kladka_reactions').all(), old);
  f.store.selectReaction(POST, player, 'yolk', true, 'network', NOW);
  f.store.selectReaction(POST, player, 'hatch', true, 'network', NOW);
  const extra = db.prepare('INSERT INTO kladka_reaction_extras VALUES (?, ?, ?)');
  assert.throws(() => extra.run(POST, player, 'warm'), /Invalid additional reaction/);
  assert.throws(() => extra.run(POST, player, 'shell'), /Invalid additional reaction/);
  assert.throws(() => extra.run('dead-beef', player, 'warm'), /Invalid additional reaction/);
  assert.deepEqual(f.store.setReaction(POST, player, 'fry', 'network', NOW).selected, ['fry']);
  f.store.selectReaction(POST, player, 'warm', true, 'network', NOW);
  // An old image updates the original table directly; compatibility triggers
  // prevent hidden stale extras from reappearing after a later upgrade.
  db.prepare('UPDATE kladka_reactions SET reaction = ? WHERE post = ? AND player = ?').run('shell', POST, player);
  assert.deepEqual(f.store.reactionSummaries([POST], player)[POST].selected, ['shell']);
  f.store.selectReaction(POST, player, 'warm', true, 'network', NOW);
  db.prepare('DELETE FROM kladka_reactions WHERE post = ? AND player = ?').run(POST, player);
  assert.deepEqual(f.store.reactionSummaries([POST], player)[POST], { counts: {}, mine: null, selected: [] });
});

test('each changed emoji uses a durable budget; retries do not, and three choices do not take three network slots', async t => {
  const f = await fixture(t), players = Array.from({ length: 6 }, () => f.account());
  for (const player of players.slice(0, 5)) {
    for (const reaction of ['shell', 'yolk', 'hatch']) f.store.selectReaction(POST, player, reaction, true, 'network', NOW);
  }
  assert.throws(() => f.store.selectReaction(POST, players[5], 'warm', true, 'network', NOW), { code: 'network_limit' });
  for (const reaction of ['shell', 'yolk', 'hatch']) f.store.selectReaction(POST, players[0], reaction, false, 'network', NOW);
  assert.throws(() => f.store.selectReaction(POST, players[5], 'warm', true, 'network', NOW), { code: 'network_limit' });
  for (let n = 0; n < 14; n++) f.store.selectReaction(POST, players[0], 'warm', n % 2 === 0, 'network', NOW);
  f.reopen();
  assert.deepEqual(f.store.selectReaction(POST, players[0], 'warm', false, 'network', NOW).selected, []);
  assert.throws(() => f.store.selectReaction(POST, players[0], 'warm', true, 'new-network', NOW), { code: 'rate_limit' });
});

test('network admission caps multi-account votes and removal cannot free a slot for a sixth account', async t => {
  const f = await fixture(t), players = Array.from({ length: 6 }, () => f.account());
  for (const player of players.slice(0, 5)) f.store.setReaction(POST, player, 'shell', 'shared-network', NOW);
  f.store.setReaction(POST, players[0], null, 'shared-network', NOW);
  f.reopen();
  assert.throws(() => f.store.setReaction(POST, players[5], 'shell', 'shared-network', NOW), { code: 'network_limit', status: 429 });
  assert.equal(f.store.setReaction(POST, players[0], 'yolk', 'shared-network', NOW).counts.yolk, 1);
  assert.equal(f.store.setReaction(POST, players[5], 'shell', 'shared-network', NOW + DAY).counts.shell, 5);
  const db = new DatabaseSync(join(f.directory, 'records.sqlite'));
  try {
    const rows = db.prepare('SELECT * FROM kladka_reaction_networks').all();
    assert.ok(rows.every(row => /^[a-f0-9]{64}$/.test(row.network)));
    assert.doesNotMatch(JSON.stringify(rows), /shared-network/);
  } finally { db.close(); }
});

test('network write budget covers separate entries and rolls back rejected changes', async t => {
  const f = await fixture(t), players = Array.from({ length: 4 }, () => f.account());
  for (let n = 0; n < 60; n++) f.store.setReaction(`abc-${n}`, players[n % 4], 'shell', 'network', NOW);
  assert.throws(() => f.store.setReaction('def', players[0], 'hatch', 'network', NOW), { code: 'rate_limit' });
  assert.deepEqual(f.store.reactionSummaries(['def'], players[0]).def, { counts: {}, mine: null, selected: [] });
  assert.equal(f.store.setReaction('def', players[0], 'hatch', 'network', NOW + 60000).mine, 'hatch');
});

test('daily account budget cannot be evaded by waiting out minute budgets', async t => {
  const f = await fixture(t), player = f.account();
  for (let n = 0; n < 200; n++) f.store.setReaction(POST, player, n % 2 ? 'shell' : 'yolk', `network-${n}`, NOW + n * 61000);
  assert.throws(() => f.store.setReaction(POST, player, 'warm', 'new-network', NOW + 200 * 61000), { code: 'rate_limit' });
  assert.equal(f.store.setReaction(POST, player, 'warm', 'new-network', NOW + DAY).mine, 'warm');
});

test('direct clients cannot forge forwarded addresses; proxy hops and IPv6 privacy addresses share stable keys', () => {
  const req = header => new Request('https://egg.example/api/kladka-reaction', { headers: { 'x-forwarded-for': header } });
  assert.equal(reactionNetwork(req('198.51.100.1'), '192.0.2.1', 0), '192.0.2.1');
  assert.equal(reactionNetwork(req('198.51.100.99, 192.0.2.1'), '172.20.0.1', 1), '192.0.2.1');
  assert.equal(reactionNetwork(req('198.51.100.2, 192.0.2.1'), '172.20.0.1', 1), '192.0.2.1');
  assert.equal(reactionNetwork(req(''), '::ffff:192.0.2.1', 0), '192.0.2.1');
  assert.equal(reactionNetwork(req(''), '2001:db8:1234:5678::1', 0), reactionNetwork(req(''), '2001:0db8:1234:5678:abcd::9999', 0));
  assert.notEqual(reactionNetwork(req(''), '2001:db8:1234:5679::1', 0), reactionNetwork(req(''), '2001:db8:1234:5678::1', 0));
  assert.throws(() => reactionNetwork(req('not-an-ip'), '172.20.0.1', 1), { code: 'network_unavailable' });
  assert.throws(() => reactionNetwork(req('192.0.2.1'), '172.20.0.1', 2), { code: 'network_unavailable' });
});
