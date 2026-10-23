import type { Edge, Point, PuzzleMechanics, PuzzleVersion, UntanglePuzzle, UntangleSeed } from "./types.ts";

import { BOARD_SIZE, analyzeBoard, isSolved, validPoint } from "./geometry.ts";
import { hash, randomGenerator, shuffled } from "./random.ts";
import { figureEmbedding } from "./figures.ts";
import { BALANCED_COUNTS, balancedStart } from "./difficulty.ts";
import { chooseSwapHint } from "./solver.ts";
export { BOARD_SIZE, NODE_MIN_DISTANCE, ROPE_NODE_CLEARANCE, analyzeBoard, isSolved } from "./geometry.ts";

export const LEVEL_COUNT = 24;
export const PUZZLE_VERSION = "NEST2";

function versionFor(mechanics: PuzzleMechanics, version?: PuzzleVersion): PuzzleVersion {
  const selected = version ?? (mechanics === "swap" ? "KNOT4" : PUZZLE_VERSION);
  if (!["drag", "swap"].includes(mechanics) || !["NEST1", "NEST2", "NEST3", "KNOT1", "KNOT2", "KNOT3", "KNOT4"].includes(selected)
    || selected.startsWith("KNOT") !== (mechanics === "swap")) throw new RangeError("Invalid nest rules");
  return selected;
}

const tutorialVersion = (version: PuzzleVersion) => version === "NEST3" || version === "KNOT2";

export function formatSeed(level: number, code: string | number, mechanics: PuzzleMechanics = "drag", version?: PuzzleVersion): string {
  if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT) throw new RangeError("Invalid nest level");
  const numeric = typeof code === "number" ? code : /^[0-9a-z]{1,7}$/i.test(code) ? parseInt(code, 36) : NaN;
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0xffffffff) throw new RangeError("Invalid nest seed");
  const selected = versionFor(mechanics, version);
  if (tutorialVersion(selected) && level > 3) throw new RangeError("Tutorial nests have only three stages");
  return `${selected}-${level}-${numeric.toString(36).toUpperCase()}`;
}

export function parseSeed(input: string): UntangleSeed | null {
  if (typeof input !== "string" || input.length > 2048) return null;
  let value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      value = url.searchParams.get("nest") ?? url.searchParams.get("untangle") ?? "";
    } catch { return null; }
  }
  const match = /^(NEST[123]|KNOT[1234])-(\d{1,2})-([0-9a-z]{1,7})$/i.exec(value);
  if (!match) return null;
  const version = match[1].toUpperCase() as PuzzleVersion, mechanics = version.startsWith("KNOT") ? "swap" : "drag";
  const level = Number(match[2]), numeric = parseInt(match[3], 36);
  if (level < 1 || level > LEVEL_COUNT || numeric > 0xffffffff || tutorialVersion(version) && level > 3) return null;
  const code = numeric.toString(36).toUpperCase();
  return { seed: formatSeed(level, code, mechanics, version), level, code, version, mechanics };
}

export function campaignSeed(level: number, mechanics: PuzzleMechanics = "drag", version?: PuzzleVersion): string {
  const selected = versionFor(mechanics, version ?? (level <= 3 ? mechanics === "swap" ? "KNOT2" : "NEST3" : undefined));
  return formatSeed(level, hash(`egg-culture:${selected.toLowerCase()}:campaign:${level}`), mechanics, selected);
}

export function puzzleRules(seed: string): { version: PuzzleVersion; mechanics: PuzzleMechanics } | null {
  const parsed = parseSeed(seed);
  return parsed ? { version: parsed.version, mechanics: parsed.mechanics } : null;
}

export function isCampaignSeed(seed: string): boolean {
  const parsed = parseSeed(seed);
  return Boolean(parsed && parsed.seed === campaignSeed(parsed.level, parsed.mechanics, parsed.version));
}

export function isTutorialSeed(seed: string): boolean {
  const parsed = parseSeed(seed);
  return Boolean(parsed && tutorialVersion(parsed.version));
}

/** Continue archived campaigns as published; the three new lessons join stage four. */
export function nextCampaignSeed(seed: string): string | null {
  const parsed = parseSeed(seed);
  if (!parsed || !isCampaignSeed(parsed.seed) || parsed.level >= LEVEL_COUNT) return null;
  return campaignSeed(parsed.level + 1, parsed.mechanics, tutorialVersion(parsed.version) ? undefined : parsed.version);
}

