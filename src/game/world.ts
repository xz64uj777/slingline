import * as THREE from "three";
import { PADS, type CraneSim } from "@/game/sim";

export type CamView = "chase" | "cab" | "hook" | "high";

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

  scene.add(new THREE.HemisphereLight(0xf2f7fb, 0xd9d3c6, 1.35));
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

  const mast = new THREE.Group();
  scene.add(mast);
  const postGeo = new THREE.BoxGeometry(0.28, 16, 0.28);
  for (const [x, z] of [
    [-0.7, -0.7],
    [0.7, -0.7],
    [-0.7, 0.7],
    [0.7, 0.7],
  ] as const) {
    const post = new THREE.Mesh(postGeo, steel);
    post.position.set(x, 8, z);
    mast.add(post);
  }
  const bandGeo = new THREE.BoxGeometry(1.7, 0.12, 0.12);
  const bandGeoZ = new THREE.BoxGeometry(0.12, 0.12, 1.7);
  for (let y = 2; y <= 14; y += 3) {
    const a = new THREE.Mesh(bandGeo, steelDark);
    const b = new THREE.Mesh(bandGeo, steelDark);
    const c = new THREE.Mesh(bandGeoZ, steelDark);
    const d = new THREE.Mesh(bandGeoZ, steelDark);
    a.position.set(0, y, -0.7);
    b.position.set(0, y, 0.7);
    c.position.set(-0.7, y, 0);
    d.position.set(0.7, y, 0);
    mast.add(a, b, c, d);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.6, 4.2), steelDark);
  base.position.y = 0.3;
  mast.add(base);

  const slew = new THREE.Group();
  scene.add(slew);
  const jibTop = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 27), steel);
  jibTop.position.set(0, 16.7, -12.5);
  slew.add(jibTop);
  const jibBot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 25), steelDark);
  jibBot.position.set(0, 15.15, -12);
  slew.add(jibBot);
  const braceGeo = new THREE.BoxGeometry(0.12, 1.55, 0.12);
  for (let z = -2; z >= -24; z -= 2.4) {
    const brace = new THREE.Mesh(braceGeo, steel);
    brace.position.set(0, 15.9, z);
    slew.add(brace);
  }
  const counter = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 10), steel);
  counter.position.set(0, 16.7, 5);
  slew.add(counter);
  const weight = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 2.2), steelDark);
  weight.position.set(0, 15.4, 8.2);
  slew.add(weight);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 1.8), steelDark);
  cab.position.set(0, 14.5, 1.3);
  slew.add(cab);
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xc9d6c4,
    emissive: 0x7f9a7c,
    emissiveIntensity: 0.35,
    roughness: 0.2,
    metalness: 0.1,
  });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.55, 0.08), windowMat);
  glass.position.set(0, 14.55, 0.35);
  slew.add(glass);

  const trolley = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.9), amber);
  trolley.position.set(0, 16.35, -14);
  slew.add(trolley);

  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 6), ropeMat);
  scene.add(rope);

  const hook = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.55), amber);
  const throat = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 8, 14, Math.PI), steel);
  throat.rotation.z = Math.PI;
  throat.position.y = -0.22;
  hook.add(block, throat);
  hook.scale.setScalar(1.7);
  scene.add(hook);

  const cargo = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), crateMat);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.18, 1.62), stripe);
  cargo.add(box, band);
  scene.add(cargo);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 16),
    new THREE.MeshBasicMaterial({ color: 0x050607, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  scene.add(shadow);

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
  let view: CamView = "chase";
  let orbit = 0;
  let pitch = 0;

  function setView(next: CamView) {
    view = next;
    orbit = 0;
    pitch = 0;
  }

  function nudge(dx: number, dy: number) {
    orbit -= dx * 0.006;
    pitch = Math.max(-8, Math.min(16, pitch - dy * 0.035));
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
    slew.rotation.y = sim.yaw;
    trolley.position.z = -sim.trolley;
    const b = sim.boom();

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

    if (sim.attached || sim.phase === "broke" || sim.phase === "done") {
      const y = sim.attached ? sim.hy - sim.hang : sim.cy;
      const x = sim.attached ? sim.hx : sim.cx;
      const z = sim.attached ? sim.hz : sim.cz;
      cargo.position.set(x, y, z);
    } else {
      cargo.position.set(sim.cx, sim.cy, sim.cz);
    }
    cargo.visible = true;
    shadow.position.x = cargo.position.x;
    shadow.position.z = cargo.position.z;
    const lift = Math.max(0, cargo.position.y - sim.cargoHalf);
    (shadow.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(0.45 - lift * 0.03, 0.12, 0.45);
    shadow.scale.setScalar(THREE.MathUtils.clamp(1 + lift * 0.04, 1, 1.6));

    const src = PADS[sim.from]!;
    const dst = PADS[sim.to]!;
    sourceRing.position.x = src.x;
    sourceRing.position.z = src.z;
    targetRing.position.x = dst.x;
    targetRing.position.z = dst.z;
    const edge = 2.3;
    const sign = dst.x >= 0 ? 1 : -1;
    pole.position.set(dst.x + sign * edge, 1.6, dst.z);
    beacon.position.set(dst.x + sign * edge, 3.5, dst.z);
    beacon.rotation.y += frameDt * 0.8;

    const fx = -Math.sin(sim.yaw);
    const fz = -Math.cos(sim.yaw);
    const yaw = sim.yaw + orbit;
    const height = Math.max(2.4, 9 + pitch);
    if (view === "cab") {
      const seat = 4.5;
      desired.set(-fx * seat, Math.max(8, 12 + pitch * 0.4), -fz * seat);
      const lookYaw = sim.yaw + orbit * 0.65;
      lookTarget.set(-Math.sin(lookYaw) * sim.trolley, Math.max(2, sim.hy + 1), -Math.cos(lookYaw) * sim.trolley);
    } else if (view === "hook") {
      desired.set(sim.hx + Math.sin(yaw) * 7, Math.max(1.8, sim.hy + 3.2 + pitch * 0.45), sim.hz + Math.cos(yaw) * 7);
      lookTarget.set(sim.hx, sim.hy, sim.hz);
    } else if (view === "high") {
      desired.set(sim.hx + Math.sin(yaw) * 8, Math.max(16, 28 + pitch), sim.hz + Math.cos(yaw) * 8);
      lookTarget.set((sim.hx + dst.x) * 0.5, 1.5, (sim.hz + dst.z) * 0.5);
    } else {
      desired.set(Math.sin(yaw) * 20 + Math.cos(yaw) * 8, height, Math.cos(yaw) * 20 - Math.sin(yaw) * 8);
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
