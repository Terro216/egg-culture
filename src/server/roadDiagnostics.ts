/** Operational context without player names, credentials or submitted payloads. */
export function reportRoadFailure(operation: string, error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
  console.error("[egg-road]", { operation, type: error instanceof Error ? error.name : "unknown", code });
}