export function isDailySeed(seed: string, day: string): boolean {
  const parsed = parseSeed(seed);
  try { return Boolean(parsed && parsed.seed === dailySeed(day, parsed.mechanics, parsed.version)); } catch { return false; }
}

/** The public nest changes at midnight Moscow time, regardless of device zone. */
export function moscowDay(date = new Date()): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid nest date");
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function checkedDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new RangeError("Invalid nest day");
  const date = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw new RangeError("Invalid nest day");
  return day;
}

export function dailySeed(date: Date | string = new Date(), mechanics: PuzzleMechanics = "drag", version?: PuzzleVersion): string {
  const day = typeof date === "string" ? checkedDay(date) : moscowDay(date);
  const selected = versionFor(mechanics, version), numeric = hash(`egg-culture:${selected.toLowerCase()}:daily:${day}`);
  // A bounded mid-campaign challenge; time never turns the daily into a 100-node board.
  return formatSeed(7 + numeric % 8, numeric, mechanics, selected);
}

const MODERN_COUNTS = [8, 10, 12, 12, 14, 14, 15, 16, 16, 17, 18, 18, 19, 20, 20, 21, 22, 22, 23, 24, 24, 24, 24, 24];
export function levelNodeCount(level: number, mechanics: PuzzleMechanics = "drag", version?: PuzzleVersion): number {
  if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT) throw new RangeError("Invalid nest level");
  const selected = versionFor(mechanics, version);
  if (selected === "KNOT4") return BALANCED_COUNTS[level - 1];
  if (tutorialVersion(selected)) {
    if (level > 3) throw new RangeError("Tutorial nests have only three stages");
    return 2 + level * 2;
  }
  return selected === "NEST1" ? 5 + Math.floor((level - 1) * 19 / (LEVEL_COUNT - 1)) : MODERN_COUNTS[level - 1];
}

function connected(count: number, edges: readonly Edge[]): boolean {
  const visited = new Set([0]), queue = [0];
  for (let head = 0; head < queue.length; head++) for (const [a, b] of edges) {
    const next = a === queue[head] ? b : b === queue[head] ? a : -1;
    if (next >= 0 && !visited.has(next)) { visited.add(next); queue.push(next); }
  }
  return visited.size === count;
}

// A fixed convex integer ring avoids platform-specific trigonometric rounding.
const RING: readonly (readonly [number, number])[] = [
  [0, -400], [104, -386], [200, -346], [283, -283], [346, -200], [386, -104],
  [400, 0], [386, 104], [346, 200], [283, 283], [200, 346], [104, 386],
  [0, 400], [-104, 386], [-200, 346], [-283, 283], [-346, 200], [-386, 104],
  [-400, 0], [-386, -104], [-346, -200], [-283, -283], [-200, -346], [-104, -386],
];

/** Build a planar triangular mesh, thin it, then hide its embedding on a shuffled ring.
 * Initial ropes may pass under other eggs: those obstructions are part of the tangle.
 * The known solution always leaves room around both shells and unrelated ropes.
 */
