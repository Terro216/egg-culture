import { GreaterDepth, Mesh, MeshBasicMaterial } from "three";
import type { BufferGeometry } from "three";

/** The depth buffer selects only hidden shell pixels; no CPU road raycasts. */
export function createEggOcclusion(geometry: BufferGeometry) {
  const material = new MeshBasicMaterial({ color: 0xffd48b, transparent: true, opacity: .8,
    depthFunc: GreaterDepth, depthWrite: false, toneMapped: false, fog: false });
  const silhouette = new Mesh(geometry, material);
  silhouette.renderOrder = 20;
  return silhouette;
}
