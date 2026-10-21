import type { Edge, Point } from "./types.ts";
import { analyzeBoard } from "./geometry.ts";
import { shuffled } from "./random.ts";

type Random = () => number;
type Figure = { points: Point[]; edges: Edge[]; radius: number };
type Disk = { x: number; y: number; radius: number };
const TAU = Math.PI * 2;
const BETWEEN_FIGURES = 96;
const SLOT_SPACING = 96;

/** Composition, contour and placement are independent seeded decisions. Nothing
 * depends on level parity; no global grid or prescribed ring arrangement exists.
 * The versioned caller owns scrambling and the fixed-slot victory rules.
 */
export function figureEmbedding(count: number, level: number, random: Random): { solution: Point[]; edges: Edge[] } {
  const minimum = Math.max(2, Math.ceil(count / 12));
  const maximum = Math.min(5, Math.floor(count / 3));
  const groups = minimum + Math.floor(random() * (maximum - minimum + 1));
  const sizes: number[] = [];
  let remaining = count;
  for (let i = 0; i < groups; i++) {
    const rest = groups - i - 1;
    const low = Math.max(3, remaining - rest * 12), high = Math.min(12, remaining - rest * 3);
    const size = low + Math.floor(random() * (high - low + 1));
    sizes.push(size); remaining -= size;
  }
  const figures = shuffled(sizes, random).map(size => makeFigure(size, level, random));
  const disks = packFigures(figures, random);
  const solution: Point[] = [], edges: Edge[] = [], membership: number[] = [];
  figures.forEach((figure, group) => {
    const offset = solution.length, centre = disks[group];
    solution.push(...figure.points.map(p => ({ x: Math.round(p.x + centre.x), y: Math.round(p.y + centre.y) })));
    edges.push(...figure.edges.map(([a, b]) => [a + offset, b + offset] as Edge));
    membership.push(...figure.points.map(() => group));
  });

  // Some clutches join a few figures. Most leave every contour independent.
  // A bridge is admitted only if it leaves the full solved drawing legal.
  const bridgeBudget = random() < .3 ? 1 + Math.floor(random() * (groups - 1)) : 0;
  const parent = figures.map((_, i) => i);
  const root = (group: number): number => parent[group] === group ? group : root(parent[group]);
  const candidates: { edge: Edge; distance: number }[] = [];
  for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
    if (membership[a] !== membership[b]) candidates.push({ edge: [a, b], distance: Math.hypot(solution[a].x - solution[b].x, solution[a].y - solution[b].y) });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  let bridges = 0;
  for (const { edge: [a, b] } of candidates) {
    if (bridges >= bridgeBudget) break;
    const first = root(membership[a]), second = root(membership[b]);
    if (first === second) continue;
    if (analyzeBoard(solution, [...edges, [a, b]]).solved) {
      edges.push([a, b]); parent[first] = second; bridges++;
    }
  }
  return { solution, edges };
}

