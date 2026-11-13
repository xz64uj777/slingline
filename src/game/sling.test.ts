import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { placeSling } from "./sling.ts";

const geometry = new THREE.CylinderGeometry(0.026, 0.026, 1, 6, 1);

function endpoints(leg: THREE.Mesh) {
  leg.updateMatrixWorld(true);
  return {
    top: new THREE.Vector3(0, 0.5, 0).applyMatrix4(leg.matrixWorld),
    bottom: new THREE.Vector3(0, -0.5, 0).applyMatrix4(leg.matrixWorld),
  };
}

function assertClose(actual: THREE.Vector3, expected: THREE.Vector3, message: string) {
  for (const axis of ["x", "y", "z"] as const) {
    assert.ok(
      Math.abs(actual[axis] - expected[axis]) < 1e-6,
      `${message}: ${axis} ${actual[axis]} != ${expected[axis]}`,
    );
  }
}

describe("placeSling", () => {
  it("spans a diagonal leg from the hook apex to the load corner", () => {
    const apex = new THREE.Vector3(0.4, 5.6, -1.2);
    const corner = new THREE.Vector3(1.52, 1.05, -0.58);
    const leg = new THREE.Mesh(geometry);

    placeSling(leg, apex, corner);
    const { top, bottom } = endpoints(leg);

    assertClose(top, corner, "top follows the corner");
    assertClose(bottom, apex, "bottom follows the apex");
    assert.ok(Math.abs(leg.scale.y - apex.distanceTo(corner)) < 1e-6, "scaled to the leg length");
    assert.equal(leg.scale.x, 1);
    assert.equal(leg.scale.z, 1);
  });

  it("keeps a vertical leg finite and full length", () => {
    const apex = new THREE.Vector3(2, 6, 3);
    const corner = new THREE.Vector3(2, 3.4, 3);
    const leg = new THREE.Mesh(geometry);

    placeSling(leg, apex, corner);
    const { top, bottom } = endpoints(leg);

    assertClose(top, corner, "top follows the corner");
    assertClose(bottom, apex, "bottom follows the apex");
    assert.ok(Math.abs(leg.scale.y - 2.6) < 1e-6);
    assert.ok(leg.matrixWorld.elements.every(Number.isFinite));
  });

  it("collapses a zero-length leg without a zero scale", () => {
    const point = new THREE.Vector3(1, 2, 3);
    const leg = new THREE.Mesh(geometry);

    placeSling(leg, point, point.clone());

    assert.deepEqual([leg.scale.x, leg.scale.y, leg.scale.z], [1, 1, 1]);
    assertClose(leg.position, point, "sits on the collapsed point");
    assert.ok(leg.matrixWorld.elements.every(Number.isFinite));
  });
});
