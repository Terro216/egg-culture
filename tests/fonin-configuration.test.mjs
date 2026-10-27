import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFoninGiftToken } from '../src/shared/utils/foninGiftToken.ts';

const directory = await mkdtemp(join(tmpdir(), 'egg-gift-config-'));
const keys = ['FONIN_ACCESS_WORD', 'FONIN_GIFT_TOKEN_SECRET', 'FONIN_GIFT_PRIVATE_DIR'];
const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const certificate = 'synthetic certificate';
await writeFile(join(directory, 'gift-1.png'), certificate);
let variant = 0;

test.after(async () => {
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
  await rm(directory, { recursive: true, force: true });
});

async function routes(word, secret = 'test-only-signing-secret') {
  if (word === undefined) delete process.env.FONIN_ACCESS_WORD;
  else process.env.FONIN_ACCESS_WORD = word;
  process.env.FONIN_GIFT_TOKEN_SECRET = secret;
  process.env.FONIN_GIFT_PRIVATE_DIR = directory;
  const query = `?configuration-test=${++variant}`;
  const [{ POST: access }, { POST: gifts }, { GET: image }] = await Promise.all([
    import(`../src/pages/api/fonin-access.ts${query}`),
    import(`../src/pages/api/fonin-gifts.ts${query}`),
    import(`../src/pages/api/fonin-gift-image.ts${query}`),
  ]);
  return { access, gifts, image };
}

const request = accessWord => ({
  clientAddress: `192.0.2.${variant}`,
  request: new Request('https://egg.example/api/fonin-gifts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessWord, giftId: 'first-steep', ritual: { stage: 1, score: 100 } }),
  }),
});
const imageRequest = token => ({ url: new URL(`https://egg.example/api/fonin-gift-image?id=first-steep&token=${token}`) });

for (const word of [undefined, '', ' \t ']) {
  test(`unconfigured gift access is disabled (${JSON.stringify(word)})`, async () => {
    const { access, gifts, image } = await routes(word);
    for (const submitted of ['', 'Яй Ци']) {
      assert.equal((await access(request(submitted))).status, 503);
      assert.equal((await gifts(request(submitted))).status, 503);
    }
    const token = await createFoninGiftToken('first-steep', 'test-only-signing-secret');
    assert.equal((await image(imageRequest(token))).status, 503);
  });
}

test('an access word that normalizes to empty cannot authorize a gift', async () => {
  const { access, gifts } = await routes('— !');
  assert.equal((await access(request(''))).status, 503);
  assert.equal((await gifts(request(''))).status, 503);
});

test('configured access still validates the word and serves signed gifts', async () => {
  const { access, gifts, image } = await routes('A test access phrase');
  assert.equal((await access(request('wrong'))).status, 403);
  assert.equal((await gifts(request('wrong'))).status, 403);
  assert.equal((await access(request(' a TEST access phrase! '))).status, 200);
  const response = await gifts(request('A test access phrase'));
  assert.equal(response.status, 200);
  const { certificate: url } = await response.json();
  const downloaded = await image({ url: new URL(url, 'https://egg.example') });
  assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), certificate);
});

test('an explicitly blank signing secret disables gift issuance and downloads', async () => {
  const { gifts, image } = await routes('A test access phrase', ' ');
  assert.equal((await gifts(request('A test access phrase'))).status, 503);
  assert.equal((await image(imageRequest('invalid'))).status, 503);
});
