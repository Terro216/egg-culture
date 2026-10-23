import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { analyzeBoard, campaignSeed, findSwapHint, formatSeed, generatePuzzle, swapNodes } from '../src/features/EggUntangle/engine.ts';
import { graphComponents } from '../src/features/EggUntangle/geometry.ts';
import { embeddingDistance, estimatedSwapMoves, shortSwapSolution } from '../src/features/EggUntangle/solver.ts';
import { targetSwapMoves } from '../src/features/EggUntangle/difficulty.ts';

test('hints take an immediate victory even when it differs from the stored embedding', () => {
  const puzzle = generatePuzzle('KNOT3-18-1'), triangle = graphComponents(puzzle.solution.length, puzzle.edges).find(group => group.length === 3);
  const alternative = puzzle.solution.map(p => ({ ...p }));
  triangle.forEach((node, i) => { alternative[node] = puzzle.solution[triangle[(i + 1) % 3]]; });
  assert.ok(analyzeBoard(alternative, puzzle.edges).solved);
  const almost = swapNodes(alternative, 0, 2);
  assert.equal(analyzeBoard(almost, puzzle.edges).solved, false);
  const hint = findSwapHint(puzzle, almost);
  assert.ok(analyzeBoard(swapNodes(almost, ...hint), puzzle.edges).solved);
});

test('a returned two-move continuation is a real winning path, including hidden-rope constraints', () => {
  let found = 0;
  for (let sample = 0; sample < 25; sample++) {
    const puzzle = generatePuzzle(formatSeed(8, sample, 'swap', 'KNOT3'));
    const points = swapNodes(swapNodes(puzzle.solution, 0, 3), 2, 5);
    const plan = shortSwapSolution(puzzle, points, Infinity);
    assert.ok(plan && plan.length <= 2, puzzle.seed);
    let current = points;
    for (const pair of plan) current = swapNodes(current, ...pair);
    assert.ok(analyzeBoard(current, puzzle.edges).solved, puzzle.seed);
    if (plan.length === 2) found++;
  }
  assert.ok(found > 10, 'exercise actual lookahead, not only immediate victories');
});

test('bounded hints always terminate, including old odd and even layouts', () => {
  for (const version of ['KNOT1', 'KNOT3', 'KNOT4']) for (const level of [4, 9, 18, 24]) for (let sample = 0; sample < 4; sample++) {
    const puzzle = generatePuzzle(formatSeed(level, sample, 'swap', version));
    let current = puzzle.initial, steps = 0;
    const visited = new Set();
    while (!analyzeBoard(current, puzzle.edges).solved) {
      const key = JSON.stringify(current); assert.ok(!visited.has(key), `${puzzle.seed}: no hint cycles`); visited.add(key);
      assert.ok(steps++ < puzzle.initial.length, puzzle.seed);
      const pair = findSwapHint(puzzle, current); assert.ok(pair); current = swapNodes(current, ...pair);
    }
  }
});

test('calibrated openings bridge the authored lessons and exclude one/two-swap shortcuts', () => {
  assert.equal(generatePuzzle(campaignSeed(3, 'swap')).initial.length, 8);
  for (let sample = 0; sample < 24; sample++) {
    const puzzle = generatePuzzle(sample ? formatSeed(4, sample, 'swap') : campaignSeed(4, 'swap'));
    assert.equal(puzzle.initial.length, 10);
    assert.equal(shortSwapSolution(puzzle, puzzle.initial, Infinity), null);
    assert.equal(embeddingDistance(puzzle, puzzle.initial), 3);
    assert.equal(estimatedSwapMoves(puzzle), 3, 'exactly three swaps: upper and lower bounds agree');
  }
});

test('KNOT4 has a measured difficulty band, deterministic geometry and safe cached copies', () => {
  for (let level = 1; level <= 24; level++) for (let sample = 0; sample < 5; sample++) {
    const seed = formatSeed(level, sample, 'swap'), puzzle = generatePuzzle(seed), target = targetSwapMoves(level);
    const moves = estimatedSwapMoves(puzzle);
    assert.ok(moves >= target - (target <= 3 ? 0 : 1) && moves <= target, `${seed}: ${moves}/${target}`);
    assert.equal(embeddingDistance(puzzle, puzzle.initial), target);
    assert.ok(analyzeBoard(puzzle.solution, puzzle.edges).solved);
    assert.ok(analyzeBoard(puzzle.initial, puzzle.edges).crossings > 0);
    const copy = generatePuzzle(seed); assert.deepEqual(copy, puzzle);
    copy.initial[0].x = -1; copy.solution[0].x = -1; copy.slots[0].x = -1;
    assert.deepEqual(generatePuzzle(seed), puzzle, 'mutating a returned puzzle cannot poison the cache');
  }
});

test('published calibrated layouts retain their exact geometry and permutation', () => {
  for (const [seed, expected] of [
    ['KNOT4-4-1W1EBE9', 'a70fd70a23b5b946204ce741a5438fe56ed5f43a0667693eec8c70d3b2826b9d'],
    ['KNOT4-12-15YFSW8', '97e8171a2dca9bf75df65c59cd3bc3c0459282b68f2390cedc768625bf44e2d0'],
    ['KNOT4-24-13QFTUH', 'b4a11301baf29cee6e0a8bb8540e959fcd4b58e652c0807c8f71aae401b57c2a'],
  ]) assert.equal(createHash('sha256').update(JSON.stringify(generatePuzzle(seed))).digest('hex'), expected);
});
