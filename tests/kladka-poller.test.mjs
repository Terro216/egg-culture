import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { startPolling, errorCode } from "../scripts/kladka-poller.mjs";
import { pollerHealthy } from "../scripts/healthcheck.mjs";

const env = { KLADKA_BOT_TOKEN: "test-token", KLADKA_ADMIN_CHAT_ID: "1" };
const telegram = (result) => new Response(JSON.stringify({ ok: true, result }));

function harness(fetchImpl) {
  const controller = new AbortController();
  const sleeps = [], health = [], logs = [];
  return {
    controller, sleeps, health, logs,
    run: (overrides = {}) => startPolling({
      env, fetchImpl, signal: controller.signal, now: () => 1_000_000,
      saveHealth: async (state) => { health.push({ ...state }); },
      sleep: async (ms) => { sleeps.push(ms); },
      logger: { log: (s) => logs.push(s), warn: (s) => logs.push(s) },
      ...overrides,
    }),
  };
}

test("failed delivery retains its offset and prevents later batch acknowledgements", async () => {
  const offsets = [], deliveries = [];
  let poll = 0, secondAttempts = 0;
  const h = harness(async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.endsWith("/deleteWebhook")) {
      assert.equal(body.drop_pending_updates, false);
      return telegram(true);
    }
    if (url.endsWith("/getUpdates")) {
      offsets.push(body.offset);
      poll++;
      if (poll === 3) { h.controller.abort(); return telegram([]); }
      return telegram((poll === 1 ? [10, 11, 12] : [11, 12]).map(update_id => ({ update_id })));
    }
    deliveries.push(body.update_id);
    if (body.update_id === 11 && ++secondAttempts === 1) return new Response("unavailable", { status: 503 });
    return new Response("ok");
  });
  await h.run();
  assert.deepEqual(offsets, [0, 11, 13]);
  assert.deepEqual(deliveries, [10, 11, 11, 12]);
  assert.deepEqual(h.sleeps, [5000]);
  assert(h.health.some(s => s.deliveryBlockedSince === 1_000_000));
  assert.equal(h.health.at(-1).deliveryBlockedSince, null);
});

test("lost local response does not confirm a possibly committed update", async () => {
  const offsets = [];
  let deliveries = 0;
  const h = harness(async (url, init) => {
    if (url.endsWith("/deleteWebhook")) return telegram(true);
    if (url.endsWith("/getUpdates")) {
      offsets.push(JSON.parse(init.body).offset);
      if (offsets.length === 3) { h.controller.abort(); return telegram([]); }
      return telegram([{ update_id: 50 }]);
    }
    if (++deliveries === 1) throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
    return new Response("ok");
  });
  await h.run();
  assert.deepEqual(offsets, [0, 0, 51]);
  assert.equal(deliveries, 2);
});

test("transport errors back off with a cap and expose only error codes", async () => {
  let polls = 0;
  const h = harness(async (url) => {
    if (url.endsWith("/deleteWebhook")) return telegram(true);
    if (++polls === 7) { h.controller.abort(); return telegram([]); }
    throw new TypeError(`fetch failed ${url}`, { cause: { code: "UND_ERR_CONNECT_TIMEOUT", message: url } });
  });
  await h.run();
  assert.deepEqual(h.sleeps, [5000, 10000, 20000, 40000, 60000, 60000]);
  assert(h.logs.some(s => s.includes("UND_ERR_CONNECT_TIMEOUT")));
  assert(!h.logs.some(s => s.includes("test-token")));
});

test("Telegram rate limit retry_after is respected", async () => {
  let polls = 0;
  const h = harness(async (url) => {
    if (url.endsWith("/deleteWebhook")) return telegram(true);
    if (++polls === 2) { h.controller.abort(); return telegram([]); }
    return new Response(JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 120 } }), { status: 429 });
  });
  await h.run();
  assert.deepEqual(h.sleeps, [120000]);
});

test("competing poller 409 does not repeatedly remove an absent webhook", async () => {
  const calls = [];
  let polls = 0;
  const h = harness(async (url) => {
    const method = url.split("/").at(-1); calls.push(method);
    if (method === "deleteWebhook") return telegram(true);
    if (method === "getWebhookInfo") return telegram({ url: "" });
    if (++polls === 2) { h.controller.abort(); return telegram([]); }
    return new Response(JSON.stringify({ ok: false, error_code: 409 }), { status: 409 });
  });
  await h.run();
  assert.deepEqual(calls, ["deleteWebhook", "getUpdates", "getWebhookInfo", "getUpdates"]);
});

test("shutdown aborts retry sleep without another request", async () => {
  let calls = 0;
  const h = harness(async () => { calls++; throw new Error("offline"); });
  await h.run({ sleep: async () => { h.controller.abort(); throw new DOMException("aborted", "AbortError"); } });
  assert.equal(calls, 1);
});

test("disabled moderation writes health without contacting Telegram", async () => {
  const h = harness(async () => { assert.fail("network must not be used"); });
  await h.run({ env: {} });
  assert.equal(h.health[0].enabled, false);
  assert.equal(pollerHealthy(h.health[0]), true);
});

test("health rejects stale polls and sustained delivery failures", () => {
  const now = 1_000_000;
  const good = { enabled: true, lastPollSuccess: now - 1000, deliveryBlockedSince: null };
  assert.equal(pollerHealthy(good, now), true);
  assert.equal(pollerHealthy({ ...good, lastPollSuccess: now - 300_000 }, now), false);
  assert.equal(pollerHealthy({ ...good, deliveryBlockedSince: now - 300_000 }, now), false);
  assert.equal(pollerHealthy({ ...good, deliveryBlockedSince: now - 1000 }, now), true);
  assert.equal(pollerHealthy({ ...good, lastPollSuccess: now + 1 }, now), false);
  assert.equal(pollerHealthy({}, now), false);
});

test("diagnostics reject URL-like error codes", () => {
  assert.equal(errorCode({ cause: { code: "https://api.telegram.org/botSECRET" } }), "request_error");
});

test("empty optional webhook secret uses the API's token-derived fallback", async () => {
  let signature;
  const h = harness(async (url, init) => {
    if (url.endsWith("/deleteWebhook")) return telegram(true);
    if (url.endsWith("/getUpdates")) return telegram([{ update_id: 1 }]);
    signature = init.headers["x-telegram-bot-api-secret-token"];
    h.controller.abort();
    return new Response("ok");
  });
  await h.run({ env: { ...env, KLADKA_WEBHOOK_SECRET: "" } });
  assert.equal(signature, crypto.createHash("sha256")
    .update(`kladka-webhook:${env.KLADKA_BOT_TOKEN}`).digest("hex").slice(0, 32));
});