function generateLegacyPuzzle(parsed: UntangleSeed): UntanglePuzzle {
  const random = randomGenerator(hash(parsed.seed)), count = levelNodeCount(parsed.level, "drag", "NEST1");
  const columns = Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / columns);
  const stepX = 720 / (columns - 1), stepY = 720 / (rows - 1);
  const solution: Point[] = Array.from({ length: count }, (_, i) => ({
    x: Math.round(140 + (i % columns) * stepX + (random() - .5) * stepX * .2),
    y: Math.round(140 + Math.floor(i / columns) * stepY + (random() - .5) * stepY * .2),
  }));
  let edges: Edge[] = [];
  const add = (a: number, b: number) => { edges.push([Math.min(a, b), Math.max(a, b)]); };
  for (let i = 0; i < count; i++) {
    if (i % columns < columns - 1 && i + 1 < count) add(i, i + 1);
    if (i + columns < count) add(i, i + columns);
    if (i % columns < columns - 1 && i + columns < count) {
      if (i + columns + 1 < count && random() < .5) add(i, i + columns + 1);
      else add(i + 1, i + columns);
    }
  }
  const targetEdges = count + Math.ceil(count * (.16 + .42 * (parsed.level - 1) / (LEVEL_COUNT - 1)));
  for (const edge of shuffled(edges, random)) {
    if (edges.length <= targetEdges) break;
    const candidate = edges.filter(item => item !== edge), degree = Array<number>(count).fill(0);
    for (const [a, b] of candidate) { degree[a]++; degree[b]++; }
    if (degree.every(value => value >= 2) && connected(count, candidate)) edges = candidate;
  }
  // Renumbering prevents stable node labels from disclosing the mesh embedding.
  const order = shuffled(Array.from({ length: count }, (_, i) => i), random);
  const inverse = Array<number>(count);
  order.forEach((oldIndex, newIndex) => { inverse[oldIndex] = newIndex; });
  const embedding = order.map(index => solution[index]);
  edges = edges.map(([a, b]) => [Math.min(inverse[a], inverse[b]), Math.max(inverse[a], inverse[b])] as Edge)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const ring = Array.from({ length: count }, (_, i) => {
    const [x, y] = RING[Math.floor(i * RING.length / count)];
    return { x: 500 + x, y: 500 + y };
  });
  const targetCrossings = Math.max(1, Math.floor(edges.length * (.12 + parsed.level * .015)));
  let initial: Point[] | undefined, bestCrossings = Infinity;
  for (let attempt = 0; attempt < 32; attempt++) {
    const candidate = shuffled(ring, random), crossings = analyzeBoard(candidate, edges).crossings;
    if (crossings >= targetCrossings && crossings < bestCrossings) { initial = candidate; bestCrossings = crossings; }
    if (bestCrossings === targetCrossings) break;
  }
  if (!initial) {
    // Bounded constructive fallback: two independent edges alternate on a convex ring.
    const first = edges[0], second = edges.find(([a, b]) => !first.includes(a) && !first.includes(b));
    if (!second) throw new Error("Nest graph has no independent edges");
    const ids = [first[0], second[0], first[1], second[1]];
    for (let i = 0; i < count; i++) if (!ids.includes(i)) ids.push(i);
    initial = Array<Point>(count);
    ids.forEach((id, index) => { initial![id] = ring[index]; });
  }
  return { version: "NEST1", mechanics: "drag", seed: parsed.seed, level: parsed.level, initial, solution: embedding, edges };
}

/** A certified lower bound: each vertex-disjoint crossing needs a different moved egg.
 * This deliberately stops at four witnesses; it is not an optimal-move solver.
 */
function crossingWitnesses(points: readonly Point[], edges: readonly Edge[], target = Math.min(4, Math.floor(points.length / 4))): [Edge, Edge][] {
  const analysis = analyzeBoard(points, edges), seen = new Set<number>();
  const candidates: { mask: number; pair: [Edge, Edge] }[] = [];
  for (const [i, j] of analysis.crossingPairs) {
    const nodes = [...edges[i], ...edges[j]];
    if (new Set(nodes).size !== 4) continue;
    const mask = nodes.reduce((bits, node) => bits | (1 << node), 0);
    if (!seen.has(mask)) { seen.add(mask); candidates.push({ mask, pair: [edges[i], edges[j]] }); }
  }
  const search = (start: number, occupied: number, remaining: number): [Edge, Edge][] | null => {
    if (!remaining) return [];
    for (let i = start; i <= candidates.length - remaining; i++) {
      if (candidates[i].mask & occupied) continue;
      const rest = search(i + 1, occupied | candidates[i].mask, remaining - 1);
      if (rest) return [candidates[i].pair, ...rest];
    }
    return null;
  };
  for (let count = target; count > 0; count--) {
    const found = search(0, 0, count);
    if (found) return found;
  }
  return [];
}

export function crossingMoveLowerBound(points: readonly Point[], edges: readonly Edge[]): number {
  return crossingWitnesses(points, edges).length;
}

