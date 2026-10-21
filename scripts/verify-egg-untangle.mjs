// Real interactions plus synthetic accounts: isolated loopback preview / its OWN SQLite only.
// node --experimental-strip-types scripts/verify-egg-untangle.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { analyzeBoard, campaignSeed, dailySeed, generatePuzzle, isSlotPermutation, moscowDay, parseSeed, swapNodes } from '../src/features/EggUntangle/engine.ts';

const origin = process.env.NEST_ORIGIN || 'http://127.0.0.1:4453';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Use an isolated loopback preview');
if (process.env.NEST_PREVIEW_ISOLATED !== '1') throw new Error('Set NEST_PREVIEW_ISOLATED=1 only after checking that the preview uses its own temporary SQLite');
const canonical = process.env.NEST_CANONICAL || 'https://egg.ilyamedve.dev';
const output = process.env.NEST_ARTIFACTS || '/tmp/egg-untangle-browser';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.NEST_CHROMIUM_EXECUTABLE ? { executablePath: process.env.NEST_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
const report = {}, contexts = new Set();
const allowedWrites = new Set(['/api/portal-account', '/api/portal-profile']);

async function setup({ width = 1200, height = 1000, mobile = false, timezoneId = 'Europe/Moscow', reducedMotion = 'reduce', init } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, timezoneId, reducedMotion, serviceWorkers: 'block' });
  contexts.add(context);
  const errors = [], writes = [], state = { failResults: false };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (['GET', 'HEAD'].includes(request.method())) return route.continue();
    if (request.method() !== 'POST' || !allowedWrites.has(url.pathname)) return route.abort();
    const body = request.postDataJSON();
    if (url.pathname === '/api/portal-profile' && body.action === 'result') {
      writes.push(body);
      if (state.failResults) return route.fulfill({ status: 503, json: { error: 'preview_offline' } });
    }
    // Change only the Origin header of requests to this loopback preview.
    const response = await route.fetch({ headers: { ...await request.allHeaders(), origin: canonical }, maxRetries: 0 });
    return route.fulfill({ response });
  });
  await context.addInitScript(() => {
    localStorage.setItem('egg_adept', 'true');
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Preview clipboard fallback'); } } });
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, errors, writes, state };
}

async function check(name, run) {
  try { report[name] = { passed: true, ...await run() }; }
  catch (error) { report[name] = { passed: false, error: error.stack }; process.exitCode = 1; }
  finally { for (const context of contexts) await context.close().catch(() => {}); contexts.clear(); }
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
  console.log(name, JSON.stringify(report[name]));
}

async function openGame(page, lang = 'ru', query = '') {
  await page.goto(`${origin}/${lang}/untangle/${query}`, { waitUntil: 'networkidle' });
  await page.locator('.nest-egg').first().waitFor();
  await page.locator('.nest-modes button:not(:disabled)').first().waitFor();
}

const seedOnPage = async page => parseSeed((await page.locator('.nest-footer button').innerText()).replace(/\s*↗$/, '').trim())?.seed;
const pointsOnPage = page => page.locator('.nest-egg').evaluateAll(elements => elements.map(element => {
  const match = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(element.getAttribute('transform'));
  return { x: Number(match[1]), y: Number(match[2]) };
}));
const movesOnPage = async page => Number(await page.locator('.nest-metrics strong').nth(1).innerText());
const localSessions = page => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('egg_untangle_v1:') && key.includes(':session:')).map(key => ({ key, value: JSON.parse(localStorage.getItem(key)) })));
async function currentSession(page) {
  const seed = await seedOnPage(page);
  const owner = await page.evaluate(() => localStorage.getItem('egg_road_active_account_v1'));
  return (await localSessions(page)).find(item => item.value.seed === seed && item.value.ticket.owner === owner)?.value;
}
async function noOverflow(page) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(size.document <= size.viewport + 1 && size.body <= size.viewport + 1, JSON.stringify(size));
  return size;
}
async function api(page, path, body) {
  return page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    return { status: response.status, data: await response.json() };
  }, { path, body });
}
async function goodApi(page, path, body) { const result = await api(page, path, body); assert.equal(result.status, 200, `${path}: ${result.status} ${result.data.error || ''}`); return result.data; }
async function profile(page) { return (await goodApi(page, '/api/portal-profile')).profile; }

