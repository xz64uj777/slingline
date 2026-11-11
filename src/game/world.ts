import * as THREE from "three";
import { LOWBOY_DROP, PADS, type CraneSim } from "@/game/sim";
import { dressSite } from "@/game/scenery";
import { applyCraneLook, createCraneModel } from "@/game/rig-model";

export type CamView = "chase" | "cab" | "hook" | "high" | "wide" | "truck";

export type Yard = {
  renderer: THREE.WebGLRenderer;
  render: (sim: CraneSim, frameDt: number) => void;
  resize: () => void;
  dispose: () => void;
  setView: (view: CamView) => void;
  nudge: (dx: number, dy: number) => void;
};

const UP = new THREE.Vector3(0, 1, 0);

export function createYard(canvas: HTMLCanvasElement): Yard {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xd7e3ec, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd7e3ec, 0.004);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);

  const steel = new THREE.MeshStandardMaterial({
    color: 0xd7dee6,
    metalness: 0.35,
    roughness: 0.38,
  });
  const steelDark = new THREE.MeshStandardMaterial({
    color: 0x8d98a4,
    metalness: 0.3,
    roughness: 0.48,
  });
  const amber = new THREE.MeshStandardMaterial({
    color: 0xe3a23a,
    emissive: 0x6a3e08,
    emissiveIntensity: 0.45,
    roughness: 0.4,
    metalness: 0.2,
  });
  const crateMat = new THREE.MeshStandardMaterial({
    color: 0xc4894a,
    roughness: 0.7,
    metalness: 0.05,
  });
  const stripe = new THREE.MeshStandardMaterial({
    color: 0xe3a23a,
    roughness: 0.5,
    metalness: 0.1,
  });
  const concrete = new THREE.MeshStandardMaterial({
    color: 0xc5ced6,
    roughness: 0.86,
    metalness: 0,
  });
  const ringAmber = new THREE.MeshStandardMaterial({
    color: 0xe3a23a,
    emissive: 0xe3a23a,
    emissiveIntensity: 0.65,
    roughness: 0.35,
  });
  const ringSteel = new THREE.MeshStandardMaterial({
    color: 0x9aa3ad,
    emissive: 0x243038,
    emissiveIntensity: 0.2,
    roughness: 0.4,
    metalness: 0.4,
  });
  const ropeMat = new THREE.MeshStandardMaterial({
    color: 0xf4efe4,
    roughness: 0.55,
    metalness: 0.02,
  });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xe3a23a,
    emissive: 0xe3a23a,
    emissiveIntensity: 0.9,
    roughness: 0.3,
  });

  const hemi = new THREE.HemisphereLight(0xf2f7fb, 0xd9d3c6, 1.35);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xfffaf2, 1.25);
  moon.position.set(24, 40, 12);
  scene.add(moon);
  const lampA = new THREE.PointLight(0xe3a23a, 28, 48, 2);
  lampA.position.set(-10, 8, -8);
  scene.add(lampA);
  const lampB = new THREE.PointLight(0xfff1d0, 18, 40, 2);
  lampB.position.set(12, 7, 10);
  scene.add(lampB);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 40), concrete);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const gridPts: number[] = [];
  for (let i = -40; i <= 40; i += 4) {
    gridPts.push(-40, 0.02, i, 40, 0.02, i, i, 0.02, -40, i, 0.02, 40);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3));
  scene.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x5c6770 })));

  const craneModel = createCraneModel();
  const { truck, slew, boom, tip, mast, wheels, rigs } = craneModel;
  scene.add(truck);

  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), ropeMat);
  scene.add(rope);

  const hook = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.36), steelDark);
  const cheek = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), amber);
  cheek.rotation.z = Math.PI / 2;
  cheek.position.x = 0.16;
  const cheek2 = cheek.clone();
  cheek2.position.x = -0.16;
  const throat = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 8, 14, Math.PI), steel);
  throat.rotation.z = Math.PI;
  throat.position.y = -0.28;
  hook.add(block, cheek, cheek2, throat);
  hook.scale.setScalar(0.55);
  scene.add(hook);

  const loads = (["crate", "beam", "heavy"] as const).map(() => {
    const mat = crateMat.clone();
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.18, 1.62), stripe);
    group.add(mesh, band);
    scene.add(group);
    const shade = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 16),
      new THREE.MeshBasicMaterial({ color: 0x050607, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    shade.rotation.x = -Math.PI / 2;
    shade.position.y = 0.03;
    scene.add(shade);
    return { group, mat, shade };
  });

  function ring(material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.15, 28), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.04;
    scene.add(mesh);
    return mesh;
  }
  const sourceRing = ring(ringSteel);
  const targetRing = ring(ringAmber);
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), beaconMat);
  scene.add(beacon);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), steelDark);
  scene.add(pole);

  for (const [x, y, z, h] of [
    [-24, 1.3, -20, 2.6],
    [26, 1.3, 8, 2.6],
    [22, 1.3, 22, 2.6],
    [-26, 1.3, 12, 2.6],
    [26, 3.9, 8, 2.6],
  ] as const) {
    const can = new THREE.Mesh(new THREE.BoxGeometry(2.4, h, 6), y > 2 ? steelDark : steel);
    can.position.set(x, y, z);
    scene.add(can);
  }

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3e4650, roughness: 0.92, metalness: 0.02 });
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x8d7b62, roughness: 0.95, metalness: 0 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xc9d6df,
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.45,
  });
  const road = new THREE.Mesh(new THREE.BoxGeometry(96, 0.04, 7), roadMat);
  road.position.set(0, 0.03, 2);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(7, 0.04, 70), roadMat);
  cross.position.set(-8, 0.025, -6);
  const apron = new THREE.Mesh(new THREE.CircleGeometry(16, 20), dirtMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(40, 0.02, -32);
  scene.add(road, cross, apron);

  const fenceMat = steelDark;
  for (const edge of [-48, 48]) {
    for (let z = -40; z <= 36; z += 8) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.16), fenceMat);
      post.position.set(edge, 0.8, z);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 8), amber);
      rail.position.set(edge, 1.15, z + 4);
      scene.add(post, rail);
    }
  }

  const office = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.6, 4.2), steel);
  office.position.set(-18, 1.3, 24);
  const officeGlass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.08), glassMat);
  officeGlass.position.set(-18, 1.6, 26.12);
  scene.add(office, officeGlass);

  const lowboyWheel = new THREE.CylinderGeometry(0.48, 0.48, 0.36, 10);
  lowboyWheel.rotateZ(Math.PI / 2);
  const lowboy = new THREE.Group();
  lowboy.visible = false;
  scene.add(lowboy);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.1, 3.2), steel);
  cab.position.set(0, 1.45, -5.2);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.28, 12), steelDark);
  bed.position.set(0, 0.85, 4.2);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 3.2), steelDark);
  neck.position.set(0, 0.95, -1.6);
  lowboy.add(cab, bed, neck);
  for (const [x, z] of [
    [1.15, -5.6],
    [-1.15, -5.6],
    [1.2, 1.2],
    [-1.2, 1.2],
    [1.2, 6.4],
    [-1.2, 6.4],
    [1.2, 8.6],
    [-1.2, 8.6],
  ] as const) {
    const hub = new THREE.Group();
    hub.position.set(x, 0.48, z);
    hub.add(new THREE.Mesh(lowboyWheel, steelDark));
    lowboy.add(hub);
  }
  const dropMark = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.7, 28), ringAmber);
  dropMark.rotation.x = -Math.PI / 2;
  dropMark.position.set(LOWBOY_DROP.x, 0.05, LOWBOY_DROP.z);
  dropMark.visible = false;
  scene.add(dropMark);

  const rise = new THREE.Group();
  rise.position.set(40, 0, -32);
  scene.add(rise);
  const colGeo = new THREE.BoxGeometry(0.35, 16, 0.35);
  for (const x of [-5, -1.6, 1.6, 5]) {
    for (const z of [-4, 0, 4]) {
      const col = new THREE.Mesh(colGeo, steel);
      col.position.set(x, 8, z);
      rise.add(col);
    }
  }
  const slabGeo = new THREE.BoxGeometry(12, 0.22, 10);
  for (let level = 0; level < 5; level += 1) {
    const slab = new THREE.Mesh(slabGeo, level === 4 ? concrete : steelDark);
    slab.position.y = 3.2 * level + 0.2;
    rise.add(slab);
  }

  const site = dressSite(scene, {
    renderer,
    hemi,
    sun: moon,
    lampA,
    lampB,
    fog: scene.fog as THREE.FogExp2,
    ground: concrete,
  });

  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geos.add(mesh.geometry);
    if (mesh.material) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of list) mats.add(m);
    }
  });

  const camPos = new THREE.Vector3(0, 12, 22);
  const look = new THREE.Vector3(0, 4, -8);
  const lookTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();
  let shake = 0;
  let nightMix = 0;
  let view: CamView = "chase";
  let orbit = 0;
  let pitch = 0;

  function setView(next: CamView) {
    view = next;
    orbit = next === "wide" ? 0.6 : 0;
    pitch = next === "wide" ? 24 : 0;
  }

  function nudge(dx: number, dy: number) {
    const wide = view === "wide";
    orbit -= dx * (wide ? 0.012 : 0.006);
    if (wide) pitch = Math.max(8, Math.min(56, pitch - dy * 0.07));
    else pitch = Math.max(-8, Math.min(16, pitch - dy * 0.035));
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, w < 800 ? 1.25 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 48 : 40;
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);
  resize();

  function render(sim: CraneSim, frameDt: number) {
    const wantNight = sim.career.job === "night" ? 1 : 0;
    nightMix += (wantNight - nightMix) * Math.min(1, frameDt * 1.4);
    site.applyNight(nightMix);
    const face = sim.bodyHeading();
    slew.rotation.y = sim.yaw - face;
    const mount = sim.crane === "tower" ? 1.45 + (sim.mountY - 1.45) * (1 - sim.stow) : sim.mountY;
    slew.position.y = mount;
    mast.scale.y = sim.crane === "tower" ? 0.04 + (1 - sim.stow) * 0.96 : 1;
    boom.rotation.x = sim.boomPitch;
    const packed = sim.state !== "lifting";
    const shown = packed ? sim.travelLength() : sim.baseLen + sim.extension;
    const overlap = Math.min(3.4, sim.baseLen * 0.5);
    const slide = packed ? 0.2 : Math.max(0.8, sim.extension + overlap);
    applyCraneLook(craneModel, sim.crane, shown, packed, sim.stow, slide);
    const hookScale =
      sim.crane === "crawler" ? 0.72 : sim.crane === "heavy" ? 0.7 : sim.crane === "lattice" ? 0.64 : sim.crane === "yard" ? 0.6 : sim.crane === "tower" ? 0.58 : 0.5;
    hook.scale.setScalar(hookScale);
    const origin = sim.rigOrigin();
    truck.position.set(origin.x, origin.y, origin.z);
    truck.rotation.y = face;
    truck.rotation.z = sim.hauling ? 0 : sim.roll;
    const showHaul = sim.crane === "crawler" && (sim.hauling || sim.crawlerOnSite);
    lowboy.visible = showHaul;
    dropMark.visible = sim.hauling;
    if (sim.hauling) {
      lowboy.position.set(sim.truckX, 0, sim.truckZ);
      lowboy.rotation.y = sim.heading;
    } else if (showHaul) {
      lowboy.position.set(sim.haulX, 0, sim.haulZ);
      lowboy.rotation.y = sim.haulH;
    }
    const spin = (sim.speed * frameDt) / 0.48;
    for (const wheel of wheels) wheel.rotation.x -= spin;
    for (const hub of craneModel.frontHubs) hub.rotation.y = -sim.driveSteer * 0.5;
    const showPads = sim.crane !== "crawler";
    const reach = Math.min(1, sim.outrigger / 0.57);
    const down = Math.max(0, (sim.outrigger - 0.57) / 0.43);
    for (const rig of rigs) {
      rig.beam.visible = showPads;
      rig.pad.visible = showPads;
      rig.beam.scale.x = 0.35 + reach * 1.7;
      rig.beam.position.x = rig.sign * (1.15 + reach * 1.15);
      rig.pad.position.x = rig.sign * (1.35 + reach * 1.7);
      rig.pad.position.y = 0.42 - down * 0.38;
    }
    truck.updateWorldMatrix(true, true);
    tip.getWorldPosition(mid);
    const b = { x: mid.x, y: mid.y, z: mid.z };

    dir.set(sim.hx - b.x, sim.hy - b.y, sim.hz - b.z);
    const length = Math.max(0.2, dir.length());
    dir.multiplyScalar(1 / length);
    mid.set((sim.hx + b.x) * 0.5, (sim.hy + b.y) * 0.5, (sim.hz + b.z) * 0.5);
    rope.position.copy(mid);
    rope.quaternion.setFromUnitVectors(UP, dir);
    rope.scale.set(1, length, 1);

    hook.position.set(sim.hx, sim.hy, sim.hz);
    dir.multiplyScalar(-1);
    hook.quaternion.setFromUnitVectors(UP, dir);

    sim.pieces.forEach((piece, i) => {
      const view = loads[i];
      if (!view) return;
      view.group.position.set(piece.x, piece.y, piece.z);
      const heavy = piece.kind === "heavy";
      const beam = piece.kind === "beam";
      view.group.scale.set(heavy ? 1.85 : beam ? 0.5 : 1, heavy ? 1.7 : beam ? 0.38 : 1, heavy ? 1.85 : beam ? 2.8 : 1);
      view.mat.color.setHex(heavy ? 0x4a4038 : beam ? 0x8d98a4 : 0xc4894a);
      view.shade.position.x = piece.x;
      view.shade.position.z = piece.z;
      const lift = Math.max(0, piece.y - (heavy ? 1.25 : beam ? 0.32 : sim.cargoHalf));
      (view.shade.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(0.45 - lift * 0.03, 0.12, 0.45);
      view.shade.scale.setScalar(THREE.MathUtils.clamp(1 + lift * 0.04, 1, 1.6));
    });

    const src = PADS[sim.from]!;
    const deck = sim.roofActive ? sim.roofDeck() : null;
    const dst = PADS[sim.to]!;
    sourceRing.position.x = src.x;
    sourceRing.position.z = src.z;
    targetRing.position.set(deck ? deck.x : dst.x, deck ? deck.y + 0.08 : 0.04, deck ? deck.z : dst.z);
    const edge = 2.3;
    const sign = (deck ? deck.x : dst.x) >= 0 ? 1 : -1;
    const px = (deck ? deck.x : dst.x) + (deck ? -4.2 : sign * edge);
    const pz = deck ? deck.z : dst.z;
    const py = deck ? deck.y : 0;
    pole.position.set(px, py + 1.6, pz);
    beacon.position.set(px, py + 3.5, pz);
    beacon.rotation.y += frameDt * 0.8;

    const fx = -Math.sin(sim.yaw);
    const fz = -Math.cos(sim.yaw);
    const yaw = sim.yaw + orbit;
    const height = Math.max(2.4, 9 + pitch);
    if (view === "cab") {
      const hx = -Math.sin(sim.heading);
      const hz = -Math.cos(sim.heading);
      desired.set(sim.truckX - hx * 6, Math.max(2.8, 4.2 + pitch * 0.25), sim.truckZ - hz * 6);
      lookTarget.set(sim.hx, Math.max(1.5, sim.hy), sim.hz);
    } else if (view === "hook") {
      desired.set(sim.hx + Math.sin(yaw) * 7, Math.max(1.8, sim.hy + 3.2 + pitch * 0.45), sim.hz + Math.cos(yaw) * 7);
      lookTarget.set(sim.hx, sim.hy, sim.hz);
    } else if (view === "wide") {
      const dist = 28 + pitch;
      desired.set(sim.truckX + Math.sin(orbit) * dist, 6 + pitch * 0.7, sim.truckZ + Math.cos(orbit) * dist);
      lookTarget.set(sim.truckX, 5, sim.truckZ);
    } else if (view === "high") {
      desired.set(sim.hx + Math.sin(yaw) * 8, Math.max(16, 28 + pitch), sim.hz + Math.cos(yaw) * 8);
      lookTarget.set((sim.hx + dst.x) * 0.5, 1.5, (sim.hz + dst.z) * 0.5);
    } else if (view === "truck") {
      const hx = -Math.sin(sim.heading);
      const hz = -Math.cos(sim.heading);
      desired.set(sim.truckX - hx * 16, 7.2, sim.truckZ - hz * 16);
      lookTarget.set(sim.truckX + hx * 10, 2.4, sim.truckZ + hz * 10);
    } else {
      desired.set(
        sim.truckX + Math.sin(yaw) * 20 + Math.cos(yaw) * 8,
        height,
        sim.truckZ + Math.cos(yaw) * 20 - Math.sin(yaw) * 8,
      );
      lookTarget.set(sim.hx * 0.72 + fx * 2, Math.max(3.2, sim.hy), sim.hz * 0.72 + fz * 2);
    }
    const k = 1 - Math.exp(-2.6 * frameDt);
    camPos.lerp(desired, k);
    look.lerp(lookTarget, k);
    if (sim.impulse > 0) {
      shake = Math.max(shake, sim.impulse);
      sim.impulse = 0;
    }
    shake *= Math.exp(-3.2 * frameDt);
    camera.position.copy(camPos);
    camera.position.x += Math.sin(performance.now() * 0.04) * shake;
    camera.lookAt(look);

    renderer.render(scene, camera);
  }

  function dispose() {
    observer.disconnect();
    renderer.dispose();
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  }

  return { renderer, render, resize, dispose, setView, nudge };
}
