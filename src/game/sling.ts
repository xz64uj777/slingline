import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3();

/**
 * Stretch a unit-height, origin-centred cylinder between two points.
 *
 * Slings are meshes rather than line primitives: a 1 px line aliases badly and
 * fades out with distance, while a cylinder keeps a real silhouette.
 */
export function placeSling(mesh: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3) {
  dir.subVectors(end, start);
  const length = dir.length();
  mesh.position.set(
    (start.x + end.x) * 0.5,
    (start.y + end.y) * 0.5,
    (start.z + end.z) * 0.5,
  );
  if (length < 1e-4) {
    // A collapsed leg still needs a finite matrix; zero scale would poison it.
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    return;
  }
  mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(length));
  mesh.scale.set(1, length, 1);
}
