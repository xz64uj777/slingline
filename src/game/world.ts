import * as THREE from "three";
import { LOWBOY_DROP, PADS, type CraneSim } from "@/game/sim";
import { levelOf } from "@/game/career";
import { LOAD_KINDS, loadSpec, type LoadKind } from "@/game/loads";
import { dressSite } from "@/game/scenery";
import { applyCraneLook, createCraneModel, operatorSeat, setBeaconPulse } from "@/game/rig-model";
import { placeSling } from "@/game/sling";
import { detectShadowQuality, SHADOW_MAP_SIZE } from "./shadow-quality.ts";

export type CamView = "chase" | "cab" | "hook" | "high" | "wide" | "truck" | "operator";

export type YardHandlers = {
  /** The GPU dropped the WebGL context; the caller should pause and say so. */
  onContextLost?: () => void;
  /** The context came back and the yard can be drawn again. */
  onContextRestored?: () => void;
};

export type Yard = {
  renderer: THREE.WebGLRenderer;
  render: (sim: CraneSim, frameDt: number) => void;
  resize: () => void;
  dispose: () => void;
  setView: (view: CamView) => void;
  nudge: (dx: number, dy: number) => void;
  zoomBy: (factor: number) => void;
};

const UP = new THREE.Vector3(0, 1, 0);

/** Half-size of the sun's orthographic shadow box, in world units. */
const SHADOW_EXTENT = 24;
/** Sun direction. The shadow camera rides this offset above its focus point. */
const SUN_OFFSET = new THREE.Vector3(30, 42, 15);

/**
 * Prefiltered sky for image-based lighting.
 *
 * One sun and a hemisphere light leave paint, chrome and glass with nothing to
 * reflect but the lamps, so the machines read as flat plastic. This builds a
 * tiny equirectangular sky — zenith, horizon band, ground and one HDR sun blob
 * aimed along the sun direction — and runs it through PMREM, so rough surfaces
 * get blurred reflections and polished ones get a highlight. Day colours only;
 * applyNight dims the whole environment alongside the night mix.
 */
function buildSkyEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture | null {
  try {
    const width = 128;
    const height = 64;
    const data = new Uint16Array(width * height * 4);
    const zenith = new THREE.Color(0x7fa7cc);
    const horizon = new THREE.Color(0xeaf0f4);
    const ground = new THREE.Color(0x5f5647);
    const sun = new THREE.Color(0xfff2d2);
    const sunDir = SUN_OFFSET.clone().normalize();
    const dir = new THREE.Vector3();
    const sky = new THREE.Color();
    const half = THREE.DataUtils.toHalfFloat;

    for (let y = 0; y < height; y += 1) {
      const sinLat = Math.sin(((y + 0.5) / height - 0.5) * Math.PI);
      const cosLat = Math.cos(((y + 0.5) / height - 0.5) * Math.PI);
      for (let x = 0; x < width; x += 1) {
        const lon = ((x + 0.5) / width - 0.5) * Math.PI * 2;
        dir.set(Math.sin(lon) * cosLat, sinLat, Math.cos(lon) * cosLat);
        if (sinLat >= 0) sky.copy(horizon).lerp(zenith, Math.pow(sinLat, 0.55));
        else sky.copy(horizon).lerp(ground, Math.pow(-sinLat, 0.5));
        // HDR sun: the tight lobe is the specular highlight, the wide one haze.
        const d = Math.max(0, dir.dot(sunDir));
        const glow = Math.pow(d, 220) * 6 + Math.pow(d, 8) * 0.3;
        const i = (y * width + x) * 4;
        data[i] = half(sky.r + sun.r * glow);
        data[i + 1] = half(sky.g + sun.g * glow);
        data[i + 2] = half(sky.b + sun.b * glow);
        data[i + 3] = half(1);
      }
    }

    const equirect = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.HalfFloatType,
    );
    equirect.mapping = THREE.EquirectangularReflectionMapping;
    equirect.colorSpace = THREE.LinearSRGBColorSpace;
    equirect.minFilter = THREE.LinearFilter;
    equirect.magFilter = THREE.LinearFilter;
    equirect.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const target = pmrem.fromEquirectangular(equirect);
    pmrem.dispose();
    equirect.dispose();
    return target.texture;
  } catch (error) {
    // No half-float filtering: keep rendering, just without reflections.
    console.warn("[yard] sky environment unavailable", error);
    return null;
  }
}