async function dragNode(page, index, destination, touch = false) {
  const board = page.locator('.nest-board svg');
  await board.scrollIntoViewIfNeeded();
  const bounds = await board.boundingBox(), current = (await pointsOnPage(page))[index];
  const screen = point => ({ x: bounds.x + point.x / 1000 * bounds.width, y: bounds.y + point.y / 1000 * bounds.height });
  const from = screen(current), to = screen(destination);
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
    for (let step = 1; step <= 6; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * step / 6, y: from.y + (to.y - from.y) * step / 6, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
  }
}

async function holdMouseDrag(page, index = 0) {
  const board = page.locator('.nest-board svg'); await board.scrollIntoViewIfNeeded();
  const bounds = await board.boundingBox(), point = (await pointsOnPage(page))[index];
  const from = { x: bounds.x + point.x / 1000 * bounds.width, y: bounds.y + point.y / 1000 * bounds.height };
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x + 35, from.y + 25, { steps: 4 });
}

async function solveByDragging(page, touch = false) {
  const seed = await seedOnPage(page), puzzle = generatePuzzle(seed);
  for (let pass = 0; pass < 3 && await page.locator('.nest-result').count() === 0; pass++) {
    for (let index = 0; index < puzzle.solution.length; index++) {
      if (await page.locator('.nest-result').count()) break;
      const current = (await pointsOnPage(page))[index], target = puzzle.solution[index];
      if (Math.hypot(current.x - target.x, current.y - target.y) > 1.5) await dragNode(page, index, target, touch);
    }
  }
  await page.locator('.nest-result').waitFor();
  assert.equal(await page.locator('.nest-thread.is-crossed').count(), 0);
  assert.equal((await currentSession(page)).done, true);
  return { seed, moves: await movesOnPage(page), text: await page.locator('.nest-result > p').nth(1).innerText() };
}

async function solveBySwapping(page, touch = false) {
  const seed = await seedOnPage(page), puzzle = generatePuzzle(seed);
  assert.equal(puzzle.mechanics, 'swap');
  await page.locator('.nest-egg').first().focus(); await page.keyboard.press('Escape');
  for (let index = 0; index < puzzle.solution.length; index++) {
    if (await page.locator('.nest-result').count()) break;
    const current = await pointsOnPage(page), target = puzzle.solution[index];
    assert.equal(isSlotPermutation(puzzle, current), true);
    if (current[index].x === target.x && current[index].y === target.y) continue;
    const other = current.findIndex(point => point.x === target.x && point.y === target.y);
    assert.ok(other >= 0 && other !== index);
    const nodes = page.locator('.nest-egg');
    if (touch) { await nodes.nth(index).tap(); await nodes.nth(other).tap(); }
    else { await nodes.nth(index).click(); await nodes.nth(other).click(); }
    assert.equal(isSlotPermutation(puzzle, await pointsOnPage(page)), true);
  }
  await page.locator('.nest-result').waitFor();
  assert.equal(await page.locator('.nest-thread.is-crossed').count(), 0);
  assert.equal((await currentSession(page)).done, true);
  return { seed, moves: await movesOnPage(page), text: await page.locator('.nest-result > p').nth(1).innerText() };
}

