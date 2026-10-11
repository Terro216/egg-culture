import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  analyzeBoard, campaignSeed, dailySeed, formatSeed, generatePuzzle, isSolved,
  levelNodeCount, LEVEL_COUNT, moscowDay, NODE_MIN_DISTANCE, parseSeed, crossingMoveLowerBound,
  findSwapHint, isCampaignSeed, isDailySeed, isSlotPermutation, isTutorialSeed, nextCampaignSeed, puzzleRules, swapNodes,
} from '../src/features/EggUntangle/engine.ts';

const point = (x, y) => ({ x, y });
const square = [point(100, 100), point(900, 100), point(900, 900), point(100, 900)];

test('proper crossings, touching endpoints and collinear overlaps are distinct from legal joints', () => {
  assert.equal(analyzeBoard(square, [[0, 2], [1, 3]]).crossings, 1);
  assert.deepEqual(analyzeBoard(square, [[0, 2], [1, 3]]).crossedEdges, [0, 1]);
  assert.ok(isSolved(square, [[0, 1], [1, 2], [2, 3], [3, 0]]));
  assert.ok(isSolved([point(100, 200), point(500, 200), point(900, 200)], [[0, 1], [1, 2]]), 'straight chains may meet at their own middle node');
  const sameRay = analyzeBoard([point(100, 200), point(500, 200), point(900, 200)], [[0, 1], [0, 2]]);
  assert.equal(sameRay.solved, false);
  assert.equal(sameRay.crossings, 1);
  assert.deepEqual(sameRay.blockedNodes, [1]);
  const separateOverlap = analyzeBoard([point(100, 100), point(700, 100), point(300, 100), point(900, 100)], [[0, 1], [2, 3]]);
  assert.equal(separateOverlap.crossings, 1);
});

test('a zero-crossing layout cannot win by hiding eggs on ropes or collapsing nodes', () => {
  const points = [point(100, 100), point(900, 100), point(500, 100), point(500, 800)];
  const junction = analyzeBoard(points, [[0, 1], [2, 3]]);
  assert.equal(junction.solved, false);
  assert.deepEqual(junction.blockedNodes, [2]);
  assert.equal(junction.crossings, 1, 'an unrelated endpoint touching a rope is a crossing');
  points[2].y = 111;
  const obscured = analyzeBoard(points, [[0, 1], [2, 3]]);
  assert.equal(obscured.crossings, 0);
  assert.equal(obscured.solved, false, 'a rope visibly passing under an unrelated egg must be moved');
  assert.deepEqual(obscured.blockedNodes, [2]);
  points[2].y = 128;
  assert.equal(analyzeBoard(points, [[0, 1], [2, 3]]).solved, false, 'a rope inside the visible shell must not count as free');
  points[2].y = 140;
  assert.equal(analyzeBoard(points, [[0, 1], [2, 3]]).solved, true, 'a visible gap between shell and rope is legal');
  const collapsed = analyzeBoard(square.map(() => point(500, 500)), [[0, 1], [1, 2], [2, 3], [3, 0]]);
  assert.equal(collapsed.solved, false);
  assert.equal(collapsed.overlappingNodes.length, 6);
  const nearlyCollapsed = [point(100, 100), point(100 + NODE_MIN_DISTANCE - 1, 100), point(900, 900)];
  assert.equal(isSolved(nearlyCollapsed, [[0, 1], [1, 2]]), false);
  assert.equal(isSolved([point(100, 100), point(160, 100), point(900, 900)], [[0, 1], [1, 2]]), false, 'nearby shell bodies cannot overlap even when their centres differ');
});

test('invalid numbers, bounds, degenerate graphs and malformed edges never count as a solution', () => {
  for (const invalid of [NaN, Infinity, -Infinity, -1, 1001, '500', null]) {
    const result = analyzeBoard([point(invalid, 100), ...square.slice(1)], [[0, 1], [1, 2]]);
    assert.equal(result.solved, false);
    assert.deepEqual(result.invalidNodes, [0]);
  }
  for (const edge of [[0, 4], [0, -1], [0, 0], [0, 1.5], [0], [0, 1, 2], null]) {
    const result = analyzeBoard(square, [[0, 1], edge]);
    assert.equal(result.solved, false);
    assert.deepEqual(result.invalidEdges, [1]);
  }
  assert.equal(analyzeBoard(square, [[0, 1], [1, 0]]).solved, false, 'duplicate undirected edges are rejected');
  assert.equal(isSolved([], []), false);
  assert.equal(isSolved(square, []), false);
});

