import * as THREE from "three";
import { acesFilmic } from "./tonemap.ts";
import type { SiteTheme } from "./levels.ts";

/**
 * Static job-site dressing. Props sit in the corners, on the high-rise, and
 * outside the fence so the hook, the loads, the set rings, and the lowboy
 * pad stay in the open. Shared boxes and instances keep the draw count small
 * enough for a phone.
 */
export type SiteLook = {
  applyNight: (amount: number, floodBoost?: number) => void;
  /** Swap the dressing set for the level's site. Cheap after the first call. */
  setTheme: (theme: SiteTheme) => void;
  /** Advance site-specific motion without coupling scenery to crane physics. */
  update: (dt: number) => void;
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

/**
 * Static yard props are casters too. The sun's frustum is tight around the
 * crane, so meshes far outside the work area cost nothing in the shadow pass.
 */
function castShadows(root: THREE.Object3D) {
  root.traverse((part) => {
    const mesh = part as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
}

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
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x16222e,
    roughness: 0.16,
    metalness: 0.55,
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xf7e7c0,
    emissive: 0xffe1a8,
    emissiveIntensity: 0.2,
    roughness: 0.4,
  });
  const cityMat = new THREE.MeshStandardMaterial({ color: 0x8e96a0, roughness: 0.82, metalness: 0.04 });

  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  const coneGeo = new THREE.ConeGeometry(0.28, 0.7, 7);
  const dummy = new THREE.Object3D();

  const skirt = new THREE.Mesh(new THREE.RingGeometry(50, 180, 36), dirt);
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
  addTruck(scene, box, cyl, cabMat, dark, steel, lampMat, windowMat, 38, 40, 0.4);
  addMixer(scene, box, cyl, mixerMat, dark, lampMat, windowMat, 22, -42, 0.8);

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

  const towerA = lightTower(box, dark, paint, lampMat, -27.2, -24.5);
  const towerB = lightTower(box, dark, paint, lampMat, 25.2, 16.2);
  scene.add(towerA, towerB);
  const floodA = new THREE.PointLight(0xffe1a8, 6, 28, 2);
  floodA.position.set(-27.2, 6.2, -24.5);
  const floodB = new THREE.PointLight(0xffe1a8, 6, 26, 2);
  floodB.position.set(25.2, 6.2, 16.2);
  const riseLamp = new THREE.PointLight(0xfff1d0, 4, 22, 2);
  riseLamp.position.set(34, 8, -26);
  scene.add(floodA, floodB, riseLamp);

  dressRise(scene, box, steel, paint, dark);

  let siteFogDensity = 0.004;
  const siteThemes = dressThemes(
    scene,
    box,
    cyl,
    {
      shed: new THREE.MeshStandardMaterial({ color: 0xb9c2ca, roughness: 0.74, metalness: 0.1 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x39424b, roughness: 0.7, metalness: 0.25 }),
      slab: new THREE.MeshStandardMaterial({ color: 0xc5ced6, roughness: 0.9, metalness: 0 }),
      // Sits just above the dirt skirt; the offset stops the two large planes
      // from z-fighting into stripes at the far edge of the quay.
      water: new THREE.MeshStandardMaterial({
        color: 0x2f4c5c,
        roughness: 0.18,
        metalness: 0.4,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      pallet: new THREE.MeshStandardMaterial({ color: 0xa88a5f, roughness: 0.66, metalness: 0.2 }),
      containers: [0x2f6d7a, 0x8a4a3a, 0x4a6a4a, 0x9a7a34, 0x3c4a6a].map(
        (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.66, metalness: 0.2 }),
      ),
      steel,
      rust,
      paint,
      dark,
    },
    [city, caps, windows],
    (density) => { siteFogDensity = density; },
  );

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

  const clearSky = new THREE.Color();
  return {
    applyNight(amount: number, floodBoost = 0) {
      const t = THREE.MathUtils.clamp(amount, 0, 1);
      sky.copy(daySky).lerp(nightSky, t);
      lights.fog.color.copy(sky);
      // Fog is tone-mapped in the shader; the clear colour is not. Hand the
      // clear the curve's output — still linear, because the renderer
      // sRGB-encodes the clear itself — so the horizon meets the sky exactly.
      if (lights.renderer.toneMapping === THREE.ACESFilmicToneMapping) {
        const [r, g, b] = acesFilmic(
          [sky.r, sky.g, sky.b],
          lights.renderer.toneMappingExposure,
        );
        clearSky.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
        lights.renderer.setClearColor(clearSky, 1);
      } else {
        lights.renderer.setClearColor(sky, 1);
      }
      lights.fog.density = siteFogDensity + t * 0.0035;
      lights.hemi.color.copy(dayHemi).lerp(nightHemi, t);
      lights.hemi.groundColor.copy(dayGround).lerp(nightGround, t);
      lights.hemi.intensity = 1.35 + (0.4 - 1.35) * t;
      lights.sun.color.copy(daySun).lerp(nightSun, t);
      lights.sun.intensity = 1.25 + (0.36 - 1.25) * t;
      lights.lampA.intensity = 28 + t * 26;
      lights.lampB.intensity = 18 + t * 20;
      floodA.intensity = 6 + t * 28 + floodBoost * (12 + t * 26);
      floodB.intensity = 6 + t * 24 + floodBoost * (10 + t * 22);
      riseLamp.intensity = 4 + t * 18 + floodBoost * (8 + t * 20);
      glass.emissiveIntensity = 0.05 + t * 0.9;
      lampMat.emissiveIntensity = 0.2 + t * 2.6;
      // The environment map is a day sky; fade it with the night mix so machines
      // do not keep reflecting daylight after the sun goes down.
      if (scene.environment) {
        scene.environmentIntensity = 0.28 * (1 - t * 0.65);
      }
      moonMat.opacity = t;
      cityMat.color.copy(dayCity).lerp(nightCity, t);
      lights.ground.color.copy(daySlab).lerp(nightSlab, t * 0.55).multiply(siteThemes.tint);
    },
    setTheme: siteThemes.setTheme,
    update: siteThemes.update,
  };
}

function addBeams(scene: THREE.Scene, box: THREE.BoxGeometry, mat: THREE.Material, x: number, z: number) {
  for (let i = 0; i < 4; i += 1) {
    const beam = new THREE.Mesh(box, mat);
    beam.castShadow = true;
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
    spool.castShadow = true;
    spool.scale.set(0.9, 0.7, 0.9);
    spool.rotation.z = Math.PI / 2;
    spool.position.set(x + dx, 0.45, z + dz);
    scene.add(spool);
  }
}

function addPlates(scene: THREE.Scene, box: THREE.BoxGeometry, mat: THREE.Material, x: number, z: number) {
  for (let i = 0; i < 3; i += 1) {
    const plate = new THREE.Mesh(box, mat);
    plate.castShadow = true;
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
  lampMat: THREE.Material,
  windowMat: THREE.Material,
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
  const windshield = new THREE.Mesh(box, windowMat);
  windshield.scale.set(1.9, 0.6, 0.06);
  windshield.position.set(0, 1.72, -4.18);
  const sideWindowL = new THREE.Mesh(box, windowMat);
  sideWindowL.scale.set(0.06, 0.55, 1.2);
  sideWindowL.position.set(1.16, 1.72, -3.1);
  const sideWindowR = sideWindowL.clone();
  sideWindowR.position.x = -1.16;
  truck.add(windshield, sideWindowL, sideWindowR);
  for (const lx of [-0.72, 0.72]) {
    const lamp = new THREE.Mesh(box, lampMat);
    lamp.scale.set(0.34, 0.2, 0.08);
    lamp.position.set(lx, 0.95, -4.22);
    truck.add(lamp);
  }
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
    const hub = new THREE.Mesh(cyl, steel);
    hub.scale.set(0.3, 0.07, 0.3);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx + Math.sign(wx) * 0.22, 0.36, wz);
    truck.add(wheel, hub);
  }
  castShadows(truck);
  scene.add(truck);
}