function meshEmbedding(count: number, level: number, random: () => number): { solution: Point[]; edges: Edge[] } {
  const columns = Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / columns);
  const stepX = 720 / (columns - 1), stepY = 720 / (rows - 1);
  const solution = Array.from({ length: count }, (_, index) => ({
    x: Math.round(140 + index % columns * stepX + (random() - .5) * stepX * .2),
    y: Math.round(140 + Math.floor(index / columns) * stepY + (random() - .5) * stepY * .2),
  }));
  let edges: Edge[] = [];
  const add = (a: number, b: number) => edges.push([Math.min(a, b), Math.max(a, b)]);
  for (let i = 0; i < count; i++) {
    if (i % columns < columns - 1 && i + 1 < count) add(i, i + 1);
    if (i + columns < count) add(i, i + columns);
    if (i % columns < columns - 1 && i + columns < count) {
      if (i + columns + 1 < count && random() < .5) add(i, i + columns + 1);
      else add(i + 1, i + columns);
    }
  }
  const target = count + Math.ceil(count * (.45 + .35 * (level - 1) / (LEVEL_COUNT - 1)));
  // Preserve enough independent edges to construct the promised crossing witnesses.
  // Minimum degree two alone does not guarantee a perfect matching after thinning.
  const protectedMatching = new Set((edgeMatching(edges, Math.floor(count / 2)) ?? []).map(([a, b]) => `${a}:${b}`));
  for (const edge of shuffled(edges, random)) {
    if (edges.length <= target) break;
    if (protectedMatching.has(`${edge[0]}:${edge[1]}`)) continue;
    const candidate = edges.filter(item => item !== edge), degrees = Array<number>(count).fill(0);
    for (const [a, b] of candidate) { degrees[a]++; degrees[b]++; }
    if (degrees.every(degree => degree >= 2) && connected(count, candidate)) edges = candidate;
  }
  return { solution, edges };
}

/** Independent polygons are intentional: swapping never changes graph connectivity. */
function multipleFigures(count: number, level: number, random: () => number): { solution: Point[]; edges: Edge[] } {
  const components = count <= 16 ? 2 : 3;
  const centres = components === 2 ? [[275, 500], [725, 500]] : [[275, 280], [725, 280], [500, 750]];
  const solution: Point[] = [], edges: Edge[] = [];
  for (let component = 0; component < components; component++) {
    const size = Math.floor(count / components) + Number(component < count % components), offset = solution.length;
    const [cx, cy] = centres[component];
    for (let i = 0; i < size; i++) {
      const [x, y] = RING[Math.floor(i * RING.length / size)];
      solution.push({ x: Math.round(cx + x * 175 / 400), y: Math.round(cy + y * 175 / 400) });
      edges.push([offset + i, offset + (i + 1) % size]);
    }
    const pivot = Math.floor(random() * size);
    const diagonals = shuffled(Array.from({ length: size - 3 }, (_, i) => (pivot + i + 2) % size), random);
    for (const end of diagonals.slice(0, Math.min(diagonals.length, 1 + Math.floor(level / 8)))) edges.push([offset + pivot, offset + end]);
  }
  return { solution, edges };
}

function edgeMatching(edges: readonly Edge[], count: number, start = 0, occupied = 0): Edge[] | null {
  if (!count) return [];
  for (let i = start; i <= edges.length - count; i++) {
    const mask = (1 << edges[i][0]) | (1 << edges[i][1]);
    if (mask & occupied) continue;
    const tail = edgeMatching(edges, count - 1, i + 1, occupied | mask);
    if (tail) return [edges[i], ...tail];
  }
  return null;
}

function hasOneSwapWin(points: readonly Point[], edges: readonly Edge[]): boolean {
  for (let a = 0; a < points.length; a++) for (let b = a + 1; b < points.length; b++) {
    if (isSolved(swapNodes(points, a, b), edges)) return true;
  }
  return false;
}

