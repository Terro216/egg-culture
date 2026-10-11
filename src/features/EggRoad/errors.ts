export type RoadFailure = "load" | "physics" | "track" | "graphics" | "context" | "runtime";
export class RoadEngineError extends Error {
  readonly code: RoadFailure;
  constructor(code: RoadFailure, cause?: unknown) { super(code, { cause }); this.code = code; }
}
