import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { analyzeBoard, campaignSeed, dailySeed, findSwapHint, formatSeed, generatePuzzle, isSlotPermutation, nextCampaignSeed, parseSeed, swapNodes } from '../src/features/EggUntangle/engine.ts';
import { graphComponents } from '../src/features/EggUntangle/geometry.ts';

test('KNOT3 has legal separated slots, reproducible solutions and usable hints throughout the difficulty range', () => {
  for (let level = 1; level <= 24; level++) for (let sample = 0; sample < 40; sample++) {
    const seed = sample ? formatSeed(level, Math.imul(sample, 2654435761) >>> 0, 'swap') : campaignSeed(level, 'swap', 'KNOT3');
    const puzzle = generatePuzzle(seed), { initial, solution, edges } = puzzle;
    assert.equal(puzzle.version, 'KNOT3');
    assert.ok(analyzeBoard(solution, edges).solved, seed);
    assert.ok(!analyzeBoard(initial, edges).solved, seed);
    assert.ok(isSlotPermutation(puzzle, initial), seed);
    assert.ok(isSlotPermutation(puzzle, solution), seed);
    assert.ok(solution.every(({ x, y }) => x >= 55 && x <= 945 && y >= 55 && y <= 945), seed);
    for (let a = 0; a < solution.length; a++) for (let b = a + 1; b < solution.length; b++) {
      assert.ok(Math.hypot(solution[a].x - solution[b].x, solution[a].y - solution[b].y) >= 94, `${seed}: separate touch targets ${a}/${b}`);
    }
    const groups = graphComponents(initial.length, edges);
    assert.ok(groups.every(group => group.length >= 3), `${seed}: no filler eggs or isolated pairs`);
    let points = initial;
    for (let i = 0; i < points.length; i++) {
      const hint = findSwapHint(puzzle, points);
      if (!hint) break;
      points = swapNodes(points, ...hint);
      assert.ok(isSlotPermutation(puzzle, points));
    }
    assert.ok(analyzeBoard(points, edges).solved, `${seed}: finite hint path`);
    assert.deepEqual(generatePuzzle(seed), puzzle, `${seed}: deterministic replay`);
  }
});

test('different seeds change component sizes and actual shapes on both odd and even levels', () => {
  for (const level of [17, 18]) {
    const sizes = new Set(), counts = new Set(), kinds = new Set();
    let fullySeparate = 0;
    for (let seed = 0; seed < 160; seed++) {
      const { solution, edges } = generatePuzzle(formatSeed(level, seed, 'swap'));
      const groups = graphComponents(solution.length, edges);
      counts.add(groups.length);
      sizes.add(groups.map(group => group.length).sort((a, b) => a - b).join(','));
      if (groups.length >= 2) fullySeparate++;
      for (const group of groups) {
        const local = edges.filter(([a]) => group.includes(a));
        if (group.length === 3) kinds.add('triangle');
        if (group.length === 4 && local.length === 4) {
          const lengths = local.map(([a, b]) => Math.hypot(solution[a].x - solution[b].x, solution[a].y - solution[b].y));
          if (Math.max(...lengths) / Math.min(...lengths) < 1.025) kinds.add('square');
        }
        if (group.length >= 6 && local.length === group.length && group.every(node => local.filter(edge => edge.includes(node)).length === 2)) {
          const centre = group.reduce((c, node) => ({ x: c.x + solution[node].x / group.length, y: c.y + solution[node].y / group.length }), { x: 0, y: 0 });
          const radii = group.map(node => Math.hypot(solution[node].x - centre.x, solution[node].y - centre.y));
          if (Math.max(...radii) / Math.min(...radii) < 1.025) kinds.add('round');
          if (Math.max(...radii) / Math.min(...radii) > 1.2) kinds.add('irregular');
        }
      }
    }
    assert.ok(sizes.size >= 16, `level ${level}: topologies vary beyond relabelled vertices`);
    assert.deepEqual([...counts].sort(), [1, 2, 3, 4, 5], `level ${level}: independent figure counts vary`);
    assert.ok(fullySeparate >= 100, 'separate figures are the usual experience');
    assert.deepEqual([...kinds].sort(), ['irregular', 'round', 'square', 'triangle']);
  }
});

test('new hard clutches cannot be finished by one lucky swap', () => {
  for (const level of [1, 2, 4, 7, 12, 18, 24]) for (let seed = 0; seed < 10; seed++) {
    const puzzle = generatePuzzle(formatSeed(level, seed, 'swap'));
    for (let a = 0; a < puzzle.initial.length; a++) for (let b = a + 1; b < puzzle.initial.length; b++) {
      assert.equal(analyzeBoard(swapNodes(puzzle.initial, a, b), puzzle.edges).solved, false, puzzle.seed);
    }
  }
});

test('new campaign, daily and free entrypoints reach KNOT3 while old shares keep their own edition', () => {
  assert.equal(parseSeed(campaignSeed(4, 'swap')).version, 'KNOT3');
  assert.equal(parseSeed(dailySeed('2026-10-22', 'swap')).version, 'KNOT3');
  assert.equal(parseSeed(formatSeed(1, 42, 'swap')).version, 'KNOT3');
  assert.equal(nextCampaignSeed(campaignSeed(3, 'swap')), campaignSeed(4, 'swap'));
  assert.equal(nextCampaignSeed(campaignSeed(8, 'swap', 'KNOT1')), campaignSeed(9, 'swap', 'KNOT1'));
  assert.notEqual(dailySeed('2026-10-22', 'swap'), dailySeed('2026-10-22', 'swap', 'KNOT1'));
});

test('published KNOT3 layouts keep their exact geometry and starting permutation', () => {
  for (const [seed, digest] of [
    ['KNOT3-4-14TCQBY', '40dae2807baa61e9267c6417895e5308e52ad9f4d1b6fcb5ea2cbb3abc621e6f'],
    ['KNOT3-12-13X06VH', '256be747963f0a7f31306a65f90236241243b558efd383b5746d4394da71388b'],
    ['KNOT3-24-1WRJ6WW', 'c56cf5d92d667e5ff010a237a90c92070386b24e3ec76119e89f2d19dec7cdff'],
  ]) assert.equal(createHash('sha256').update(JSON.stringify(generatePuzzle(seed))).digest('hex'), digest);
});