function addMixer(
  scene: THREE.Scene,
  box: THREE.BoxGeometry,
  cyl: THREE.CylinderGeometry,
  body: THREE.Material,
  dark: THREE.Material,
  lampMat: THREE.Material,
  windowMat: THREE.Material,
  x: number,
  z: number,
  rot: number,
) {
  const truck = new THREE.Group();
  truck.position.set(x, 0, z);
  truck.rotation.y = rot;
  // Frame first: every other part sits on it, so nothing floats.
  const frame = new THREE.Mesh(box, dark);
  frame.scale.set(1.7, 0.3, 5.4);
  frame.position.set(0, 0.82, 0);
  const cab = new THREE.Mesh(box, body);
  cab.scale.set(2.2, 1.7, 2);
  cab.position.set(0, 1.85, -2.7);
  // Tapered bowl: wide at the mouth, narrow at the discharge end.
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 1, 12), dark);
  drum.scale.set(1.15, 2.8, 1.15);
  drum.rotation.x = Math.PI / 2 - 0.14;
  drum.position.set(0, 1.62, 0.55);
  const hopper = new THREE.Mesh(box, dark);
  hopper.scale.set(1.1, 0.5, 0.8);
  hopper.position.set(0, 2.2, -1.05);
  truck.add(frame, cab, drum, hopper);
  const windshield = new THREE.Mesh(box, windowMat);
  windshield.scale.set(1.85, 0.55, 0.06);
  windshield.position.set(0, 1.95, -3.72);
  const sideWindowL = new THREE.Mesh(box, windowMat);
  sideWindowL.scale.set(0.06, 0.5, 1.1);
  sideWindowL.position.set(1.12, 1.95, -2.7);
  const sideWindowR = sideWindowL.clone();
  sideWindowR.position.x = -1.12;
  const chute = new THREE.Mesh(box, dark);
  chute.scale.set(0.5, 0.18, 2.3);
  chute.position.set(0, 1.15, 2.6);
  chute.rotation.x = 0.34;
  const chuteLamp = new THREE.Mesh(box, lampMat);
  chuteLamp.scale.set(0.36, 0.14, 0.06);
  chuteLamp.position.set(0, 1.55, -3.74);
  truck.add(windshield, sideWindowL, sideWindowR, chute, chuteLamp);
  for (const [wx, wz] of [
    [1.05, -2.7],
    [-1.05, -2.7],
    [1.05, 1.7],
    [-1.05, 1.7],
  ] as const) {
    const wheel = new THREE.Mesh(cyl, dark);
    wheel.scale.set(0.7, 0.38, 0.7);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.35, wz);
    const hub = new THREE.Mesh(cyl, body);
    hub.scale.set(0.28, 0.06, 0.28);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx + Math.sign(wx) * 0.21, 0.35, wz);
    truck.add(wheel, hub);
  }
  castShadows(truck);
  scene.add(truck);
}

