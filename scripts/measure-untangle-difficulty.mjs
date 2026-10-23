// Pure, deterministic calibration audit. No browser, database or network access.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { analyzeBoard, campaignSeed, formatSeed, generatePuzzle } from '../src/features/EggUntangle/engine.ts';
import { estimatedSwapMoves, embeddingDistance } from '../src/features/EggUntangle/solver.ts';
import { targetSwapMoves } from '../src/features/EggUntangle/difficulty.ts';
import { graphComponents } from '../src/features/EggUntangle/geometry.ts';

const samples = Number(process.env.NEST_SAMPLES || 100);
assert.ok(Number.isInteger(samples) && samples > 0 && samples <= 2000);
const report = { boards: 0, componentCounts: {}, levels: [], campaign: [], worstMs: 0, worstSeed: '', failures: [] };
const start = performance.now();
for (let level = 1; level <= 24; level++) {
  const measured = [];
  for (let sample = 10; sample < 10 + samples; sample++) {
    const seed = formatSeed(level, Math.imul(sample, 2654435761) >>> 0, 'swap', 'KNOT4'), began = performance.now();
    try {
      const puzzle = generatePuzzle(seed), ms = performance.now() - began;
      if (ms > report.worstMs) { report.worstMs = ms; report.worstSeed = seed; }
      const moves = estimatedSwapMoves(puzzle), target = targetSwapMoves(level);
      assert.ok(moves <= target && moves >= target - Number(target > 3), `${moves} measured swaps; target ${target}`);
      assert.equal(embeddingDistance(puzzle, puzzle.initial), target);
      assert.ok(analyzeBoard(puzzle.solution, puzzle.edges).solved && analyzeBoard(puzzle.initial, puzzle.edges).crossings > 0);
      const count = graphComponents(puzzle.initial.length, puzzle.edges).length;
      report.componentCounts[count] = (report.componentCounts[count] || 0) + 1;
      measured.push(moves);
    } catch (error) { report.failures.push({ seed, error: error.message }); }
    report.boards++;
  }
  report.levels.push({ level, min: Math.min(...measured), max: Math.max(...measured), mean: measured.reduce((a, b) => a + b, 0) / measured.length });
  const puzzle = generatePuzzle(campaignSeed(level, 'swap'));
  report.campaign.push({ seed: puzzle.seed, eggs: puzzle.initial.length, measuredMoves: estimatedSwapMoves(puzzle) });
}
report.seconds = (performance.now() - start) / 1000;
if (process.env.NEST_REPORT) await writeFile(process.env.NEST_REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
assert.deepEqual(report.failures, []);
