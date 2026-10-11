import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { RollRhythm } from '../src/features/EggRoad/rhythm.ts';
import { RoadSimulation, initializePhysics } from '../src/features/EggRoad/simulation.ts';
import { createRoadTrack } from '../src/features/EggRoad/track.ts';
import { createStuntTrack } from '../src/features/EggRoad/stunts.ts';
import { SteeringRamp } from '../src/features/EggRoad/controls.ts';
await initializePhysics();

function hold(rhythm, direction, ticks, lateral = .8, forward = 15) {
  let earned = 0;
  for (let tick = 0; tick < ticks; tick++) earned += Number(rhythm.step(1 / 120, direction, lateral, forward, true));
  return earned;
}

function chargedRhythm() {
  const rhythm = new RollRhythm();
  for (let stroke = 0; stroke < 8; stroke++) hold(rhythm, stroke % 2 ? -1 : 1, 30);
  assert.ok(rhythm.step(1 / 120, 1, .8, 15, true));
  assert.equal(rhythm.charge, 1);
  return rhythm;
}

test('short real corrections qualify sooner, without handing out 30 km/h in the first half second', () => {
  const modern = new RollRhythm(), classic = new RollRhythm(2);
  for (const direction of [1, -1, 1, -1]) {
    hold(modern, direction, 15, .4);
    hold(classic, direction, 15, .4);
  }
  assert.equal(modern.chain, 3);
  assert.ok(modern.speedBonus * 3.6 > 5 && modern.speedBonus * 3.6 < 15);
  assert.equal(classic.chain, 0, 'the same small corrections missed the old duration threshold');
  for (const [ticks, lateral, forward, input] of [[8, 2, 15, 1], [15, .1, 15, 1], [30, 2, 2, 1], [30, 2, 15, .09]]) {
    const rhythm = new RollRhythm();
    for (let stroke = 0; stroke < 8; stroke++) hold(rhythm, stroke % 2 ? -input : input, ticks, lateral, forward);
    assert.equal(rhythm.speedBonus, 0, 'taps, no sideways movement, low forward speed and the deadzone cannot farm boost');
  }
});

test('continuous light corrections keep producing useful gains after the opening strokes', () => {
  const rhythm = new RollRhythm(), bonuses = [];
  for (let tick = 0; tick < 960; tick++) {
    rhythm.step(1 / 120, Math.floor(tick / 30) % 2 ? -1 : 1, .8, 15, true);
    if ([239, 479, 959].includes(tick)) bonuses.push(rhythm.speedBonus * 3.6);
  }
  assert.ok(bonuses[0] > 20 && bonuses[0] < 35, String(bonuses));
  assert.ok(bonuses[1] > bonuses[0] + 12, String(bonuses));
  assert.ok(bonuses[2] > bonuses[1] + 18, String(bonuses));
});

test('a brief release keeps the series; stopping or holding one direction loses it within about two seconds', () => {
  for (const input of [0, 1]) {
    const rhythm = chargedRhythm(), bonus = rhythm.speedBonus;
    hold(rhythm, input, 60);
    assert.equal(rhythm.speedBonus, bonus, 'half a second gives room for a normal correction');
    hold(rhythm, input, 108);
    assert.ok(rhythm.speedBonus > bonus * .4 && rhythm.speedBonus < bonus * .6, String(rhythm.charge));
    hold(rhythm, input, 90);
    assert.equal(rhythm.speedBonus, 0);
    assert.equal(rhythm.chain, 0, 'a discharged long series cannot be restored with one turn');
    hold(rhythm, 1, 30); hold(rhythm, -1, 1);
    assert.equal(rhythm.chain, 1);
    assert.ok(rhythm.speedBonus < bonus * .1);
  }
});

test('resuming real alternating corrections restores a fading charge without losing the active series', () => {
  const rhythm = chargedRhythm(), bonus = rhythm.speedBonus, chain = rhythm.chain;
  hold(rhythm, 1, 120);
  const faded = rhythm.speedBonus;
  assert.ok(faded < bonus * .8 && faded > 0);
  assert.equal(hold(rhythm, -1, 1), 1);
  assert.equal(rhythm.chain, chain + 1);
  assert.ok(rhythm.speedBonus > faded);
  assert.equal(hold(rhythm, -1, 30), 0);
  assert.equal(hold(rhythm, 1, 1), 1);
  assert.equal(rhythm.charge, 1);
  assert.ok(rhythm.speedBonus > bonus);
});

test('both classic map versions retain their earlier charge gain, slow fade and capped speed', () => {
  for (const version of [1, 2]) {
    const rhythm = new RollRhythm(version);
    for (let stroke = 0; stroke < 10; stroke++) hold(rhythm, stroke % 2 ? -1 : 1, 30);
    assert.ok(rhythm.speedBonus * 3.6 > 32 && rhythm.speedBonus * 3.6 <= 32.4);
    const charge = rhythm.charge;
    hold(rhythm, 0, 120);
    assert.ok(rhythm.charge > charge - .03);
    assert.ok(rhythm.chain > 0);
  }
});

