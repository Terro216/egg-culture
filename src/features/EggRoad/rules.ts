/** Shared by the simulation, UI and input validation. No rendering dependencies. */
export const ROAD_RULES_VERSION = 3;
export type RoadVersion = 1 | 2 | 3;
export const GATE_SPACING = 18;
export const PHYSICS_STEP = 1 / 120;
export const FLIGHT_LIMIT = 4.2;
export const JUMP_SPEED = 6;
export const JUMP_RECHARGE_SECONDS = 6;
export const FINISH_MARGIN = 12;
export const CONTACT = {
  skin: 0.025, top: 0.15, shortcutAir: 0.3, dropAir: 0.4,
  hardLandingAir: 0.45, nearSeconds: 0.7, nearGap: 0.85,
  hopSeconds: 1.2, hopGap: 3, flightWarning: 0.35,
} as const;
export const scoreRules = (version: RoadVersion = 1) => version === 1
  ? { gate: 100, edge: 14, speed: 20, rhythm: 2, rhythmCap: 10, shortcut: 35, drop: 3 }
  : { gate: 100, edge: 10, speed: 14, rhythm: 2, rhythmCap: 4, shortcut: 100, drop: 5 };
