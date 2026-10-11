import { isAchievement } from "./model.ts";
import { activeRoadAccount } from "../EggRoad/storage.ts";
import type { AchievementId } from "./model.ts";
const remembered = new Map<string, AchievementId[]>();

export function activePortalName(): string | null {
  return activeRoadAccount();
}
export function portalStorageKey(key: string, name = activePortalName()) {
  return name ? `${key}:account:${encodeURIComponent(name.normalize("NFKC").toLowerCase())}` : key;
}
export function announceAchievements(ids: readonly AchievementId[], name = activePortalName()) {
  if (!ids.length) return;
  let previous: AchievementId[] = [];
  const key = portalStorageKey("egg_portal_achievements_v1", name);
  try { const value = JSON.parse(localStorage.getItem(key) ?? "[]"); if (Array.isArray(value)) previous = value.filter(isAchievement); } catch { /* Browser storage is optional. */ }
  previous = [...new Set([...previous, ...(remembered.get(key) ?? [])])];
  const fresh = [...new Set(ids)].filter(id => !previous.includes(id));
  if (!fresh.length) return;
  remembered.set(key, [...previous, ...fresh]);
  try { localStorage.setItem(key, JSON.stringify([...new Set([...previous, ...fresh])])); } catch { /* Keep the toast available. */ }
  if (typeof window !== "undefined" && name === activePortalName()) window.dispatchEvent(new CustomEvent("egg:achievements", { detail: fresh }));
}
