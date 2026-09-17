import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const digestToken = (value: string) => createHash("sha256").update(value).digest("hex");
export const validPassword = (value: unknown): value is string => typeof value === "string" && [...value].length >= 15 && [...value].length <= 128 && !/\p{Cs}/u.test(value);
export const newSessionToken = () => randomBytes(32).toString("hex");
export function newRecoveryCode() { return randomBytes(20).toString("hex").toUpperCase().match(/.{4}/g)!.join("-"); }
export function recoveryDigest(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.replace(/[ -]/g, "").toUpperCase();
  return /^[0-9A-F]{40}$/.test(code) ? digestToken(code) : null;
}

export class PasswordBusyError extends Error {}
let active = 0;
async function derive(password: string, salt: string) {
  // Bound memory use even if requests arrive from many IPs at once.
  if (active >= 2) throw new PasswordBusyError();
  active++;
  try {
    return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64,
      { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key)));
  } finally { active--; }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-17-8-1$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string | null) {
  const match = /^scrypt-17-8-1\$([0-9a-f]{32})\$([0-9a-f]{128})$/.exec(stored ?? "");
  // Unknown names do the same expensive work and return the same login error.
  const actual = await derive(password, match?.[1] ?? "0".repeat(32));
  const expected = Buffer.from(match?.[2] ?? "0".repeat(128), "hex");
  return timingSafeEqual(actual, expected) && Boolean(match);
}
