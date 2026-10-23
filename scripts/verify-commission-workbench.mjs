// Focused interaction checks. All browser requests are confined to the loopback preview.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { applyAction, currentCase, newRun, replay, restoreRun } from '../src/features/Commission/engine.ts';
import { storageKey } from '../src/features/Commission/storage.ts';
const preview = new URL(process.env.COMMISSION_PREVIEW ?? 'http://127.0.0.1:4457');
assert.equal(preview.hostname, '127.0.0.1');
const origin = 'https://egg.ilyamedve.dev';
const out = process.env.COMMISSION_EVIDENCE ?? '/tmp/egg-commission-browser-20261023';
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], evidence = [];
let page;
function fixture(day, index = 0) {
  const run = newRun('campaign', '2026-10-23', '12345678-1234-4234-8234-123456789abc'); let s = replay(run);
  const act = a => { s = applyAction(s, a); run.actions.push(a); };
  while (true) {
    if (s.phase === 'brief') act({ type: 'start' });
    if (s.day === day && s.index === index) return { run, state: s };
    if (s.phase === 'desk') {
      const item = currentCase(s);
      for (const tool of item.mandatory) act({ type: 'tool', tool });
      act({ type: 'decide', decision: item.defect === 'none' ? 'admit' : 'reject', reason: item.defect }); act({ type: 'next' });
    } else if (s.phase === 'report') { act({ type: 'evening' }); act({ type: 'choice', option: 0 }); act({ type: 'advance' }); }
  }
}
async function open(save, width = 390, lang = 'ru') {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await ctx.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) return route.abort();
    const response = await route.fetch({ url: new URL(url.pathname + url.search, preview).href, headers: { ...req.headers(), origin, host: new URL(origin).host } });
    await route.fulfill({ response });
  });
  await ctx.addInitScript(({ key, run }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ run, revision: 0, dirty: true, replace: false })); }, { key: storageKey(null, 'campaign'), run: save.run });
  page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${origin}/${lang}/commission/`); await page.locator('.commission-save-dot:not(.loading)').waitFor();
  return page;
}
async function state() { return restoreRun(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).run, storageKey(null, 'campaign'))).state; }
async function select(tool) { await page.locator('.commission-tool-tray button').nth(['inspect', 'scale', 'light', 'plate', 'archive'].indexOf(tool)).click(); }
async function prepare(tool) { await select(tool); if (await page.locator('.commission-exam-start .commission-primary').count()) await page.locator('.commission-exam-start .commission-primary').click(); }
async function shot(name, locator) {
  await (locator ?? page).screenshot({ path: `${out}/${name}.png`, ...(locator ? {} : { fullPage: false }) });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); evidence.push(name);
}
try {
  // The crack is absent from the first view, then visible on its seeded side.
  await open(fixture(2, 1)); await page.locator('canvas').waitFor();
  await shot('mobile-inspection-before-turn', page.locator('.commission-specimen'));
  await page.locator('.commission-text-observation summary').click();
  assert.match(await page.locator('.commission-text-observation p').innerText(), /Линии разлома не видно/);
  const canvas = page.locator('.commission-specimen-canvas'); await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 30, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + 145, box.y + box.height / 2, { steps: 12 }); await page.mouse.up();
  await page.locator('.commission-surfaces .is-seen').nth(1).waitFor();
  assert.equal((await state()).observed.includes('inspect'), false);
  assert.equal(await page.getByRole('button', { name: 'Записать наблюдение', exact: true }).isDisabled(), true);
  let found = false;
  for (let i = 0; i < 4; i++) {
    if ((await page.locator('.commission-text-observation p').innerText()).includes('тёмная линия')) { found = true; await shot('mobile-inspection-hidden-crack', page.locator('.commission-specimen')); }
    await page.locator('.commission-rotate button').last().click(); await page.waitForTimeout(75);
  }
  assert.equal(found, true); assert.equal(await page.locator('.commission-surfaces .is-seen').count(), 4);
  await page.locator('.commission-findings input').last().check(); await page.getByRole('button', { name: 'Записать наблюдение', exact: true }).click();
  assert.equal((await state()).findings.inspect.answer, 'shell');
  evidence.push('pointer-coverage-and-hidden-crack');

  await open(fixture(2), 320, 'en'); await prepare('light');
  const beforeTime = (await state()).time;
  assert.equal((await state()).observed.includes('light'), false);
  assert.equal(await page.getByRole('button', { name: 'Record observation', exact: true }).isDisabled(), true);
  const lamp = page.locator('.commission-specimen-canvas'); await lamp.focus();
  const before = await lamp.screenshot(); await lamp.press('ArrowRight'); await page.waitForTimeout(100); const after = await lamp.screenshot();
  assert.notDeepEqual(before, after, 'Candling rotation must visibly change the internal specimen');
  await shot('en-320-candling-rotation', page.locator('.commission-specimen'));
  await page.reload(); await page.locator('.commission-save-dot:not(.loading)').waitFor(); await select('light');
  assert.equal((await state()).time, beforeTime); assert.equal(await page.locator('.commission-exam-start').count(), 0);
  const ruler = page.locator('input[type="range"]'); await ruler.focus(); await ruler.press('End');
  await page.locator('.commission-findings input').last().check(); await page.getByRole('button', { name: 'Record observation', exact: true }).click();
  await page.locator('.commission-decisions .reject').click(); await page.locator('.commission-signature select').selectOption('age');
  await page.locator('.commission-signature .commission-primary').click();
  assert.equal((await state()).receipt.correct, false); assert.match(await page.locator('.commission-receipt').innerText(), /control measurement/);
  evidence.push('paid-instrument-reload-and-inaccurate-ruler');

  const legacy = fixture(5); await open(legacy);
  assert.equal((await state()).day, 5); assert.equal((await state()).budget, legacy.state.budget); assert.deepEqual((await state()).reports, legacy.state.reports);
  await prepare('scale'); await shot('mobile-empty-scale', page.locator('.commission-workbench'));
  await page.getByRole('button', { name: 'Выставить ноль', exact: true }).click(); await page.getByRole('button', { name: 'Положить образец', exact: true }).click();
  await shot('mobile-loaded-scale', page.locator('.commission-workbench'));
  const controls = await page.locator('.commission-rotate button').first().boundingBox(); const drawing = await page.locator('canvas').boundingBox();
  assert.ok(controls.y >= drawing.y + drawing.height, 'Rotation controls must not overlap the drawing');
  await prepare('archive');
  const oldEntry = page.locator('.commission-record-list button').filter({ hasText: /Редакция 0/ }); await oldEntry.click();
  await page.locator('.commission-findings input').last().check(); await page.getByRole('button', { name: 'Записать наблюдение', exact: true }).click();
  await page.locator('.commission-decisions .reject').click(); await page.locator('.commission-signature select').selectOption('permit');
  await page.locator('.commission-signature .commission-primary').click();
  assert.equal((await state()).receipt.correct, false); assert.match(await page.locator('.commission-receipt').innerText(), /старая редакция/);
  assert.doesNotMatch(await page.locator('main').innerText(), /\bunits\b|\d+\s*ед\./);
  evidence.push('legacy-day5-and-wrong-archive-revision');
  assert.deepEqual(errors, []);
  await writeFile(`${out}/results-workbench.json`, JSON.stringify({ evidence, errors }, null, 2));
  console.log(JSON.stringify({ evidence, errors }));
} catch (error) { if (page) await page.screenshot({ path: `${out}/workbench-failure.png`, fullPage: true }).catch(() => {}); console.error(error); process.exitCode = 1; }
finally { await browser.close(); }