function makeFigure(size: number, level: number, random: Random): Figure {
  const radius = Math.max(115, size * 17) * (1 + random() * .08);
  const cycle: Edge[] = Array.from({ length: size }, (_, i) => [i, (i + 1) % size]);
  // Triangles, squares/rectangles/diamonds, round rings, uneven and concave
  // contours. A square retains equal sides; random noise isn't its identity.
  const kind = Math.floor(random() * (size < 5 ? 3 : 4));
  for (let attempt = 0; attempt < 64; attempt++) {
    const rotation = random() * TAU;
    const aspect = kind === 0 ? 1 : .78 + random() * .22;
    const points = Array.from({ length: size }, (_, i) => {
      const irregular = kind >= 2 && size !== 4;
      const angle = i * TAU / size + (irregular ? (random() - .5) * TAU / size * .28 : 0);
      const radial = kind === 3 && size >= 6 ? (i % 2 ? .64 : 1) : irregular ? .82 + random() * .18 : 1;
      const x = Math.cos(angle) * radius * radial, y = Math.sin(angle) * radius * radial * aspect;
      return { x: Math.round(x * Math.cos(rotation) - y * Math.sin(rotation)), y: Math.round(x * Math.sin(rotation) + y * Math.cos(rotation)) };
    });
    // Geometry checks use board coordinates, while the packer needs local ones.
    const translated = points.map(p => ({ x: p.x + 500, y: p.y + 500 }));
    if (!analyzeBoard(translated, cycle).solved || points.some((a, i) => points.some((b, j) => i < j && Math.hypot(a.x - b.x, a.y - b.y) < SLOT_SPACING))) continue;
    const edges = [...cycle];
    const diagonals: Edge[] = [];
    for (let a = 0; a < size; a++) for (let b = a + 2; b < size; b++) if (a !== 0 || b !== size - 1) diagonals.push([a, b]);
    const budget = random() < .5 ? 0 : Math.min(size - 3, 1 + Math.floor(level / 10));
    for (const edge of shuffled(diagonals, random)) {
      if (edges.length >= size + budget) break;
      if (analyzeBoard(translated, [...edges, edge]).solved) edges.push(edge);
    }
    // Rounding can move a vertex by <1 unit beyond the nominal disk.
    return { points, edges, radius: radius + 1 };
  }
  // A thin concave contour can run out of clearance at high vertex counts.
  // Fall back to a rotated regular polygon of the SAME size, never a new board.
  const rotation = random() * TAU;
  return { radius: radius + 1, edges: cycle, points: Array.from({ length: size }, (_, i) => ({
    x: Math.round(Math.cos(rotation + i * TAU / size) * radius),
    y: Math.round(Math.sin(rotation + i * TAU / size) * radius),
  })) };
}

function packFigures(figures: Figure[], random: Random): Disk[] {
  const order = figures.map((_, i) => i).sort((a, b) => figures[b].radius - figures[a].radius);
  const hulls = figures.map(figure => convexHull(figure.points));
  const separatingAxes = hulls.map((first, a) => hulls.map((second, b) => {
    if (a === b) return [];
    return [first, second].flatMap(hull => hull.map((point, i) => {
      const next = hull[(i + 1) % hull.length], length = Math.hypot(next.x - point.x, next.y - point.y);
      const x = (point.y - next.y) / length, y = (next.x - point.x) / length;
      const pa = first.map(p => p.x * x + p.y * y), pb = second.map(p => p.x * x + p.y * y);
      return { x, y, amin: Math.min(...pa), amax: Math.max(...pa), bmin: Math.min(...pb), bmax: Math.max(...pb) };
    }));
  }));
  const separated = (a: Disk, ai: number, b: Disk, bi: number) => {
    if (Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius + BETWEEN_FIGURES) return true;
    // Convex hull separation leaves air around the actual shapes. Reserving
    // whole circles wastes the corners of triangles and can reject legal packs.
    return separatingAxes[ai][bi].some(axis => {
      const offset = (a.x - b.x) * axis.x + (a.y - b.y) * axis.y;
      return axis.amin + offset - axis.bmax >= BETWEEN_FIGURES || axis.bmin - axis.amax - offset >= BETWEEN_FIGURES;
    });
  };
  for (let attempt = 0; attempt < 256; attempt++) {
    const placed: (Disk & { index: number })[] = [], result: Disk[] = [];
    for (const index of order) {
      const radius = figures[index].radius, margin = 56 + radius;
      let best: Disk | undefined, bestScore = -Infinity;
      for (let sample = 0; sample < 120; sample++) {
        const candidate = { x: margin + random() * (1000 - margin * 2), y: margin + random() * (1000 - margin * 2), radius };
        const gap = Math.min(...placed.map(other => Math.hypot(candidate.x - other.x, candidate.y - other.y) - radius - other.radius));
        if (!placed.every(other => separated(candidate, index, other, other.index))) continue;
        // Pick among well-spaced positions instead of converging on one layout.
        const score = placed.length ? Math.min(gap, 180) + random() * 120 : random();
        if (score > bestScore) { best = candidate; bestScore = score; }
      }
      if (!best) break;
      placed.push({ ...best, index }); result[index] = best;
    }
    if (placed.length === figures.length) return result;
  }
  throw new Error("Cannot pack clutch figures with safe spacing");
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (list: Point[]) => {
    const hull: Point[] = [];
    for (const p of list) {
      while (hull.length >= 2) {
        const a = hull[hull.length - 2], b = hull[hull.length - 1];
        if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0) break;
        hull.pop();
      }
      hull.push(p);
    }
    return hull.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
