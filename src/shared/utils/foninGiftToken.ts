const encoder = new TextEncoder();

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const sign = async (payload: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
};

export const createFoninGiftToken = async (giftId: string, secret: string, ttlMs = 10 * 60 * 1000) => {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${giftId}.${expiresAt}`;
  const signature = await sign(payload, secret);

  return `${expiresAt}.${signature}`;
};

export const verifyFoninGiftToken = async (giftId: string, token: string, secret: string) => {
  const [expiresAtRaw, signature] = token.split(".");
  const expiresAt = Number(expiresAtRaw);

  if (!Number.isFinite(expiresAt) || !signature) return false;
  if (expiresAt < Date.now()) return false;

  const expectedSignature = await sign(`${giftId}.${expiresAt}`, secret);
  return expectedSignature === signature;
};
