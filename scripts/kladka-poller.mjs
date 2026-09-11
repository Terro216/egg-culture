import crypto from "node:crypto";
import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

// Telegram retains unconfirmed updates for at most 24 hours. Keep the offset at
// the first undelivered update, including across a failed batch. The API's
// setPostStatus is idempotent, so retrying a delivery is safe.
const LONG_POLL_SECONDS = 25;
const RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 60_000;
export const HEALTH_FILE = "/tmp/kladka-poller-health.json";

export function errorCode(error) {
  // Messages can contain the bot URL; only log transport/error codes.
  const code = error?.cause?.code ?? error?.code ?? error?.name;
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(code ?? "") ? code : "request_error";
}

async function writeHealth(state) {
  const pending = `${HEALTH_FILE}.tmp`;
  await fs.writeFile(pending, JSON.stringify(state), { mode: 0o600 });
  await fs.rename(pending, HEALTH_FILE);
}

export async function startPolling({
  env = process.env,
  fetchImpl = fetch,
  sleep = (ms, signal) => delay(ms, undefined, { signal }),
  saveHealth = writeHealth,
  now = Date.now,
  logger = console,
  signal = new AbortController().signal,
} = {}) {
  const token = env.KLADKA_BOT_TOKEN;
  const enabled = Boolean(token && env.KLADKA_ADMIN_CHAT_ID);
  const state = { enabled, lastPollSuccess: null, deliveryBlockedSince: null };
  await saveHealth(state);
  if (!enabled) {
    logger.log("[kladka-poller] бот не настроен — модерация выключена");
    return;
  }
  const endpoint = env.KLADKA_CALLBACK_URL ??
    `http://127.0.0.1:${env.PORT ?? 4321}/api/kladka-telegram`;
  const secret = env.KLADKA_WEBHOOK_SECRET || crypto
    .createHash("sha256").update(`kladka-webhook:${token}`).digest("hex").slice(0, 32);

  async function api(method, body = {}) {
    const timeout = method === "getUpdates" ? (LONG_POLL_SECONDS + 10) * 1_000 : 15_000;
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) {
      const error = new Error("Telegram API request failed");
      error.code = `HTTP_${Number(data?.error_code ?? response.status) || 0}`;
      error.status = Number(data?.error_code ?? response.status);
      error.retryAfter = Number(data?.parameters?.retry_after) || 0;
      throw error;
    }
    return data.result;
  }

  let offset = 0;
  let failures = 0;
  let webhookCleared = false;
  logger.log("[kladka-poller] запущен");
  while (!signal.aborted) {
    let retryAfterMs = 0;
    try {
      if (!webhookCleared) {
        await api("deleteWebhook", { drop_pending_updates: false });
        webhookCleared = true;
      }
      const updates = await api("getUpdates", {
        offset, timeout: LONG_POLL_SECONDS, allowed_updates: ["callback_query"],
      });
      if (!Array.isArray(updates)) throw new TypeError("Invalid getUpdates result");
      state.lastPollSuccess = now();
      await saveHealth(state);
      // One ordered attempt per cycle. A failed delivery blocks this update
      // and all later updates instead of acknowledging them prematurely.
      for (const update of updates) {
        if (!Number.isSafeInteger(update.update_id) || update.update_id < 0) {
          throw new TypeError("Invalid update id");
        }
        try {
          const response = await fetchImpl(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-telegram-bot-api-secret-token": secret,
            },
            body: JSON.stringify(update),
            signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
          });
          await response.arrayBuffer();
          if (!response.ok) {
            const error = new Error("Local delivery failed");
            error.code = `LOCAL_HTTP_${response.status}`;
            throw error;
          }
        } catch (error) {
          state.deliveryBlockedSince ??= now();
          await saveHealth(state);
          throw error;
        }
        offset = update.update_id + 1;
        state.deliveryBlockedSince = null;
        await saveHealth(state);
      }
      if (failures) logger.log("[kladka-poller] опрос и доставка восстановились");
      failures = 0;
    } catch (error) {
      if (signal.aborted) break;
      failures += 1;
      retryAfterMs = Math.max(0, error.retryAfter || 0) * 1_000;
      logger.warn(`[kladka-poller] ${errorCode(error)}; последовательных сбоев: ${failures}`);
      if (error.status === 409) {
        // 409 can also mean another poller is active. Only remove an actual
        // webhook; don't repeatedly deleteWebhook on competing getUpdates.
        try {
          const info = await api("getWebhookInfo");
          if (info?.url) webhookCleared = false;
        } catch (probeError) {
          if (!signal.aborted) logger.warn(`[kladka-poller] webhook probe: ${errorCode(probeError)}`);
        }
      }
    }
    if (failures && !signal.aborted) {
      const backoff = Math.min(MAX_RETRY_DELAY_MS, RETRY_DELAY_MS * 2 ** Math.min(failures - 1, 4));
      try {
        await sleep(Math.max(backoff, retryAfterMs), signal);
      } catch (error) {
        if (!signal.aborted) throw error;
      }
    }
  }
}
