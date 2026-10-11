import { completeInitiation, portalState, refreshPortal, settledPortal, portalIdentityReady } from "./client.ts";
import type { PortalState } from "./client.ts";

let guest = false;
export function guestInitiated() {
  if (guest) return true;
  try { if (localStorage.getItem("egg_adept") === "true") return true; } catch { /* Cookie may still be available. */ }
  try { return document.cookie.split("; ").includes("egg_guest_initiated=1"); } catch { return false; }
}
export function clearGuestInitiation() {
  guest = false;
  try { localStorage.removeItem("egg_adept"); } catch { /* Browser storage is optional. */ }
  try { document.cookie = "egg_guest_initiated=; Max-Age=0; Path=/; SameSite=Lax"; } catch { /* Browser storage is optional. */ }
}
export function isInitiated(state: PortalState = portalState()) {
  if (!portalIdentityReady(state)) return false;
  if (state.account?.registered) return Boolean(state.profile?.initiated);
  return Boolean(state.account && !state.failed && guestInitiated());
}
export async function resolveInitiation() {
  await refreshPortal();
  const state = await settledPortal();
  if (!state.account || state.failed) throw new Error("unavailable");
  return isInitiated(state);
}
export async function recordInitiation(answers: number[]) {
  const before = (await settledPortal()).account;
  await completeInitiation(answers);
  if (before?.name !== portalState().account?.name || before?.registered !== portalState().account?.registered) throw new Error("account_changed");
  if (portalState().account?.registered) return;
  guest = true;
  try { document.cookie = "egg_guest_initiated=1; Path=/; SameSite=Lax"; } catch { /* Local storage may still be available. */ }
  try { localStorage.setItem("egg_adept", "true"); } catch { /* Current page remains usable. */ }
  // The flag is for a guest only; an account always reads its own cloud status.
  window.dispatchEvent(new Event("egg:initiation"));
}

/** An unavailable account is not a failed Initiation. Keep the destination and offer retry. */
export function runInitiationGate(decide: (passed: boolean) => void) {
  const run = async () => {
    document.getElementById("initiation-connection")?.remove();
    try { decide(await resolveInitiation()); }
    catch {
      const ru = document.documentElement.lang === "ru";
      const notice = document.createElement("p"); notice.id = "initiation-connection"; notice.setAttribute("role", "alert");
      notice.textContent = ru ? "Не удалось проверить Инициацию в профиле. " : "Could not check your Initiation. ";
      const retry = document.createElement("button"); retry.type = "button"; retry.textContent = ru ? "Повторить" : "Retry";
      retry.addEventListener("click", () => { void run(); }); notice.append(retry);
      (document.querySelector("main") ?? document.body).prepend(notice);
    }
  };
  void run();
}