async function pairByPointer(page, first, second, force = false) {
  await page.locator('.nest-egg').nth(first).click({ force });
  await page.locator('.nest-egg').nth(second).click({ force });
}
const waitForLanding = page => page.waitForFunction(() => document.querySelector('.nest-board')?.getAttribute('aria-busy') !== 'true');
async function recordMotion(page) {
  await page.evaluate(() => {
    window.__nestMotion = [];
    const token = window.__nestMotionToken = (window.__nestMotionToken || 0) + 1;
    const end = performance.now() + 10000;
    const sample = () => {
      if (token !== window.__nestMotionToken) return;
      const board = document.querySelector('.nest-board');
      const points = [...document.querySelectorAll('.nest-egg')].map(element => {
        const values = element.getAttribute('transform').match(/translate\(([-\d.]+)[ ,]([-\d.]+)\)/);
        return { x: Number(values[1]), y: Number(values[2]) };
      });
      const lines = [...document.querySelectorAll('.nest-thread-core')].map(element => ['x1', 'y1', 'x2', 'y2'].map(name => Number(element.getAttribute(name))));
      window.__nestMotion.push({ time: performance.now(), busy: board?.getAttribute('aria-busy') === 'true', result: Boolean(document.querySelector('.nest-result')), points, lines });
      if (performance.now() < end) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}
async function verifyMotion(page, puzzle, before, target, label) {
  await waitForLanding(page); await page.waitForTimeout(40);
  const frames = await page.evaluate(() => { window.__nestMotionToken++; return window.__nestMotion; });
  const moving = frames.filter(frame => frame.busy && frame.points.some((point, index) => Math.hypot(point.x - before[index].x, point.y - before[index].y) > .1 && Math.hypot(point.x - target[index].x, point.y - target[index].y) > .1));
  assert.ok(moving.length >= 3, `${label}: no sustained intermediate frames`);
  for (const frame of moving) for (const [[a, b], index] of puzzle.edges.map((edge, index) => [edge, index])) {
    assert.deepEqual(frame.lines[index], [frame.points[a].x, frame.points[a].y, frame.points[b].x, frame.points[b].y], `${label}: rope endpoints track both eggs`);
  }
  const changed = before.map((point, index) => point.x !== target[index].x || point.y !== target[index].y ? index : -1).filter(index => index >= 0);
  assert.equal(changed.length, 2);
  const index = changed[0], dx = target[index].x - before[index].x, dy = target[index].y - before[index].y;
  const arcDeviation = Math.max(...moving.map(frame => Math.abs(dx * (frame.points[index].y - before[index].y) - dy * (frame.points[index].x - before[index].x)) / Math.hypot(dx, dy)));
  assert.ok(arcDeviation > 4, `${label}: path should visibly curve`);
  assert.deepEqual(await pointsOnPage(page), target);
  assert.equal(isSlotPermutation(puzzle, target), true);
  await writeFile(`${output}/motion-${label}.json`, JSON.stringify(frames, null, 2));
  return { frames: moving.length, arcDeviation: Math.round(arcDeviation * 100) / 100, eggsAndRopesTogether: true };
}

function componentCount(puzzle) {
  const unseen = new Set(puzzle.initial.map((_, index) => index));
  let count = 0;
  while (unseen.size) {
    count++; const queue = [unseen.values().next().value]; unseen.delete(queue[0]);
    for (let head = 0; head < queue.length; head++) for (const [a, b] of puzzle.edges) {
      const next = a === queue[head] ? b : b === queue[head] ? a : -1;
      if (unseen.delete(next)) queue.push(next);
    }
  }
  return count;
}

async function hoverContrast(button) {
  await button.hover();
  await button.page().waitForTimeout(180);
  const result = await button.evaluate(element => {
    const parse = color => (color.match(/[\d.]+/g) || []).map(Number);
    const parents = []; for (let current = element; current; current = current.parentElement) parents.unshift(current);
    let background = [255, 255, 255];
    for (const parent of parents) { const color = parse(getComputedStyle(parent).backgroundColor), alpha = color[3] ?? 1; background = background.map((value, index) => value * (1 - alpha) + color[index] * alpha); }
    const foreground = parse(getComputedStyle(element).color);
    const luminance = color => color.slice(0, 3).map(value => { const x = value / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const light = luminance(foreground), dark = luminance(background);
    return { label: element.textContent.trim(), color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor, ratio: (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05) };
  });
  assert.ok(result.ratio >= 4.5, JSON.stringify(result)); return result;
}

try {
  await check('desktop-controls-resume-and-actual-solve', async () => {
    const { page, errors } = await setup();
    await openGame(page, 'ru', `?nest=${campaignSeed(2)}`);
    const initial = await pointsOnPage(page);
    await page.locator('.nest-egg').first().focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await movesOnPage(page), 1);
    const moved = await pointsOnPage(page); assert.notDeepEqual(moved, initial);
    await page.getByRole('button', { name: '↶ Отменить', exact: true }).click();
    assert.deepEqual(await pointsOnPage(page), initial); assert.equal(await movesOnPage(page), 2);
    await page.getByRole('button', { name: '↷ Вернуть', exact: true }).click();
    assert.deepEqual(await pointsOnPage(page), moved); assert.equal(await movesOnPage(page), 3);
    await page.getByRole('button', { name: 'Подсказка', exact: true }).click();
    assert.equal((await currentSession(page)).hints, 1);
    const before = await currentSession(page);
    await page.reload({ waitUntil: 'networkidle' }); await page.locator('.nest-egg').first().waitFor();
    assert.deepEqual(await pointsOnPage(page), moved);
    const after = await currentSession(page);
    assert.equal(after.ticket.id, before.ticket.id); assert.equal(after.moves, 3); assert.equal(after.hints, 1);
    await holdMouseDrag(page);
    assert.notDeepEqual(await pointsOnPage(page), moved, 'held pointer produces a provisional layout');
    await page.getByRole('button', { name: 'Пауза', exact: true }).focus(); await page.keyboard.press('Space');
    await page.mouse.up();
    assert.deepEqual(await pointsOnPage(page), moved, 'pausing cancels an uncommitted drag');
    assert.equal(await movesOnPage(page), 3);
    const pausedTime = await page.locator('.nest-metrics strong').nth(2).innerText();
    await page.waitForTimeout(1250);
    assert.equal(await page.locator('.nest-metrics strong').nth(2).innerText(), pausedTime);
    await page.getByRole('button', { name: 'Продолжить ритуал', exact: true }).click();
    await holdMouseDrag(page);
    assert.notDeepEqual(await pointsOnPage(page), moved);
    await page.locator('.nest-rules button').nth(1).focus(); await page.keyboard.press('Space');
    await page.mouse.up();
    assert.equal(parseSeed(await seedOnPage(page)).mechanics, 'swap');
    await page.locator('.nest-rules button').first().click();
    await page.getByRole('button', { name: 'Уровень 2', exact: true }).click();
    assert.deepEqual(await pointsOnPage(page), moved, 'rule changes retain only the committed layout');
    assert.equal(await movesOnPage(page), 3); assert.equal((await currentSession(page)).ticket.id, before.ticket.id);
    await page.getByRole('button', { name: 'Поделиться этой кладкой', exact: true }).click();
    const challenge = await page.locator('.nest-share-fallback').inputValue();
    assert.ok(challenge.includes(campaignSeed(2)));
    const result = await solveByDragging(page);
    await page.getByRole('button', { name: 'Поделиться результатом', exact: true }).click();
    const share = await page.locator('.nest-share-fallback').inputValue();
    assert.match(share, new RegExp(`${result.moves} ход(?:а|ов)?`)); assert.match(share, /1 подсказк[а-я]*/u);
    assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem('egg_untangle_v1:guest:progress')))).campaign.includes(2));
    const dimensions = await noOverflow(page);
    await page.screenshot({ path: `${output}/ru-desktop-solved.png`, fullPage: true });
    assert.deepEqual(errors, []);
    return { ...result, reloadResume: true, keyboardUndoRedo: true, heldDragPauseAndRuleCancellation: true, pause: true, shareFallback: true, dimensions, errors };
  });

  await check('mobile-touch-daily-timezones-and-invalid-links', async () => {
    const one = await setup({ width: 320, height: 740, mobile: true, timezoneId: 'Pacific/Honolulu' });
    const two = await setup({ width: 390, height: 844, mobile: true, timezoneId: 'Asia/Tokyo' });
    await openGame(one.page, 'en', '?nest=not-a-clutch');
    await one.page.getByText('Clutch code not recognised. Level one is open.', { exact: true }).waitFor();
    assert.equal(await seedOnPage(one.page), campaignSeed(1));
    const before = await pointsOnPage(one.page);
    await dragNode(one.page, 0, { x: Math.max(80, before[0].x - 70), y: Math.max(80, before[0].y - 50) }, true);
    assert.equal(await movesOnPage(one.page), 1); assert.notDeepEqual(await pointsOnPage(one.page), before);
    await one.page.getByRole('button', { name: 'Daily clutch', exact: true }).click();
    await openGame(two.page, 'ru'); await two.page.getByRole('button', { name: 'Кладка дня', exact: true }).click();
    const day = moscowDay(), seed = dailySeed(day);
    assert.equal(await seedOnPage(one.page), seed); assert.equal(await seedOnPage(two.page), seed);
    assert.deepEqual(await pointsOnPage(one.page), await pointsOnPage(two.page));
    await one.page.getByRole('button', { name: 'Share this clutch', exact: true }).click();
    const shared = await one.page.locator('.nest-share-fallback').inputValue();
    assert.ok(shared.includes(`day=${day}`));
    const dimensions = [await noOverflow(one.page), await noOverflow(two.page)];
    await one.page.screenshot({ path: `${output}/en-mobile-320-daily.png`, fullPage: true });
    await two.page.screenshot({ path: `${output}/ru-mobile-390-daily.png`, fullPage: true });
    await openGame(one.page, 'en', `?nest=${dailySeed('2026-02-28')}&day=2026-02-30`);
    assert.equal(await one.page.locator('.nest-seed-form').count(), 1, 'invalid date is handled as a free seed');
    await one.page.locator('.nest-seed-form input').fill(shared.match(/https?:\/\/\S+/)[0]);
    await one.page.getByRole('button', { name: 'Open', exact: true }).click();
    assert.equal(await seedOnPage(one.page), seed); assert.equal(await one.page.locator('.nest-daily').count(), 1);
    assert.deepEqual(one.errors, []); assert.deepEqual(two.errors, []);
    return { day, seed, timezones: ['Pacific/Honolulu', 'Asia/Tokyo'], actualTouch: true, invalidSeed: true, invalidDate: true, dailyLinkReplay: true, dimensions, errors: [] };
  });

  await check('hardmode-fixed-swaps-components-and-legacy', async () => {
    const desktop = await setup(), mobile = await setup({ width: 390, height: 844, mobile: true });
    const seed = campaignSeed(4, 'swap'), puzzle = generatePuzzle(seed);
    assert.ok(componentCount(puzzle) >= 2, 'this campaign clutch has separate figures');
    await openGame(desktop.page, 'ru', `?nest=${seed}`);
    const initial = await pointsOnPage(desktop.page);
    assert.deepEqual(initial, puzzle.initial);
    await dragNode(desktop.page, 0, { x: initial[0].x + 45, y: initial[0].y + 45 });
    assert.deepEqual(await pointsOnPage(desktop.page), initial, 'hardmode does not allow free drag');
    assert.equal(await movesOnPage(desktop.page), 0);
    await desktop.page.locator('.nest-egg').first().focus(); await desktop.page.keyboard.press('Escape');
    await desktop.page.keyboard.press('ArrowRight');
    assert.deepEqual(await pointsOnPage(desktop.page), initial, 'arrows navigate, never change coordinates');
    await desktop.page.keyboard.press('Enter');
    await desktop.page.locator('.nest-egg').nth(2).focus(); await desktop.page.keyboard.press('Space');
    const swapped = await pointsOnPage(desktop.page);
    assert.equal(await movesOnPage(desktop.page), 1); assert.equal(isSlotPermutation(puzzle, swapped), true);
    assert.equal(swapped.filter((point, index) => point.x !== initial[index].x || point.y !== initial[index].y).length, 2);
    await desktop.page.getByRole('button', { name: '↶ Отменить', exact: true }).click();
    assert.deepEqual(await pointsOnPage(desktop.page), initial);
    await desktop.page.getByRole('button', { name: '↷ Вернуть', exact: true }).click();
    assert.deepEqual(await pointsOnPage(desktop.page), swapped);
    await desktop.page.getByRole('button', { name: 'Подсказка', exact: true }).click();
    assert.equal((await currentSession(desktop.page)).hints, 1);
    const contrasts = [];
    for (const button of await desktop.page.locator('.egg-nest button[aria-pressed="true"]').all()) contrasts.push(await hoverContrast(button));
    const desktopResult = await solveBySwapping(desktop.page);
    contrasts.push(await hoverContrast(desktop.page.getByRole('button', { name: 'Поделиться результатом', exact: true })));
    assert.ok((await desktop.page.evaluate(() => JSON.parse(localStorage.getItem('egg_untangle_v1:guest:progress')))).hardCampaign.includes(4));
    await desktop.page.screenshot({ path: `${output}/hard-desktop-solved.png`, fullPage: true });
    await openGame(mobile.page, 'en', `?nest=${campaignSeed(1, 'swap')}`);
    const mobileResult = await solveBySwapping(mobile.page, true);
    assert.match(mobileResult.text, /^1 move ·/, 'English first-stage result uses the singular');
    await noOverflow(mobile.page);
    await mobile.page.screenshot({ path: `${output}/hard-mobile-touch-solved.png`, fullPage: true });
    const oldSeed = campaignSeed(1, 'drag', 'NEST1');
    await openGame(desktop.page, 'ru', `?nest=${oldSeed}`);
    assert.deepEqual(await pointsOnPage(desktop.page), generatePuzzle(oldSeed).initial);
    assert.equal(parseSeed(await seedOnPage(desktop.page)).mechanics, 'drag');
    const legacyResult = await solveByDragging(desktop.page);
    const stored = await desktop.page.evaluate(() => JSON.parse(localStorage.getItem('egg_untangle_v1:guest:progress')));
    assert.ok(stored.legacyCampaign.includes(1)); assert.ok(!stored.campaign.includes(1)); assert.ok(stored.hardCampaign.includes(4));
    assert.deepEqual(desktop.errors, []); assert.deepEqual(mobile.errors, []);
    return { components: componentCount(puzzle), fixedSlots: true, noCoordinateCheat: true, keyboardPair: true, undoRedo: true, desktopResult, mobileResult, legacyResult, separateCampaigns: true, contrasts, errors: [] };
  });

  await check('animated-swaps-settlement-and-tutorial-progression', async () => {
    const { page, errors } = await setup({ reducedMotion: 'no-preference' });
    const seed = 'KNOT3-12-ABC', puzzle = generatePuzzle(seed);
    await openGame(page, 'en', `?nest=${seed}`);
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), false);
    const initial = await pointsOnPage(page), target = swapNodes(initial, 0, 1);
    assert.equal(analyzeBoard(target, puzzle.edges).solved, false);
    await recordMotion(page); await pairByPointer(page, 0, 1);
    await page.locator('.nest-board[aria-busy="true"]').waitFor();
    const during = await currentSession(page);
    assert.deepEqual(during.points, target, 'canonical target is durable before animation lands');
    assert.equal(during.moves, 1);
    await pairByPointer(page, 2, 3, true);
    await page.locator('.nest-egg').nth(4).focus(); await page.keyboard.press('Enter');
    await page.locator('.nest-egg').nth(5).focus(); await page.keyboard.press('Space');
    const forward = await verifyMotion(page, puzzle, initial, target, 'forward');
    assert.equal(await movesOnPage(page), 1, 'extra pointer/keyboard swaps during motion are blocked');
    assert.equal(await page.locator('.nest-egg[aria-pressed="true"]').count(), 0);

    await recordMotion(page); await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
    const undo = await verifyMotion(page, puzzle, target, initial, 'undo');
    await recordMotion(page); await page.getByRole('button', { name: '↷ Redo', exact: true }).click();
    const redo = await verifyMotion(page, puzzle, initial, target, 'redo');
    assert.equal(await movesOnPage(page), 3);

    await pairByPointer(page, 0, 1);
    await page.locator('.nest-board[aria-busy="true"]').waitFor();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await waitForLanding(page);
    assert.deepEqual(await pointsOnPage(page), initial); assert.equal(await movesOnPage(page), 4);
    await page.getByRole('button', { name: 'Continue the ritual', exact: true }).click();

    await pairByPointer(page, 0, 1);
    await page.locator('.nest-board[aria-busy="true"]').waitFor();
    // Exercise the same visibility callback browsers send when hiding the tab.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await waitForLanding(page);
    assert.deepEqual(await pointsOnPage(page), target); assert.equal(await movesOnPage(page), 5);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });

    await pairByPointer(page, 0, 1);
    await page.locator('.nest-board[aria-busy="true"]').waitFor();
    await page.locator('.nest-rules button').first().click();
    const savedAfterSwitch = (await localSessions(page)).find(item => item.value.seed === seed)?.value;
    assert.deepEqual(savedAfterSwitch.points, initial); assert.equal(savedAfterSwitch.moves, 6);
    await openGame(page, 'en', `?nest=${seed}`);
    assert.deepEqual(await pointsOnPage(page), initial);
    await pairByPointer(page, 0, 1);
    await page.locator('.nest-board[aria-busy="true"]').waitFor();
    await page.reload({ waitUntil: 'networkidle' }); await page.locator('.nest-egg').first().waitFor();
    assert.deepEqual(await pointsOnPage(page), target); assert.equal(await movesOnPage(page), 7);
    assert.equal((await currentSession(page)).ticket.id, during.ticket.id);
    await waitForLanding(page);

    const tutorialSeed = campaignSeed(1, 'swap'), tutorial = generatePuzzle(tutorialSeed);
    await openGame(page, 'en', `?nest=${tutorialSeed}`);
    const winningPair = tutorial.initial.flatMap((_, a) => tutorial.initial.map((__, b) => [a, b])).find(([a, b]) => a < b && analyzeBoard(swapNodes(tutorial.initial, a, b), tutorial.edges).solved);
    assert.ok(winningPair, 'first swap tutorial has a one-swap solution');
    await recordMotion(page); await pairByPointer(page, ...winningPair);
    await page.locator('.nest-board[aria-busy="true"]').waitFor();
    assert.equal(await page.locator('.nest-result').count(), 0, 'victory waits until landing');
    assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).isDisabled(), true, 'a winning flight cannot be paused');
    assert.equal(await page.locator('.nest-pause').count(), 0);
    assert.equal((await currentSession(page)).done, true, 'winning target is already safe to reload');
    await page.locator('.nest-result').waitFor();
    const victoryFrames = await page.evaluate(() => { window.__nestMotionToken++; return window.__nestMotion; });
    assert.ok(victoryFrames.some(frame => frame.busy));
    assert.ok(victoryFrames.filter(frame => frame.busy).every(frame => !frame.result));
    await writeFile(`${output}/motion-victory.json`, JSON.stringify(victoryFrames, null, 2));
    await page.screenshot({ path: `${output}/animated-tutorial-victory.png`, fullPage: true });

    const reduced = await setup({ width: 390, height: 844, mobile: true });
    await openGame(reduced.page, 'ru', `?nest=${tutorialSeed}`);
    assert.equal(await reduced.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    const tutorialSteps = [];
    for (let level = 1; level <= 3; level++) {
      assert.equal(await seedOnPage(reduced.page), campaignSeed(level, 'swap'));
      const result = await solveBySwapping(reduced.page, true);
      assert.equal(await reduced.page.locator('.nest-board[aria-busy="true"]').count(), 0);
      tutorialSteps.push({ level, ...result });
      await reduced.page.getByRole('button', { name: 'Следующая ступень →', exact: true }).click();
    }
    assert.equal(await seedOnPage(reduced.page), campaignSeed(4, 'swap'));
    assert.equal(parseSeed(await seedOnPage(reduced.page)).version, 'KNOT3', 'step four enters the varied figure campaign');
    await noOverflow(reduced.page);
    await reduced.page.screenshot({ path: `${output}/tutorial-bridge-mobile.png`, fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(reduced.errors, []);
    return { forward, undo, redo, rapidInputBlocked: true, canonicalPersistence: true, pauseSettles: true, visibilitySignalSettles: true, ruleSwitchSettles: true, reloadSettles: true, victoryAfterLanding: true, reducedMotionImmediate: true, tutorialSteps, newFigureStepFour: true, errors: [] };
  });

  await check('account-offline-retry-cloud-and-privacy', async () => {
    const first = await setup({ width: 1100, height: 1000 });
    const name = `Nest-${randomUUID().slice(0, 8)}`, password = randomUUID();
    await openGame(first.page);
    await goodApi(first.page, '/api/portal-account', { action: 'register', name, password });
    await openGame(first.page, 'ru', `?nest=${campaignSeed(1)}`);
    await first.page.locator('.portal-presence').getByRole('link', { name: `${name} · Профиль`, exact: true }).waitFor();
    first.state.failResults = true;
    const result = await solveByDragging(first.page);
    await first.page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith('egg_portal_outbox_v1:account:')));
    assert.ok(first.writes.length > 0);
    const ticket = first.writes[0].run.id;
    assert.equal(first.writes[0].game, undefined);
    assert.equal(first.writes[0].run.game, 'untangle');
    assert.equal(first.writes[0].expectedName, name.toLowerCase());
    first.state.failResults = false;
    await first.page.getByRole('button', { name: 'Повторить отправку', exact: true }).click();
    await first.page.getByText('Результат сохранён в профиле.', { exact: true }).waitFor();
    const saved = await profile(first.page);
    assert.ok(saved.untangle.campaign.includes(1));
    assert.equal(saved.untangle.totalSolved, 1);
    assert.ok(saved.achievements.includes('untangle.first')); assert.ok(saved.achievements.includes('untangle.clean'));
    assert.ok(first.writes.every(write => write.run.id === ticket));
    const repeat = await goodApi(first.page, '/api/portal-profile', first.writes[0]);
    assert.equal(repeat.profile.untangle.totalSolved, 1);
    assert.equal(repeat.profile.stats.find(stat => stat.game === 'untangle').runs, 1);

    const second = await setup({ width: 320, height: 740, mobile: true });
    await openGame(second.page, 'en');
    await goodApi(second.page, '/api/portal-account', { action: 'login', name, password });
    await openGame(second.page, 'en', `?nest=${campaignSeed(1)}`);
    await second.page.getByRole('button', { name: 'Level 1, complete', exact: true }).waitFor();
    await second.page.locator('.nest-best').waitFor();
    assert.equal((await profile(second.page)).id, saved.id);
    assert.equal((await currentSession(second.page)).ticket.owner, name.toLowerCase());
    const anon = await setup(); await openGame(anon.page);
    const publicData = await goodApi(anon.page, `/api/portal-profile?id=${saved.id}`);
    assert.equal(publicData.profile.untangle, undefined);
    assert.ok(publicData.profile.achievements.includes('untangle.first'));
    const publicText = JSON.stringify(publicData);
    assert.ok(!publicText.includes(result.seed)); assert.ok(!publicText.includes('positions'));
    assert.ok(!publicText.includes('recovery')); assert.ok(!publicText.includes('password'));

    await goodApi(second.page, '/api/portal-account', { action: 'logout' });
    await openGame(second.page, 'en');
    assert.equal((await currentSession(second.page)).ticket.owner, null);
    assert.equal((await profile(second.page)), null);
    assert.equal(await second.page.getByRole('button', { name: 'Level 1, complete', exact: true }).count(), 0);
    assert.ok((await localSessions(second.page)).some(item => item.value.ticket.owner === name.toLowerCase()), 'old account state retained separately');
    await goodApi(first.page, '/api/portal-profile', { action: 'settings', expectedName: name.toLowerCase(), avatar: 0, public: false });
    assert.equal((await api(anon.page, `/api/portal-profile?id=${saved.id}`)).status, 404);
    await first.page.screenshot({ path: `${output}/account-solved.png`, fullPage: true });
    for (const item of [first, second, anon]) assert.deepEqual(item.errors, []);
    return { realSolve: result, retrySameUuid: true, idempotent: true, achievements: ['untangle.first', 'untangle.clean'], secondDevice: true, accountIsolation: true, publicHistoryPrivate: true, hideProfile: true, errors: [] };
  });

  await check('guest-victory-login-explicit-import', async () => {
    const first = await setup({ width: 390, height: 844, mobile: true });
    const name = `Claim-${randomUUID().slice(0, 8)}`, password = randomUUID();
    await openGame(first.page, 'ru', `?nest=${campaignSeed(2, 'swap')}`);
    const result = await solveBySwapping(first.page, true), completed = await currentSession(first.page);
    assert.equal(completed.ticket.owner, null); assert.equal(first.writes.length, 0);
    await first.page.goto(`${origin}/ru/profile/#nest-results`, { waitUntil: 'networkidle' });
    await goodApi(first.page, '/api/portal-account', { action: 'register', name, password });
    await first.page.reload({ waitUntil: 'networkidle' });
    const importer = first.page.locator('.nest-guest-import'); await importer.waitFor();
    assert.ok((await importer.innerText()).includes(name));
    assert.ok((await importer.innerText()).includes(result.seed));
    const before = await profile(first.page);
    assert.equal(before.untangle.totalSolved, 0, 'login must not silently adopt guest results');
    assert.equal(first.writes.length, 0);
    const submission = first.page.waitForResponse(response => response.url() === `${origin}/api/portal-profile` && response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'result');
    await importer.getByRole('button', { name: `Сохранить в профиль «${name}»`, exact: true }).click();
    assert.equal((await submission).status(), 200);
    const claimed = await profile(first.page);
    assert.ok(claimed.untangle.hardCampaign.includes(2)); assert.equal(claimed.untangle.totalSolved, 1);
    assert.equal(first.writes[0].run.id, completed.ticket.id);
    assert.equal(first.writes[0].run.guestImport, true);
    assert.equal(first.writes[0].expectedName, name.toLowerCase());
    const duplicate = await goodApi(first.page, '/api/portal-profile', first.writes[0]);
    assert.equal(duplicate.profile.stats.find(stat => stat.game === 'untangle').runs, 1);
    await first.page.reload({ waitUntil: 'networkidle' });
    assert.equal(await first.page.locator('.nest-guest-import button').count(), 0, 'claimed guest proof no longer offered');
    await noOverflow(first.page);
    await first.page.screenshot({ path: `${output}/guest-imported-profile.png`, fullPage: true });
    const second = await setup(); await openGame(second.page, 'en');
    const otherName = `Claim-${randomUUID().slice(0, 8)}`;
    await goodApi(second.page, '/api/portal-account', { action: 'register', name: otherName, password: randomUUID() });
    const stolen = await api(second.page, '/api/portal-profile', { ...first.writes[0], expectedName: otherName.toLowerCase() });
    assert.equal(stolen.status, 409); assert.equal(stolen.data.error, 'guest_result_claimed');
    assert.deepEqual(first.errors, []); assert.deepEqual(second.errors, []);
    return { realGuestSolve: result, noAutomaticImport: true, explicitOwnerNamed: true, originalUuidRetained: true, retryIdempotent: true, removedFromPrompt: true, secondOwnerRejected: true, errors: [] };
  });
} finally { await browser.close(); }
assert.ok(Object.values(report).every(item => item.passed), 'Untangle browser checks failed; see results.json');
