type Options = {
  owner: string;
  currentOwner: () => string | null;
  onUnlock: () => void;
  onAccountMismatch: () => void | Promise<void>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** One page/account owns its heartbeat lifecycle; later responses cannot award a new owner. */
export function createManifestoTracker(options: Options) {
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  let disposed = false, completed = false, busy = false, pausePending = false, desiredActive = false, visited = false;
  let current: AbortController | null = null;
  const isCurrent = () => !disposed && options.currentOwner() === options.owner;
  async function send(active: boolean, abort: AbortController) {
    const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? 10000);
    try {
      const response = await fetchImpl("/api/manifesto-progress", { method: "POST", credentials: "same-origin", keepalive: !active,
        signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active, expectedName: options.owner }) });
      const progress = response.ok ? await response.json() as { elapsed: number; unlocked: boolean } : null;
      return { status: response.status, ok: response.ok, progress };
    } finally { clearTimeout(timer); }
  }
  async function visit(active: boolean): Promise<void> {
    if (!isCurrent() || completed) return;
    desiredActive = active;
    if (busy) { if (!active) pausePending = true; return; }
    busy = true; visited = true;
    try {
      while (isCurrent() && !completed) {
        // Preserve a blur even if focus returns before the previous request finishes:
        // the server must reset its continuous-reading interval, then resume promptly.
        const sendingActive = pausePending ? false : desiredActive;
        pausePending = false;
        const abort = new AbortController(); current = abort;
        try {
          const response = await send(sendingActive, abort);
          if (!isCurrent()) return;
          if (!abort.signal.aborted) {
            if (response.status === 401 || response.status === 409) { await options.onAccountMismatch(); return; }
            const progress = response.progress;
            if (response.ok && progress) {
              if (progress.unlocked === true) options.onUnlock();
              if (Number.isFinite(progress.elapsed) && progress.elapsed >= 240000) completed = true;
            }
          }
        } catch { /* A later heartbeat retries; a transient failure never completes an account. */ }
        finally { if (current === abort) current = null; }
        if (!pausePending && desiredActive === sendingActive) break;
      }
    } finally { busy = false; }
  }
  return {
    visit,
    async dispose() {
      if (disposed) return;
      disposed = true; current?.abort();
      // The old account must not send a cleanup heartbeat with a new account's cookie.
      if (!visited || completed || options.currentOwner() !== options.owner) return;
      try { await send(false, new AbortController()); } catch { /* keepalive is best effort on page exit */ }
    },
  };
}