test('versioned seeds round-trip canonically and reject unsupported, oversized or malformed input', () => {
  const seed = formatSeed(24, 0xffffffff);
  assert.equal(seed, 'NEST2-24-1Z141Z3');
  assert.deepEqual(parseSeed('  nest2-24-1z141z3  '), { seed, level: 24, code: '1Z141Z3', version: 'NEST2', mechanics: 'drag' });
  assert.equal(parseSeed('NEST1-01-0000000').seed, 'NEST1-1-0');
  assert.equal(parseSeed(`https://egg.example/ru/games?nest=${seed}`).seed, seed);
  assert.equal(parseSeed(`https://egg.example/ru/games?untangle=${seed}`).seed, seed);
  for (const invalid of ['NEST4-1-0', 'KNOT3-1-0', 'NEST3-4-0', 'KNOT2-4-0', 'NEST1-0-0', 'NEST1-25-0', 'NEST1-1-1Z141Z4', 'NEST1-1--1', 'NEST1-1-A\nB', 'x'.repeat(2049), null, {}, 'https://egg.example/?other=NEST1-1-0']) {
    assert.equal(parseSeed(invalid), null, String(invalid));
  }
  for (const level of [-1, 0, 25, NaN, 1.5]) assert.throws(() => formatSeed(level, 1), RangeError);
  for (const code of [-1, 2 ** 32, NaN, 1.5, 'abc!', '99999999']) assert.throws(() => formatSeed(1, code), RangeError);
  assert.throws(() => generatePuzzle('NEST1-1-0', 2), RangeError);
  assert.throws(() => generatePuzzle('wrong'), RangeError);
  assert.throws(() => formatSeed(1, 1, 'swap', 'NEST1'), RangeError);
  assert.throws(() => formatSeed(1, 1, 'drag', 'KNOT1'), RangeError);
});

test('daily nests use the Moscow midnight boundary and remain replayable for an exact day', () => {
  const before = new Date('2026-10-03T20:59:59.999Z'), after = new Date('2026-10-03T21:00:00.000Z');
  assert.equal(moscowDay(before), '2026-10-03');
  assert.equal(moscowDay(after), '2026-10-04');
  assert.equal(dailySeed(before), dailySeed('2026-10-03'));
  assert.equal(dailySeed(after), dailySeed('2026-10-04'));
  assert.notEqual(dailySeed(before), dailySeed(after));
  for (const date of ['2026-02-30', '2026-13-01', '2026-00-01', '2026-1-01', '2026-10-03junk', 'not a day']) assert.throws(() => dailySeed(date), RangeError);
  assert.throws(() => dailySeed(new Date(NaN)), RangeError);
  for (let year = 2020; year <= 2100; year++) {
    const { level } = parseSeed(dailySeed(`${year}-01-01`));
    assert.ok(level >= 7 && level <= 14, 'calendar age cannot increase the node budget');
  }
});

