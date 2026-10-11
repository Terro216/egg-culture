/** Bound legacy form/JSON endpoints before their parsers allocate the full body. */
export class RequestBodyError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

const attempts = new Map<string, { count: number; until: number }>();
export function allowRequestAttempt(key: string, limit = 20, windowMs = 60000) {
  const now = Date.now();
  for (const [id, item] of attempts) if (item.until <= now) attempts.delete(id);
  let item = attempts.get(key);
  if (!item) {
    if (attempts.size >= 10000) return false;
    attempts.set(key, item = { count: 0, until: now + windowMs });
  }
  return ++item.count <= limit;
}

let reading = 0;
export async function readLimitedBody(request: Request, maximum: number, timeoutMs = 15000): Promise<Uint8Array> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new RequestBodyError(413, "too_large");
  if (reading >= 4) throw new RequestBodyError(503, "busy");
  if (!request.body) throw new RequestBodyError(400, "invalid_body");
  reading++;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RequestBodyError(408, "timeout")), timeoutMs); });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await Promise.race([reader.read(), timeout]);
      if (part.done) break;
      size += part.value.length;
      if (size > maximum) throw new RequestBodyError(413, "too_large");
      chunks.push(part.value);
    }
    return new Uint8Array(Buffer.concat(chunks, size));
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error instanceof RequestBodyError ? error : new RequestBodyError(400, "invalid_body");
  } finally {
    clearTimeout(timer!); reader.releaseLock(); reading--;
  }
}

export async function readJsonObject(request: Request, maximum = 8192): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new RequestBodyError(415, "content_type");
  const bytes = await readLimitedBody(request, maximum);
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object");
    return value;
  } catch { throw new RequestBodyError(400, "invalid_body"); }
}
