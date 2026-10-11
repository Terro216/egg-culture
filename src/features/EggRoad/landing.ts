import { MathUtils, Vector3 } from "three";
import { Ball } from "@dimforge/rapier3d-compat";
import type { RoadSimulation } from "./simulation.ts";
import { FLIGHT_LIMIT } from "./simulation.ts";
import { nearestRoadSample } from "./track.ts";

// The guide is an estimate, not a second physics simulation. Passing the egg's
// convex hull to every cast rebuilds that hull inside Rapier, up to 289 times
// per prediction. A small spherical probe keeps this optional aid inexpensive;
// the actual egg collider, spin and all gameplay contacts remain unchanged.
const probe = new Ball(0.9);
const PREDICTION_STEP = 0.08;

export function landingGuideEligible(sim: RoadSimulation) {
  return sim.phase === "running" && !sim.rollingOnRoad && sim.flightTime >= 0.75 && sim.body.linvel().y < -4;
}

/** Ordinary shell hops must not reveal the next contact. Once the drop is
 * large enough, its peak keeps the ring visible as the egg approaches it. */
export function predictLandingGuide(sim: RoadSimulation) {
  if (!landingGuideEligible(sim)) return null;
  const landing = predictLanding(sim);
  const height = landing ? sim.dropHeight + sim.position.y - landing.position.y : 0;
  return height >= 8 ? landing : null;
}

/** First-contact estimate only: future input and the impact itself can change it. */
export function predictLanding(sim: RoadSimulation) {
  const position = sim.position.clone();
  const velocity = new Vector3().copy(sim.body.linvel());
  const right = sim.steeringRight;
  // A just-ended contact may leave a forward drive force from the previous
  // step. Only lateral steering continues in the air.
  const lateral = MathUtils.clamp(new Vector3().copy(sim.body.userForce()).dot(right) / sim.body.mass(), -11, 11);
  const acceleration = right.clone().multiplyScalar(lateral).add(sim.world.gravity);
  const angularSpeed = new Vector3().copy(sim.body.angvel()).length();
  const horizon = Math.min(2.4, FLIGHT_LIMIT - sim.flightTime);
  for (let time = 0; time < horizon; time += PREDICTION_STEP) {
    const dt = Math.min(PREDICTION_STEP, horizon - time);
    velocity.addScaledVector(acceleration, dt).divideScalar(1 + sim.body.linearDamping() * dt);
    const hit = sim.world.castShape(position, sim.rotation, velocity, probe, 0, dt, true, undefined, undefined, sim.collider);
    if (hit) {
      const chunk = sim.roadColliders.get(hit.collider.handle);
      if (!chunk || velocity.dot(hit.normal1) >= 0) return null;
      const point = new Vector3().copy(hit.witness1);
      const sample = sim.track.samples[nearestRoadSample(sim.track, point, chunk.first, chunk.last)];
      if ((sim.track.loop ? sample.normal.dot(hit.normal1) : hit.normal1.y) < 0.45) return null;
      return { position: point, sample, seconds: time + hit.time_of_impact, uncertainty: Math.min(1.8, 0.5 + time * .25 + angularSpeed * .015) };
    }
    position.addScaledVector(velocity, dt);
  }
  return null;
}
