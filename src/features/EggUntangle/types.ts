/** Board coordinates are independent of the displayed SVG size. */
export type Point = { x: number; y: number };
export type Edge = readonly [number, number];
export type PuzzleMechanics = "drag" | "swap";
export type PuzzleVersion = "NEST1" | "NEST2" | "NEST3" | "KNOT1" | "KNOT2" | "KNOT3" | "KNOT4";

export type UntangleSeed = {
  seed: string;
  level: number;
  code: string;
  version: PuzzleVersion;
  mechanics: PuzzleMechanics;
};

export type UntanglePuzzle = {
  version: PuzzleVersion;
  mechanics: PuzzleMechanics;
  seed: string;
  level: number;
  initial: Point[];
  /** One valid embedding for hints; other valid embeddings win as well. */
  solution: Point[];
  edges: Edge[];
  /** Hardmode permits only permutations of these exact fixed positions. */
  slots?: Point[];
};

export type BoardAnalysis = {
  crossings: number;
  crossingPairs: [number, number][];
  crossedEdges: number[];
  overlappingNodes: [number, number][];
  /** Nodes which cover an unrelated rope. */
  blockedNodes: number[];
  invalidNodes: number[];
  invalidEdges: number[];
  solved: boolean;
};
