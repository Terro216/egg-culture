// Run only against an isolated development preview and its synthetic /tmp database.
import assert from 'node:assert/strict';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createRoadRecordStore } from '../src/server/roadRecords.ts';
import { createKladkaStore } from '../src/shared/utils/kladkaStore.ts';
import { digestToken, hashPassword } from '../src/server/roadPasswords.ts';

const preview = new URL(process.env.KLADKA_PREVIEW ?? 'http://127.0.0.1:4469');
assert.equal(preview.hostname, '127.0.0.1');
assert.ok(process.env.KLADKA_TEST_DATA, 'Supply the isolated preview data directory');
const directory = await realpath(resolve(process.env.KLADKA_TEST_DATA));
assert.ok(directory.startsWith('/tmp/'), 'Never use production data');
const out = resolve(process.env.KLADKA_EVIDENCE ?? '/tmp/egg-kladka-evidence');
assert.ok(out.startsWith('/tmp/'));
await mkdir(out, { recursive: true });
const store = createRoadRecordStore(join(directory, 'egg-road')), book = createKladkaStore(directory);
const password = 'Synthetic reaction test only';
const passwordHash = await hashPassword(password);
const suffix = randomBytes(4).toString('hex');
const names = { adept: `Shell ${suffix}`, second: `Yolk ${suffix}`, fresh: `Hatch ${suffix}`, novice: `Novice ${suffix}`, community: `Quiet ${suffix}` };
for (const [kind, name] of Object.entries(names)) {
  store.register(`synthetic-${name}`, name, passwordHash, 'synthetic-recovery', digestToken(randomBytes(32).toString('hex')));
  const player = store.credentials(name).player;
  if (kind !== 'novice') store.completeInitiation(player);
}
const post = await book.createPost({ name: 'Адепт Тихой Скорлупы', text: 'Учебная запись. Утро держится на тёплой скорлупе и спокойном желтке.', ipHash: `synthetic-${suffix}` }, null, false);
store.selectReaction(post.id, store.credentials(names.community).player, 'yolk', true, 'synthetic-community');
const locked = await book.createPost({ name: 'Хранитель', text: 'Restricted synthetic breakfast', ipHash: `synthetic-${suffix}`, visibility: 'adepts' }, null, false);
store.setReaction(locked.id, store.credentials(names.adept).player, 'shell', 'synthetic-network');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [], evidence = [], contexts = [];
async function open(kind, width, lang) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  contexts.push(context);
  await context.route('**/*', route => new URL(route.request().url()).origin === preview.origin ? route.continue() : route.abort());
  if (kind) {
    const response = await context.request.post(`${preview.origin}/api/portal-account`, { headers: { origin: preview.origin }, data: { action: 'login', name: names[kind], password } });
    assert.equal(response.status(), 200, await response.text());
  }
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${preview.origin}/${lang}/kladka/`, { waitUntil: 'networkidle' });
  const entry = page.locator(`#entry-${post.id}`), trigger = entry.locator('.kladka-reaction-trigger');
  await trigger.waitFor();
  await page.waitForFunction(id => !document.querySelector(`#entry-${id} .kladka-reaction-trigger`)?.disabled, post.id);
  return { context, page, entry, trigger };
}
async function idle(page, entry) {
  await page.waitForFunction(id => document.querySelector(`#entry-${id} .kladka-reaction-bar`)?.getAttribute('aria-busy') === 'false', post.id);
  assert.equal(await entry.locator('.kladka-reaction-error').count(), 0);
}
async function snapshot(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal page overflow');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  await page.locator(`#entry-${post.id}`).screenshot({ path: join(out, `${name}-entry.png`) });
}
try {
  const mobile = await open('adept', 390, 'ru');
  let { page, entry, trigger } = mobile;
  assert.equal(await trigger.innerText(), 'Реакция');
  await trigger.click();
  const choices = entry.locator('.kladka-reaction-choice');
  assert.equal(await choices.count(), 5);
  assert.equal(await choices.first().evaluate(element => element === document.activeElement), true);
  await choices.first().press('Enter'); await idle(page, entry);
  assert.equal(await choices.first().evaluate(element => element === document.activeElement), true, 'Keyboard focus stays in the open picker');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  await choices.nth(1).click(); await idle(page, entry);
  await choices.nth(2).click(); await idle(page, entry);
  assert.equal(await entry.locator('.kladka-reaction-chip[aria-pressed="true"]').count(), 3);
  assert.match(await entry.locator('.kladka-reaction-hint').innerText(), /Выбрано 3 из 3/);
  assert.equal(await choices.nth(3).getAttribute('aria-disabled'), 'true');
  const yolkChip = entry.locator('.kladka-reaction-chip').filter({ hasText: '💛' });
  await yolkChip.press('Enter'); await idle(page, entry);
  assert.equal(await yolkChip.getAttribute('aria-pressed'), 'false');
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Open-picker chip removal keeps focus');
  await yolkChip.press('Enter'); await idle(page, entry);
  assert.equal(await yolkChip.getAttribute('aria-pressed'), 'true');
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Open-picker chip addition keeps focus');
  await entry.locator('.kladka-reaction-chip').filter({ hasText: '🐣' }).press('Enter'); await idle(page, entry);
  assert.equal(await entry.locator('.kladka-reaction-chip').filter({ hasText: '🐣' }).count(), 0);
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'A disappearing chip leaves focus on the trigger');
  await choices.nth(2).click(); await idle(page, entry);
  // aria-disabled remains keyboard discoverable but must not send a fourth vote.
  let requests = 0;
  const countRequest = request => { if (request.url().endsWith('/api/kladka-reaction')) requests++; };
  page.on('request', countRequest);
  await choices.nth(3).focus(); await choices.nth(3).press('Enter');
  assert.equal(requests, 0);
  page.off('request', countRequest);
  await snapshot(page, 'mobile-three');
  await choices.nth(1).click(); await idle(page, entry);
  assert.equal(await choices.nth(1).getAttribute('aria-pressed'), 'false');
  assert.equal(await entry.locator('.kladka-reaction-chip[aria-pressed="true"]').count(), 2);
  await choices.nth(3).click(); await idle(page, entry);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(id => document.querySelectorAll(`#entry-${id} .kladka-reaction-chip[aria-pressed="true"]`).length === 3, post.id);
  await entry.locator('.kladka-reaction-chip[aria-pressed="true"]').nth(2).click(); await idle(page, entry);
  assert.equal(await entry.locator('.kladka-reaction-chip[aria-pressed="true"]').count(), 2);
  assert.match(await entry.locator('.kladka-reaction-bar').innerText(), /🥚[\s\S]*🐣/);
  evidence.push('keyboard-three-selections-cap-independent-removal-and-reload');
  evidence.push('open-picker-keyboard-chip-add-remove-and-disappear-preserve-focus');

  let lose = true;
  const lostResponse = async route => {
    if (!lose) return route.continue();
    lose = false; const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort('failed');
  };
  await page.route('**/api/kladka-reaction', lostResponse);
  await trigger.click(); await entry.locator('.kladka-reaction-choice').nth(4).click();
  await entry.locator('.kladka-reaction-error button').waitFor();
  await snapshot(page, 'mobile-retry');
  await entry.locator('.kladka-reaction-error button').click(); await idle(page, entry);
  assert.equal(await entry.locator('.kladka-reaction-chip[aria-pressed="true"]').count(), 3);
  assert.match(await entry.locator('.kladka-reaction-bar').innerText(), /🥚[\s\S]*🐣[\s\S]*🍳/);
  await page.unroute('**/api/kladka-reaction', lostResponse);
  evidence.push('lost-response-retry-is-idempotent');

  await page.keyboard.press('Escape');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
  await trigger.click(); await entry.locator('.kladka-post-text').click();
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  evidence.push('escape-focus-and-outside-dismissal');

  const throttle = route => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'rate_limit', retryAfter: 60 }) });
  await page.route('**/api/kladka-reaction', throttle);
  await trigger.click(); await entry.locator('.kladka-reaction-choice').first().click();
  await entry.locator('.kladka-reaction-error').waitFor();
  assert.match(await entry.locator('.kladka-reaction-error').innerText(), /через 1 мин/);
  assert.equal(await entry.locator('.kladka-reaction-chip[aria-pressed="true"]').count(), 3);
  assert.match(await entry.locator('.kladka-reaction-bar').innerText(), /🥚[\s\S]*🐣[\s\S]*🍳/);
  await page.unroute('**/api/kladka-reaction', throttle);
  evidence.push('rate-limit-explained-without-fake-count');

  // A write started in one account cannot paint its result onto another account.
  let release, intercepted;
  const waiting = new Promise(resolve => { intercepted = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  const delayed = async route => { const response = await route.fetch(); intercepted(); await hold; await route.fulfill({ response }).catch(() => {}); };
  await page.route('**/api/kladka-reaction', delayed);
  await entry.locator('.kladka-reaction-choice').nth(2).click(); await waiting;
  const login = await mobile.context.request.post(`${preview.origin}/api/portal-account`, { headers: { origin: preview.origin }, data: { action: 'login', name: names.second, password } });
  assert.equal(login.status(), 200);
  await page.evaluate(() => window.dispatchEvent(new Event('egg:account')));
  await page.waitForFunction(name => localStorage.getItem('egg_road_active_account_v1')?.includes(name.toLowerCase()), names.second);
  release();
  // Account storage updates before React commits the replacement island. Wait
  // for its visible state, rather than inspecting the previous render's button.
  await page.waitForFunction(id => !document.querySelector(`#entry-${id} .kladka-reaction-trigger`)?.disabled
    && !document.querySelector(`#entry-${id} .kladka-reaction-chip[aria-pressed="true"]`), post.id);
  assert.equal(await entry.locator('.kladka-reaction-chip[aria-pressed="true"]').count(), 0);
  await page.unroute('**/api/kladka-reaction', delayed);
  evidence.push('account-switch-ignores-old-response');

  const desktop = await open('adept', 1200, 'en');
  assert.equal(await desktop.trigger.innerText(), 'Reaction');
  await desktop.trigger.click();
  await desktop.entry.locator('.kladka-reaction-choice').nth(3).click(); await idle(desktop.page, desktop.entry);
  assert.equal(await desktop.entry.locator('.kladka-reaction-chip[aria-pressed="true"]').count(), 3);
  await snapshot(desktop.page, 'desktop-picker');
  assert.equal(await desktop.entry.locator('.kladka-reaction-choice').nth(4).getAttribute('aria-pressed'), 'true');
  await desktop.page.keyboard.press('Escape');
  await snapshot(desktop.page, 'desktop-selected');
  const narrow = await open('adept', 320, 'en'); await narrow.trigger.click(); await snapshot(narrow.page, 'narrow-picker');
  evidence.push('ru-en-desktop-mobile-320px');

  const guest = await open(null, 390, 'ru'); await guest.trigger.click();
  assert.match(await guest.entry.locator('.kladka-reaction-gate').innerText(), /Войдите в аккаунт/);
  assert.equal(await guest.page.locator(`#entry-${locked.id} .kladka-reactions`).count(), 0);
  assert.equal(await guest.page.getByText('Restricted synthetic breakfast').count(), 0);
  await snapshot(guest.page, 'guest-gate');
  const fresh = await open('fresh', 390, 'ru'); await fresh.trigger.click();
  assert.equal(await fresh.entry.locator('.kladka-reaction-choice').count(), 5);
  await fresh.entry.locator('.kladka-reaction-choice').first().click(); await idle(fresh.page, fresh.entry);
  assert.match(await fresh.entry.locator('.kladka-reaction-chip[aria-pressed="true"]').innerText(), /🥚/);
  await snapshot(fresh.page, 'new-account-reaction');
  const novice = await open('novice', 390, 'en'); await novice.trigger.click();
  assert.match(await novice.entry.locator('.kladka-reaction-gate').innerText(), /Pass the Initiation/);
  assert.equal(await novice.page.locator(`#entry-${locked.id} .kladka-reactions`).count(), 0);
  evidence.push('new-account-reacts-immediately-and-guest-novice-locked-gates-hold');
  assert.deepEqual(errors, []);
  await writeFile(join(out, 'result.json'), JSON.stringify({ evidence, errors }, null, 2));
  console.log(JSON.stringify({ evidence, errors }));
} finally {
  await Promise.all(contexts.map(context => context.close())); await browser.close(); store.close();
}