function generateModernPuzzle(parsed: UntangleSeed): UntanglePuzzle {
  const random = randomGenerator(hash(parsed.seed)), count = levelNodeCount(parsed.level, parsed.mechanics, parsed.version);
  if (parsed.version === "KNOT4") {
    for (let attempt = 0; attempt < 8; attempt++) {
      const graph = figureEmbedding(count, parsed.level, random), order = shuffled(Array.from({ length: count }, (_, i) => i), random);
      const inverse = Array<number>(count); order.forEach((old, i) => { inverse[old] = i; });
      const puzzle: UntanglePuzzle = { seed: parsed.seed, version: parsed.version, mechanics: parsed.mechanics, level: parsed.level, initial: [], solution: order.map(i => graph.solution[i]), slots: graph.solution,
        edges: graph.edges.map(([a, b]) => [Math.min(inverse[a], inverse[b]), Math.max(inverse[a], inverse[b])] as Edge).sort((a, b) => a[0] - b[0] || a[1] - b[1]) };
      try { puzzle.initial = balancedStart(puzzle, random); return puzzle; }
      catch (error) { if (!(error instanceof Error) || error.message !== "Cannot calibrate clutch difficulty") throw error; }
    }
    throw new Error("Cannot generate a calibrated clutch");
  }
  const graph = parsed.version === "KNOT3" ? figureEmbedding(count, parsed.level, random)
    : parsed.mechanics === "swap" && parsed.level % 2 === 0
      ? multipleFigures(count, parsed.level, random) : meshEmbedding(count, parsed.level, random);
  const order = shuffled(Array.from({ length: count }, (_, i) => i), random), inverse = Array<number>(count);
  order.forEach((oldIndex, newIndex) => { inverse[oldIndex] = newIndex; });
  const solution = order.map(index => graph.solution[index]);
  const edges = graph.edges.map(([a, b]) => [Math.min(inverse[a], inverse[b]), Math.max(inverse[a], inverse[b])] as Edge)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const slots = parsed.mechanics === "swap" ? graph.solution.map(point => ({ ...point })) : Array.from({ length: count }, (_, i) => {
    const [x, y] = RING[Math.floor(i * RING.length / count)];
    return { x: 500 + x, y: 500 + y };
  });
  let witnesses = parsed.level <= 2 ? 2 : parsed.level <= 8 ? 3 : 4;
  // Odd-sized separate figures may not admit a perfect edge matching. Measure
  // the available witnesses instead of forcing triangles back into a grid.
  if (parsed.version === "KNOT3") while (witnesses > 1 && !edgeMatching(edges, witnesses * 2)) witnesses--;
  const targetCrossings = Math.ceil(edges.length * (.55 + parsed.level * .018));
  let initial: Point[] | undefined;
  for (let attempt = 0; attempt < 96; attempt++) {
    const candidate = shuffled(slots, random);
    if (analyzeBoard(candidate, edges).crossings < targetCrossings || crossingWitnesses(candidate, edges, witnesses).length < witnesses) continue;
    // Three independent crossings already exclude every two-egg swap solution.
    if (parsed.mechanics === "swap" && witnesses < 3 && hasOneSwapWin(candidate, edges)) continue;
    initial = candidate; break;
  }
  if (!initial) {
    // Construct enough independent crossings from a matching and crossed slot pairs.
    const matching = edgeMatching(edges, witnesses * 2);
    const allSlotEdges: Edge[] = [];
    for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) allSlotEdges.push([a, b]);
    const slotCrossings = crossingWitnesses(slots, allSlotEdges, witnesses);
    if (!matching || slotCrossings.length < witnesses) throw new Error("Cannot construct nest crossing witnesses");
    initial = Array<Point>(count);
    const usedSlots = new Set<number>();
    slotCrossings.forEach((pair, group) => pair.forEach((slotEdge, edge) => slotEdge.forEach((slot, endpoint) => {
      initial![matching[group * 2 + edge][endpoint]] = { ...slots[slot] }; usedSlots.add(slot);
    })));
    const remaining = shuffled(slots.map((point, index) => ({ point, index })).filter(({ index }) => !usedSlots.has(index)), random);
    for (let i = 0; i < count; i++) if (!initial[i]) initial[i] = { ...remaining.pop()!.point };
    if (parsed.mechanics === "swap" && witnesses < 3 && hasOneSwapWin(initial, edges)) {
      // The small opening graphs have few permutations: continue a bounded rejection search.
      for (let attempt = 0; attempt < 512; attempt++) {
        const candidate = shuffled(slots, random);
        if (crossingWitnesses(candidate, edges, witnesses).length === witnesses && !hasOneSwapWin(candidate, edges)) { initial = candidate; break; }
      }
      if (hasOneSwapWin(initial, edges)) throw new Error("Cannot construct a multi-swap nest");
    }
  }
  return { version: parsed.version, mechanics: parsed.mechanics, seed: parsed.seed, level: parsed.level,
    initial, solution, edges, ...(parsed.mechanics === "swap" ? { slots } : {}) };
}

/** Compact, authored lessons. The swap permutations have exact distances 1/2/3
 * from any legal layout, verified exhaustively in tests. Drag lessons only claim
 * a known 1/2/3-move route, since freely placed points can have other solutions.
 */