test('every campaign level and a seed sweep have connected solvable graphs, safe spacing and crossed starts', () => {
  let lastCount = 0;
  for (let level = 1; level <= LEVEL_COUNT; level++) {
    const count = levelNodeCount(level);
    assert.ok(count >= lastCount && count >= 5 && count <= 24);
    lastCount = count;
    for (const seed of [campaignSeed(level, 'drag', 'NEST2'), ...Array.from({ length: 18 }, (_, i) => formatSeed(level, Math.imul(i + 1, 2654435761) >>> 0))]) {
      const puzzle = generatePuzzle(seed);
      assert.equal(puzzle.initial.length, count, seed);
      assert.equal(puzzle.solution.length, count, seed);
      assert.equal(puzzle.seed, seed);
      assert.ok(isSolved(puzzle.solution, puzzle.edges), `${seed}: known embedding must win`);
      const initial = analyzeBoard(puzzle.initial, puzzle.edges);
      assert.ok(initial.crossings > 0, `${seed}: puzzle cannot start solved`);
      assert.deepEqual(initial.overlappingNodes, [], `${seed}: initial eggs must have separate touch targets`);
      assert.deepEqual(analyzeBoard(puzzle.solution, puzzle.edges).blockedNodes, [], `${seed}: the solution must leave visible shell clearance`);
      const degrees = Array(count).fill(0), reached = new Set([0]);
      for (const [a, b] of puzzle.edges) { degrees[a]++; degrees[b]++; }
      assert.ok(degrees.every(degree => degree >= 2), `${seed}: no trivial detached or dangling egg`);
      for (let pass = 0; pass < count; pass++) for (const [a, b] of puzzle.edges) {
        if (reached.has(a)) reached.add(b);
        if (reached.has(b)) reached.add(a);
      }
      assert.equal(reached.size, count, `${seed}: all eggs belong to one nest`);
      assert.ok(puzzle.edges.length <= 3 * count - 6);
      // A reflected valid embedding is deliberately different from the saved solution.
      assert.ok(isSolved(puzzle.solution.map(({ x, y }) => point(1000 - x, y)), puzzle.edges), `${seed}: any planar embedding must win`);
    }
  }
  assert.equal(lastCount, 24);
});

test('seed replay is deterministic, topology varies, and callers cannot mutate later generated boards', () => {
  const code = campaignSeed(12), first = generatePuzzle(code), second = generatePuzzle(code);
  assert.deepEqual(first, second);
  const topology = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(generatePuzzle(formatSeed(12, i)).edges)));
  assert.ok(topology.size > 15, 'new seeds change the graph, not only its initial positions');
  const pristine = structuredClone(second);
  first.initial[0].x = 999;
  first.solution[0].x = 999;
  first.edges[0][0] = 99;
  assert.deepEqual(generatePuzzle(code), pristine);
  assert.notEqual(second.initial[0], second.solution[0]);
  // Any intentional NEST1 rules change must introduce a new version instead of changing old shares.
  const { mechanics, ...legacy } = generatePuzzle(campaignSeed(12, 'drag', 'NEST1'));
  assert.equal(mechanics, 'drag');
  assert.equal(createHash('sha256').update(JSON.stringify(legacy)).digest('hex'), '177c23f679546f4532325007332be6cd90b4c98e65fa2b50ed5051b4c5c80a0b');
});

test('legacy codes keep their generation and canonical identities while new paths use independent rules', () => {
  for (const [mechanics, version] of [['drag', 'NEST1'], ['drag', 'NEST2'], ['swap', 'KNOT1']]) {
    const campaign = campaignSeed(4, mechanics, version), daily = dailySeed('2026-10-03', mechanics, version);
    assert.equal(parseSeed(campaign).version, version);
    assert.deepEqual(puzzleRules(campaign), { version, mechanics });
    assert.ok(isCampaignSeed(campaign));
    assert.ok(isDailySeed(daily, '2026-10-03'));
    assert.equal(isDailySeed(daily, '2026-10-04'), false);
    assert.equal(isDailySeed(daily, '2026-02-31'), false);
    assert.equal(isCampaignSeed(formatSeed(4, 0, mechanics, version)), false);
  }
  assert.equal(puzzleRules('invalid'), null);
  assert.equal(levelNodeCount(1, 'drag', 'NEST1'), 5);
  assert.equal(levelNodeCount(1), 8);
  assert.notEqual(campaignSeed(1), campaignSeed(1, 'drag', 'NEST1'));
  assert.notEqual(dailySeed('2026-10-03'), dailySeed('2026-10-03', 'drag', 'NEST1'));
});

test('the new early campaign requires multiple different eggs to move, without claiming optimal moves', () => {
  const regression = generatePuzzle('NEST2-3-13D36F4');
  assert.ok(crossingMoveLowerBound(regression.initial, regression.edges) >= 3, 'mesh thinning must retain enough independent edges');
  for (let level = 1; level <= LEVEL_COUNT; level++) {
    for (let seed = 0; seed < 16; seed++) {
      const puzzle = generatePuzzle(seed ? formatSeed(level, seed) : campaignSeed(level, 'drag', 'NEST2'));
      const required = level <= 2 ? 2 : level <= 8 ? 3 : 4;
      assert.ok(crossingMoveLowerBound(puzzle.initial, puzzle.edges) >= required, puzzle.seed);
    }
  }
});

