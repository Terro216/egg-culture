// Archived KNOT3 generation audit; no browser, database or network access.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { analyzeBoard, campaignSeed, formatSeed, generatePuzzle } from '../src/features/EggUntangle/engine.ts';
import { graphComponents } from '../src/features/EggUntangle/geometry.ts';

const samples = Number(process.env.NEST_SAMPLES || 500);
assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 10000);
const report = { boards: 0, componentCounts: {}, partitions: {}, worstMs: 0, worstSeed: '', campaign: [], failures: [] };
const start = performance.now();
for (let level = 1; level <= 24; level++) for (let sample = 0; sample < samples; sample++) {
  const seed = sample ? formatSeed(level, Math.imul(sample, 2654435761) >>> 0, 'swap', 'KNOT3') : campaignSeed(level, 'swap', 'KNOT3');
  const began = performance.now();
  try {
    const puzzle = generatePuzzle(seed), groups = graphComponents(puzzle.solution.length, puzzle.edges);
    const solved = analyzeBoard(puzzle.solution, puzzle.edges), initial = analyzeBoard(puzzle.initial, puzzle.edges);
    assert.ok(solved.solved && !initial.solved && !initial.overlappingNodes.length);
    const partition = groups.map(group => group.length).sort((a, b) => a - b).join('+');
    report.componentCounts[groups.length] = (report.componentCounts[groups.length] || 0) + 1;
    report.partitions[partition] = (report.partitions[partition] || 0) + 1;
    if (!sample) report.campaign.push({ seed, partition, eggs: puzzle.solution.length });
  } catch (error) { report.failures.push({ seed, error: error.message }); }
  const ms = performance.now() - began;
  if (ms > report.worstMs) { report.worstMs = ms; report.worstSeed = seed; }
  report.boards++;
}
report.seconds = (performance.now() - start) / 1000;
if (process.env.NEST_REPORT) await writeFile(process.env.NEST_REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, partitions: Object.keys(report.partitions).length, campaign: undefined }));
assert.deepEqual(report.failures, []);
