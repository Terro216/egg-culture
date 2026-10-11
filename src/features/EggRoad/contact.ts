import { CONTACT } from "./rules.ts";

/** Contact grace describes shell hops; it never awards distance or gates. */
export function classifyRoadAir(above: boolean, gap: number, airTime: number, jumping: boolean) {
  return {
    nearRoad: !jumping && above && airTime < CONTACT.nearSeconds && gap < CONTACT.nearGap,
    ordinaryHop: above && airTime < CONTACT.hopSeconds && gap < CONTACT.hopGap,
  };
}
