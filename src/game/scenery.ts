import * as THREE from "three";

/**
 * Static job-site dressing. Props sit in the corners, on the high-rise, and
 * outside the fence so the hook, the loads, the set rings, and the lowboy
 * pad stay in the open. Shared boxes and instances keep the draw count small
 * enough for a phone.
 */
export type SiteLook = {
  applyNight: (amount: number) => void;
};

type Lights = {
  renderer: THREE.WebGLRenderer;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  lampA: THREE.PointLight;
  lampB: THREE.PointLight;
  fog: THREE.FogExp2;
  ground: THREE.MeshStandardMaterial;
};

const CITY: readonly [number, number, number, number, number][] = [
  [-48, -62, 12, 9, 16],
  [-30, -66, 14, 10, 26],
  [-10, -60, 10, 8, 12],
  [8, -68, 16, 11, 32],
  [28, -62, 9, 9, 18],
  [46, -66, 12, 10, 22],
  [62, -16, 8, 14, 20],
  [64, 14, 10, 12, 14],
  [58, 36, 11, 9, 28],
  [-64, -8, 9, 16, 18],
  [-66, 22, 10, 12, 24],
  [-56, 44, 14, 8, 13],
  [16, 66, 18, 10, 30],
  [-12, 68, 12, 9, 16],
  [42, 64, 11, 11, 21],
];

