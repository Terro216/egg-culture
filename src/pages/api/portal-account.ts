// Keep the existing, hardened account/session implementation and old API working.
// Both names address the same account, cookies, recovery codes and durable store.
export { GET, POST } from "./egg-road-account.ts";
export const prerender = false;