export function createYard(canvas: HTMLCanvasElement, handlers: YardHandlers = {}): Yard {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Filmic curve: highlights roll off instead of clipping, which is what made
  // the bare primitives read as flat. Exposure is the single knob to taste.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const shadowQuality = detectShadowQuality();
  const shadowsOn = shadowQuality !== "off";
  const shadowMapSize = shadowQuality === "off" ? 0 : SHADOW_MAP_SIZE[shadowQuality];
  renderer.shadowMap.enabled = shadowsOn;
  renderer.shadowMap.type =
    shadowQuality === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.setClearColor(0xd7e3ec, 1);

  const handleContextLost = (event: Event) => {
    // Without preventDefault the browser will not attempt a restore.
    event.preventDefault();
    handlers.onContextLost?.();
  };
  const handleContextRestored = () => {
    resize();
    handlers.onContextRestored?.();
  };
  canvas.addEventListener("webglcontextlost", handleContextLost, false);
  canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd7e3ec, 0.004);
  const environment = buildSkyEnvironment(renderer);
  if (environment) {
    scene.environment = environment;
    // Subtle: reflections sit under the sun's key light, they do not replace it.
    scene.environmentIntensity = 0.28;
  }
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
  moon.position.copy(SUN_OFFSET);
  moon.castShadow = shadowsOn;
  if (shadowsOn) {
    moon.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    moon.shadow.bias = -0.0002;
    moon.shadow.normalBias = 0.04;
  }
  const shadowCamera = moon.shadow.camera;
  shadowCamera.left = -SHADOW_EXTENT;
  shadowCamera.right = SHADOW_EXTENT;
  shadowCamera.top = SHADOW_EXTENT;
  shadowCamera.bottom = -SHADOW_EXTENT;
  shadowCamera.near = 1;
  shadowCamera.far = 140;
  shadowCamera.updateProjectionMatrix();
  scene.add(moon, moon.target);
  const lampA = new THREE.PointLight(0xe3a23a, 28, 48, 2);
  lampA.position.set(-10, 8, -8);
  scene.add(lampA);
  const lampB = new THREE.PointLight(0xfff1d0, 18, 40, 2);
  lampB.position.set(12, 7, 10);
  scene.add(lampB);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 40), concrete);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
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

  // Work lights: two heads on the boom tip, aimed at the hook, switched on by
  // the player after dark. Off by default so daylight is untouched.
  const workLampMat = new THREE.MeshStandardMaterial({
    color: 0xfff2cf,
    emissive: 0xffe7b0,
    emissiveIntensity: 0,
    roughness: 0.45,
  });
  const workLamps = [-1, 1].map((side) => {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.24, 10), workLampMat);
    const light = new THREE.SpotLight(0xfff0c9, 0, 44, 0.44, 0.7, 1.2);
    // Mounted on the boom head so they travel with the jib.
    housing.position.set(side * 0.34, 0.06, 0.12);
    housing.rotation.x = 0.9;
    light.position.set(side * 0.34, 0.14, 0.12);
    tip.add(housing, light);
    scene.add(light.target);
    return { side, housing, light };
  });

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

  // Four-leg lifting slings and corner shackles. These are separate from the
  // hoist rope so the rigging remains visible while the load is being carried.
  // Thin cylinders rather than lines: a 1 px line aliases badly and vanishes
  // with distance, while a mesh keeps a real silhouette at any range.
  const slingMaterial = new THREE.MeshStandardMaterial({
    color: 0x303943,
    metalness: 0.55,
    roughness: 0.42,
  });
  const slingGeometry = new THREE.CylinderGeometry(0.026, 0.026, 1, 6, 1);
  const slingLegs = Array.from({ length: 4 }, () => {
    const leg = new THREE.Mesh(slingGeometry, slingMaterial);
    leg.visible = false;
    scene.add(leg);
    return leg;
  });
  const shackleMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa6b1, metalness: 0.72, roughness: 0.32 });
  const shackles = Array.from({ length: 4 }, () => {
    const shackle = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), shackleMaterial);
    scene.add(shackle);
    return shackle;
  });

  const box = new THREE.BoxGeometry(1, 1, 1);
  const loadViews = new Map<LoadKind, THREE.Group>();

  const loadMat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.16 });
  const addBox = (group: THREE.Group, mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(box, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  /** One yard model per load kind, built at true size around its centre. */
  const buildLoad = (kind: LoadKind) => {
    const spec = loadSpec(kind);
    const group = new THREE.Group();
    const body = loadMat(spec.color);
    if (kind === "crate") {
      addBox(group, body, 1.6, 1.6, 1.6);
      addBox(group, stripe, 1.62, 0.18, 1.62);
    } else if (kind === "beam") {
      addBox(group, body, 0.62, 0.1, 4.3, 0, 0.22, 0);
      addBox(group, body, 0.62, 0.1, 4.3, 0, -0.22, 0);
      addBox(group, body, 0.12, 0.44, 4.3);
      addBox(group, stripe, 0.64, 0.03, 4.3, 0, 0.28, 0);
    } else if (kind === "heavy") {
      addBox(group, body, 2.24, 2.24, 2.24);
      addBox(group, stripe, 2.26, 0.3, 2.26);
      addBox(group, steelDark, 2.3, 0.12, 2.3, 0, -1.08, 0);
    } else if (kind === "pipe") {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 6.4, 14), body);
      tube.rotation.x = Math.PI / 2;
      group.add(tube);
      for (const z of [-2.2, 0, 2.2]) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.09, 14), stripe);
        band.rotation.x = Math.PI / 2;
        band.position.z = z;
        group.add(band);
      }
    } else if (kind === "truss") {
      addBox(group, body, 1.1, 0.09, 5.2, 0, 0.44, 0);
      addBox(group, body, 1.1, 0.09, 5.2, 0, -0.44, 0);
      for (let i = -2; i <= 2; i += 1) {
        addBox(group, body, 0.07, 0.88, 0.07, 0, 0, i * 1.25);
        const diag = new THREE.Mesh(box, body);
        diag.scale.set(0.06, 1.62, 0.06);
        diag.position.set(0, 0, i * 1.25 + 0.62);
        diag.rotation.x = 0.88;
        group.add(diag);
      }
      addBox(group, stripe, 1.12, 0.04, 5.2, 0, 0.5, 0);
    } else if (kind === "panel") {
      addBox(group, concrete, 3.4, 0.26, 1.8);
      addBox(group, steelDark, 3.4, 0.03, 1.8, 0, 0.145, 0);
      for (const x of [-1.2, 1.2]) {
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 10), steelDark);
        loop.position.set(x, 0.2, 0);
        loop.rotation.y = Math.PI / 2;
        group.add(loop);
      }
    } else if (kind === "hvac") {
      addBox(group, body, 2.0, 1.2, 1.6);
      addBox(group, steelDark, 2.04, 0.08, 1.64, 0, 0.64, 0);
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 14), steelDark);
      fan.position.set(0.35, 0.7, 0);
      group.add(fan);
      for (const x of [-0.75, -0.25, 0.25]) addBox(group, stripe, 0.04, 0.5, 1.5, x, 0, 0.06);
    } else {
      addBox(group, body, 2.4, 2.6, 6.0);
      addBox(group, stripe, 2.42, 0.16, 6.02, 0, 0.9, 0);
      addBox(group, steelDark, 2.44, 0.14, 6.02, 0, -1.2, 0);
      for (const z of [-2.7, -1.4, 0, 1.4, 2.7]) {
        addBox(group, steelDark, 2.44, 2.5, 0.06, 0, 0, z);
      }
    }
    scene.add(group);
    loadViews.set(kind, group);
  };

  for (const kind of LOAD_KINDS) buildLoad(kind);

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

  const containers: THREE.Mesh[] = [];
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
    containers.push(can);
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

  // One sun casts; every surface catches it. The rig, the loads, the carrier
  // and the solid yard furniture all throw shadows (scenery props set their own
  // flags at build time).
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) mesh.receiveShadow = true;
  });
  const casters: THREE.Object3D[] = [
    truck,
    lowboy,
    hook,
    office,
    rise,
    ...containers,
    ...loadViews.values(),
  ];
  for (const caster of casters) {
    caster.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
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
  const seatDir = new THREE.Vector3();
  let shake = 0;
  let nightMix = 0;
  let elapsed = 0;
  let view: CamView = "chase";
  let orbit = 0;
  let pitch = 0;

  function setView(next: CamView) {
    view = next;
    camera.zoom = 1;
    // The seat sits inside the cab, so it wants a wider lens than the chase view.
    camera.fov = next === "operator" ? 54 : camera.aspect < 1 ? 48 : 40;
    camera.updateProjectionMatrix();
    orbit = next === "wide" ? 0.6 : 0;
    pitch = next === "wide" ? 24 : 0;
  }

  function nudge(dx: number, dy: number) {
    const wide = view === "wide";
    orbit -= dx * (wide ? 0.012 : 0.006);
    if (wide) pitch = Math.max(8, Math.min(56, pitch - dy * 0.07));
    else pitch = Math.max(-8, Math.min(16, pitch - dy * 0.035));
  }

  function zoomBy(factor: number) {
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, 0.72, 2.4);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, w < 800 ? 1.25 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = view === "operator" ? 54 : camera.aspect < 1 ? 48 : 40;
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);
  resize();

  function render(sim: CraneSim, frameDt: number) {
    const wantNight = sim.career.job === "night" || sim.night ? 1 : 0;
    nightMix += (wantNight - nightMix) * Math.min(1, frameDt * 1.4);
    elapsed += frameDt;
    site.applyNight(nightMix, sim.lightsOn ? 1 : 0);
    site.setTheme(levelOf(sim.career.job).theme);
    setBeaconPulse(craneModel, nightMix, elapsed);
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
    const outer = 1.35 + reach * 1.8;
    const padY = 0.5 - down * 0.48;
    for (const rig of rigs) {
      rig.beam.visible = showPads;
      rig.pad.visible = showPads;
      rig.beam.scale.x = outer;
      rig.pad.position.set(rig.sign * (outer - 0.02), padY, rig.z);
      // The jack drops out of the beam and lands on the pad, so the foot is
      // always attached to the machine instead of floating under the beam.
      rig.bracket.position.set(rig.sign * (outer - 0.02), 0.5, rig.z);
      const legLen = Math.max(0, 0.51 - (padY + 0.1));
      rig.leg.visible = showPads && legLen > 0.05;
      rig.leg.scale.set(1, legLen, 1);
      rig.leg.position.set(rig.sign * (outer - 0.02), padY + 0.1 + legLen / 2, rig.z);
    }
    truck.updateWorldMatrix(true, true);
    tip.getWorldPosition(mid);
    const b = { x: mid.x, y: mid.y, z: mid.z };

    // Work lights hang off the boom head and aim at the hook.
    const lampTarget = sim.lightsOn ? 1 : 0;
    workLampMat.emissiveIntensity += (lampTarget * 2.4 - workLampMat.emissiveIntensity) * Math.min(1, frameDt * 6);
    for (const lamp of workLamps) {
      lamp.light.target.position.set(sim.hx, sim.hy, sim.hz);
      lamp.light.intensity += (lampTarget * 150 - lamp.light.intensity) * Math.min(1, frameDt * 5);
    }

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

    // Keep lifting slings and shackles stowed during travel and setup.
    const carried = sim.attached && sim.carry != null && sim.state === "lifting" && !sim.hauling
      ? sim.pieces[sim.carry]
      : undefined;
    slingLegs.forEach((leg) => { leg.visible = Boolean(carried); });
    shackles.forEach((shackle) => { shackle.visible = Boolean(carried); });
    if (carried) {
      const spec = loadSpec(carried.kind);
      const halfSpan = spec.halfX;
      const halfLength = spec.halfZ;
      const attachY = carried.y + spec.halfY;
      const apex = new THREE.Vector3(sim.hx, sim.hy - 0.18, sim.hz);
      for (let i = 0; i < 4; i += 1) {
        const xSign = i % 2 === 0 ? -1 : 1;
        const zSign = i < 2 ? -1 : 1;
        const end = new THREE.Vector3(
          carried.x + xSign * halfSpan,
          attachY,
          carried.z + zSign * halfLength,
        );
        placeSling(slingLegs[i]!, apex, end);
        shackles[i]!.position.copy(end);
      }
    }

    for (const piece of sim.pieces) loadViews.get(piece.kind)?.position.set(piece.x, piece.y, piece.z);
    // Only the stocked kinds are drawn; the rest stay parked off-stage.
    for (const [kind, group] of loadViews) group.visible = sim.pieces.some((piece) => piece.kind === kind);

    // Keep the one tight sun frustum over the crane and whatever it is carrying,
    // snapped to whole shadow texels so the edges do not crawl while driving.
    // With the pass switched off there is nothing to track.
    if (shadowsOn) {
      const focusX = (sim.truckX + sim.hx) * 0.5;
      const focusZ = (sim.truckZ + sim.hz) * 0.5;
      const texel = (SHADOW_EXTENT * 2) / shadowMapSize;
      const snapX = Math.round(focusX / texel) * texel;
      const snapZ = Math.round(focusZ / texel) * texel;
      moon.target.position.set(snapX, 0, snapZ);
      moon.position.set(snapX + SUN_OFFSET.x, SUN_OFFSET.y, snapZ + SUN_OFFSET.z);
      moon.target.updateMatrixWorld();
    }

    const src = PADS[sim.from]!;
    const deck = sim.roofActive ? sim.roofDeck() : null;
    const dst = PADS[sim.to]!;
    sourceRing.position.x = src.x;
    sourceRing.position.z = src.z;
    targetRing.position.set(deck ? deck.x : dst.x, deck ? deck.y + 0.08 : 0.04, deck ? deck.z : dst.z);
    // The amber ring is the landing tolerance: draw it at the job's radius so
    // precision work visibly asks for a smaller target than a yard move.
    targetRing.scale.setScalar(sim.setTolerance / 2.15);
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
    } else if (view === "operator") {
      // Operator's seat in the house cab, a hand's width ahead of the glass so
      // the boom and the hook stay framed instead of the near plane filling up.
      operatorSeat(craneModel, desired);
      seatDir.set(sim.hx - desired.x, 0, sim.hz - desired.z);
      if (seatDir.lengthSq() < 1e-4) seatDir.set(fx, 0, fz);
      seatDir.normalize();
      // Out past the cab glass and above the house roof: seated at the glass the
      // near roof fills half the frame, which is not what the view is for.
      desired.addScaledVector(seatDir, 0.95);
      desired.y += 0.45;
      // Sit off the boom's axis, the way the cab does, so the jib does not
      // eclipse the load on the sight line.
      desired.x += Math.cos(sim.yaw) * 0.75;
      desired.z -= Math.sin(sim.yaw) * 0.75;
      lookTarget.set(sim.hx, Math.max(0.8, sim.hy) + pitch * 0.25, sim.hz);
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
    canvas.removeEventListener("webglcontextlost", handleContextLost, false);
    canvas.removeEventListener("webglcontextrestored", handleContextRestored, false);
    renderer.dispose();
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  }

  return { renderer, render, resize, dispose, setView, nudge, zoomBy };
}
