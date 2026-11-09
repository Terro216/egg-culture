// Run against an isolated built preview with Node --experimental-strip-types.
// PLAYWRIGHT_MODULE points to an existing Playwright installation.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PERSONAS } from '../src/features/EggPersona/personaData.ts';
import { personaShareMetadata } from '../src/features/EggPersona/sharing.ts';

const preview = new URL(process.env.PERSONA_PREVIEW ?? 'http://127.0.0.1:4459');
assert.equal(preview.hostname, '127.0.0.1', 'Use an isolated preview');
const out = process.env.PERSONA_EVIDENCE ?? '/tmp/egg-persona-sharing';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [], report = { cards: [], crawlers: [], interactions: [] };
const fonts = await Promise.all([
  ['Lora', 'Lora-Regular.ttf', 'normal', 400],
  ['Lora', 'Lora-Italic.ttf', 'italic', 400],
  ['Playfair Display', 'PlayfairDisplay-SemiBold.ttf', 'normal', 600],
].map(async ([family, file, style, weight]) => `@font-face {font-family:'${family}';font-style:${style};font-weight:${weight};src:url(data:font/ttf;base64,${(await readFile(new URL(`../src/shared/assets/fonts/${file}`, import.meta.url))).toString('base64')})}`));

async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block', ...options });
  await ctx.route('**/*', route => new URL(route.request().url()).origin === preview.origin ? route.continue() : route.abort());
  ctx.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  return ctx;
}

try {
  // JavaScript-disabled pages prove that crawlers receive the actual result in HTML.
  for (const userAgent of ['TelegramBot (like TwitterBot)', 'WhatsApp/2.0', 'Twitterbot/1.0']) {
    const ctx = await context({ javaScriptEnabled: false, userAgent });
    const page = await ctx.newPage();
    const variants = userAgent.startsWith('Telegram')
      ? ['ru', 'en'].flatMap(lang => [undefined, ...PERSONAS.map(p => p.id)].map(id => [lang, id]))
      : [['ru', 'farm'], ['en', 'industrial']];
    for (const [lang, id] of variants) {
      const expected = personaShareMetadata(lang, id);
      const response = await page.goto(new URL(`${expected.canonicalPath}${id ? '&' : '?'}utm_source=test&token=not-for-sharing`, preview).href);
      assert.equal(response.status(), 200);
      const meta = await page.locator('meta[property], meta[name^="twitter:"]').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.getAttribute('property') ?? node.getAttribute('name'), node.content])));
      const canonical = new URL(await page.locator('link[rel="canonical"]').getAttribute('href'));
      assert.equal(canonical.pathname + canonical.search, expected.canonicalPath);
      assert.equal(meta['og:url'], canonical.href);
      assert.equal(meta['og:title'], expected.title);
      assert.equal(meta['og:description'], expected.description);
      assert.equal(meta['twitter:title'], expected.title);
      assert.equal(meta['twitter:description'], expected.description);
      assert.equal(meta['twitter:card'], 'summary_large_image');
      assert.equal(meta['og:image:width'], '1200');
      assert.equal(meta['og:image:height'], '630');
      assert.equal(meta['og:image:type'], 'image/png');
      assert.equal(meta['og:image:alt'], expected.imageAlt);
      const imageURL = new URL(meta['og:image']);
      assert.equal(imageURL.origin, canonical.origin);
      assert.equal(imageURL.pathname + imageURL.search, expected.image);
      assert.equal(meta['twitter:image'], imageURL.href);
      for (const alternate of await page.locator('link[rel="alternate"]').evaluateAll(nodes => nodes.map(n => n.href))) {
        assert.equal(new URL(alternate).search, canonical.search);
      }
      if (id) {
        assert.equal(await page.locator('.egg-persona-result-title').textContent(), expected.persona[lang].name);
        assert.equal(await page.locator('.egg-persona-option').count(), 0);
      } else assert.equal(await page.locator('.egg-persona-option').count(), 4);
      if (userAgent.startsWith('Telegram')) {
        const imageResponse = await ctx.request.get(new URL(expected.image, preview).href);
        assert.equal(imageResponse.status(), 200);
        const file = `${lang}-${id ?? 'quiz'}.png`;
        await writeFile(`${out}/${file}`, await imageResponse.body());
        report.cards.push(file);
      }
    }
    report.crawlers.push({ userAgent, pages: variants.length });
    await ctx.close();
  }

  for (const [lang, width, name] of [['ru', 1440, 'desktop'], ['en', 390, 'mobile']]) {
    const ctx = await context({ viewport: { width, height: 900 } });
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: async value => { window.shared = value; } });
    });
    const page = await ctx.newPage();
    await page.goto(new URL(`/${lang}/egg-type?result=farm&utm_source=test#noise`, preview).href);
    await page.addStyleTag({ content: fonts.join('\n') });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.egg-persona-canvas').waitFor({ state: 'visible' });
    const shareButton = page.getByRole('button', { name: lang === 'ru' ? 'Поделиться' : 'Share', exact: true });
    await shareButton.click();
    assert.equal((await page.evaluate(() => window.shared)).url, new URL(`/${lang}/egg-type?result=farm`, preview).href);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    // Clipboard fallback uses the same clean result URL.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { value: undefined });
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.copied = value; } } });
    });
    await shareButton.click();
    assert.equal(await page.evaluate(() => window.copied), new URL(`/${lang}/egg-type?result=farm`, preview).href);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: lang === 'ru' ? 'Сохранить карточку' : 'Save the card' }).click();
    assert.equal((await downloadEvent).suggestedFilename(), 'egg-persona-farm.png');
    await page.getByRole('button', { name: lang === 'ru' ? 'Пройти заново' : 'Retake' }).click();
    assert.equal(new URL(page.url()).searchParams.has('result'), false);
    for (let i = 0; i < 7; i++) await page.locator('.egg-persona-option').first().click();
    const result = new URL(page.url()).searchParams.get('result');
    assert.ok(PERSONAS.some(p => p.id === result));
    await shareButton.click();
    assert.equal(await page.evaluate(() => window.copied), new URL(`/${lang}/egg-type?result=${result}`, preview).href);
    await page.reload();
    assert.equal(await page.locator('.egg-persona-result-title').textContent(), PERSONAS.find(p => p.id === result)[lang].name);
    await page.goto(new URL(`/${lang}/egg-type/?result=unknown&utm_source=test`, preview).href);
    assert.equal(new URL(await page.locator('link[rel="canonical"]').getAttribute('href')).search, '');
    assert.equal(await page.locator('.egg-persona-option').count(), 4);
    report.interactions.push({ lang, width, sharedResult: result, nativeShare: true, clipboard: true, download: true, retake: true, reload: true });
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
