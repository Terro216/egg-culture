// Run on big-one with Node --experimental-strip-types. This runner only writes
// to an isolated preview; every browser request is intercepted before transport.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { restoreRun, currentCase, canAppeal, canFile } from '../src/features/Commission/engine.ts';
import { tools, claims } from '../src/features/Commission/content.ts';
import { storageKey } from '../src/features/Commission/storage.ts';

const preview = new URL(process.env.COMMISSION_PREVIEW ?? 'http://127.0.0.1:4457');
assert.equal(preview.hostname, '127.0.0.1', 'Use an isolated loopback preview, never production');
const origin = 'https://egg.ilyamedve.dev';
const out = process.env.COMMISSION_EVIDENCE ?? '/tmp/egg-commission-browser-20261022';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], failures = [], evidence = [];
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block', ...options });
  await ctx.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    try {
      const response = await route.fetch({ url: new URL(url.pathname + url.search, preview).href, headers: { ...request.headers(), origin, host: new URL(origin).host } });
      await route.fulfill({ response });
    } catch { await route.abort(); }
  });
  ctx.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 500) failures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
    page.on('dialog', dialog => dialog.accept());
  });
  return ctx;
}
async function open(ctx, lang = 'ru') {
  const page = await ctx.newPage();
  const response = await page.goto(`${origin}/${lang}/commission/`);
  assert.equal(response.status(), 200);
  assert.match(response.headers()['x-robots-tag'], /noindex/);
  assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
  await page.locator('.commission-save-dot:not(.loading)').waitFor();
  return page;
}
async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(dimensions.content <= dimensions.width + 1, `${name} overflows: ${JSON.stringify(dimensions)}`);
  evidence.push(name);
}
async function run(page, owner = 'guest', slot = 'campaign') {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key))?.run, storageKey(owner === 'guest' ? null : owner, slot));
}
async function state(page, owner, slot) { return restoreRun(await run(page, owner, slot))?.state; }
async function click(page, text) { await page.getByRole('button', { name: text, exact: typeof text === 'string' }).click(); }
async function play(page, lang, owner = 'guest', slot = 'campaign') {
  let guard = 0;
  while (++guard < 350) {
    const s = await state(page, owner, slot); assert.ok(s);
    if (s.phase === 'ended' || s.phase === 'final') return s;
    if (s.phase === 'brief') { await page.locator('.commission-brief .commission-primary').click(); continue; }
    if (s.phase === 'desk') {
      if (s.receipt) { await page.locator('.commission-receipt .commission-primary').click(); continue; }
      const item = currentCase(s);
      if (await page.locator('.commission-mobile-tabs').isVisible()) await page.getByRole('tab').first().click();
      for (const tool of item.mandatory) if (!s.observed.includes(tool)) {
        await click(page, new RegExp(`^${tools[tool].action[lang]}`));
        if (s.mode === 'campaign' && s.index === 0 && ((s.day === 2 && tool === 'light') || (s.day === 4 && tool === 'plate'))) await shot(page, `${lang}-${tool}`);
      }
      let decision = item.defect === 'none' ? 'admit' : 'reject';
      if (s.mode === 'campaign' && s.day === 3 && s.index === 0) decision = 'hold';
      if (s.mode === 'campaign' && s.day === 5 && s.index === 0) decision = 'guarantee';
      const index = { admit: 0, reject: 1, hold: 2, guarantee: 3 }[decision];
      await page.locator('.commission-decisions button').nth(index).click();
      assert.equal((await state(page, owner, slot)).receipt, null, 'Selection must not stamp immediately');
      if (decision === 'reject') await page.locator('.commission-signature select').selectOption(item.defect);
      await page.locator('.commission-signature .commission-primary').click();
      const result = await state(page, owner, slot);
      assert.ok(result.receipt, 'Stamp must write a receipt');
      assert.ok(decision === 'hold' || result.receipt.correct, `${s.day}/${s.index}: honest decision rejected`);
      continue;
    }
    if (s.phase === 'report') {
      assert.equal(s.reports.at(-1).errors, 0);
      if (s.day === 8) await shot(page, `${lang}-report-sanction`);
      if (canAppeal(s)) await page.locator('.commission-warning .commission-secondary').click();
      await page.locator('.commission-report .commission-primary').click();
      continue;
    }
    assert.equal(s.phase, 'evening');
    if (s.eventChoice === null) await page.locator('.commission-event-choices button').first().click();
    if (s.day === 4) { await page.locator('.commission-purchases button').first().click(); await shot(page, `${lang}-evening`); }
    const updated = await state(page, owner, slot);
    if (Object.keys(claims).some(id => canFile(updated, id) && !updated.claims.includes(id))) {
      await page.locator('.commission-toolbar button[aria-label="Досье"]').click();
      for (const button of await page.locator('.commission-evidence-thread button:enabled').all()) await button.click();
      await page.keyboard.press('Escape');
    }
    console.log(`campaign shift ${s.day}: ${s.reports.at(-1).correct} correct`);
    await page.locator('.commission-evening-aside > .commission-primary').click();
  }
  throw new Error('Playthrough exceeded its bound');
}
let page;
try {
 if (process.env.COMMISSION_CHECK === 'final') {
  page = await open(await context({ viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' }), 'en');
  await shot(page, 'final-en-320-intro');
  await page.locator('.commission-intro-actions .commission-primary').click();
  await click(page, /Open admissions/); await page.locator('.commission-specimen-canvas canvas').waitFor();
  const canvas = page.locator('.commission-specimen-canvas');
  await canvas.focus(); const before = await canvas.screenshot(); await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150); const after = await canvas.screenshot();
  assert.notDeepEqual(before, after, 'Keyboard rotation must change the rendered specimen');
  const fixture = JSON.parse(await readFile(`${out}/campaign.json`, 'utf8'));
  const firstDish = fixture.actions.findIndex(action => action.type === 'tool' && action.tool === 'plate');
  assert.ok(firstDish > 0); fixture.actions = fixture.actions.slice(0, firstDish + 1);
  await click(page, 'Account and saves');
  await page.locator('input[type="file"]').setInputFiles({ name: 'specimen.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await page.keyboard.press('Escape');
  await click(page, /Open the control specimen/);
  await shot(page, 'final-en-320-dish');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await shot(page, 'final-en-desktop-dish');
  await click(page, /Candle the specimen/); await shot(page, 'final-en-candling');
  await click(page, /Request the record/); await shot(page, 'final-en-registry');
  assert.equal(await page.locator('.commission-model-fallback').count(), 0);
  await click(page, 'Account and saves');
  const exportEvent = page.waitForEvent('download'); await click(page, 'Download save');
  const exported = await exportEvent; await exported.saveAs(`${out}/exported-continuation.json`);
  assert.ok(restoreRun(JSON.parse(await readFile(`${out}/exported-continuation.json`, 'utf8'))));
  evidence.push('keyboard-rotation-five-tools-reduced-motion-import-export');
 }
 if (!['accounts', 'final'].includes(process.env.COMMISSION_CHECK)) {
  const ctx = await context(); page = await open(ctx);
  await shot(page, 'ru-desktop-intro');
  await page.locator('.commission-intro-actions .commission-primary').click();
  await shot(page, 'ru-desktop-brief');
  await click(page, /Открыть приём/);
  await page.locator('.commission-specimen-canvas canvas').waitFor();
  await shot(page, 'ru-desktop-desk');
  await click(page, /Взвесить образец/);
  await shot(page, 'ru-desktop-scale');
  assert.equal(await page.locator('.commission-model-fallback').count(), 0, 'WebGL model must render');
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'ru-mobile-specimen');
  await page.getByRole('tab', { name: 'Паспорт партии' }).click();
  await shot(page, 'ru-mobile-passport');
  await page.setViewportSize({ width: 320, height: 740 });
  await shot(page, 'ru-small-passport');
  await click(page, 'Регламент');
  await shot(page, 'ru-small-regulations');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const final = await play(page, 'ru');
  assert.equal(final.phase, 'final'); assert.equal(final.claims.length, 3);
  await shot(page, 'ru-finale');
  await page.locator('.commission-ending-choices article').nth(1).getByRole('button').click();
  assert.equal((await state(page)).ending, 'open');
  await shot(page, 'ru-open-ending');
  const finished = await run(page);
  await writeFile(`${out}/campaign.json`, JSON.stringify(finished));
  await page.reload(); await page.locator('.commission-completion').waitFor();
  assert.deepEqual(await run(page), finished, 'Guest resume must preserve the exact transcript');
  await click(page, 'Прочитать журнал дел');
  assert.equal(await page.locator('.commission-ledger > section').count(), 12);
  await page.keyboard.press('Escape');
  const cardEvent = page.waitForEvent('download'); await click(page, 'Скачать характеристику');
  await (await cardEvent).saveAs(`${out}/service-record.png`);
  const en = await open(await context({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), 'en');
  await shot(en, 'en-mobile-intro');
  await click(en, 'Daily shift');
  await en.locator('.commission-intro-actions .commission-primary').click();
  await click(en, /Open admissions/);
  await en.locator('.commission-specimen-canvas canvas').waitFor();
  await shot(en, 'en-mobile-desk');
  const dailySlot = await en.evaluate(() => Object.keys(localStorage).find(key => key.startsWith('egg_commission_v1:guest:daily:')).split(':').slice(2).join(':'));
  const daily = await play(en, 'en', 'guest', dailySlot);
  assert.equal(daily.phase, 'ended'); assert.equal(daily.score, 800);
  await shot(en, 'en-daily-ended');
  await writeFile(`${out}/daily.json`, JSON.stringify(await run(en, 'guest', dailySlot)));
 }
 if (!['play', 'final'].includes(process.env.COMMISSION_CHECK)) {
  const accountContext = await context(); page = await open(accountContext);
  const name = `Commission${Date.now().toString(36)}`, password = crypto.randomUUID();
  await page.locator('.commission-intro-actions .commission-primary').click();
  await click(page, /Открыть приём/); await click(page, /Взвесить образец/);
  const guest = await run(page);
  await click(page, 'Аккаунт и сохранение');
  await click(page, 'Войти, чтобы сохранять прогресс');
  await page.getByRole('group').getByRole('button', { name: 'Закрепить имя', exact: true }).click();
  await page.locator('#road-account-name').fill(name);
  await page.locator('#road-account-password').fill(password);
  await page.locator('#road-account-confirm').fill(password);
  await page.locator('form .egg-road-account-submit').click();
  await click(page, 'Я сохранил код');
  await page.locator('.commission-save-dot.saved').waitFor();
  assert.equal(await run(page, name), null, 'Registration must not silently adopt a guest save');
  await click(page, 'Перенести гостевое прохождение в аккаунт');
  await page.locator('.commission-save-dot.saved').waitFor();
  assert.deepEqual(await run(page, name), guest);
  assert.deepEqual(await run(page), guest, 'Import must preserve guest continuation');
  const deviceContext = await context(); const device = await open(deviceContext);
  await click(device, 'Аккаунт и сохранение'); await click(device, 'Войти, чтобы сохранять прогресс');
  await device.locator('#road-account-name').fill(name); await device.locator('#road-account-password').fill(password);
  await device.locator('form .egg-road-account-submit').click();
  await device.locator('.commission-save-dot.saved').waitFor(); await device.keyboard.press('Escape');
  assert.deepEqual(await run(device, name), guest, 'Second browser must resume the same run');
  await deviceContext.route('**/api/commission*', route => route.abort());
  await click(device, /Осмотреть скорлупу/);
  await device.locator('.commission-save-dot.offline').waitFor();
  await page.locator('.commission-decisions .admit').click();
  await page.locator('.commission-signature .commission-primary').click();
  await page.locator('.commission-save-dot.saved').waitFor();
  await deviceContext.unroute('**/api/commission*');
  await device.evaluate(() => window.dispatchEvent(new Event('online')));
  await device.locator('.commission-save-dot.conflict').waitFor();
  await click(device, 'Сравнить'); await shot(device, 'ru-save-conflict');
  await click(device, 'Продолжить из аккаунта'); await device.keyboard.press('Escape');
  assert.deepEqual(await run(device, name), await run(page, name), 'Conflict choice must use the selected transcript');
  // Finish and publish the same deterministic daily transcript already exercised through UI.
  const dailyFixture = JSON.parse(await readFile(`${out}/daily.json`, 'utf8'));
  await page.locator('.commission-wordmark').click(); await click(page, 'Ежедневная смена');
  await page.locator('.commission-save-dot.saved').waitFor();
  await click(page, 'Аккаунт и сохранение');
  await page.locator('input[type="file"]').setInputFiles({ name: 'daily.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(dailyFixture)) });
  await page.keyboard.press('Escape'); await page.locator('.commission-completion').waitFor();
  await page.locator('.commission-save-dot.saved').waitFor();
  assert.equal(await page.locator('.commission-standings li').count(), 0);
  await click(page, 'Опубликовать результат под моим именем');
  await page.locator('.commission-standings li.is-own').waitFor();
  assert.match(await page.locator('.commission-standings li.is-own').innerText(), /800/);
  await click(page, 'Убрать мой результат из зачёта');
  await page.locator('.commission-standings li').waitFor({ state: 'detached' });
  // Account changes travel through the existing API and the same identity event.
  const other = `Other${Date.now().toString(36)}`;
  await device.evaluate(async ({ other, password }) => {
    const auth = async body => { const response = await fetch('/api/portal-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(`auth ${response.status}`); };
    await auth({ action: 'logout' }); await auth({ action: 'register', name: other, password });
    window.dispatchEvent(new Event('egg:account'));
  }, { other, password });
  await device.locator('.commission-save-dot.saved').waitFor();
  await device.locator('.commission-intro').waitFor();
  assert.equal(await run(device, other), null);
  assert.ok(await run(device, name), 'Previous account cache stays isolated');
  // Old-owner writes must be refused even if they arrive after a new login.
  const status = await device.evaluate(async ({ name, guest }) => (await fetch('/api/commission', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', expectedName: name, revision: 0, run: guest }) })).status, { name, guest });
  assert.equal(status, 409);
  const guards = await device.evaluate(async ({ other, guest }) => {
    const post = async body => (await fetch('/api/commission', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status;
    const own = await (await fetch('/api/commission')).json();
    return { empty: own.run === null && own.achievements.length === 0,
      malformed: await post('{'), oversized: await post(' '.repeat(196609)),
      impossible: await post(JSON.stringify({ action: 'save', expectedName: other, revision: 0, run: { ...guest, actions: [{ type: 'end', ending: 'open' }] } })) };
  }, { other, guest });
  assert.deepEqual(guards, { empty: true, malformed: 400, oversized: 413, impossible: 400 });
  await device.locator('.commission-intro-actions .commission-primary').click();
  await click(device, /Открыть приём/); await device.locator('.commission-save-dot.saved').waitFor();
  await deviceContext.route('**/api/commission*', route => route.abort());
  await click(device, /Взвесить образец/); await device.locator('.commission-save-dot.offline').waitFor();
  await deviceContext.unroute('**/api/commission*'); await device.evaluate(() => window.dispatchEvent(new Event('online')));
  await device.locator('.commission-save-dot.saved').waitFor();
  const retried = await device.evaluate(async () => (await (await fetch('/api/commission')).json()).run);
  assert.deepEqual(retried, await run(device, other), 'Online retry must persist the local continuation');
  const blocked = await context();
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } }));
  const memoryPage = await open(blocked, 'en');
  await memoryPage.locator('[role="alert"]').waitFor();
  await memoryPage.locator('.commission-intro-actions .commission-primary').click();
  await click(memoryPage, /Open admissions/); await click(memoryPage, /Weigh the specimen/);
  assert.match(await memoryPage.locator('.commission-observation').innerText(), /Measured mass/);
  await shot(memoryPage, 'en-storage-unavailable');
  evidence.push('registration-guest-import-two-device-resume-offline-conflict-account-isolation-daily-opt-in-withdraw-storage-blocked');
 }
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  await writeFile(`${out}/results-${process.env.COMMISSION_CHECK ?? 'all'}.json`, JSON.stringify({ evidence, errors, failures }, null, 2));
  console.log(JSON.stringify({ evidence, errors, failures }));
} catch (error) {
  if (page) await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
