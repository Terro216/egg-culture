import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digestToken } from '../src/server/roadPasswords.ts';

const directory = await mkdtemp(join(tmpdir(), 'egg-reaction-api-'));
process.env.KLADKA_DATA_DIR = join(directory, 'book');
process.env.EGG_ROAD_DATA_DIR = join(directory, 'road');
process.env.KLADKA_REACTION_PROXY_HOPS = '0';
const { kladkaStore } = await import('../src/shared/utils/kladkaStore.ts');
const { roadRecordStore } = await import('../src/server/roadRecords.ts');
const { ROAD_SESSION_COOKIE } = await import('../src/server/roadHttp.ts');
const { POST } = await import('../src/pages/api/kladka-reaction.ts');
const { GET } = await import('../src/pages/api/kladka-feed.ts');
const site = new URL('https://egg.example');
let serial = 0;
function context(body, cookies = {}, options = {}) {
  const headers = { origin: site.origin, 'content-type': 'application/json', ...options.headers };
  return { site, url: site, clientAddress: options.ip ?? `192.0.2.${++serial}`,
    cookies: { get: key => cookies[key] === undefined ? undefined : { value: cookies[key] } },
    request: new Request(new URL('/api/kladka-reaction', site), { method: 'POST', headers, body: options.raw ?? JSON.stringify(body) }) };
}
function account(name, token, initiated = true) {
  const store = roadRecordStore();
  store.register(`guest-${name}`, name, 'test-password', 'test-recovery', digestToken(token));
  const player = store.credentials(name).player;
  if (initiated) store.completeInitiation(player);
  return { [ROAD_SESSION_COOKIE]: token };
}
const book = kladkaStore();
const open = await book.createPost({ name: 'Test Adept', text: 'Public fixture', ipHash: 'public' }, null, false);
const locked = await book.createPost({ name: 'Test Adept', text: 'Restricted fixture', visibility: 'adepts', ipHash: 'private' }, null, false);
const pending = await book.createPost({ name: 'Test Adept', text: 'Pending fixture', ipHash: 'pending' }, null, true);
const rejected = await book.createPost({ name: 'Test Adept', text: 'Rejected fixture', ipHash: 'rejected' }, null, true);
await book.setPostStatus(rejected.id, 'rejected');
const signedIn = account('Adept', 'a'.repeat(64));
const body = (post = open.id, reaction = 'shell', owner = 'Adept') => ({ account: owner, post, reaction });
test.after(async () => { roadRecordStore().close(); await rm(directory, { recursive: true, force: true }); });

test('cross-site, unauthenticated, forged guest and expired sessions cannot vote', async () => {
  assert.equal((await POST(context(body(), signedIn, { headers: { origin: 'https://evil.example' } }))).status, 403);
  assert.equal((await POST(context(body(), signedIn, { headers: { origin: '' } }))).status, 403);
  assert.equal((await POST(context(body(), signedIn, { headers: { 'content-type': 'text/plain' } }))).status, 415);
  for (const cookies of [{}, { egg_guest_initiated: '1', egg_road_player: 'a'.repeat(64) }, { [ROAD_SESSION_COOKIE]: 'f'.repeat(64) }]) {
    assert.equal((await POST(context(body(), cookies))).status, 401);
  }
  const revoked = account('Revoked', 'e'.repeat(64));
  roadRecordStore().logout(digestToken('e'.repeat(64)));
  assert.equal((await POST(context(body(open.id, 'shell', 'Revoked'), revoked))).status, 401);
});

test('strict small-body validation rejects client counters, identities, arrays and unknown emoji', async () => {
  for (const bad of [null, [], { ...body(), count: 9000 }, { ...body(), player: 'other' }, body(open.id, 'anything'), body('../private'), { post: open.id, reaction: 'shell' },
    { ...body(), selected: 'true' }, { ...body(), selected: 1 }, { ...body(), selected: null }, { ...body(open.id, null), selected: false },
    { ...body(), selected: true, count: 3 }]) {
    assert.equal((await POST(context(bad, signedIn))).status, 400);
  }
  assert.equal((await POST(context({}, signedIn, { raw: '{broken' }))).status, 400);
  assert.equal((await POST(context({}, signedIn, { raw: JSON.stringify({ pad: 'x'.repeat(1024) }) }))).status, 413);
  assert.equal((await POST(context(body(open.id, 'shell', 'Another account'), signedIn))).status, 409);
});

