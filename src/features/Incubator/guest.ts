import { incubatorDay, validIncubatorState } from "./rules.ts";
import type { IncubatorState } from "./rules.ts";

export const GUEST_INCUBATOR_STORAGE_KEY = "egg_incubator_v1";
export const GUEST_INCUBATOR_EVENT = "egg:incubator";
export type GuestIncubator = {
  state: IncubatorState | null;
  storage: "saved" | "session" | "empty" | "unavailable" | "invalid";
};
let guestMemory: IncubatorState | null = null;
let unsaved = false;

/** Reading never repairs, resets or imports an egg. Both guest views use this cache. */
export function readGuestIncubator(today = incubatorDay()): GuestIncubator {
  let raw: string | null;
  try { raw = localStorage.getItem(GUEST_INCUBATOR_STORAGE_KEY); }
  catch { return { state: guestMemory, storage: guestMemory ? "session" : "unavailable" }; }
  // A quota failure must not replace a fresh egg with an older stored copy.
  if (unsaved && guestMemory) return { state: guestMemory, storage: "session" };
  if (!raw) {
    // A different tab may have imported or cleared a previously saved egg.
    guestMemory = null;
    return { state: null, storage: "empty" };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return { state: guestMemory, storage: "invalid" }; }
  if (!validIncubatorState(parsed, today)) return { state: null, storage: "invalid" };
  guestMemory = parsed;
  return { state: parsed, storage: "saved" };
}

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(GUEST_INCUBATOR_EVENT));
}

export function saveGuestIncubator(state: IncubatorState) {
  guestMemory = state;
  unsaved = true;
  try { localStorage.setItem(GUEST_INCUBATOR_STORAGE_KEY, JSON.stringify(state)); unsaved = false; }
  catch { /* Private browsing still keeps this visit's egg in memory. */ }
  announce();
}

/** Called only after the existing cloud import has succeeded. */
export function clearGuestIncubator() {
  guestMemory = null;
  unsaved = false;
  try { localStorage.removeItem(GUEST_INCUBATOR_STORAGE_KEY); }
  catch { /* An idempotent cloud import is safe to repeat. */ }
  announce();
}
