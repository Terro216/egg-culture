import { MathUtils, Quaternion, Vector3 } from "three";
import type { RoadSimulation } from "./simulation.ts";
import { FLIGHT_LIMIT } from "./simulation.ts";
import { nearestRoadSample } from "./track.ts";

/** First-contact estimate only: future input and the impact itself can change it. */
export function predictLanding(sim: RoadSimulation) {
  const position = sim.position.clone(), rotation = sim.rotation.clone();
  const velocity = new Vector3().copy(sim.body.linvel());
  const right = sim.track.samples[sim.sampleIndex].right;
  // A just-ended contact may leave a forward drive force from the previous
  // step. Only lateral steering continues in the air.
  const lateral = MathUtils.clamp(new Vector3().copy(sim.body.userForce()).dot(right) / sim.body.mass(), -11, 11);
  const acceleration = right.clone().multiplyScalar(lateral).add(sim.world.gravity);
  const spin = new Vector3().copy(sim.body.angvel()), angularSpeed = spin.length();
  if (angularSpeed) spin.divideScalar(angularSpeed);
  const turn = new Quaternion(), shape = sim.collider.shape;
  const horizon = Math.min(2.4, FLIGHT_LIMIT - sim.flightTime);
  for (let time = 0; time < horizon; time += 0.08) {
    const dt = Math.min(0.08, horizon - time);
    velocity.addScaledVector(acceleration, dt).divideScalar(1 + sim.body.linearDamping() * dt);
    const hit = sim.world.castShape(position, rotation, velocity, shape, 0, dt, true, undefined, undefined, sim.collider);
    if (hit) {
      const chunk = sim.roadColliders.get(hit.collider.handle);
      if (!chunk || hit.normal1.y < 0.45 || velocity.dot(hit.normal1) >= 0) return null;
      const point = new Vector3().copy(hit.witness1);
      const sample = sim.track.samples[nearestRoadSample(sim.track, point, chunk.first, chunk.last)];
      return { position: point, sample, seconds: time + hit.time_of_impact };
    }
    position.addScaledVector(velocity, dt);
    if (angularSpeed) rotation.premultiply(turn.setFromAxisAngle(spin, angularSpeed * dt));
  }
  return null;
}