test('real alternating strokes keep adding speed past 130 and 1000, with diminishing gains', () => {
  const rhythm = new RollRhythm(), bonuses = new Map();
  for (let stroke = 0; stroke <= 1010; stroke++) {
    const direction = stroke % 2 ? -1 : 1;
    for (let tick = 0; tick < 54; tick++) if (rhythm.step(1 / 120, direction, direction * 2, 20, true)) bonuses.set(rhythm.chain, rhythm.speedBonus * 3.6);
  }
  assert.ok(bonuses.get(130) > 115 && bonuses.get(130) < 125);
  for (let chain = 5; chain <= 1000; chain++) assert.ok(bonuses.get(chain + 1) > bonuses.get(chain), `No ceiling at ${chain}`);
  assert.ok(bonuses.get(131) - bonuses.get(130) < bonuses.get(21) - bonuses.get(20));
  assert.ok(bonuses.get(1001) - bonuses.get(1000) < bonuses.get(131) - bonuses.get(130));
  assert.ok(bonuses.get(260) > bonuses.get(130) + 15);
  const held = rhythm.speedBonus;
  for (let tick = 0; tick < 1000; tick++) rhythm.step(1 / 120, tick % 2 ? 1 : -1, 20, 20, false);
  assert.equal(rhythm.speedBonus, held, 'air cannot grow or consume the bonus');
  for (let tick = 0; tick < 2400; tick++) rhythm.step(1 / 120, 0, 0, 20, true);
  assert.equal(rhythm.speedBonus, 0, 'a long pause must discharge even a very long series');
  rhythm.reset(); assert.equal(rhythm.speedBonus, 0); assert.equal(rhythm.chain, 0);
});

test('the HUD exposes the same physical bonus and classic codes retain their earlier drive', () => {
  for (const version of [1, 2, 3]) {
    const sim = new RoadSimulation(createRoadTrack(2, 17, version));
    try {
      sim.rhythm.chain = 130; sim.rhythm.charge = 1;
      assert.equal(sim.snapshot().rhythmSpeedBonus, sim.rhythmSpeedBonus);
      if (version < 3) assert.equal(sim.rhythmSpeedBonus, 9);
      else assert.ok(sim.rhythmSpeedBonus * 3.6 > 95);
      sim.reset(); assert.equal(sim.snapshot().rhythmSpeedBonus, 0);
    } finally { sim.dispose(); }
  }
});

test('the speed lane does not brake downhill momentum, and jumping releases its hop damping', () => {
  const sim = new RoadSimulation(createStuntTrack(5), 'stunt');
  try {
    sim.start(); const sample = sim.track.samples[sim.sampleIndex];
    sim.body.setLinvel(sample.tangent.clone().multiplyScalar(80), true);
    sim.step(0);
    assert.ok(new Vector3().copy(sim.body.userForce()).dot(sample.tangent) > -1e-6, 'no hidden motor brake above target speed');
    assert.ok(sim.jump()); sim.step(0);
    assert.ok(new Vector3().copy(sim.body.userForce()).length() < 1e-8, 'rescue flight has neither drive nor road attraction');
  } finally { sim.dispose(); }
});

test('the speed plunge sustains fast rolling with 150ms steering corrections, not just a falling peak', () => {
  for (const amplitude of [.65, 1.5]) {
    const sim = new RoadSimulation(createStuntTrack(5), 'stunt'), ramp = new SteeringRamp();
    let target = amplitude, input = 0, fastRollingSeconds = 0, rollingPeak = 0;
    try {
      sim.start();
      for (let tick = 0; tick < 120 * 180 && sim.phase === 'running'; tick++) {
        if (tick % 18 === 0) {
          const offset = sim.position.x, lateral = sim.body.linvel().x;
          if ((target > 0 && offset > target) || (target < 0 && offset < target)) target = -target;
          const correction = target - offset - lateral * .25;
          input = Math.abs(correction) < .15 ? 0 : Math.sign(correction);
        }
        sim.step(ramp.step(1 / 120, input));
        if (sim.rollingOnRoad) {
          const speed = sim.snapshot().speed * 3.6;
          rollingPeak = Math.max(rollingPeak, speed);
          if (speed > 150) fastRollingSeconds += 1 / 120;
        }
      }
      assert.equal(sim.phase, 'finished', JSON.stringify({ amplitude, distance: sim.progress, reason: sim.endReason }));
      assert.ok(rollingPeak > 300, String(rollingPeak));
      // Wider corrections produce slower series and now lose their boost more
      // readily. Both still finish and sustain speed, without relying on a fall.
      assert.ok(fastRollingSeconds > (amplitude < 1 ? 25 : 15), String(fastRollingSeconds));
    } finally { sim.dispose(); }
  }
});