export function dressSite(scene: THREE.Scene, lights: Lights): SiteLook {
  const dirt = new THREE.MeshStandardMaterial({ color: 0x8d7b62, roughness: 0.96, metalness: 0 });
  const gravel = new THREE.MeshStandardMaterial({ color: 0x6e675c, roughness: 0.94, metalness: 0.02 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3a424c, roughness: 0.92, metalness: 0.04 });
  const paint = new THREE.MeshStandardMaterial({ color: 0xe3a23a, roughness: 0.6, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c3238, roughness: 0.7, metalness: 0.35 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb7c0c8, roughness: 0.45, metalness: 0.45 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.75, metalness: 0.2 });
  const cabMat = new THREE.MeshStandardMaterial({ color: 0xc4492c, roughness: 0.55, metalness: 0.15 });
  const mixerMat = new THREE.MeshStandardMaterial({ color: 0xd7dee6, roughness: 0.5, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1c3148,
    emissive: 0xf2e2b0,
    emissiveIntensity: 0.05,
    roughness: 0.25,
    metalness: 0.1,
  });
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xe07a2f, roughness: 0.7 });
  const cityMat = new THREE.MeshStandardMaterial({ color: 0x8e96a0, roughness: 0.82, metalness: 0.04 });

  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  const coneGeo = new THREE.ConeGeometry(0.28, 0.7, 7);
  const dummy = new THREE.Object3D();

  const skirt = new THREE.Mesh(new THREE.RingGeometry(50, 130, 28), dirt);
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = 0.005;
  scene.add(skirt);

  const laydown = new THREE.Mesh(box, gravel);
  laydown.scale.set(16, 0.06, 18);
  laydown.position.set(-38, 0.04, -30);
  const bay = new THREE.Mesh(box, asphalt);
  bay.scale.set(20, 0.05, 16);
  bay.position.set(4, 0.035, 10);
  scene.add(laydown, bay);

  for (const [x, z, sx, sz] of [
    [4, 17.2, 16, 0.16],
    [4, 2.8, 16, 0.16],
    [12.2, 10, 0.16, 14],
    [-4.2, 10, 0.16, 14],
  ] as const) {
    const stripe = new THREE.Mesh(box, paint);
    stripe.scale.set(sx, 0.02, sz);
    stripe.position.set(x, 0.06, z);
    scene.add(stripe);
  }
  for (let x = -36; x <= 36; x += 8) {
    if (Math.abs(x + 8) < 6) continue;
    const dash = new THREE.Mesh(box, paint);
    dash.scale.set(2.4, 0.02, 0.16);
    dash.position.set(x, 0.055, 2);
    scene.add(dash);
  }

  const city = new THREE.InstancedMesh(box, cityMat, CITY.length);
  const caps = new THREE.InstancedMesh(box, dark, CITY.length);
  const windows = new THREE.InstancedMesh(box, glass, CITY.length);
  CITY.forEach(([x, z, sx, sz, sy], i) => {
    dummy.position.set(x, sy / 2, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    city.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, sy - 0.35, z);
    dummy.scale.set(sx * 1.06, 0.7, sz * 1.06);
    dummy.updateMatrix();
    caps.setMatrixAt(i, dummy.matrix);
    const face = Math.atan2(-x, -z);
    dummy.position.set(x + Math.sin(face) * (sx * 0.5 + 0.08), sy * 0.58, z + Math.cos(face) * (sz * 0.5 + 0.08));
    dummy.scale.set(sx * 0.55, sy * 0.22, 0.12);
    dummy.rotation.set(0, face, 0);
    dummy.updateMatrix();
    windows.setMatrixAt(i, dummy.matrix);
  });
  city.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  windows.instanceMatrix.needsUpdate = true;
  scene.add(city, caps, windows);

  const postCount = 40;
  const posts = new THREE.InstancedMesh(box, dark, postCount);
  let post = 0;
  for (const edge of [-47.5, 47.5]) {
    for (let x = -44; x <= 44; x += 4) {
      if (Math.abs(x + 8) < 5 || post >= postCount) continue;
      dummy.position.set(x, 0.8, edge);
      dummy.scale.set(0.16, 1.6, 0.16);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      posts.setMatrixAt(post, dummy.matrix);
      post += 1;
    }
  }
  posts.count = post;
  posts.instanceMatrix.needsUpdate = true;
  scene.add(posts);
  for (const edge of [-47.5, 47.5]) {
    for (const [x, len] of [
      [-26, 32],
      [18, 48],
    ] as const) {
      const rail = new THREE.Mesh(box, paint);
      rail.scale.set(len, 0.08, 0.08);
      rail.position.set(x, 1.15, edge);
      scene.add(rail);
    }
  }

  const gate = new THREE.Group();
  gate.position.set(-46.5, 0, 2);
  const gatePostL = new THREE.Mesh(box, dark);
  const gatePostR = new THREE.Mesh(box, dark);
  gatePostL.scale.set(0.28, 3.2, 0.28);
  gatePostR.scale.set(0.28, 3.2, 0.28);
  gatePostL.position.set(0, 1.6, -3.6);
  gatePostR.position.set(0, 1.6, 3.6);
  const gateBar = new THREE.Mesh(box, paint);
  gateBar.scale.set(0.12, 0.16, 7.4);
  gateBar.position.set(0, 2.9, 0);
  gate.add(gatePostL, gatePostR, gateBar);
  scene.add(gate);

  addBeams(scene, box, steel, -38, -30);
  addSpools(scene, cyl, rust, -34, -36);
  addPlates(scene, box, steel, 28.6, 13.4);
  addPipeRack(scene, box, cyl, steel, rust, 25, -25);
  addGeneratorBay(scene, box, cyl, steel, dark, paint, -15, 21);
  addPanelBed(scene, box, steel, paint, -34, -14);
  addTruck(scene, box, cyl, cabMat, dark, steel, 38, 40, 0.4);
  addMixer(scene, box, cyl, mixerMat, dark, 22, -42, 0.8);

  const coneCount = 6;
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, coneCount);
  let cone = 0;
  for (let i = 0; i < 8 && cone < coneCount; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const oz = Math.cos(a) * 10;
    if (oz < -3) continue;
    dummy.position.set(4 + Math.sin(a) * 10, 0.35, 10 + oz);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    cones.setMatrixAt(cone, dummy.matrix);
    cone += 1;
  }
  cones.count = cone;
  cones.instanceMatrix.needsUpdate = true;
  scene.add(cones);

  const towerA = lightTower(box, dark, paint, -27.2, -24.5);
  const towerB = lightTower(box, dark, paint, 25.2, 16.2);
  scene.add(towerA, towerB);
  const floodA = new THREE.PointLight(0xffe1a8, 6, 28, 2);
  floodA.position.set(-27.2, 6.2, -24.5);
  const floodB = new THREE.PointLight(0xffe1a8, 6, 26, 2);
  floodB.position.set(25.2, 6.2, 16.2);
  const riseLamp = new THREE.PointLight(0xfff1d0, 4, 22, 2);
  riseLamp.position.set(34, 8, -26);
  scene.add(floodA, floodB, riseLamp);

  dressRise(scene, box, steel, paint, dark);

  const moonMat = new THREE.SpriteMaterial({ color: 0xf4efe4, transparent: true, opacity: 0 });
  const moon = new THREE.Sprite(moonMat);
  moon.position.set(-18, 52, -36);
  moon.scale.set(7, 7, 1);
  scene.add(moon);

  const daySky = new THREE.Color(0xd7e3ec);
  const nightSky = new THREE.Color(0x101820);
  const dayHemi = new THREE.Color(0xf2f7fb);
  const nightHemi = new THREE.Color(0x24344a);
  const dayGround = new THREE.Color(0xd9d3c6);
  const nightGround = new THREE.Color(0x1a140e);
  const daySun = new THREE.Color(0xfffaf2);
  const nightSun = new THREE.Color(0xb7c9dc);
  const daySlab = new THREE.Color(0xc5ced6);
  const nightSlab = new THREE.Color(0x3a4248);
  const dayCity = new THREE.Color(0x8e96a0);
  const nightCity = new THREE.Color(0x4a5560);
  const sky = new THREE.Color();

  return {
    applyNight(amount: number) {
      const t = THREE.MathUtils.clamp(amount, 0, 1);
      sky.copy(daySky).lerp(nightSky, t);
      lights.renderer.setClearColor(sky, 1);
      lights.fog.color.copy(sky);
      lights.fog.density = 0.004 + t * 0.0035;
      lights.hemi.color.copy(dayHemi).lerp(nightHemi, t);
      lights.hemi.groundColor.copy(dayGround).lerp(nightGround, t);
      lights.hemi.intensity = 1.35 + (0.4 - 1.35) * t;
      lights.sun.color.copy(daySun).lerp(nightSun, t);
      lights.sun.intensity = 1.25 + (0.36 - 1.25) * t;
      lights.lampA.intensity = 28 + t * 26;
      lights.lampB.intensity = 18 + t * 20;
      floodA.intensity = 6 + t * 28;
      floodB.intensity = 6 + t * 24;
      riseLamp.intensity = 4 + t * 18;
      glass.emissiveIntensity = 0.05 + t * 0.9;
      moonMat.opacity = t;
      cityMat.color.copy(dayCity).lerp(nightCity, t);
      lights.ground.color.copy(daySlab).lerp(nightSlab, t * 0.55);
    },
  };
}

