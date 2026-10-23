// Guest-only browser acceptance; even public runs block every network mutation.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { campaignSeed, formatSeed, generatePuzzle, analyzeBoard } from '../src/features/EggUntangle/engine.ts';
import { graphComponents } from '../src/features/EggUntangle/geometry.ts';

const origin = process.env.NEST_ORIGIN || 'http://127.0.0.1:4453';
assert.ok(['http://127.0.0.1:4453', 'https://egg.ilyamedve.dev'].includes(origin));
const output = process.env.NEST_ARTIFACTS || '/tmp/egg-untangle-improvements-browser';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.NEST_CHROMIUM_EXECUTABLE ? { executablePath: process.env.NEST_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
const results = [];
const points = page => page.locator('.nest-egg').evaluateAll(nodes => nodes.map(node => {
  const [, x, y] = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(node.getAttribute('transform'));
  return { x: Number(x), y: Number(y) };
}));
const moveCount = async page => Number(await page.locator('.nest-metrics strong').nth(1).innerText());
const hints = async page => (await page.locator('.nest-egg.is-hint').evaluateAll(nodes => nodes.map(node => Number(node.dataset.node))));
async function tap(page, node, mobile) {
  const egg = page.locator(`.nest-egg[data-node="${node}"]`);
  if (mobile) await egg.tap(); else await egg.click();
}
async function touch(session, type, x, y) {
  await session.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
}
try {
  for (const { width, height, lang } of [
    { width: 390, height: 844, lang: 'ru' }, { width: 320, height: 568, lang: 'en' },
    { width: 844, height: 390, lang: 'ru' }, { width: 1200, height: 900, lang: 'en' },
  ]) {
    const mobile = width < 900, context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin && ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const seed = formatSeed(4, 7, 'swap'), puzzle = generatePuzzle(seed);
    await page.goto(`${origin}/${lang}/untangle/?nest=${seed}`, { waitUntil: 'networkidle' });
    await page.locator('.nest-egg').first().waitFor();
    if (width < 600) await page.locator('.egg-nest.is-focused').waitFor();
    else await page.locator('.nest-view-controls button').click();
    assert.deepEqual(await points(page), puzzle.initial);
    const board = await page.locator('.nest-board').boundingBox();
    assert.ok(board.y < 200 && board.y + board.height <= height, `${width}: full board is visible on entry`);
    assert.ok(board.width >= Math.min(width - 24, height - 290), 'focus view uses the available play area');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/${width}-focus.png` });

    // Hold the second egg with another one already selected: inspection must
    // never consume a move or accidentally exchange them on release.
    await tap(page, 0, mobile);
    const before = await points(page), second = await page.locator('.nest-egg[data-node="1"]').boundingBox();
    const session = await context.newCDPSession(page), x = second.x + second.width / 2, y = second.y + second.height / 2;
    if (mobile) await touch(session, 'touchStart', x, y); else { await page.mouse.move(x, y); await page.mouse.down(); }
    await page.locator('.nest-board.is-inspecting').waitFor();
    assert.deepEqual(await points(page), before);
    const group = graphComponents(puzzle.initial.length, puzzle.edges).find(group => group.includes(1));
    assert.equal(await page.locator('.nest-egg.is-inspected').count(), group.length);
    assert.equal(await moveCount(page), 0);
    await page.screenshot({ path: `${output}/${width}-inspection.png` });
    if (mobile) await touch(session, 'touchEnd'); else await page.mouse.up();
    assert.equal(await page.locator('.nest-board.is-inspecting').count(), 0);
    assert.deepEqual(await points(page), before);
    assert.equal(await page.locator('.nest-egg[aria-pressed="true"]').getAttribute('data-node'), '0');
    await tap(page, 0, mobile);

    // The explicit control and keyboard shortcut expose the same whole figure.
    await tap(page, 1, mobile);
    const inspect = page.getByRole('button', { name: lang === 'ru' ? 'Показать фигуру' : 'Show shape', exact: true });
    await inspect.click(); assert.equal(await page.locator('.nest-egg.is-inspected').count(), group.length);
    await page.getByRole('button', { name: lang === 'ru' ? 'Все фигуры' : 'All shapes', exact: true }).click();
    await page.locator('.nest-egg[data-node="1"]').focus(); await page.keyboard.press('f');
    assert.equal(await page.locator('.nest-egg.is-inspected').count(), group.length);
    await page.keyboard.press('f'); await tap(page, 1, mobile);

    await page.getByRole('button', { name: lang === 'ru' ? 'Увеличить поле' : 'Enlarge board', exact: true }).click();
    const scale = await page.locator('.nest-board').evaluate(node => node.querySelector('svg').getBoundingClientRect().width / node.clientWidth);
    assert.ok(scale > 1.9);
    if (mobile) {
      const bounds = await page.locator('.nest-board').boundingBox(), sx = bounds.x + bounds.width * .7, sy = bounds.y + Math.min(bounds.height / 2, 100);
      await touch(session, 'touchStart', sx, sy);
      for (let i = 1; i <= 5; i++) await touch(session, 'touchMove', sx - i * 20, sy);
      await touch(session, 'touchEnd');
      assert.ok(await page.locator('.nest-board').evaluate(node => node.scrollLeft > 0), 'touch pans the enlarged board');
      assert.deepEqual(await points(page), before, 'panning never makes a swap');
      assert.equal(await moveCount(page), 0);
    }
    await page.screenshot({ path: `${output}/${width}-zoom.png` });
    await page.getByRole('button', { name: lang === 'ru' ? 'Поле целиком' : 'Fit board', exact: true }).click();
    await session.detach();

    const hintButton = page.getByRole('button', { name: lang === 'ru' ? /^Подсказка/ : /^Hint/ });
    await hintButton.click(); const firstPair = await hints(page);
    await hintButton.click(); assert.match(await hintButton.innerText(), /1$/);
    await page.reload({ waitUntil: 'networkidle' }); await page.locator('.nest-egg').first().waitFor();
    await hintButton.click(); assert.match(await hintButton.innerText(), /1$/);
    assert.deepEqual(await hints(page), firstPair, 'reopening after reload does not consume another hint');
    let steps = 0;
    while (!await page.locator('.nest-result').count()) {
      assert.ok(steps++ < puzzle.initial.length);
      await hintButton.click();
      const pair = await hints(page); assert.equal(pair.length, 2);
      for (const node of pair) await tap(page, node, mobile);
    }
    assert.ok(analyzeBoard(await points(page), puzzle.edges).solved);
    assert.equal(await moveCount(page), 3, 'the calibrated fourth-stage free puzzle solves in three swaps');
    const oldReceipt = await page.evaluate(seed => JSON.parse(localStorage.getItem(`egg_untangle_v1:guest:session:${seed}`)), seed);
    const next = page.getByRole('button', { name: lang === 'ru' ? 'Следующая случайная кладка →' : 'Next random clutch →', exact: true });
    assert.match(await next.getAttribute('class'), /nest-primary/);
    await next.click();
    const newSeed = new URL(page.url()).searchParams.get('nest');
    assert.notEqual(newSeed, seed); assert.match(newSeed, /^KNOT4-4-/); assert.equal(await moveCount(page), 0);
    assert.ok(await page.evaluate(id => localStorage.getItem(`egg_untangle_v1:guest:receipt:${id}`), oldReceipt.ticket.id));
    assert.deepEqual(await points(page), generatePuzzle(newSeed).initial);
    assert.equal(await page.locator('.egg-nest.is-focused').count(), 1);
    await page.locator('.nest-view-controls button').click();
    assert.ok(await page.locator('.nest-modes').isVisible(), 'settings remain reachable');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'leaving focus restores page scrolling');
    await page.reload({ waitUntil: 'networkidle' }); await page.locator('.nest-egg').first().waitFor();
    assert.equal(await page.locator('.egg-nest.is-focused').count(), 0, 'the view preference survives reload');
    const denseSeed = formatSeed(24, 11, 'swap');
    await page.goto(`${origin}/${lang}/untangle/?nest=${denseSeed}`, { waitUntil: 'networkidle' });
    await page.locator('.nest-egg').first().waitFor(); await page.locator('.nest-view-controls button').click();
    assert.equal(await page.locator('.nest-egg').count(), 24);
    for (let move = 0; move < 2; move++) {
      await hintButton.click();
      for (const node of await hints(page)) await tap(page, node, mobile);
    }
    assert.equal(await moveCount(page), 2, 'dense boards accept the intended mouse/touch exchanges');
    await page.screenshot({ path: `${output}/${width}-dense.png` });
    await page.keyboard.press('Escape');
    // Escape on an egg cancels its selection first. The view control's Escape
    // then exits the full-window mode and restores the outside page.
    await page.locator('.nest-view-controls button').focus(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('.egg-nest.is-focused').count(), 0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert.deepEqual(errors, []);
    results.push({ width, height, lang, seed, steps, focusedEntry: true, holdWithoutSwap: true, keyboardInspection: true, zoomAndPan: true, repeatedHint: true, nextClutch: true, errors });
    await context.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ results, fourthStage: campaignSeed(4, 'swap') }, null, 2));
  console.log(JSON.stringify({ passed: results.length, results }));
} finally { await browser.close(); }