function lightTower(
  box: THREE.BoxGeometry,
  dark: THREE.Material,
  paint: THREE.Material,
  lampMat: THREE.Material,
  x: number,
  z: number,
) {
  const tower = new THREE.Group();
  tower.position.set(x, 0, z);
  const base = new THREE.Mesh(box, dark);
  base.scale.set(1.2, 0.24, 1.6);
  base.position.y = 0.12;
  const mast = new THREE.Mesh(box, dark);
  mast.scale.set(0.18, 6.2, 0.18);
  mast.position.y = 3.1;
  const head = new THREE.Mesh(box, paint);
  head.scale.set(1.4, 0.28, 0.35);
  head.position.y = 6.15;
  const glare = new THREE.Mesh(box, lampMat);
  glare.scale.set(1.26, 0.2, 0.06);
  glare.position.set(0, 6.0, 0.16);
  tower.add(base, mast, head, glare);
  castShadows(tower);
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
  const deckWood = new THREE.MeshStandardMaterial({ color: 0x98724f, roughness: 0.86, metalness: 0.02 });
  const deckWoodAlt = new THREE.MeshStandardMaterial({ color: 0xa9825c, roughness: 0.84, metalness: 0.02 });
  // The top floor is a finished rooftop terrace: timber boards sit exactly at
  // the roof-set height, inside the existing parapet rails.
  for (let i = 0; i < 10; i += 1) {
    const board = new THREE.Mesh(box, i % 2 === 0 ? deckWood : deckWoodAlt);
    board.scale.set(1.06, 0.16, 9.0);
    board.position.set(-4.77 + i * 1.06, 13.03, 0);
    rise.add(board);
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
  castShadows(rise);
  scene.add(rise);
}

type SiteMats = {
  shed: THREE.Material;
  roof: THREE.Material;
  slab: THREE.Material;
  water: THREE.Material;
  pallet: THREE.Material;
  containers: THREE.Material[];
  steel: THREE.Material;
  rust: THREE.Material;
  paint: THREE.Material;
  dark: THREE.Material;
};

const THEME_TINT: Record<SiteTheme, number> = {
  yard: 0xffffff,
  warehouse: 0xdfe2e4,
  steel: 0xd6cbb9,
  tower: 0xe6e9eb,
  port: 0xcfdbe1,
  residential: 0xe4ded1,
  windFarm: 0xdde6dc,
};

/**
 * One dressing set per site theme, all outside the fence so nothing the crane
 * can hit moves. Built once; setTheme just toggles the groups and the skyline.
 */
function dressThemes(
  scene: THREE.Scene,
  box: THREE.BoxGeometry,
  cyl: THREE.CylinderGeometry,
  mats: SiteMats,
  skyline: THREE.Object3D[],
  setFogDensity: (density: number) => void,
) {
  const groups: Record<Exclude<SiteTheme, "yard">, THREE.Group> = {
    warehouse: new THREE.Group(),
    steel: new THREE.Group(),
    tower: new THREE.Group(),
    port: new THREE.Group(),
    residential: new THREE.Group(),
    windFarm: new THREE.Group(),
  };
  for (const group of Object.values(groups)) {
    group.visible = false;
    scene.add(group);
  }

  const add = (
    parent: THREE.Group,
    mat: THREE.Material,
    sx: number,
    sy: number,
    sz: number,
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = new THREE.Mesh(box, mat);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  // Warehouse estate: long low sheds with roller doors and trailers at the dock.
  for (const [x, w] of [
    [-30, 26],
    [0, 24],
    [30, 26],
  ] as const) {
    add(groups.warehouse, mats.shed, w, 7, 14, x, 3.5, 62);
    add(groups.warehouse, mats.roof, w + 1, 0.5, 15, x, 7.2, 62);
    for (let i = 0; i < 3; i += 1) {
      const doorX = x - w / 3 + i * (w / 3);
      add(groups.warehouse, mats.roof, 4.6, 4.8, 0.2, doorX, 2.4, 54.9);
      add(groups.warehouse, mats.paint, 4.9, 0.2, 0.24, doorX, 4.9, 54.9);
    }
  }
  for (const [x, rot] of [
    [14, 0.3],
    [20, -0.25],
  ] as const) {
    const trailer = new THREE.Group();
    trailer.position.set(x, 0, 52);
    trailer.rotation.y = rot;
    add(trailer, mats.steel, 2.5, 0.3, 11, 0, 0.95, 0);
    add(trailer, mats.dark, 2.5, 2.4, 2.4, 0, 1.8, -5.2);
    for (const z of [-4.4, 4.2]) {
      const wheel = new THREE.Mesh(cyl, mats.dark);
      wheel.scale.set(0.62, 0.4, 0.62);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(1.15, 0.42, z);
      trailer.add(wheel);
    }
    groups.warehouse.add(trailer);
  }
  for (let i = 0; i < 6; i += 1) {
    add(groups.warehouse, mats.pallet, 1.2, 0.16, 1, -19 + (i % 2) * 1.4, 0.1 + Math.floor(i / 2) * 0.18, 52 - (i % 3) * 0.4);
  }

  // Steel yard: racking, pipe stacks and plate piles across the north fence.
  for (const x of [-22, 0, 22]) {
    for (const dx of [-2.4, 2.4]) add(groups.steel, mats.dark, 0.34, 8.5, 0.34, x + dx, 4.25, -56);
    for (let j = 0; j < 9; j += 1) {
      add(groups.steel, j % 3 === 1 ? mats.rust : mats.steel, 7.4, 0.34, 0.7, x, 0.35 + j * 0.42, -56 + (j % 2) * 0.5);
    }
    add(groups.steel, mats.paint, 7.8, 0.18, 0.9, x, 4.2, -56);
  }
  for (let i = 0; i < 12; i += 1) {
    const pipe = new THREE.Mesh(cyl, i % 3 === 0 ? mats.rust : mats.steel);
    pipe.scale.set(0.34, 10, 0.34);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(34 + (i % 4) * 0.8, 0.35 + Math.floor(i / 4) * 0.7, -54);
    groups.steel.add(pipe);
  }
  for (let i = 0; i < 6; i += 1) add(groups.steel, mats.steel, 3.2, 0.16, 2.4, -36, 0.12 + i * 0.18, -54);

  // High-rise: hoist, barriers and rebar on the block beside the rise.
  add(groups.tower, mats.paint, 1.3, 26, 1.3, 46, 13, -58);
  add(groups.tower, mats.dark, 2.4, 2.6, 2.2, 45.2, 6, -58);
  for (let i = 0; i < 8; i += 1) add(groups.tower, i % 2 ? mats.paint : mats.slab, 0.5, 1.1, 2.6, 28, 0.55, -54 + i * 3);
  for (let i = 0; i < 5; i += 1) add(groups.tower, mats.rust, 1.6, 0.5, 6, -46, 0.3 + (i % 2) * 0.5, -56 + Math.floor(i / 2) * 2);

  // Docks: stacked boxes and a gantry over the water beyond the fence.
  for (let row = 0; row < 2; row += 1) {
    for (let i = 0; i < 6; i += 1) {
      const can = mats.containers[(i + row) % mats.containers.length]!;
      add(groups.port, can, 2.6, 2.6, 6, -18 + i * 3, 1.3 + row * 2.65, 62);
    }
  }
  for (const x of [-8, 14]) add(groups.port, mats.paint, 1.1, 20, 1.1, x, 10, 66);
  add(groups.port, mats.paint, 24, 1.4, 1.6, 3, 20, 66);
  add(groups.port, mats.dark, 3, 2.2, 3, 3, 17.8, 66);
  add(groups.port, mats.water, 260, 0.1, 90, 0, 0.02, 112);
  for (let i = 0; i < 6; i += 1) {
    const bollard = new THREE.Mesh(cyl, mats.dark);
    bollard.scale.set(0.4, 0.9, 0.4);
    bollard.position.set(-20 + i * 8, 0.45, 54);
    groups.port.add(bollard);
  }

  // Maple Lane is a separate off-yard address, not another pad inside the
  // industrial fence. The crane works through a side gate into a real backyard.
  const residential = groups.residential;
  const homeX = -102;
  const homeZ = 30;
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x55764b, roughness: 0.98 });
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x33393e, roughness: 0.96 });
  const driveMat = new THREE.MeshStandardMaterial({ color: 0x555a5d, roughness: 0.92 });
  const walkMat = new THREE.MeshStandardMaterial({ color: 0xc4c0b4, roughness: 0.94 });
  const sidingMat = new THREE.MeshStandardMaterial({ color: 0xe7dbc4, roughness: 0.9 });
  const sageMat = new THREE.MeshStandardMaterial({ color: 0xa9b69e, roughness: 0.92 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0xb3c6cd, roughness: 0.9 });
  const shingleMat = new THREE.MeshStandardMaterial({ color: 0x45494b, roughness: 0.86 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf2eee3, roughness: 0.82 });
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x82aebd, roughness: 0.22, metalness: 0.12 });
  const garageMat = new THREE.MeshStandardMaterial({ color: 0xd5d2c8, roughness: 0.82 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x536456, roughness: 0.85 });
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0xe6dece, roughness: 0.9 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x9b7654, roughness: 0.88 });
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x69513b, roughness: 0.96 });
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x476b43, roughness: 0.98 });
  const markingMat = new THREE.MeshStandardMaterial({ color: 0xe6cf78, roughness: 0.8 });

  // A five-home residential block makes Maple Lane read as an address, not a prop yard.
  add(residential, lawnMat, 76, 0.08, 50, homeX, 0.025, 31);
  add(residential, roadMat, 76, 0.14, 7.2, homeX, 0.1, 8);
  add(residential, walkMat, 76, 0.16, 0.3, homeX, 0.1, 4.25);
  add(residential, walkMat, 76, 0.16, 0.3, homeX, 0.1, 11.75);
  add(residential, walkMat, 76, 0.12, 1.1, homeX, 0.08, 3.35);
  add(residential, walkMat, 76, 0.12, 1.1, homeX, 0.08, 12.65);
  for (let i = 0; i < 13; i += 1) {
    add(residential, markingMat, 2.5, 0.025, 0.12, -138 + i * 6, 0.18, 8);
  }

  // Front drives and a separate wide side drive through the backyard gate.
  for (const x of [-134, -68]) add(residential, driveMat, 6, 0.12, 18, x, 0.09, 17.5);
  add(residential, driveMat, 7, 0.12, 18, -105, 0.09, 17.5);
  add(residential, driveMat, 8, 0.12, 32, -91.5, 0.09, 24);
  for (const x of [-137.2, -130.8, -71.2, -64.8]) add(residential, walkMat, 0.16, 0.1, 17, x, 0.08, 17.5);
  for (const x of [-108.7, -101.3]) add(residential, walkMat, 0.16, 0.1, 17, x, 0.08, 17.5);
  for (const x of [-95.5, -87.5]) add(residential, walkMat, 0.16, 0.1, 32, x, 0.08, 24);

  // The crane starts on the street; amber chevrons lead into the parking box.
  const setupX = -92;
  const setupZ = 30;
  for (const z of [-4.5, 4.5]) add(residential, markingMat, 7, 0.035, 0.14, setupX, 0.18, setupZ + z);
  for (const x of [-3.5, 3.5]) add(residential, markingMat, 0.14, 0.035, 9, setupX + x, 0.18, setupZ);
  for (const z of [14, 18, 22, 26]) add(residential, markingMat, 1.8, 0.025, 0.16, -91.5, 0.18, z);

  // Main Maple Lane home: gabled roof, garage, entry porch and glazed windows.
  add(residential, sidingMat, 14, 6, 10, homeX, 3, homeZ);
  const mainRoofL = add(residential, shingleMat, 7.8, 0.42, 11.2, homeX - 3.5, 7.45, homeZ);
  mainRoofL.rotation.z = 0.4;
  const mainRoofR = add(residential, shingleMat, 7.8, 0.42, 11.2, homeX + 3.5, 7.45, homeZ);
  mainRoofR.rotation.z = -0.4;
  add(residential, shingleMat, 0.42, 0.4, 11.5, homeX, 8.88, homeZ);
  add(residential, trimMat, 14.5, 0.22, 10.5, homeX, 6.03, homeZ);
  add(residential, trimMat, 5.05, 3.15, 0.18, -106, 1.68, 24.82);
  add(residential, garageMat, 4.65, 2.75, 0.1, -106, 1.62, 24.68);
  for (const y of [0.95, 1.55, 2.15]) add(residential, trimMat, 4.35, 0.055, 0.08, -106, y, 24.61);
  add(residential, trimMat, 1.9, 2.85, 0.18, -98.4, 1.55, 24.82);
  add(residential, doorMat, 1.42, 2.42, 0.1, -98.4, 1.44, 24.68);
  for (const x of [-101.8, -96.6]) {
    add(residential, trimMat, 2.35, 1.8, 0.16, x, 4.02, 24.82);
    add(residential, windowMat, 2.04, 1.48, 0.08, x, 4.02, 24.7);
    add(residential, trimMat, 2.35, 0.12, 0.22, x, 3.02, 24.72);
  }
  add(residential, shingleMat, 3.5, 0.24, 2.2, -98.4, 3, 24.0);
  for (const x of [-99.8, -97]) add(residential, trimMat, 0.14, 2.5, 0.14, x, 1.25, 23.2);

  // Two lower homes make this read as a neighborhood street, not an isolated prop.
  const addNeighborHome = (x: number, wall: THREE.Material, z = homeZ) => {
    add(residential, wall, 9, 4.5, 8, x, 2.25, z);
    const roofL = add(residential, shingleMat, 5.2, 0.35, 8.7, x - 2.3, 5.55, z);
    roofL.rotation.z = 0.48;
    const roofR = add(residential, shingleMat, 5.2, 0.35, 8.7, x + 2.3, 5.55, z);
    roofR.rotation.z = -0.48;
    add(residential, shingleMat, 0.34, 0.34, 8.8, x, 6.55, z);
    for (const wx of [x - 2.2, x + 2.2]) {
      add(residential, trimMat, 1.7, 1.35, 0.14, wx, 3.05, z - 4.08);
      add(residential, windowMat, 1.42, 1.08, 0.08, wx, 3.05, z - 4.19);
    }
    add(residential, trimMat, 1.45, 2.2, 0.14, x, 1.1, z - 4.08);
    add(residential, doorMat, 1.15, 1.9, 0.08, x, 1, z - 4.19);
  };
  addNeighborHome(-134, blueMat);
  addNeighborHome(-120, sageMat);
  addNeighborHome(-80, blueMat);
  addNeighborHome(-68, sageMat);

  // Street trees and a mailbox help anchor the driveways and house scale.
  const treeLeaves = new THREE.SphereGeometry(1.9, 10, 8);
  for (const [x, z] of [[-123, 19], [-78, 19], [-119, 48], [-78, 51]] as const) {
    const trunk = new THREE.Mesh(cyl, barkMat);
    trunk.scale.set(0.42, 4.2, 0.42);
    trunk.position.set(x, 2.1, z);
    const crown = new THREE.Mesh(treeLeaves, foliageMat);
    crown.scale.set(1.15, 1.3, 1.1);
    crown.position.set(x, 5.5, z);
    residential.add(trunk, crown);
  }
  add(residential, trimMat, 0.14, 1.45, 0.14, -91.5, 0.73, 16);
  add(residential, doorMat, 0.82, 0.48, 0.48, -91.5, 1.45, 16);
  add(residential, trimMat, 0.16, 3.1, 0.16, -77.5, 1.55, 8.5);
  add(residential, doorMat, 1.75, 0.7, 0.12, -77.5, 3.05, 8.5);

  // The backyard is fenced, with a deliberately wide side-gate opening for the crane.
  const addFenceX = (x0: number, x1: number, z: number) => {
    const length = x1 - x0;
    const mid = (x0 + x1) / 2;
    add(residential, fenceMat, length, 0.12, 0.12, mid, 0.48, z);
    add(residential, fenceMat, length, 0.12, 0.12, mid, 1.02, z);
    for (let x = x0; x <= x1 + 0.01; x += 1.25) {
      add(residential, fenceMat, 0.12, 1.25, 0.16, x, 0.62, z);
    }
  };
  const addFenceZ = (x: number, z0: number, z1: number) => {
    const length = z1 - z0;
    const mid = (z0 + z1) / 2;
    add(residential, fenceMat, 0.12, 0.12, length, x, 0.48, mid);
    add(residential, fenceMat, 0.12, 0.12, length, x, 1.02, mid);
    for (let z = z0; z <= z1 + 0.01; z += 1.25) {
      add(residential, fenceMat, 0.16, 1.25, 0.12, x, 0.62, z);
    }
  };
  addFenceX(-116, -88, 54);
  addFenceZ(-116, 36, 54);
  addFenceZ(-88, 36, 54);
  addFenceX(-116, -96, 36);
  for (const x of [-116, -96, -88]) add(residential, fenceMat, 0.24, 1.55, 0.24, x, 0.78, 36);

  // Patio deck and paver walk sit behind the house, inside the fence.
  const backyardDeck = new THREE.Group();
  backyardDeck.position.set(-103, 0, 42);
  for (let i = 0; i < 12; i += 1) {
    add(backyardDeck, i % 2 ? deckMat : mats.pallet, 1, 0.06, 8, -5.5 + i, 0.06, 0);
  }
  add(backyardDeck, mats.dark, 12.2, 0.12, 0.16, 0, 0.05, -3.95);
  add(backyardDeck, mats.dark, 12.2, 0.12, 0.16, 0, 0.05, 3.95);
  for (const x of [-5.95, 5.95]) add(backyardDeck, mats.dark, 0.16, 0.12, 8, x, 0.05, 0);
  residential.add(backyardDeck);
  for (const z of [36.7, 38.1]) add(residential, walkMat, 1.8, 0.1, 0.8, -103, 0.08, z);
  for (const x of [-113, -92]) {
    const shrub = new THREE.Mesh(treeLeaves, foliageMat);
    shrub.scale.set(0.75, 0.45, 0.65);
    shrub.position.set(x, 0.75, 30);
    residential.add(shrub);
  }

  // The wind call is a separate ridge address, reached by an access track.
  const windFarm = groups.windFarm;
  const ridgeGrass = new THREE.MeshStandardMaterial({ color: 0x778656, roughness: 0.98 });
  const ridgeRock = new THREE.MeshStandardMaterial({ color: 0x746e60, roughness: 0.97 });
  const turbinePaint = new THREE.MeshStandardMaterial({ color: 0xe3e6df, roughness: 0.62, metalness: 0.08 });
  const turbineBlade = new THREE.MeshStandardMaterial({ color: 0xd2d8d5, roughness: 0.52, metalness: 0.12 });
  const ridge = new THREE.Mesh(new THREE.CircleGeometry(44, 48), ridgeGrass);
  ridge.rotation.x = -Math.PI / 2;
  ridge.position.set(92, 0.015, 88);
  windFarm.add(ridge);
  add(windFarm, driveMat, 26, 0.16, 23, 92, 0.07, 84);

  const accessTrackA = add(windFarm, roadMat, 5, 0.14, 28, 65, 0.08, 70);
  accessTrackA.rotation.y = 1.01;
  const accessTrackB = add(windFarm, roadMat, 5, 0.14, 14, 80, 0.08, 80);
  accessTrackB.rotation.y = 0.92;
  for (const z of [72.5, 95.5]) add(windFarm, mats.paint, 25, 0.035, 0.14, 92, 0.19, z);
  for (const x of [79.5, 104.5]) add(windFarm, mats.paint, 0.14, 0.035, 23, x, 0.19, 84);

  // Two low saddles support the long blade at both the delivery and assembly pads.
  const addBladeCradle = (x: number, z: number) => {
    for (const dz of [-4.7, 4.7]) {
      add(windFarm, mats.dark, 2.5, 0.12, 0.48, x, 0.08, z + dz);
      for (const dx of [-0.82, 0.82]) {
        const leg = add(windFarm, mats.dark, 0.13, 0.22, 0.15, x + dx, 0.19, z + dz);
        leg.rotation.z = dx < 0 ? -0.28 : 0.28;
      }
      add(windFarm, mats.paint, 1.15, 0.1, 0.52, x, 0.24, z + dz);
    }
  };
  addBladeCradle(87, 79);
  addBladeCradle(97, 85);

  // A parked delivery trailer makes the pickup pad read as a real laydown yard.
  add(windFarm, mats.dark, 3.1, 0.65, 8.6, 87, 0.62, 68.8);
  add(windFarm, turbinePaint, 2.6, 0.22, 8.2, 87, 1.05, 68.8);
  for (const z of [66.1, 71.4]) {
    for (const x of [85.4, 88.6]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 10), mats.dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.42, z);
      windFarm.add(wheel);
    }
  }

  const windRotors: THREE.Group[] = [];
  const addTurbine = (x: number, z: number, height: number, bladeLength: number, phase: number) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 1.05, height, 12), turbinePaint);
    tower.position.set(x, height / 2, z);
    windFarm.add(tower);
    const nacelle = new THREE.Mesh(box, turbinePaint);
    nacelle.scale.set(2.3, 0.78, 1.05);
    nacelle.position.set(x, height, z);
    windFarm.add(nacelle);
    const rotor = new THREE.Group();
    rotor.position.set(x, height, z + 0.62);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), mats.steel);
    rotor.add(hub);
    const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.72, 10), mats.dark);
    hubCap.rotation.x = Math.PI / 2;
    hubCap.position.z = 0.38;
    rotor.add(hubCap);
    const bladeGeometry = new THREE.CylinderGeometry(0.055, 0.34, bladeLength, 8);
    for (const angle of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
      const blade = new THREE.Mesh(bladeGeometry, turbineBlade);
      blade.position.y = bladeLength / 2;
      blade.rotation.z = angle;
      rotor.add(blade);
    }
    rotor.rotation.z = phase;
    windFarm.add(rotor);
    windRotors.push(rotor);
  };
  addTurbine(103, 97, 22, 7.5, 0.18);
  addTurbine(72, 102, 25, 8.2, 1.12);
  addTurbine(116, 76, 18, 6.4, -0.56);

  for (const [x, z, sx, sy, sz] of [
    [61, 104, 8, 3, 5],
    [122, 105, 9, 4, 6],
    [64, 69, 7, 2.4, 4],
    [123, 65, 8, 3.2, 5],
  ] as const) {
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), ridgeRock);
    boulder.scale.set(sx, sy, sz);
    boulder.position.set(x, sy * 0.66, z);
    windFarm.add(boulder);
  }

  windFarm.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  residential.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  let current: SiteTheme = "yard";
  const tint = new THREE.Color(THEME_TINT.yard);
  const update = (dt: number) => {
    if (current !== "windFarm") return;
    for (const rotor of windRotors) rotor.rotation.z += dt * 0.2;
  };
  const setTheme = (next: SiteTheme) => {
    if (next === current) return;
    current = next;
    for (const [key, group] of Object.entries(groups)) group.visible = key === next;
    const showSkyline = next === "yard" || next === "steel" || next === "tower";
    for (const part of skyline) part.visible = showSkyline;
    tint.setHex(THEME_TINT[next]);
    setFogDensity(next === "residential" ? 0.012 : next === "windFarm" ? 0.0028 : 0.004);
  };
  return { tint, setTheme, update };
}