function addBeams(scene: THREE.Scene, box: THREE.BoxGeometry, mat: THREE.Material, x: number, z: number) {
  for (let i = 0; i < 4; i += 1) {
    const beam = new THREE.Mesh(box, mat);
    beam.scale.set(0.28, 0.22, 7.2);
    beam.position.set(x - 1.2 + i * 0.42, 0.2 + i * 0.18, z);
    scene.add(beam);
  }
}

function addSpools(scene: THREE.Scene, cyl: THREE.CylinderGeometry, mat: THREE.Material, x: number, z: number) {
  for (const [dx, dz] of [
    [0, 0],
    [1.3, 0.4],
  ] as const) {
    const spool = new THREE.Mesh(cyl, mat);
    spool.scale.set(0.9, 0.7, 0.9);
    spool.rotation.z = Math.PI / 2;
    spool.position.set(x + dx, 0.45, z + dz);
    scene.add(spool);
  }
}

function addPlates(scene: THREE.Scene, box: THREE.BoxGeometry, mat: THREE.Material, x: number, z: number) {
  for (let i = 0; i < 3; i += 1) {
    const plate = new THREE.Mesh(box, mat);
    plate.scale.set(1.6, 0.12, 2.4);
    plate.position.set(x, 0.12 + i * 0.14, z);
    scene.add(plate);
  }
}

