import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digestToken } from '../src/server/roadPasswords.ts';

const directory = await mkdtemp(join(tmpdir(), 'egg-kladka-visibility-'));
process.env.KLADKA_DATA_DIR = join(directory, 'book');
process.env.EGG_ROAD_DATA_DIR = join(directory, 'road');
process.env.KLADKA_BOT_TOKEN = ''; process.env.KLADKA_ADMIN_CHAT_ID = '';
const { kladkaStore } = await import('../src/shared/utils/kladkaStore.ts');
const { roadRecordStore } = await import('../src/server/roadRecords.ts');
const { ROAD_SESSION_COOKIE } = await import('../src/server/roadHttp.ts');
const { GET: feed } = await import('../src/pages/api/kladka-feed.ts');
const { GET: image } = await import('../src/pages/api/kladka-image.ts');
const { POST: publish } = await import('../src/pages/api/kladka-post.ts');
let ip = 0;
const context = (path, cookies = {}, body) => {
  const url = new URL(path, 'https://egg.example');
  return { url, cookies: { get: key => cookies[key] === undefined ? undefined : { value: cookies[key] } },
    clientAddress: `192.0.2.${++ip}`, request: new Request(url, body ? { method: 'POST', body } : {}) };
};
test.after(async () => { roadRecordStore().close(); await rm(directory, { recursive: true, force: true }); });

test('anonymous and signed-in novice readers never receive restricted text or images; adepts do', async () => {
  const store = kladkaStore(), photo = Buffer.from([255, 216, 1, 2]);
  const draft = { name: 'Adept', text: 'Private breakfast', style: 'Private style', ipHash: 'private', visibility: 'adepts', image: { ext: 'jpg', type: 'image/jpeg' } };
  const restricted = await store.createPost(draft, photo, false);
  const open = await store.createPost({ ...draft, ipHash: 'public', text: 'Public breakfast', visibility: 'public' }, photo, false);
  const pending = await store.createPost({ ...draft, ipHash: 'pending', visibility: 'public' }, photo, true);
  const rejected = await store.createPost({ ...draft, ipHash: 'rejected' }, photo, true);
  await store.setPostStatus(rejected.id, 'rejected');
  const accounts = roadRecordStore(), token = 'a'.repeat(64);
  accounts.register('guest', 'Novice', 'test-hash', 'test-recovery', digestToken(token));
  const signedIn = { [ROAD_SESSION_COOKIE]: token, egg_guest_initiated: '1' };
  for (const cookies of [{}, { egg_guest_initiated: 'true' }, signedIn]) {
    const response = await feed(context('/api/kladka-feed', cookies));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('vary'), 'Cookie');
    const { posts } = await response.json();
    const locked = posts.find(p => p.id === restricted.id);
    assert.deepEqual(Object.keys(locked).sort(), ['createdAt', 'id', 'locked', 'name', 'visibility']);
    assert.equal(locked.locked, true);
    assert.equal(posts.find(p => p.id === open.id).text, 'Public breakfast');
    assert.ok(!posts.some(p => p.id === pending.id || p.id === rejected.id));
    const denied = await image(context(`/api/kladka-image?id=${restricted.id}`, cookies));
    assert.equal(denied.status, 404);
    assert.equal(denied.headers.get('cache-control'), 'private, no-store');
    const publicImage = await image(context(`/api/kladka-image?id=${open.id}`, cookies));
    assert.equal(publicImage.status, 200);
    assert.equal(publicImage.headers.get('cache-control'), 'private, no-store');
  }
  accounts.completeInitiation(accounts.credentials('Novice').player);
  for (const cookies of [{ egg_guest_initiated: '1' }, signedIn]) {
    const { posts } = await (await feed(context('/api/kladka-feed', cookies))).json();
    assert.equal(posts.find(p => p.id === restricted.id).text, 'Private breakfast');
    assert.doesNotMatch(JSON.stringify(posts), /ipHash|delivery|moderatedAt/);
    const response = await image(context(`/api/kladka-image?id=${restricted.id}&v=2`, cookies));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), photo);
    for (const post of [pending, rejected]) assert.equal((await image(context(`/api/kladka-image?id=${post.id}`, cookies))).status, 404);
  }
  await store.setPostStatus(pending.id, 'rejected');
});

test('publication validates audience and persists the choice through approval; old forms stay public', async () => {
  for (const visibility of [undefined, 'public', 'adepts']) {
    const body = new FormData(); body.set('text', `Entry ${visibility}`);
    if (visibility !== undefined) body.set('visibility', visibility);
    const response = await publish(context('/api/kladka-post', {}, body));
    assert.equal(response.status, 200);
    const post = (await kladkaStore().getApprovedPosts()).find(p => p.text === `Entry ${visibility}`);
    assert.equal(post.visibility, visibility ?? 'public');
  }
  for (const visibility of ['', 'unknown', 'ADEPTS', ' public ', new Blob(['adepts'])]) {
    const body = new FormData(); body.set('text', 'Invalid'); body.set('visibility', visibility);
    assert.equal((await publish(context('/api/kladka-post', {}, body))).status, 400);
  }
  const duplicate = new FormData(); duplicate.set('text', 'Duplicate'); duplicate.append('visibility', 'public'); duplicate.append('visibility', 'adepts');
  assert.equal((await publish(context('/api/kladka-post', {}, duplicate))).status, 400);
  process.env.KLADKA_BOT_TOKEN = 'test-only'; process.env.KLADKA_ADMIN_CHAT_ID = '123';
  const body = new FormData(); body.set('text', 'Moderated'); body.set('visibility', 'adepts');
  const response = await publish(context('/api/kladka-post', {}, body));
  assert.equal((await response.json()).status, 'pending');
  let saved;
  await kladkaStore().deliverNext(async post => { saved = post; assert.equal(post.visibility, 'adepts'); });
  await kladkaStore().setPostStatus(saved.id, 'approved');
  assert.equal((await kladkaStore().getPost(saved.id)).visibility, 'adepts');
});
