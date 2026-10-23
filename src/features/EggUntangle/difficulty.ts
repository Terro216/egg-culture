import type { Point, UntanglePuzzle } from "./types.ts";
import { analyzeBoard } from "./geometry.ts";
import { estimatedSwapMoves, shortSwapSolution } from "./solver.ts";

export const BALANCED_COUNTS = [8, 8, 8, 10, 10, 12, 12, 14, 14, 15, 16, 16, 17, 18, 18, 19, 20, 20, 21, 22, 22, 23, 24, 24];
export const targetSwapMoves = (level: number) => level <= 3 ? Math.max(2, level) : 3 + Math.floor((level - 3) / 2);

/** Scramble by merging permutation cycles: each exchange adds exactly one move
 * to the distance from the known embedding. Unlike a uniform shuffle, this
 * gives the opening stages a small, explicit solution budget.
 */
export function balancedStart(puzzle: UntanglePuzzle, random: () => number): Point[] {
  const target = targetSwapMoves(puzzle.level), count = puzzle.solution.length;
  for (let attempt = 0; attempt < 32; attempt++) {
    const points = puzzle.solution.map(p => ({ ...p })), parent = points.map((_, i) => i);
    const root = (node: number): number => parent[node] === node ? node : root(parent[node]);
    for (let move = 0; move < target; move++) {
      const pairs: [number, number][] = [];
      for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) if (root(a) !== root(b)) pairs.push([a, b]);
      const [a, b] = pairs[Math.floor(random() * pairs.length)];
      [points[a], points[b]] = [points[b], points[a]]; parent[root(a)] = root(b);
    }
    if (!analyzeBoard(points, puzzle.edges).crossings) continue;
    // Exhaustive two-swap rejection is cheap on the small opening boards;
    // later boards use the same bounded search as the player-facing hint.
    const shortcut = shortSwapSolution(puzzle, points, count <= 12 ? Infinity : 12);
    if (shortcut && shortcut.length < Math.min(3, target)) continue;
    const measured = estimatedSwapMoves(puzzle, points), distance = Math.abs(target - measured);
    if (distance <= (target <= 3 ? 0 : 1)) return points;
  }
  // A new seed is rejected rather than silently replacing its difficulty with
  // a uniform shuffle. The caller deterministically tries another composition.
  throw new Error("Cannot calibrate clutch difficulty");
}
