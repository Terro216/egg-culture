import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoadValidator, RoadValidationBusyError } from '../src/server/roadValidation.ts';
import { createTrackForSpec } from '../src/features/EggRoad/trackSpec.ts';
import { parseRoadCode } from '../src/features/EggRoad/seed.ts';

test('worker validation preserves exact legacy, current and special-road finish bounds', async t => {
  const validator = createRoadValidator(); t.after(() => validator.close());
  for (const code of ['EGG1-R-1-0', 'EGG2-R-5-ABC', 'EGG3-R-7-ABC', 'EGG3-S-8-0', 'EGG3-T-8-1']) {
    const length = createTrackForSpec(parseRoadCode(code)).length;
    assert.equal(await validator.plausible({ code, distance: length, finished: true }), true, code);
    assert.equal(await validator.plausible({ code, distance: length + 4.01, finished: true }), false, code);
    assert.equal(await validator.plausible({ code, distance: 0, finished: true }), false, code);
  }
  assert.equal(await validator.plausible({ code: 'EGG3-E-2-ABC', distance: 100, finished: false }), true);
  assert.equal(await validator.plausible({ code: 'EGG3-E-2-ABC', distance: 100, finished: true }), false);
});

test('validation bounds distinct queued jobs, shares duplicates, and leaves main timers responsive', async t => {
  const validator = createRoadValidator(); t.after(() => validator.close());
  let ticks = 0; const timer = setInterval(() => ticks++, 1); t.after(() => clearInterval(timer));
  const runs = Array.from({ length: 8 }, (_, i) => ({ code: `EGG3-R-1000-${(i + 1000).toString(36).toUpperCase()}`, distance: 19, finished: false }));
  const jobs = runs.map(run => validator.plausible(run));
  const duplicate = validator.plausible(runs[0]);
  await assert.rejects(validator.plausible({ ...runs[0], code: 'EGG3-R-1000-ZZZ' }), RoadValidationBusyError);
  assert.deepEqual(await Promise.all(jobs), Array(8).fill(true));
  assert.equal(await duplicate, true); assert.ok(ticks > 0, 'CPU geometry runs off the request event loop');
  assert.equal(await validator.plausible({ ...runs[0], code: 'EGG3-R-1000-ZZZ' }), true, 'admission recovers after jobs finish');
});
