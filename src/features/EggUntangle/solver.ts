import type { Point, UntanglePuzzle } from "./types.ts";
import { analyzeBoard, distanceToSegmentSquared, ROPE_NODE_CLEARANCE, segmentsIntersect } from "./geometry.ts";

export type Swap = [number, number];
type Candidate = { pair: Swap; cost: number };
type Model = {
  encode: (points: readonly Point[]) => number[] | null;
  cost: (positions: number[], stopEarly?: boolean) => number;
  target: number[];
  pairs: Swap[];
};
const models = new WeakMap<UntanglePuzzle, Model>();

/** Slot geometry never changes during swaps. Precompute its obstructions once;
 * bounded searches can then inspect moves without repeating geometric arithmetic.
 * The public geometry validator remains authoritative for submitted victories.
 */
function modelFor(puzzle: UntanglePuzzle): Model | null {
  if (puzzle.mechanics !== "swap" || !puzzle.slots) return null;
  const cached = models.get(puzzle); if (cached) return cached;
  const slots = puzzle.slots, count = slots.length;
  if (!analyzeBoard(puzzle.solution, puzzle.edges).solved) return null;
  const keys = new Map(slots.map((point, i) => [`${point.x}:${point.y}`, i]));
  const encode = (points: readonly Point[]) => {
    if (points.length !== count) return null;
    const ids = points.map(point => keys.get(`${point.x}:${point.y}`));
    return ids.some(id => id === undefined) || new Set(ids).size !== count ? null : ids as number[];
  };
  const target = encode(puzzle.solution); if (!target) return null;
  const pairs: Swap[] = [], ids = new Int16Array(count * count);
  for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
    ids[a * count + b] = ids[b * count + a] = pairs.length; pairs.push([a, b]);
  }
  const blocked = new Uint8Array(pairs.length), crosses = new Uint8Array(pairs.length ** 2);
  pairs.forEach(([a, b], i) => {
    blocked[i] = Number(slots.some((point, node) => node !== a && node !== b
      && distanceToSegmentSquared(point, slots[a], slots[b]) < ROPE_NODE_CLEARANCE ** 2));
    for (let j = 0; j < i; j++) {
      const [c, d] = pairs[j];
      // Shared-endpoint overlaps already make at least one edge blocked by a slot.
      if (a !== c && a !== d && b !== c && b !== d && segmentsIntersect(slots[a], slots[b], slots[c], slots[d])) {
        crosses[i * pairs.length + j] = crosses[j * pairs.length + i] = 1;
      }
    }
  });
  const drawing = new Int16Array(puzzle.edges.length);
  const cost = (positions: number[], stopEarly = false) => {
    let value = 0;
    for (let i = 0; i < puzzle.edges.length; i++) {
      const [a, b] = puzzle.edges[i], edge = ids[positions[a] * count + positions[b]];
      drawing[i] = edge;
      if (blocked[edge]) { if (stopEarly) return 1; value += 4; }
      for (let j = 0; j < i; j++) if (crosses[edge * pairs.length + drawing[j]]) {
        if (stopEarly) return 1; value++;
      }
    }
    return value;
  };
  const model = { encode, cost, target, pairs }; models.set(puzzle, model); return model;
}

const exchange = (positions: number[], [a, b]: Swap) => { [positions[a], positions[b]] = [positions[b], positions[a]]; };

/** Exact distance to the stored embedding, an upper bound on a winning path. */
export function embeddingDistance(puzzle: UntanglePuzzle, points: readonly Point[]): number {
  const model = modelFor(puzzle), positions = model?.encode(points);
  if (!model || !positions) return Infinity;
  const inverse = Array<number>(positions.length); model.target.forEach((slot, node) => { inverse[slot] = node; });
  const seen = new Set<number>(); let cycles = 0;
  for (let i = 0; i < positions.length; i++) if (!seen.has(i)) {
    cycles++; for (let node = i; !seen.has(node); node = inverse[positions[node]]) seen.add(node);
  }
  return positions.length - cycles;
}

function rankedMoves(model: Model, positions: number[]): { win: Swap | null; candidates: Candidate[] } {
  const candidates: Candidate[] = [];
  for (const pair of model.pairs) {
    exchange(positions, pair); const cost = model.cost(positions); exchange(positions, pair);
    if (!cost) return { win: pair, candidates };
    candidates.push({ pair, cost });
  }
  candidates.sort((a, b) => a.cost - b.cost || a.pair[0] - b.pair[0] || a.pair[1] - b.pair[1]);
  return { win: null, candidates };
}

/** Checks every immediate win; searches a bounded set of two-move continuations.
 * Infinity is used only by offline/generation difficulty checks, for an exact
 * proof that a small opening puzzle cannot be solved in one or two swaps.
 */
export function shortSwapSolution(puzzle: UntanglePuzzle, points: readonly Point[], firstMoves = 12): Swap[] | null {
  const model = modelFor(puzzle), positions = model?.encode(points);
  if (!model || !positions) return null;
  if (!model.cost(positions, true)) return [];
  const { win, candidates } = rankedMoves(model, positions);
  if (win) return [win];
  for (const { pair } of candidates.slice(0, firstMoves)) {
    exchange(positions, pair);
    for (const second of model.pairs) {
      if (pair[0] === second[0] && pair[1] === second[1]) continue;
      exchange(positions, second); const solved = !model.cost(positions, true); exchange(positions, second);
      if (solved) { exchange(positions, pair); return [pair, second]; }
    }
    exchange(positions, pair);
  }
  return null;
}

export function chooseSwapHint(puzzle: UntanglePuzzle, points: readonly Point[]): Swap | null {
  const model = modelFor(puzzle), positions = model?.encode(points);
  if (!model || !positions || !model.cost(positions, true)) return null;
  const short = shortSwapSolution(puzzle, points);
  if (short?.length) return short[0];
  // Every fallback reduces exact distance to a valid embedding. Prefer the
  // clearest such move, but never trade guaranteed progress for a local minimum.
  const distance = embeddingDistance(puzzle, points);
  let best: Swap | null = null, bestCost = Infinity;
  for (const pair of model.pairs) {
    exchange(positions, pair);
    const next = positions.map(slot => puzzle.slots![slot]);
    if (embeddingDistance(puzzle, next) < distance) {
      const cost = model.cost(positions);
      if (cost < bestCost) { bestCost = cost; best = pair; }
    }
    exchange(positions, pair);
  }
  return best;
}

/** A measured winning route, never presented as the mathematically optimal one. */
export function estimatedSwapMoves(puzzle: UntanglePuzzle, points = puzzle.initial): number {
  let current = points, moves = 0;
  while (!analyzeBoard(current, puzzle.edges).solved && moves < points.length) {
    const pair = chooseSwapHint(puzzle, current); if (!pair) return Infinity;
    current = current.slice(); [current[pair[0]], current[pair[1]]] = [current[pair[1]], current[pair[0]]]; moves++;
  }
  return analyzeBoard(current, puzzle.edges).solved ? moves : Infinity;
}