test('concurrent distinct selections stop at three and return authoritative state to a stale device', async () => {
  const cookies = account('Multiple', 'd'.repeat(64));
  const entry = await book.createPost({ name: 'Test Adept', text: 'Multiple choices', ipHash: 'multiple' }, null, false);
  const select = (reaction, selected = true) => POST(context({ ...body(entry.id, reaction, 'Multiple'), selected }, cookies));
  const responses = await Promise.all(['shell', 'yolk', 'hatch', 'warm'].map(reaction => select(reaction)));
  assert.equal(responses.filter(response => response.status === 200).length, 3);
  assert.equal(responses.filter(response => response.status === 409).length, 1);
  const conflict = await responses.find(response => response.status === 409).json();
  assert.equal(conflict.error, 'reaction_limit');
  assert.equal(conflict.summary.selected.length, 3);
  assert.deepEqual(Object.values(conflict.summary.counts), [1, 1, 1]);
  const chosen = conflict.summary.selected;
  const absent = ['shell', 'yolk', 'hatch', 'warm'].find(reaction => !chosen.includes(reaction));
  for (const reaction of chosen) {
    const retry = await select(reaction);
    assert.equal(retry.status, 200);
    assert.deepEqual((await retry.json()).summary, conflict.summary);
  }
  const removed = await select(chosen[1], false);
  assert.deepEqual((await removed.json()).summary.selected, chosen.filter(reaction => reaction !== chosen[1]));
  const added = await select(absent);
  assert.equal(added.status, 200);
  const after = (await added.json()).summary;
  assert.equal(after.selected.length, 3);
  assert.ok(after.selected.includes(absent));
  const feed = await (await GET(context({}, cookies))).json();
  assert.deepEqual(feed.reactions.entries[entry.id], after);
  const guest = await (await GET(context({}))).json();
  assert.deepEqual(guest.reactions.entries[entry.id], { counts: after.counts, mine: null, selected: [] });
  const oldClient = await POST(context(body(entry.id, 'fry', 'Multiple'), cookies));
  assert.deepEqual((await oldClient.json()).summary, { counts: { fry: 1 }, mine: 'fry', selected: ['fry'] });
});

test('new adepts can react immediately while server initiation and hidden-entry access remain enforced', async () => {
  const novice = account('Novice', 'b'.repeat(64), false); novice.egg_guest_initiated = '1';
  const fresh = account('Fresh', 'c'.repeat(64));
  assert.equal((await POST(context(body(open.id, 'shell', 'Novice'), novice))).status, 403);
  assert.equal((await POST(context(body(locked.id, 'shell', 'Novice'), novice))).status, 404);
  const young = await POST(context(body(open.id, 'shell', 'Fresh'), fresh));
  assert.equal(young.status, 200);
  assert.equal((await young.json()).summary.mine, 'shell');
  assert.equal((await POST(context(body(open.id, null, 'Fresh'), fresh))).status, 200);
  for (const post of [pending.id, rejected.id, 'dead-beef']) assert.equal((await POST(context(body(post), signedIn))).status, 404);
  const response = await POST(context(body(locked.id), signedIn)); assert.equal(response.status, 200);
  for (const cookies of [{}, novice]) {
    const feed = await GET(context({}, cookies)); const data = await feed.json();
    assert.equal(data.posts.find(post => post.id === locked.id).locked, true);
    assert.equal(data.reactions.entries[locked.id], undefined);
    assert.equal(data.reactions.entries[pending.id], undefined);
    assert.doesNotMatch(JSON.stringify(data), /player|ipHash|network|secret|token|Restricted fixture/);
  }
});

test('concurrent retries, switching devices, replacement and removal preserve one vote', async () => {
  const responses = await Promise.all(Array.from({ length: 12 }, () => POST(context(body(), signedIn))));
  for (let response of responses) {
    // The shared bounded body reader admits four simultaneous parses. Retrying
    // overload must not create an extra vote or a partially applied change.
    if (response.status === 503) {
      assert.equal((await response.json()).error, 'busy');
      response = await POST(context(body(), signedIn));
    }
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('vary'), 'Cookie');
    assert.deepEqual((await response.json()).summary, { counts: { shell: 1 }, mine: 'shell', selected: ['shell'] });
  }
  const changed = await POST(context(body(open.id, 'yolk'), signedIn));
  assert.deepEqual((await changed.json()).summary, { counts: { yolk: 1 }, mine: 'yolk', selected: ['yolk'] });
  const data = await (await GET(context({}, signedIn))).json();
  assert.equal(data.reactions.entries[open.id].mine, 'yolk');
  const guest = await (await GET(context({}))).json();
  assert.deepEqual(guest.reactions.entries[open.id], { counts: { yolk: 1 }, mine: null, selected: [] });
  const removed = await POST(context(body(open.id, null), signedIn));
  assert.deepEqual((await removed.json()).summary, { counts: {}, mine: null, selected: [] });
});