const TUTORIALS: { solution: Point[]; edges: Edge[]; displaced: [number, Point][]; permutation: number[] }[] = [
  {
    solution: [{ x: 250, y: 250 }, { x: 750, y: 250 }, { x: 750, y: 750 }, { x: 250, y: 750 }],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
    displaced: [[0, { x: 880, y: 650 }]],
    permutation: [3, 1, 2, 0],
  },
  {
    solution: [{ x: 180, y: 280 }, { x: 480, y: 280 }, { x: 480, y: 720 }, { x: 180, y: 720 }, { x: 800, y: 280 }, { x: 800, y: 720 }],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5]],
    displaced: [[0, { x: 716, y: 349 }], [4, { x: 191, y: 158 }]],
    permutation: [3, 1, 2, 4, 0, 5],
  },
  {
    solution: [{ x: 150, y: 250 }, { x: 420, y: 250 }, { x: 420, y: 750 }, { x: 150, y: 750 }, { x: 580, y: 250 }, { x: 850, y: 250 }, { x: 850, y: 750 }, { x: 580, y: 750 }],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4]],
    displaced: [[0, { x: 376, y: 895 }], [3, { x: 794, y: 273 }], [5, { x: 119, y: 109 }]],
    permutation: [0, 1, 7, 6, 5, 4, 3, 2],
  },
];

function generateTutorialPuzzle(parsed: UntangleSeed): UntanglePuzzle {
  const lesson = TUTORIALS[parsed.level - 1], random = randomGenerator(hash(parsed.seed));
  const turns = Math.floor(random() * 4), mirror = random() < .5;
  const transform = (point: Point): Point => {
    let x = mirror ? BOARD_SIZE - point.x : point.x, y = point.y;
    for (let turn = 0; turn < turns; turn++) [x, y] = [BOARD_SIZE - y, x];
    return { x, y };
  };
  const positions = lesson.solution.map(point => ({ ...point }));
  for (const [egg, point] of lesson.displaced) positions[egg] = { ...point };
  const initial = parsed.mechanics === "swap" ? lesson.permutation.map(index => lesson.solution[index]) : positions;
  const order = shuffled(lesson.solution.map((_, index) => index), random), inverse = Array<number>(order.length);
  order.forEach((oldIndex, newIndex) => { inverse[oldIndex] = newIndex; });
  const edges = lesson.edges.map(([a, b]) => [Math.min(inverse[a], inverse[b]), Math.max(inverse[a], inverse[b])] as Edge)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { version: parsed.version, mechanics: parsed.mechanics, seed: parsed.seed, level: parsed.level,
    initial: order.map(index => transform(initial[index])), solution: order.map(index => transform(lesson.solution[index])), edges,
    ...(parsed.mechanics === "swap" ? { slots: lesson.solution.map(transform) } : {}) };
}

const calibratedPuzzles = new Map<string, UntanglePuzzle>();
export function generatePuzzle(seed: string, level?: number): UntanglePuzzle {
  const parsed = parseSeed(seed);
  if (!parsed || (level !== undefined && level !== parsed.level)) throw new RangeError("Invalid nest seed or level");
  const cached = calibratedPuzzles.get(parsed.seed);
  if (cached) return structuredClone(cached);
  const puzzle = tutorialVersion(parsed.version) ? generateTutorialPuzzle(parsed) : parsed.version === "NEST1" ? generateLegacyPuzzle(parsed) : generateModernPuzzle(parsed);
  if (parsed.version === "KNOT4") {
    if (calibratedPuzzles.size >= 32) calibratedPuzzles.delete(calibratedPuzzles.keys().next().value!);
    calibratedPuzzles.set(parsed.seed, structuredClone(puzzle));
  }
  return puzzle;
}

export function swapNodes(points: readonly Point[], a: number, b: number): Point[] {
  if (![a, b].every(index => Number.isInteger(index) && index >= 0 && index < points.length)) throw new RangeError("Invalid egg index");
  const result = points.map(point => ({ ...point }));
  [result[a], result[b]] = [result[b], result[a]];
  return result;
}

export function isSlotPermutation(puzzle: UntanglePuzzle, positions: readonly Point[]): boolean {
  if (puzzle.mechanics !== "swap" || !puzzle.slots || !Array.isArray(positions) || positions.length !== puzzle.slots.length) return false;
  const remaining = new Set(puzzle.slots.map(point => `${point.x}:${point.y}`));
  if (remaining.size !== puzzle.slots.length) return false;
  for (const point of positions) if (!validPoint(point) || !remaining.delete(`${point.x}:${point.y}`)) return false;
  return remaining.size === 0;
}

/** Immediate wins, bounded two-move search, then a guaranteed-progress fallback. */
export function findSwapHint(puzzle: UntanglePuzzle, positions: readonly Point[]): [number, number] | null {
  if (!isSlotPermutation(puzzle, positions) || isSolved(positions, puzzle.edges)) return null;
  return chooseSwapHint(puzzle, positions);
}
