import type { BoardAnalysis, Edge, Point } from "./types.ts";

export const BOARD_SIZE = 1000;
export const NODE_MIN_DISTANCE = 72;
export const ROPE_NODE_CLEARANCE = 32;
const EPSILON = 1e-7;

/** Stable node groups, independent of their current positions. */
export function graphComponents(count: number, edges: readonly Edge[]): number[][] {
  const adjacent: number[][] = Array.from({ length: count }, () => []);
  for (const [a, b] of edges) { adjacent[a].push(b); adjacent[b].push(a); }
  const seen = new Set<number>(), groups: number[][] = [];
  for (let node = 0; node < count; node++) {
    if (seen.has(node)) continue;
    const group = [node]; seen.add(node);
    for (let i = 0; i < group.length; i++) for (const next of adjacent[group[i]]) {
      if (!seen.has(next)) { seen.add(next); group.push(next); }
    }
    groups.push(group);
  }
  return groups;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function withinSegment(point: Point, a: Point, b: Point): boolean {
  return Math.abs(orientation(a, b, point)) <= EPSILON
    && point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON
    && point.y >= Math.min(a.y, b.y) - EPSILON && point.y <= Math.max(a.y, b.y) + EPSILON;
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = orientation(a, b, c), abD = orientation(a, b, d);
  const cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return withinSegment(c, a, b) || withinSegment(d, a, b) || withinSegment(a, c, d) || withinSegment(b, c, d);
}

export function distanceToSegmentSquared(point: Point, a: Point, b: Point): number {
  const x = b.x - a.x, y = b.y - a.y, length = x * x + y * y;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * x + (point.y - a.y) * y) / length)) : 0;
  return (point.x - a.x - t * x) ** 2 + (point.y - a.y - t * y) ** 2;
}

export function validPoint(point: Point): boolean {
  return Boolean(point) && typeof point.x === "number" && typeof point.y === "number"
    && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= BOARD_SIZE && point.y >= 0 && point.y <= BOARD_SIZE;
}

/** Shared endpoints are allowed; overlaps, T-junctions and hidden nodes are not. */
export function analyzeBoard(points: readonly Point[], edges: readonly Edge[]): BoardAnalysis {
  const crossingPairs: [number, number][] = [], overlappingNodes: [number, number][] = [];
  const crossedEdges = new Set<number>(), blockedNodes = new Set<number>();
  const invalidNodes: number[] = [], invalidEdges: number[] = [];
  for (let i = 0; i < points.length; i++) if (!validPoint(points[i])) invalidNodes.push(i);
  const seenEdges = new Set<string>();
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!Array.isArray(edge) || edge.length !== 2 || !edge.every(index => Number.isInteger(index) && index >= 0 && index < points.length)
      || edge[0] === edge[1]) { invalidEdges.push(i); continue; }
    const key = `${Math.min(...edge)}:${Math.max(...edge)}`;
    if (seenEdges.has(key)) invalidEdges.push(i);
    seenEdges.add(key);
  }
  if (invalidNodes.length === 0 && invalidEdges.length === 0) {
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      if ((points[i].x - points[j].x) ** 2 + (points[i].y - points[j].y) ** 2 < NODE_MIN_DISTANCE ** 2) overlappingNodes.push([i, j]);
    }
    for (let i = 0; i < edges.length; i++) {
      const [a, b] = edges[i];
      for (let node = 0; node < points.length; node++) {
        if (node !== a && node !== b && distanceToSegmentSquared(points[node], points[a], points[b]) < ROPE_NODE_CLEARANCE ** 2) {
          blockedNodes.add(node); crossedEdges.add(i);
        }
      }
      for (let j = i + 1; j < edges.length; j++) {
        const [c, d] = edges[j];
        const shared = a === c || a === d ? a : b === c || b === d ? b : -1;
        let intersects: boolean;
        if (shared >= 0) {
          const first = points[a === shared ? b : a], second = points[c === shared ? d : c], origin = points[shared];
          // Adjacent ropes may meet, but may not run over one another in the same direction.
          intersects = Math.abs(orientation(origin, first, second)) <= EPSILON
            && (first.x - origin.x) * (second.x - origin.x) + (first.y - origin.y) * (second.y - origin.y) > EPSILON;
        } else intersects = segmentsIntersect(points[a], points[b], points[c], points[d]);
        if (intersects) { crossingPairs.push([i, j]); crossedEdges.add(i); crossedEdges.add(j); }
      }
    }
  }
  return {
    crossings: crossingPairs.length, crossingPairs,
    crossedEdges: [...crossedEdges].sort((a, b) => a - b), overlappingNodes,
    blockedNodes: [...blockedNodes].sort((a, b) => a - b), invalidNodes, invalidEdges,
    solved: points.length >= 3 && edges.length >= 2 && !invalidNodes.length && !invalidEdges.length
      && !crossingPairs.length && !overlappingNodes.length && !blockedNodes.size,
  };
}

export function isSolved(points: readonly Point[], edges: readonly Edge[]): boolean {
  return analyzeBoard(points, edges).solved;
}

