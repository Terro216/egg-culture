import test from 'node:test';
import assert from 'node:assert/strict';

const today = '2026-10-03';
const egg = { startedAt: '2026-10-01', lastWarm: today, streak: 3, qi: 3, burns: 0, totalWarmed: 3 };

async function fixture(name) {
  const original = Object.fromEntries(['localStorage', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map(), writes = [];
  const browser = new EventTarget();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes.push(['set', key]); values.set(key, value); },
    removeItem: key => { writes.push(['remove', key]); values.delete(key); },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
  const module = await import(`../src/features/Incubator/guest.ts?case=${name}`);
  return { module, values, writes, browser, restore() {
    for (const key of Object.keys(original)) {
      if (original[key]) Object.defineProperty(globalThis, key, original[key]);
      else delete globalThis[key];
    }
  } };
}

test('guest summary reads the existing incubator key without saving or migrating progress', async () => {
  const f = await fixture('existing');
  try {
    assert.deepEqual(f.module.readGuestIncubator(today), { state: null, storage: 'empty' });
    f.values.set('egg_incubator_v1', JSON.stringify(egg));
    const before = [...f.values];
    assert.deepEqual(f.module.readGuestIncubator(today), { state: egg, storage: 'saved' });
    assert.deepEqual([...f.values], before);
    assert.deepEqual(f.writes, []);
  } finally { f.restore(); }
});

test('malformed, impossible and future guest eggs remain untouched when viewed', async () => {
  const f = await fixture('invalid');
  try {
    for (const raw of ['{broken', 'null', JSON.stringify({ ...egg, qi: 999 }), JSON.stringify({ ...egg, lastWarm: '2026-10-04' }), JSON.stringify({ ...egg, startedAt: '2026-02-30' })]) {
      f.values.set('egg_incubator_v1', raw);
      assert.deepEqual(f.module.readGuestIncubator(today), { state: null, storage: 'invalid' });
      assert.equal(f.values.get('egg_incubator_v1'), raw);
    }
    assert.deepEqual(f.writes, []);
  } finally { f.restore(); }
});

test('blocked storage shares the same session egg between incubator and summary and reports changes', async () => {
  const f = await fixture('blocked');
  let changes = 0;
  f.browser.addEventListener(f.module.GUEST_INCUBATOR_EVENT, () => changes++);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    assert.deepEqual(f.module.readGuestIncubator(today), { state: null, storage: 'unavailable' });
    f.module.saveGuestIncubator(egg);
    assert.deepEqual(f.module.readGuestIncubator(today), { state: egg, storage: 'session' });
    assert.equal(changes, 1);
    f.module.clearGuestIncubator();
    assert.deepEqual(f.module.readGuestIncubator(today), { state: null, storage: 'unavailable' });
    assert.equal(changes, 2);
  } finally { f.restore(); }
});

test('successful import cleanup removes only the guest egg and does not revive its memory copy', async () => {
  const f = await fixture('import');
  try {
    f.values.set('unrelated', 'keep');
    f.module.saveGuestIncubator(egg);
    assert.equal(f.values.get('egg_incubator_v1'), JSON.stringify(egg));
    assert.deepEqual(f.module.readGuestIncubator(today).state, egg);
    f.module.clearGuestIncubator();
    assert.deepEqual(f.module.readGuestIncubator(today), { state: null, storage: 'empty' });
    assert.deepEqual([...f.values], [['unrelated', 'keep']]);
  } finally { f.restore(); }
});

test('a damaged JSON read retains the prior session fallback without repairing the stored bytes', async () => {
  const f = await fixture('cached');
  try {
    f.values.set('egg_incubator_v1', JSON.stringify(egg));
    f.module.readGuestIncubator(today);
    f.values.set('egg_incubator_v1', '{broken');
    assert.deepEqual(f.module.readGuestIncubator(today), { state: egg, storage: 'invalid' });
    assert.equal(f.values.get('egg_incubator_v1'), '{broken');
    assert.deepEqual(f.writes, []);
  } finally { f.restore(); }
});

test('an egg cleared or imported in another tab is not resurrected from a saved memory copy', async () => {
  const f = await fixture('cross-tab-clear');
  try {
    f.values.set('egg_incubator_v1', JSON.stringify(egg));
    assert.deepEqual(f.module.readGuestIncubator(today).state, egg);
    f.values.delete('egg_incubator_v1');
    assert.deepEqual(f.module.readGuestIncubator(today), { state: null, storage: 'empty' });
    assert.deepEqual(f.writes, []);
  } finally { f.restore(); }
});

test('a failed warmth save keeps fresh session progress instead of reading back the old stored egg', async () => {
  const f = await fixture('quota');
  const old = { ...egg, lastWarm: '2026-10-02', streak: 2, qi: 2, totalWarmed: 2 };
  try {
    f.values.set('egg_incubator_v1', JSON.stringify(old));
    f.module.readGuestIncubator(today);
    const workingStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { ...workingStorage, setItem() { throw new Error('quota'); } } });
    f.module.saveGuestIncubator(egg);
    assert.deepEqual(f.module.readGuestIncubator(today), { state: egg, storage: 'session' });
    assert.equal(f.values.get('egg_incubator_v1'), JSON.stringify(old));
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: workingStorage });
    f.module.saveGuestIncubator(egg);
    assert.deepEqual(f.module.readGuestIncubator(today), { state: egg, storage: 'saved' });
    assert.equal(f.values.get('egg_incubator_v1'), JSON.stringify(egg));
  } finally { f.restore(); }
});