test('modern story and hardmode seed fingerprints freeze both graph generation and initial permutations', () => {
  for (const [seed, expected] of [
    ['NEST2-1-YUQ5Q4', 'f393f720ed0d7c1a55799b4aa7e3945cc17185a192e8fbee08359f2c16651a7e'],
    ['NEST2-12-3HN5QI', '86ede1b7ca99eca699fac00c9362152cfc128890c21ca882e754eee4e9071fb8'],
    ['NEST2-24-XGPP5F', '12d9513f402cb8cab363baa904e5353ae8bf4bf7e04f74344fc13ae3f6dc1e5c'],
    ['KNOT1-1-5X9SMJ', '5e8db132af590cb78b3e252acb1352a77c9ca5f78e01403615832c7b2ebacfec'],
    ['KNOT1-12-1EDNBYZ', '660812467c4249e0b464c077a7be337564f1da5fb052b93b9f5d71056d74135d'],
    ['KNOT1-24-1FHOW8U', '65644f6a6485ca4f75975f996e17ec603b5c8c47992bbbae01a2003293f4ec5f'],
  ]) assert.equal(createHash('sha256').update(JSON.stringify(generatePuzzle(seed))).digest('hex'), expected, seed);
});

test('tutorial seed fingerprints freeze their authored lessons and seeded transforms', () => {
  for (const [seed, expected] of [
    ['NEST3-1-1Q2F0BD', '4534f21050138809f0f8357cd0ad7f31990e9f044bd3af2ac43ece651d9bb8f1'],
    ['NEST3-2-1P8G78G', '13d2f7267ba7c9ded7ff364de94f25598d39bad60e9589b75e06404a85d1470a'],
    ['NEST3-3-1PIFSXF', 'e435cc835f25d234c05fdd344281099e8b6d1c9710ff89e696a778a3505de183'],
    ['KNOT2-1-163POXC', '69c8da2f01ae62e1d90125bb15d57c7ce3008fc0f19f542e308aea4a3e23bac0'],
    ['KNOT2-2-16XOI09', 'a6bb7cb53ef15d5ba89c301e3743de7941a3655093e4afcdfd894d356ad125e1'],
    ['KNOT2-3-16NOWBA', '253fd8a44aca4344cde9a6832135a2da1b50f1f811daa4ebf7dc0a617226cbc5'],
  ]) assert.equal(createHash('sha256').update(JSON.stringify(generatePuzzle(seed))).digest('hex'), expected, seed);
});

test('hardmode supports independent figures and all fixed-slot layouts can be solved by repeated swap hints', () => {
  let connectedBoards = 0, disconnectedBoards = 0;
  for (let level = 1; level <= LEVEL_COUNT; level++) {
    for (let seed = 0; seed < 12; seed++) {
      const puzzle = generatePuzzle(seed ? formatSeed(level, seed, 'swap') : campaignSeed(level, 'swap', 'KNOT1'));
      assert.equal(puzzle.mechanics, 'swap');
      assert.equal(puzzle.version, 'KNOT1');
      assert.ok(isSlotPermutation(puzzle, puzzle.initial), puzzle.seed);
      assert.ok(isSlotPermutation(puzzle, puzzle.solution), puzzle.seed);
      assert.ok(isSolved(puzzle.solution, puzzle.edges), `${puzzle.seed}: known embedding has visible clearance`);
      assert.equal(isSolved(puzzle.initial, puzzle.edges), false);
      assert.deepEqual(analyzeBoard(puzzle.initial, puzzle.edges).overlappingNodes, []);
      const reached = new Set([0]);
      for (let pass = 0; pass < puzzle.initial.length; pass++) for (const [a, b] of puzzle.edges) {
        if (reached.has(a)) reached.add(b);
        if (reached.has(b)) reached.add(a);
      }
      if (reached.size === puzzle.initial.length) connectedBoards++; else disconnectedBoards++;
      if (level <= 2) for (let a = 0; a < puzzle.initial.length; a++) for (let b = a + 1; b < puzzle.initial.length; b++) {
        assert.equal(isSolved(swapNodes(puzzle.initial, a, b), puzzle.edges), false, `${puzzle.seed}: no one-swap opener`);
      }
      let points = puzzle.initial;
      for (let moves = 0; moves < puzzle.initial.length; moves++) {
        const hint = findSwapHint(puzzle, points);
        if (!hint) break;
        points = swapNodes(points, ...hint);
        assert.ok(isSlotPermutation(puzzle, points));
      }
      assert.ok(isSolved(points, puzzle.edges), `${puzzle.seed}: hints must terminate in a valid layout`);
      assert.equal(findSwapHint(puzzle, points), null);
    }
  }
  assert.ok(connectedBoards > 0);
  assert.ok(disconnectedBoards > 0);
});