function addTruck(
  scene: THREE.Scene,
  box: THREE.BoxGeometry,
  cyl: THREE.CylinderGeometry,
  cabMat: THREE.Material,
  dark: THREE.Material,
  steel: THREE.Material,
  x: number,
  z: number,
  rot: number,
) {
  const truck = new THREE.Group();
  truck.position.set(x, 0, z);
  truck.rotation.y = rot;
  const cab = new THREE.Mesh(box, cabMat);
  cab.scale.set(2.3, 1.8, 2.2);
  cab.position.set(0, 1.35, -3.1);
  const bed = new THREE.Mesh(box, dark);
  bed.scale.set(2.4, 0.35, 6.4);
  bed.position.set(0, 1.05, 1.1);
  truck.add(cab, bed);
  for (let i = 0; i < 3; i += 1) {
    const stick = new THREE.Mesh(box, steel);
    stick.scale.set(0.22, 0.18, 5.6);
    stick.position.set(-0.6 + i * 0.55, 1.4, 1.2);
    truck.add(stick);
  }
  for (const [wx, wz] of [
    [1.15, -3.2],
    [-1.15, -3.2],
    [1.15, 1.4],
    [-1.15, 1.4],
    [1.15, 3.2],
    [-1.15, 3.2],
  ] as const) {
    const wheel = new THREE.Mesh(cyl, dark);
    wheel.scale.set(0.72, 0.4, 0.72);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    truck.add(wheel);
  }
  scene.add(truck);
}

function addMixer(
  scene: THREE.Scene,
  box: THREE.BoxGeometry,
  cyl: THREE.CylinderGeometry,
  body: THREE.Material,
  dark: THREE.Material,
  x: number,
  z: number,
  rot: number,
) {
  const truck = new THREE.Group();
  truck.position.set(x, 0, z);
  truck.rotation.y = rot;
  const cab = new THREE.Mesh(box, body);
  cab.scale.set(2.2, 1.7, 2);
  cab.position.set(0, 1.3, -2.6);
  const drum = new THREE.Mesh(cyl, dark);
  drum.scale.set(1.5, 3.4, 1.5);
  drum.rotation.x = Math.PI / 2.4;
  drum.position.set(0, 1.7, 0.8);
  truck.add(cab, drum);
  for (const [wx, wz] of [
    [1.1, -2.6],
    [-1.1, -2.6],
    [1.1, 1.6],
    [-1.1, 1.6],
  ] as const) {
    const wheel = new THREE.Mesh(cyl, dark);
    wheel.scale.set(0.7, 0.38, 0.7);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.35, wz);
    truck.add(wheel);
  }
  scene.add(truck);
}

function lightTower(box: THREE.BoxGeometry, dark: THREE.Material, paint: THREE.Material, x: number, z: number) {
  const tower = new THREE.Group();
  tower.position.set(x, 0, z);
  const mast = new THREE.Mesh(box, dark);
  mast.scale.set(0.18, 6.2, 0.18);
  mast.position.y = 3.1;
  const head = new THREE.Mesh(box, paint);
  head.scale.set(1.4, 0.28, 0.35);
  head.position.y = 6.15;
  tower.add(mast, head);
  return tower;
}

function dressRise(
  scene: THREE.Scene,
  box: THREE.BoxGeometry,
  steel: THREE.Material,
  paint: THREE.Material,
  dark: THREE.Material,
) {
  const rise = new THREE.Group();
  rise.position.set(40, 0, -32);
  for (const level of [1, 2, 3, 4]) {
    const y = 3.2 * level + 0.42;
    for (const [sx, sz, px, pz] of [
      [12.2, 0.08, 0, -5],
      [12.2, 0.08, 0, 5],
      [0.08, 10, -6, 0],
      [0.08, 10, 6, 0],
    ] as const) {
      const rail = new THREE.Mesh(box, paint);
      rail.scale.set(sx, 0.08, sz);
      rail.position.set(px, y, pz);
      rise.add(rail);
    }
  }
  for (const z of [-4, -1.2, 1.6, 4]) {
    const pole = new THREE.Mesh(box, dark);
    pole.scale.set(0.12, 13.4, 0.12);
    pole.position.set(6.35, 6.7, z);
    rise.add(pole);
  }
  for (const y of [3.5, 6.7, 9.9, 12.6]) {
    const plank = new THREE.Mesh(box, steel);
    plank.scale.set(0.7, 0.08, 9.2);
    plank.position.set(6.15, y, 0);
    rise.add(plank);
  }
  const hoist = new THREE.Mesh(box, dark);
  hoist.scale.set(0.35, 14.5, 0.35);
  hoist.position.set(-6.5, 7.2, 3.4);
  const cage = new THREE.Mesh(box, paint);
  cage.scale.set(0.7, 1.1, 0.8);
  cage.position.set(-6.15, 4.2, 3.4);
  const tarp = new THREE.Mesh(box, paint);
  tarp.scale.set(8, 2.4, 0.08);
  tarp.position.set(0, 8.2, 5.15);
  rise.add(hoist, cage, tarp);
  scene.add(rise);
}

