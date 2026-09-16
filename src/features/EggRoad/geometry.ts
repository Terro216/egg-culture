import { SphereGeometry } from "three";
import type { BufferAttribute } from "three";

/** One profile for both the visible shell and the actual convex rigid body. */
export function createEggGeometry(widthSegments = 32, heightSegments = 24) {
  const geometry = new SphereGeometry(1, widthSegments, heightSegments);
  const positions = geometry.getAttribute("position") as BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const radius = 0.73 * (1 - 0.22 * y);
    positions.setXYZ(i, positions.getX(i) * radius, y * 1.12, positions.getZ(i) * radius);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** The collider uses every visible vertex, including the narrow tip. */
export function createEggHull() {
  const geometry = createEggGeometry();
  const points = new Float32Array(geometry.getAttribute("position").array);
  geometry.dispose();
  return points;
}
