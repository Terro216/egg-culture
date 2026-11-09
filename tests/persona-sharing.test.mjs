import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { PERSONAS } from '../src/features/EggPersona/personaData.ts';
import { personaResultPath, personaShareMetadata } from '../src/features/EggPersona/sharing.ts';
import { GET } from '../src/pages/api/persona-og.ts';

const origin = 'https://example.org';
const image = path => GET({ url: new URL(path, origin) });

test('every result and language has a distinct, shareable identity and matching copy', () => {
  const pages = new Set(), images = new Set();
  for (const lang of ['ru', 'en']) for (const persona of PERSONAS) {
    const share = personaShareMetadata(lang, persona.id);
    const page = new URL(share.canonicalPath, origin);
    const png = new URL(share.image, origin);
    assert.equal(page.pathname, `/${lang}/egg-type`);
    assert.equal(page.searchParams.get('result'), persona.id);
    assert.equal(png.searchParams.get('type'), persona.id);
    assert.equal(png.searchParams.get('lang'), lang);
    assert.ok(share.title.includes(persona[lang].name));
    assert.ok(share.description.includes(persona[lang].desc));
    assert.ok(share.imageAlt.includes(persona[lang].name));
    assert.equal(personaResultPath(lang, persona.id), share.canonicalPath);
    pages.add(page.href); images.add(png.href);
  }
  assert.equal(pages.size, 16);
  assert.equal(images.size, 16);
});

test('invalid results fall back to the quiz without reflecting query input in metadata', () => {
  for (const lang of ['ru', 'en']) {
    const base = personaShareMetadata(lang);
    assert.equal(base.canonicalPath, `/${lang}/egg-type`);
    assert.equal(new URL(base.image, origin).searchParams.has('type'), false);
    for (const bad of [null, '', 'unknown', 'FARM', 'farm&token=private', '<script>', '../farm']) {
      assert.deepEqual(personaShareMetadata(lang, bad), base);
    }
  }
});

test('the image route renders all 18 unique PNGs at social-card size and caches them', async () => {
  const hashes = new Set();
  for (const lang of ['ru', 'en']) for (const id of [undefined, ...PERSONAS.map(p => p.id)]) {
    const path = personaShareMetadata(lang, id).image;
    const response = image(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'image/png');
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=86400');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 1200);
    assert.equal(bytes.readUInt32BE(20), 630);
    assert.ok(bytes.length > 10000 && bytes.length < 1_000_000, `Unexpected image size: ${bytes.length}`);
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual(Buffer.from(await image(path).arrayBuffer()), bytes);
  }
  assert.equal(hashes.size, 18, 'Each result and language must have its own artwork');
});

test('legacy image URLs still work and unrecognized types cannot populate the image cache', async () => {
  const oldImage = image('/api/persona-og?type=farm&lang=ru');
  const newImage = image(personaShareMetadata('ru', 'farm').image);
  assert.deepEqual(await oldImage.arrayBuffer(), await newImage.arrayBuffer());
  for (const type of ['', 'unknown', '../../secret', '<svg/>', 'farm&lang=en']) {
    assert.equal(image(`/api/persona-og?type=${encodeURIComponent(type)}`).status, 404);
  }
  assert.deepEqual(
    await image('/api/persona-og?type=farm&lang=unknown').arrayBuffer(),
    await image('/api/persona-og?type=farm&lang=ru').arrayBuffer(),
  );
});
