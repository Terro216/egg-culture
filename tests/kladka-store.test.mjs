import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const legacyIds = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
process.env.KLADKA_LEGACY_ADEPT_POST_IDS = ` ${legacyIds[0]},, ${legacyIds[1]} `;
const { createKladkaStore, KladkaQuotaError, KladkaStorageError, visibleKladkaEntries } = await import('../src/shared/utils/kladkaStore.ts');

const draft = (ipHash = 'test-ip') => ({ name: 'Adept', text: 'Breakfast', ipHash });
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'egg-kladka-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, file: join(directory, 'posts.json'), store: createKladkaStore(directory) };
}

test('corrupt or invalid existing books fail closed without replacing historical bytes', async t => {
  const f = await fixture(t);
  for (const raw of ['{"posts":[{"id":"old"}', '{"posts":"damaged"}', '{"posts":[null]}']) {
    await writeFile(f.file, raw);
    await assert.rejects(f.store.createPost(draft(), null, true), KladkaStorageError);
    await assert.rejects(f.store.setPostStatus('a', 'approved'), KladkaStorageError);
    assert.equal(await readFile(f.file, 'utf8'), raw);
  }
});

test('simultaneous submissions and store instances share atomic daily quota', async t => {
  const f = await fixture(t), other = createKladkaStore(f.directory);
  const outcomes = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => (i % 2 ? f.store : other).createPost(draft(), null, true)));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 3);
  assert.equal(outcomes.filter(result => result.status === 'rejected' && result.reason instanceof KladkaQuotaError).length, 7);
  assert.equal(JSON.parse(await readFile(f.file, 'utf8')).posts.length, 3);
});

test('failed image persistence never publishes a post or consumes its quota', async t => {
  const f = await fixture(t), image = Buffer.from([0xff, 0xd8, 1, 2]);
  await writeFile(join(f.directory, 'images'), 'blocked');
  await assert.rejects(f.store.createPost({ ...draft(), image: { ext: 'jpg', type: 'image/jpeg' } }, image, false));
  assert.equal((await f.store.getApprovedPosts()).length, 0);
  await rm(join(f.directory, 'images'));
  const post = await f.store.createPost({ ...draft(), image: { ext: 'jpg', type: 'image/jpeg' } }, image, false);
  assert.deepEqual(await f.store.readImage(post.id, 'jpg'), image);
  await f.store.createPost(draft(), null, false);
  await f.store.createPost(draft(), null, false);
  await assert.rejects(f.store.createPost(draft(), null, false), KladkaQuotaError);
});

test('durable moderation retries survive reopen, lease concurrent calls and stop after acknowledgement', { timeout: 5000 }, async t => {
  const f = await fixture(t), start = 1800000000000;
  const post = await f.store.createPost(draft(), null, true, start);
  let calls = 0;
  const fail = async () => { calls++; throw new Error('network offline'); };
  assert.deepEqual(await f.store.deliverNext(fail, start), { attempted: true, delivered: false });
  const reopened = createKladkaStore(f.directory);
  assert.equal((await reopened.deliverNext(fail, start + 59999)).attempted, false);
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  const delivery = reopened.deliverNext(async item => {
    calls++; started.resolve(); assert.equal(item.id, post.id); await release.promise;
  }, start + 60000);
  await started.promise;
  try {
    assert.equal((await f.store.deliverNext(fail, start + 60000)).attempted, false);
  } finally {
    release.resolve();
  }
  assert.deepEqual(await delivery, { attempted: true, delivered: true });
  assert.equal(calls, 2);
  assert.equal((await createKladkaStore(f.directory).deliverNext(fail, start + 86400000)).attempted, false);
  assert.equal((await reopened.getPost(post.id)).status, 'pending', 'delivery never approves the post');
});