test('only the three default campaign introductions change; published editions and free/daily defaults remain available', () => {
  for (const [mechanics, tutorial, published] of [['drag', 'NEST3', 'NEST2'], ['swap', 'KNOT2', 'KNOT1']]) {
    for (let level = 1; level <= LEVEL_COUNT; level++) {
      const seed = campaignSeed(level, mechanics), expectedVersion = level <= 3 ? tutorial : published;
      assert.equal(parseSeed(seed).version, expectedVersion);
      assert.equal(isTutorialSeed(seed), level <= 3);
      assert.ok(isCampaignSeed(seed));
      assert.equal(nextCampaignSeed(seed), level === 24 ? null : campaignSeed(level + 1, mechanics));
      if (level <= 3) {
        assert.notEqual(seed, campaignSeed(level, mechanics, published));
        assert.equal(generatePuzzle(seed).initial.length, level * 2 + 2);
        assert.equal(levelNodeCount(level, mechanics, tutorial), level * 2 + 2);
      } else assert.equal(seed, campaignSeed(level, mechanics, published));
    }
    assert.equal(parseSeed(formatSeed(1, 1, mechanics)).version, published, 'random/free boards keep their published generator');
    assert.equal(dailySeed('2026-10-04', mechanics), dailySeed('2026-10-04', mechanics, published));
    assert.throws(() => formatSeed(4, 1, mechanics, tutorial), RangeError);
    assert.throws(() => levelNodeCount(4, mechanics, tutorial), RangeError);
    assert.throws(() => dailySeed('2026-10-04', mechanics, tutorial), RangeError);
    assert.equal(isDailySeed(campaignSeed(1, mechanics), '2026-10-04'), false);
    assert.equal(nextCampaignSeed(campaignSeed(1, mechanics, published)), campaignSeed(2, mechanics, published), 'an old direct link continues its old edition');
  }
  assert.equal(nextCampaignSeed(campaignSeed(1, 'drag', 'NEST1')), campaignSeed(2, 'drag', 'NEST1'));
  assert.equal(nextCampaignSeed('NEST3-1-0'), null, 'a free tutorial seed is not a canonical campaign');
  assert.equal(isTutorialSeed('NEST3-1-0'), true);
  assert.equal(isTutorialSeed('NEST3-4-0'), false);
  assert.equal(nextCampaignSeed('invalid'), null);
});

test('authored drag lessons offer a clear 1/2/3-move route without hidden ropes or overlapping eggs', () => {
  for (let level = 1; level <= 3; level++) for (let seed = 0; seed < 32; seed++) {
    const puzzle = generatePuzzle(seed ? formatSeed(level, seed, 'drag', 'NEST3') : campaignSeed(level));
    const analysis = analyzeBoard(puzzle.initial, puzzle.edges);
    assert.ok(analysis.crossings > 0);
    assert.deepEqual(analysis.overlappingNodes, []);
    assert.deepEqual(analysis.blockedNodes, []);
    assert.ok(isSolved(puzzle.solution, puzzle.edges));
    assert.equal(puzzle.slots, undefined);
    assert.ok(puzzle.initial.every(({ x, y }) => x >= 45 && y >= 45 && x <= 955 && y <= 955));
    const changed = puzzle.initial.flatMap((point, index) => point.x !== puzzle.solution[index].x || point.y !== puzzle.solution[index].y ? [index] : []);
    assert.equal(changed.length, level, 'exactly this many supplied hint destinations differ');
    for (let mask = 0; mask < (1 << level) - 1; mask++) {
      const points = structuredClone(puzzle.initial);
      changed.forEach((node, bit) => { if (mask & (1 << bit)) points[node] = puzzle.solution[node]; });
      assert.equal(isSolved(points, puzzle.edges), false, 'the authored route does not finish before its final correction');
    }
    assert.deepEqual(generatePuzzle(puzzle.seed), puzzle);
  }
});