function addPipeRack(
  scene: THREE.Scene,
  box: THREE.BoxGeometry,
  cyl: THREE.CylinderGeometry,
  steel: THREE.Material,
  rust: THREE.Material,
  x: number,
  z: number,
) {
  const rack = new THREE.Group();
  rack.position.set(x, 0, z);
  for (const px of [-3.8, 3.8]) {
    for (const pz of [-1.4, 1.4]) {
      const leg = new THREE.Mesh(box, rust);
      leg.scale.set(0.18, 2.4, 0.18);
      leg.position.set(px, 1.2, pz);
      rack.add(leg);
    }
    const crossbar = new THREE.Mesh(box, rust);
    crossbar.scale.set(0.22, 0.2, 3.2);
    crossbar.position.set(px, 2.15, 0);
    rack.add(crossbar);
  }
  const pipeGeometry = cyl.clone();
  pipeGeometry.rotateZ(Math.PI / 2);
  for (let layer = 0; layer < 3; layer += 1) {
    for (let i = 0; i < 4; i += 1) {
      const tube = new THREE.Mesh(pipeGeometry, steel);
      tube.scale.set(0.48, 7.2, 0.48);
      tube.position.set(0, 0.45 + layer * 0.58, -0.9 + i * 0.6);
      rack.add(tube);
    }
  }
  scene.add(rack);
}

function addGeneratorBay(
  scene: THREE.Scene,
  box: THREE.BoxGeometry,
  cyl: THREE.CylinderGeometry,
  steel: THREE.Material,
  dark: THREE.Material,
  paint: THREE.Material,
  x: number,
  z: number,
) {
  const bay = new THREE.Group();
  bay.position.set(x, 0, z);
  const plinth = new THREE.Mesh(box, dark);
  plinth.scale.set(5.2, 0.18, 4.4);
  plinth.position.y = 0.12;
  const cabinet = new THREE.Mesh(box, steel);
  cabinet.scale.set(2.2, 1.7, 1.4);
  cabinet.position.set(0, 1.05, 0);
  const control = new THREE.Mesh(box, paint);
  control.scale.set(0.5, 0.7, 0.08);
  control.position.set(0.55, 1.05, 0.75);
  const exhaust = new THREE.Mesh(cyl, dark);
  exhaust.scale.set(0.15, 0.75, 0.15);
  exhaust.position.set(-0.65, 2.25, -0.35);
  bay.add(plinth, cabinet, control, exhaust);
  for (const px of [-2.3, 2.3]) {
    const bollard = new THREE.Mesh(cyl, paint);
    bollard.scale.set(0.14, 0.8, 0.14);
    bollard.position.set(px, 0.4, 1.8);
    bay.add(bollard);
  }
  scene.add(bay);
}

function addPanelBed(
  scene: THREE.Scene,
  box: THREE.BoxGeometry,
  steel: THREE.Material,
  paint: THREE.Material,
  x: number,
  z: number,
) {
  const bed = new THREE.Group();
  bed.position.set(x, 0, z);
  for (let level = 0; level < 3; level += 1) {
    const panel = new THREE.Mesh(box, steel);
    panel.scale.set(5.2, 0.36, 3.6);
    panel.position.set(0, 0.42 + level * 0.48, 0);
    bed.add(panel);
    for (const px of [-1.9, 0, 1.9]) {
      const rib = new THREE.Mesh(box, paint);
      rib.scale.set(0.08, 0.48, 3.5);
      rib.position.set(px, 0.42 + level * 0.48, 0);
      bed.add(rib);
    }
  }
  for (const px of [-3.2, 3.2]) {
    const stop = new THREE.Mesh(box, paint);
    stop.scale.set(0.12, 1.8, 0.12);
    stop.position.set(px, 0.9, -2.3);
    bed.add(stop);
  }
  scene.add(bed);
}