test('legacy pending posts are adopted while rejected posts are never resent', async t => {
  const f = await fixture(t), post = await f.store.createPost(draft(), null, true);
  const book = JSON.parse(await readFile(f.file, 'utf8')); delete book.posts[0].delivery;
  await writeFile(f.file, JSON.stringify(book));
  let sent = 0;
  assert.equal((await f.store.deliverNext(async () => { sent++; })).delivered, true);
  await f.store.setPostStatus(post.id, 'rejected');
  await f.store.deliverNext(async () => { sent++; }, Date.now() + 86400000);
  assert.equal(sent, 1);
});

test('audience survives moderation, retries and reopening; invalid audience never changes the book', async t => {
  const f = await fixture(t);
  const post = await f.store.createPost({ ...draft(), visibility: 'adepts' }, null, true);
  await f.store.deliverNext(async delivered => assert.equal(delivered.visibility, 'adepts'));
  await f.store.setPostStatus(post.id, 'approved');
  const reopened = createKladkaStore(f.directory);
  assert.equal((await reopened.getPost(post.id)).visibility, 'adepts');
  const before = await readFile(f.file, 'utf8');
  await assert.rejects(reopened.createPost({ ...draft(), visibility: 'anyone' }, null, false), TypeError);
  assert.equal(await readFile(f.file, 'utf8'), before);
});

test('legacy migration restricts only the requested entries, preserves explicit choices and never writes on read', async t => {
  const f = await fixture(t);
  const base = { ...draft(), text: 'Legacy fixture', createdAt: '2024-01-01T00:00:00.000Z', status: 'approved' };
  const ids = legacyIds;
  const raw = JSON.stringify({ posts: [...ids.map(id => ({ ...base, id })), { ...base, id: 'abc' }] });
  await writeFile(f.file, raw);
  for (const id of ids) assert.equal((await f.store.getPost(id)).visibility, 'adepts');
  assert.equal((await f.store.getPost('abc')).visibility, 'public');
  const novice = visibleKladkaEntries(await f.store.getApprovedPosts(), false);
  for (const id of ids) assert.deepEqual(Object.keys(novice.find(p => p.id === id)).sort(), ['createdAt', 'id', 'locked', 'name', 'visibility']);
  assert.equal(await readFile(f.file, 'utf8'), raw);
  await f.store.createPost(draft('new-ip'), null, true);
  const saved = JSON.parse(await readFile(f.file, 'utf8')).posts;
  for (const id of ids) assert.equal(saved.find(p => p.id === id).visibility, 'adepts');
  await writeFile(f.file, JSON.stringify({ posts: ids.map(id => ({ ...base, id, visibility: 'public' })) }));
  for (const id of ids) assert.equal((await createKladkaStore(f.directory).getPost(id)).visibility, 'public');
});

test('reader projections omit private content and internal fields, including for image-only entries', async t => {
  const f = await fixture(t);
  await f.store.createPost({ ...draft('public'), text: 'Public breakfast', style: 'Blanc' }, null, false);
  await f.store.createPost({ ...draft('private'), text: 'Secret breakfast', style: 'Hidden style', visibility: 'adepts' }, null, false);
  await f.store.createPost({ ...draft('photo'), text: '', visibility: 'adepts', image: { ext: 'jpg', type: 'image/jpeg' } }, Buffer.from([255, 216, 1]), false);
  await f.store.createPost({ ...draft('pending'), text: 'Pending content' }, null, true);
  const posts = await f.store.getApprovedPosts();
  const novice = visibleKladkaEntries(posts, false), adept = visibleKladkaEntries(posts, true);
  assert.equal(novice.length, 3);
  assert.equal(novice.filter(p => p.locked).length, 2);
  for (const p of novice.filter(p => p.locked)) assert.deepEqual(Object.keys(p).sort(), ['createdAt', 'id', 'locked', 'name', 'visibility']);
  assert.ok(adept.some(p => p.text === 'Secret breakfast'));
  assert.ok(adept.some(p => p.image === true));
  for (const projection of [novice, adept]) assert.doesNotMatch(JSON.stringify(projection), /ipHash|delivery|moderatedAt|Pending content/);
  assert.doesNotMatch(JSON.stringify(novice), /Secret breakfast|Hidden style/);
});
