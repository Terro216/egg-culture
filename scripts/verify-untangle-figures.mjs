// Read-only browser acceptance. Production mode blocks every network mutation;
// victories stay in a fresh guest browser, never in someone's real account.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { analyzeBoard, campaignSeed, dailySeed, findSwapHint, formatSeed, generatePuzzle, isSlotPermutation } from '../src/features/EggUntangle/engine.ts';
import { graphComponents } from '../src/features/EggUntangle/geometry.ts';

const origin = process.env.NEST_ORIGIN || 'http://127.0.0.1:4453';
assert.ok(['http://127.0.0.1:4453', 'https://egg.ilyamedve.dev'].includes(origin), 'Use the isolated preview or the approved public origin');
const output = process.env.NEST_ARTIFACTS || '/tmp/egg-knot3-browser';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.NEST_CHROMIUM_EXECUTABLE ? { executablePath: process.env.NEST_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
const results = [], images = [];
const seeds = [campaignSeed(4, 'swap')], partitions = new Set();
for (let value = 0; value < 120 && seeds.length < 7; value++) {
  const seed = formatSeed(18, value, 'swap'), puzzle = generatePuzzle(seed);
  const partition = graphComponents(puzzle.initial.length, puzzle.edges).map(group => group.length).sort((a, b) => a - b).join('+');
  if (!partitions.has(partition)) { partitions.add(partition); seeds.push(seed); }
}
const readPoints = page => page.locator('.nest-egg').evaluateAll(nodes => nodes.map(node => {
  const [, x, y] = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(node.getAttribute('transform'));
  return { x: Number(x), y: Number(y) };
}));
try {
  for (const [width, lang] of [[1200, 'ru'], [390, 'en'], [320, 'ru']]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 600, hasTouch: width < 600, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin && ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    await context.addInitScript(() => localStorage.setItem('egg_untangle_focus', '0'));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (width === 1200) {
      await page.goto(`${origin}/${lang}/untangle/?nest=KNOT1-12-ABC`, { waitUntil: 'networkidle' });
      await page.locator('.nest-egg').first().waitFor();
      assert.deepEqual(await readPoints(page), generatePuzzle('KNOT1-12-ABC').initial);
      await page.getByRole('button', { name: 'Открыть новые фигуры', exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.get('nest'), 'KNOT4-12-ABC');
      assert.deepEqual(await readPoints(page), generatePuzzle('KNOT4-12-ABC').initial);
      assert.ok(await page.evaluate(() => localStorage.getItem('egg_untangle_v1:guest:session:KNOT1-12-ABC')), 'the archived layout is retained');
    }
    for (const seed of width === 1200 ? seeds : [seeds[1], seeds.at(-1)]) {
      const puzzle = generatePuzzle(seed);
      await page.goto(`${origin}/${lang}/untangle/?nest=${seed}`, { waitUntil: 'networkidle' });
      await page.locator('.nest-egg').first().waitFor();
      assert.deepEqual(await readPoints(page), puzzle.initial, 'browser/server deterministic generation');
      const shellRatio = await page.locator('.nest-egg-shell').first().evaluate(node => { const b = node.getBBox(); return b.height / b.width; });
      assert.ok(shellRatio > 1.4, 'shell silhouette is taller than the old round body');
      let moves = 0;
      while (!await page.locator('.nest-result').count()) {
        assert.ok(moves < puzzle.initial.length, 'hints make progress');
        const points = await readPoints(page), hint = findSwapHint(puzzle, points);
        assert.ok(hint);
        for (const egg of hint) {
          const node = page.locator(`.nest-egg[data-node="${egg}"]`);
          if (width < 600) await node.tap(); else await node.click();
        }
        moves++;
        assert.ok(isSlotPermutation(puzzle, await readPoints(page)));
        if (moves === 1) {
          const saved = await readPoints(page);
          await page.reload({ waitUntil: 'networkidle' });
          await page.locator('.nest-egg').first().waitFor();
          assert.deepEqual(await readPoints(page), saved, 'unfinished new-edition session survives reload');
        }
      }
      assert.ok(analyzeBoard(await readPoints(page), puzzle.edges).solved);
      assert.equal(await page.locator('.nest-thread.is-crossed').count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.waitForFunction(() => !document.querySelector(".portal-achievement-toast"), null, { timeout: 30000 });
      const file = `${width}-${seed}.png`;
      await page.locator('.nest-board').screenshot({ path: `${output}/${file}` });
      const components = graphComponents(puzzle.initial.length, puzzle.edges).map(group => group.length).sort((a, b) => a - b);
      results.push({ width, lang, seed, components, moves, shellRatio, restored: true });
      if (width === 1200) images.push({ file, seed, components });
    }
    // Verify the actual controls route to the new daily generator as well.
    await page.getByRole('button', { name: lang === 'ru' ? 'Кладка дня' : 'Daily clutch', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('nest'), dailySeed(new URL(page.url()).searchParams.get('day'), 'swap'));
    assert.deepEqual(errors, []);
    await context.close();
  }
  const cards = await Promise.all(images.map(async ({ file, seed, components }) => `<figure><img src="data:image/png;base64,${(await readFile(`${output}/${file}`)).toString('base64')}"/><figcaption>${seed} · ${components.join(' + ')} eggs</figcaption></figure>`));
  const gallery = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  await gallery.setContent(`<style>body{margin:0;padding:20px;background:#211c20;color:#f4dfb0;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}figure{margin:0}img{width:100%;display:block}figcaption{padding:10px 0}</style><main>${cards.join('')}</main>`);
  await gallery.screenshot({ path: `${output}/variety.png`, fullPage: true });
  await writeFile(`${output}/gallery.html`, `<!doctype html><meta charset="utf-8">${await gallery.content()}`);
  await writeFile(`${output}/figures.json`, JSON.stringify({ results, errors: [] }, null, 2));
  console.log(JSON.stringify({ passed: results.length, widths: [1200, 390, 320], errors: [] }));
} finally { await browser.close(); }
