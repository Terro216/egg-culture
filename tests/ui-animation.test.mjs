import test from 'node:test';
import assert from 'node:assert/strict';
import { animateDecoration } from '../src/shared/utils/decorativeAnimation.ts';

test('decorative motion respects visibility and reduced motion without accruing hidden time', () => {
  const previous = new Map(['document', 'window', 'matchMedia', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const document = Object.assign(new EventTarget(), { hidden: false });
  const window = new EventTarget();
  const media = Object.assign(new EventTarget(), { matches: true });
  const frames = new Map();
  let sequence = 0, observer, disconnected = false;
  const install = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  install('document', document); install('window', window); install('matchMedia', () => media);
  install('requestAnimationFrame', callback => { frames.set(++sequence, callback); return sequence; });
  install('cancelAnimationFrame', id => frames.delete(id));
  install('IntersectionObserver', class { constructor(callback) { observer = callback; } observe() {} disconnect() { disconnected = true; } });
  const advance = now => { const pending = [...frames]; frames.clear(); for (const [, callback] of pending) callback(now); };
  try {
    const draws = [];
    const stop = animateDecoration({}, (elapsed, delta) => draws.push({ elapsed, delta }));
    assert.deepEqual(draws, [{ elapsed: 0, delta: 0 }], 'reduced motion keeps a static first frame');
    assert.equal(frames.size, 0);
    media.matches = false; media.dispatchEvent(new Event('change'));
    advance(100); advance(120);
    assert.equal(draws.at(-1).elapsed, .02);
    document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(frames.size, 0, 'background tabs stop scheduling frames');
    document.hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    advance(100000);
    assert.equal(draws.at(-1).elapsed, .02, 'time spent hidden is not animation time');
    observer([{ isIntersecting: false }]);
    assert.equal(frames.size, 0, 'offscreen decorations stop');
    observer([{ isIntersecting: true }]);
    assert.equal(frames.size, 1);
    window.dispatchEvent(new Event('pagehide'));
    assert.equal(frames.size, 0);
    window.dispatchEvent(new Event('pageshow'));
    assert.equal(frames.size, 1, 'back-forward cache restoration resumes motion');
    media.matches = true; media.dispatchEvent(new Event('change'));
    assert.equal(frames.size, 0, 'enabling reduced motion stops an already running animation');
    stop();
    media.matches = false; media.dispatchEvent(new Event('change'));
    observer([{ isIntersecting: true }]);
    assert.equal(frames.size, 0, 'cleanup removes subscriptions and cannot restart');
    assert.equal(disconnected, true);
  } finally {
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