function shortestSwapSolution(puzzle, depthLimit) {
  const queue = [{ order: puzzle.initial.map(point => puzzle.slots.findIndex(slot => slot.x === point.x && slot.y === point.y)), depth: 0 }];
  const seen = new Set([queue[0].order.join(',')]);
  for (let head = 0; head < queue.length; head++) {
    const { order, depth } = queue[head];
    if (isSolved(order.map(index => puzzle.slots[index]), puzzle.edges)) return depth;
    if (depth === depthLimit) continue;
    for (let a = 0; a < order.length; a++) for (let b = a + 1; b < order.length; b++) {
      const next = [...order]; [next[a], next[b]] = [next[b], next[a]];
      const key = next.join(',');
      if (!seen.has(key)) { seen.add(key); queue.push({ order: next, depth: depth + 1 }); }
    }
  }
  return null;
}

test('hard tutorials require exactly 1, 2 and 3 swaps across all valid target layouts', () => {
  for (let level = 1; level <= 3; level++) for (let seed = 0; seed < 4; seed++) {
    const puzzle = generatePuzzle(seed ? formatSeed(level, seed, 'swap', 'KNOT2') : campaignSeed(level, 'swap'));
    assert.ok(isSlotPermutation(puzzle, puzzle.initial));
    assert.ok(isSlotPermutation(puzzle, puzzle.solution));
    assert.deepEqual(analyzeBoard(puzzle.initial, puzzle.edges).overlappingNodes, []);
    assert.deepEqual(analyzeBoard(puzzle.initial, puzzle.edges).blockedNodes, []);
    assert.equal(shortestSwapSolution(puzzle, level), level, 'the minimum is measured against every planar permutation, not only the stored target');
    let points = puzzle.initial, hints = 0;
    for (; hints < 4; hints++) {
      const hint = findSwapHint(puzzle, points);
      if (!hint) break;
      points = swapNodes(points, ...hint);
    }
    assert.ok(isSolved(points, puzzle.edges));
    assert.equal(hints, level);
    assert.deepEqual(generatePuzzle(puzzle.seed), puzzle);
  }
});

test('hardmode proof rejects off-slot planar layouts, duplicate slots and arbitrary coordinates', () => {
  const puzzle = generatePuzzle(campaignSeed(2, 'swap'));
  const shifted = puzzle.solution.map(point => ({ x: point.x + 1, y: point.y }));
  assert.ok(isSolved(shifted, puzzle.edges), 'a translated graph is planar');
  assert.equal(isSlotPermutation(puzzle, shifted), false, 'but free dragging is not a legal hardmode move');
  const duplicate = puzzle.solution.map(point => ({ ...point }));
  duplicate[0] = { ...duplicate[1] };
  assert.equal(isSlotPermutation(puzzle, duplicate), false);
  assert.equal(isSlotPermutation(puzzle, puzzle.solution.slice(1)), false);
  assert.equal(isSlotPermutation(puzzle, puzzle.solution.map((point, i) => i ? point : { x: NaN, y: 20 })), false);
  assert.equal(isSlotPermutation(generatePuzzle(campaignSeed(1)), puzzle.solution), false);
  const original = structuredClone(puzzle.initial), swapped = swapNodes(puzzle.initial, 0, 1);
  assert.deepEqual(puzzle.initial, original);
  assert.deepEqual(swapped[0], original[1]);
  assert.deepEqual(swapNodes(swapped, 0, 1), original);
  assert.throws(() => swapNodes(original, -1, 2), RangeError);
  assert.throws(() => swapNodes(original, 0, 1.5), RangeError);
});
