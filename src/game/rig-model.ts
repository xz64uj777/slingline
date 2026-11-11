import * as THREE from "three";
import type { CraneId } from "@/game/cranes";

/**
 * Low-poly machines shaped after real crane types. Paint and proportions come
 * from the reference photos. No logos, no photo textures. The boom tip stays
 * on the same local axis the rope already uses.
 */
export type Outrigger = { beam: THREE.Group; pad: THREE.Group; sign: number };

export type CraneModel = {
  truck: THREE.Group;
  slew: THREE.Group;
  boom: THREE.Group;
  tip: THREE.Object3D;
  mast: THREE.Group;
  tracks: THREE.Group;
  nose: THREE.Object3D;
  wheels: THREE.Mesh[];
  frontHubs: THREE.Group[];
  rigs: Outrigger[];
};

type Look = {
  body: number;
  boom: number;
  cab: number;
  carrier: number;
  accent: number;
  thick: number;
  counter: number;
};

const LOOK: Record<CraneId, Look> = {
  rental: { body: 0x8e969e, boom: 0x5c656d, cab: 0xd5dde4, carrier: 0x3e454c, accent: 0xe3a23a, thick: 1.15, counter: 0.4 },
  yard: { body: 0xc0392b, boom: 0xa83228, cab: 0x1c2024, carrier: 0x171a1d, accent: 0xf4efe4, thick: 1.05, counter: 1.1 },
  heavy: { body: 0xe3a23a, boom: 0xf0b429, cab: 0x1e3a5f, carrier: 0x3a4148, accent: 0x14181c, thick: 0.92, counter: 1.7 },
  lattice: { body: 0xc4492c, boom: 0x9a341c, cab: 0x24282c, carrier: 0x2a241f, accent: 0xf4efe4, thick: 1, counter: 2.1 },
  tower: { body: 0xf0b429, boom: 0xe3a23a, cab: 0xf7f4ee, carrier: 0x4a525a, accent: 0x8d9398, thick: 1, counter: 1.4 },
  crawler: { body: 0x5e6a52, boom: 0x3a4238, cab: 0x2c332c, carrier: 0x2a2e28, accent: 0xe3a23a, thick: 1.05, counter: 1.8 },
};

const AXLES: Record<CraneId, { z: number; steer: boolean; scale: number; track: number }[]> = {
  rental: [
    { z: 1.05, steer: true, scale: 0.62, track: 0.92 },
    { z: -0.75, steer: false, scale: 0.62, track: 0.92 },
  ],
  yard: [
    { z: 1.45, steer: true, scale: 1.75, track: 1.55 },
    { z: -1.25, steer: false, scale: 1.75, track: 1.55 },
  ],
  heavy: [
    { z: 4.7, steer: true, scale: 0.78, track: 1.08 },
    { z: 3.25, steer: true, scale: 0.78, track: 1.08 },
    { z: 1.2, steer: false, scale: 0.78, track: 1.08 },
    { z: -0.4, steer: false, scale: 0.78, track: 1.08 },
    { z: -1.95, steer: false, scale: 0.78, track: 1.08 },
  ],
  lattice: [
    { z: 3.9, steer: true, scale: 0.84, track: 1.08 },
    { z: 2.35, steer: false, scale: 0.84, track: 1.08 },
    { z: 0.7, steer: false, scale: 0.84, track: 1.08 },
    { z: -0.95, steer: false, scale: 0.84, track: 1.08 },
  ],
  tower: [
    { z: 2.1, steer: true, scale: 0.7, track: 1.02 },
    { z: 0.45, steer: false, scale: 0.7, track: 1.02 },
    { z: -1.15, steer: false, scale: 0.7, track: 1.02 },
  ],
  crawler: [],
};

const unit = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.36, 12);
wheelGeo.rotateZ(Math.PI / 2);
const drumGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
drumGeo.rotateZ(Math.PI / 2);

function paint(color: number, rough = 0.55, metal = 0.25) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function put(mesh: THREE.Mesh, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.visible = true;
}

export function createCraneModel(): CraneModel {
  const bodyMat = paint(0x8e969e, 0.5, 0.35);
  const boomMat = paint(0x5c656d, 0.48, 0.4);
  const cabMat = paint(0xd5dde4, 0.45, 0.2);
  const carrierMat = paint(0x3e454c, 0.62, 0.3);
  const accentMat = paint(0xe3a23a, 0.45, 0.15);
  const rubber = paint(0x1a1c1e, 0.9, 0.05);
  const glass = new THREE.MeshStandardMaterial({
    color: 0xc5d0d8,
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const trackMat = paint(0x2a2e32, 0.72, 0.35);

  const truck = new THREE.Group();
  truck.rotation.order = "YZX";

  const chassis = new THREE.Mesh(unit, carrierMat);
  const frame = new THREE.Mesh(unit, carrierMat);
  const nose = new THREE.Mesh(unit, cabMat);
  const noseGlass = new THREE.Mesh(unit, glass);
  const deck = new THREE.Mesh(unit, bodyMat);
  const bumper = new THREE.Mesh(unit, accentMat);
  const stack = new THREE.Mesh(unit, carrierMat);
  truck.add(chassis, frame, deck, nose, noseGlass, bumper, stack);

  const wheels: THREE.Mesh[] = [];
  const frontHubs: THREE.Group[] = [];
  const hubs: { hub: THREE.Group; steer: boolean; mesh: THREE.Mesh }[] = [];
  for (let i = 0; i < 10; i += 1) {
    const hub = new THREE.Group();
    const mesh = new THREE.Mesh(wheelGeo, rubber);
    const rim = new THREE.Mesh(unit, carrierMat);
    rim.scale.set(0.18, 0.5, 0.5);
    hub.add(mesh, rim);
    truck.add(hub);
    wheels.push(mesh);
    hubs.push({ hub, steer: false, mesh });
  }

  const tracks = new THREE.Group();
  tracks.visible = false;
  truck.add(tracks);
  for (const side of [-1, 1]) {
    const tread = new THREE.Mesh(unit, trackMat);
    tread.scale.set(0.86, 0.62, 6.6);
    tread.position.set(side * 1.38, 0.4, 0.35);
    const shoe = new THREE.Mesh(unit, carrierMat);
    shoe.scale.set(1.02, 0.12, 6.8);
    shoe.position.set(side * 1.38, 0.08, 0.35);
    tracks.add(tread, shoe);
    for (let i = 0; i < 7; i += 1) {
      const pad = new THREE.Mesh(unit, trackMat);
      pad.scale.set(0.98, 0.06, 0.42);
      pad.position.set(side * 1.35, 0.06, -2.4 + i * 0.95);
      tracks.add(pad);
    }
  }
  const carbody = new THREE.Mesh(unit, bodyMat);
  carbody.scale.set(2.3, 0.42, 4.6);
  carbody.position.set(0, 0.72, 0.3);
  tracks.add(carbody);

  const rigs: Outrigger[] = [];
  for (const [x, z] of [
    [1.05, 1.6],
    [-1.05, 1.6],
    [1.05, -0.9],
    [-1.05, -0.9],
  ] as const) {
    const sign = Math.sign(x) || 1;
    const beam = new THREE.Group();
    const bar = new THREE.Mesh(unit, carrierMat);
    bar.scale.set(1.35, 0.16, 0.2);
    const stripe = new THREE.Mesh(unit, accentMat);
    stripe.scale.set(1.38, 0.05, 0.24);
    beam.add(bar, stripe);
    beam.position.set(x + sign * 0.4, 0.62, z);
    const pad = new THREE.Group();
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.1, 10), carrierMat);
    const plate = new THREE.Mesh(unit, accentMat);
    plate.scale.set(0.7, 0.04, 0.7);
    plate.position.y = 0.02;
    pad.add(foot, plate);
    pad.position.set(x + sign * 0.8, 0.4, z);
    truck.add(beam, pad);
    rigs.push({ beam, pad, sign });
  }

  const mast = new THREE.Group();
  mast.visible = false;
  mast.position.set(0, 0, -1.6);
  truck.add(mast);
  for (const [x, z] of [
    [-0.55, -0.55],
    [0.55, -0.55],
    [-0.55, 0.55],
    [0.55, 0.55],
  ] as const) {
    const post = new THREE.Mesh(unit, boomMat);
    post.scale.set(0.16, 16, 0.16);
    post.position.set(x, 8, z);
    mast.add(post);
  }
  for (let y = 2; y <= 14; y += 2.4) {
    for (const [sx, sz, px, pz] of [
      [1.3, 0.08, 0, -0.55],
      [1.3, 0.08, 0, 0.55],
      [0.08, 1.3, -0.55, 0],
      [0.08, 1.3, 0.55, 0],
    ] as const) {
      const band = new THREE.Mesh(unit, carrierMat);
      band.scale.set(sx, 0.08, sz);
      band.position.set(px, y, pz);
      mast.add(band);
    }
  }
  const mastBase = new THREE.Mesh(unit, carrierMat);
  mastBase.scale.set(3.4, 0.45, 3.4);
  mastBase.position.y = 0.28;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.28, 12), accentMat);
  ring.position.y = 15.85;
  mast.add(mastBase, ring);

  const slew = new THREE.Group();
  slew.position.set(0, 2.15, -1.6);
  truck.add(slew);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.9, 0.5, 12), carrierMat);
  pedestal.position.y = 0.15;
  const house = new THREE.Mesh(unit, bodyMat);
  const houseCab = new THREE.Mesh(unit, cabMat);
  const houseGlass = new THREE.Mesh(unit, glass);
  const counter = new THREE.Mesh(unit, carrierMat);
  const ballast = new THREE.Mesh(unit, accentMat);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 6), accentMat);
  const winch = new THREE.Mesh(drumGeo, carrierMat);
  const winch2 = new THREE.Mesh(drumGeo, carrierMat);
  slew.add(pedestal, house, houseCab, houseGlass, counter, ballast, beacon, winch, winch2);

  const aLeft = new THREE.Mesh(unit, carrierMat);
  const aRight = new THREE.Mesh(unit, carrierMat);
  slew.add(aLeft, aRight);

  const counterJib = new THREE.Group();
  slew.add(counterJib);
  for (const x of [-0.28, 0.28]) {
    const chord = new THREE.Mesh(unit, boomMat);
    chord.scale.set(0.08, 0.08, 3.2);
    chord.position.set(x, 0.45, 1.7);
    counterJib.add(chord);
  }
  for (let i = 0; i < 3; i += 1) {
    const block = new THREE.Mesh(unit, accentMat);
    block.scale.set(1.1, 0.38, 0.55);
    block.position.set(0, 0.55, 0.7 + i * 0.62);
    counterJib.add(block);
  }

  const boom = new THREE.Group();
  slew.add(boom);
  const tele = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 8), boomMat);
  const teleMid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 8), bodyMat);
  const teleIn = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 8), boomMat);
  const ram = new THREE.Mesh(unit, carrierMat);
  boom.add(tele, teleMid, teleIn, ram);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i += 1) {
    const collar = new THREE.Mesh(unit, carrierMat);
    boom.add(collar);
    rings.push(collar);
  }
  const head = new THREE.Mesh(unit, accentMat);
  const sheave = new THREE.Mesh(drumGeo, carrierMat);
  boom.add(head, sheave);

  const truss = buildTruss(boom, boomMat, carrierMat, 7);
  const jib = buildTruss(boom, boomMat, carrierMat, 6);

  const tip = new THREE.Group();
  const tipBlock = new THREE.Mesh(unit, accentMat);
  tipBlock.scale.set(0.34, 0.16, 0.28);
  const tipSheave = new THREE.Mesh(drumGeo, carrierMat);
  tipSheave.scale.set(0.22, 0.16, 0.22);
  tipSheave.position.y = -0.02;
  tip.add(tipBlock, tipSheave);
  boom.add(tip);

  const model: CraneModel = { truck, slew, boom, tip, mast, tracks, nose, wheels, frontHubs, rigs };

  const parts = {
    bodyMat, boomMat, cabMat, carrierMat, accentMat,
    chassis, frame, nose, noseGlass, deck, bumper, stack,
    hubs, house, houseCab, houseGlass, counter, ballast, beacon, winch, winch2,
    pedestal, aLeft, aRight, counterJib, tele, teleMid, teleIn, ram, rings, head, sheave, truss, jib,
  };

  (model as CraneModel & { parts: typeof parts }).parts = parts;
  return model;
}

type Truss = { chords: THREE.Mesh[]; braces: THREE.Mesh[]; bays: number };

function buildTruss(parent: THREE.Object3D, boomMat: THREE.Material, dark: THREE.Material, bays: number): Truss {
  const chords: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i += 1) {
    const chord = new THREE.Mesh(unit, boomMat);
    parent.add(chord);
    chords.push(chord);
  }
  const braces: THREE.Mesh[] = [];
  for (let i = 0; i < bays * 4; i += 1) {
    const brace = new THREE.Mesh(unit, i % 2 === 0 ? dark : boomMat);
    parent.add(brace);
    braces.push(brace);
  }
  return { chords, braces, bays };
}

type Parts = ReturnType<typeof createCraneModel> extends infer _T
  ? {
      bodyMat: THREE.MeshStandardMaterial;
      boomMat: THREE.MeshStandardMaterial;
      cabMat: THREE.MeshStandardMaterial;
      carrierMat: THREE.MeshStandardMaterial;
      accentMat: THREE.MeshStandardMaterial;
      chassis: THREE.Mesh;
      frame: THREE.Mesh;
      nose: THREE.Mesh;
      noseGlass: THREE.Mesh;
      deck: THREE.Mesh;
      bumper: THREE.Mesh;
      stack: THREE.Mesh;
      hubs: { hub: THREE.Group; steer: boolean; mesh: THREE.Mesh }[];
      house: THREE.Mesh;
      houseCab: THREE.Mesh;
      houseGlass: THREE.Mesh;
      counter: THREE.Mesh;
      ballast: THREE.Mesh;
      beacon: THREE.Mesh;
      winch: THREE.Mesh;
      winch2: THREE.Mesh;
      pedestal: THREE.Mesh;
      aLeft: THREE.Mesh;
      aRight: THREE.Mesh;
      counterJib: THREE.Group;
      tele: THREE.Mesh;
      teleMid: THREE.Mesh;
      teleIn: THREE.Mesh;
      ram: THREE.Mesh;
      rings: THREE.Mesh[];
      head: THREE.Mesh;
      sheave: THREE.Mesh;
      truss: Truss;
      jib: Truss;
    }
  : never;

function partsOf(model: CraneModel): Parts {
  return (model as CraneModel & { parts: Parts }).parts;
}

function hideTruss(truss: Truss) {
  for (const mesh of truss.chords) mesh.visible = false;
  for (const mesh of truss.braces) mesh.visible = false;
}

function showTruss(truss: Truss, shown: number, halfX: number, rise: number, y0: number) {
  const zMid = -shown / 2;
  const corners: [number, number][] = [
    [-halfX, y0],
    [halfX, y0],
    [-halfX * 0.72, y0 + rise],
    [halfX * 0.72, y0 + rise],
  ];
  truss.chords.forEach((chord, i) => {
    const [x, y] = corners[i]!;
    put(chord, x, y, zMid, 0.055, 0.055, Math.max(0.2, shown));
  });
  const bays = truss.bays;
  const bayLen = shown / bays;
  const span = Math.hypot(bayLen, rise);
  const tilt = Math.atan2(rise, bayLen);
  for (let bay = 0; bay < bays; bay += 1) {
    const z = -shown * ((bay + 0.5) / bays);
    for (let k = 0; k < 4; k += 1) {
      const mesh = truss.braces[bay * 4 + k]!;
      mesh.visible = true;
      mesh.rotation.set(0, 0, 0);
      const diag = k % 2 === 0 ? 1 : -1;
      if (k < 2) {
        const side = k === 0 ? -1 : 1;
        mesh.position.set(side * halfX, y0 + rise * 0.5, z);
        mesh.scale.set(0.04, 0.04, span);
        mesh.rotation.x = diag * tilt;
      } else {
        mesh.position.set(0, k === 2 ? y0 : y0 + rise, z);
        mesh.scale.set(0.04, 0.04, Math.hypot(bayLen, halfX * 1.6));
        mesh.rotation.y = diag * Math.atan2(halfX * 1.6, bayLen);
      }
    }
  }
}

export function applyCraneLook(model: CraneModel, crane: CraneId, shown: number, packed: boolean, stow: number, slide: number) {
  const look = LOOK[crane];
  const p = partsOf(model);
  p.bodyMat.color.setHex(look.body);
  p.boomMat.color.setHex(look.boom);
  p.cabMat.color.setHex(look.cab);
  p.carrierMat.color.setHex(look.carrier);
  p.accentMat.color.setHex(look.accent);

  const tele = crane === "rental" || crane === "yard" || crane === "heavy";
  const lattice = crane === "lattice" || crane === "crawler";
  const tower = crane === "tower";
  const erected = tower && stow < 0.45;

  p.chassis.visible = crane !== "crawler";
  p.frame.visible = crane === "heavy" || crane === "lattice";
  p.deck.visible = tele || crane === "lattice";
  p.nose.visible = crane !== "crawler" && !erected;
  p.noseGlass.visible = p.nose.visible;
  p.bumper.visible = crane === "yard" || crane === "heavy" || crane === "lattice";
  p.stack.visible = crane !== "tower";
  model.tracks.visible = crane === "crawler";
  model.mast.visible = tower;

  if (crane === "rental") {
    put(p.chassis, 0, 0.62, 0.15, 2.15, 0.48, 3.5);
    put(p.deck, 0, 0.98, -0.15, 2.05, 0.42, 2.4);
    put(p.nose, 0.05, 1.28, 1.15, 1.35, 0.85, 1.15);
    put(p.noseGlass, 0.05, 1.42, 1.55, 1.15, 0.42, 0.12);
    put(p.stack, -0.7, 1.35, -0.2, 0.12, 0.55, 0.12);
  } else if (crane === "yard") {
    put(p.chassis, 0, 0.98, 0.15, 2.3, 0.5, 5.1);
    put(p.deck, 0, 1.2, -0.35, 2.3, 0.35, 2.6);
    put(p.nose, 0, 1.7, 1.15, 1.7, 1.15, 1.45);
    put(p.noseGlass, 0, 1.85, 1.72, 1.5, 0.55, 0.1);
    put(p.bumper, 0, 0.7, 2.85, 2.5, 0.28, 0.18);
    put(p.stack, 0.85, 1.85, -0.4, 0.14, 0.7, 0.14);
  } else if (crane === "heavy") {
    put(p.chassis, 0, 0.7, 1.35, 2.35, 0.42, 9.6);
    put(p.frame, 0, 0.98, 0.4, 1.15, 0.16, 8.4);
    put(p.deck, 0, 1.15, -0.8, 2.2, 0.28, 3.2);
    put(p.nose, 0, 1.45, 5.15, 2.15, 1.35, 2.05);
    put(p.noseGlass, 0, 1.7, 6.05, 1.9, 0.7, 0.1);
    put(p.bumper, 0, 0.55, 6.15, 2.4, 0.22, 0.16);
    put(p.stack, 0.95, 1.7, 3.4, 0.16, 0.9, 0.16);
  } else if (crane === "lattice") {
    put(p.chassis, 0, 0.72, 1.15, 2.4, 0.48, 8.2);
    put(p.frame, 0, 1.02, 0.6, 1.2, 0.14, 7.2);
    put(p.deck, 0, 1.18, -0.7, 2.35, 0.32, 3.4);
    put(p.nose, 0, 1.42, 4.35, 2.2, 1.25, 1.9);
    put(p.noseGlass, 0, 1.62, 5.15, 1.95, 0.62, 0.1);
    put(p.bumper, 0, 0.55, 5.3, 2.45, 0.22, 0.16);
    put(p.stack, -0.9, 1.7, 2.6, 0.16, 0.85, 0.16);
  } else if (crane === "tower") {
    put(p.chassis, 0, 0.48, 0.4, erected ? 3.2 : 2.3, 0.4, erected ? 3.2 : 6.2);
    put(p.nose, 0, 1.25, 2.5, 2.1, 1.05, 1.7);
    put(p.noseGlass, 0, 1.4, 3.2, 1.8, 0.5, 0.1);
    put(p.stack, 0.7, 1.2, 0.4, 0.12, 0.4, 0.12);
  } else {
    p.stack.visible = true;
    put(p.stack, 0.85, 1.55, 0.9, 0.16, 0.7, 0.16);
  }

  const axles = AXLES[crane];
  p.hubs.forEach((slot, i) => {
    const axle = axles[Math.floor(i / 2)];
    const on = Boolean(axle) && crane !== "crawler" && !(tower && erected);
    slot.hub.visible = on;
    slot.mesh.visible = on;
    if (!axle || !on) return;
    const side = i % 2 === 0 ? 1 : -1;
    slot.steer = axle.steer;
    slot.hub.position.set(side * axle.track, 0.48 * axle.scale, axle.z);
    slot.mesh.scale.setScalar(axle.scale);
    const rim = slot.hub.children[1] as THREE.Mesh;
    rim.visible = true;
    rim.position.set(side * -0.02, 0, 0);
  });
  model.frontHubs.length = 0;
  for (const slot of p.hubs) if (slot.steer && slot.hub.visible) model.frontHubs.push(slot.hub);

  const houseY = crane === "rental" ? 0.55 : crane === "crawler" ? 0.85 : 0.7;
  put(p.house, 0, houseY, crane === "heavy" ? 0.15 : 0.05, crane === "rental" ? 1.7 : 2.05, crane === "rental" ? 0.7 : 0.95, crane === "lattice" || crane === "crawler" ? 2.4 : 1.8);
  put(p.houseCab, crane === "tower" ? 0.85 : 0.15, houseY + 0.72, crane === "tower" ? -0.15 : 0.55, crane === "tower" ? 0.7 : 1.15, 0.7, 0.85);
  put(p.houseGlass, p.houseCab.position.x, p.houseCab.position.y + 0.05, p.houseCab.position.z + 0.4, crane === "tower" ? 0.62 : 1.05, 0.42, 0.08);
  p.houseCab.visible = crane !== "rental";
  p.houseGlass.visible = p.houseCab.visible;
  p.counter.visible = crane !== "rental" && !tower;
  const counterLen = look.counter;
  put(p.counter, 0, 0.55, 0.85 + counterLen * 0.35, crane === "crawler" ? 1.8 : 1.5, packed ? 0.45 : 0.85, counterLen);
  put(p.ballast, 0, 0.95, p.counter.position.z, 1.35, 0.18, counterLen * 0.7);
  p.ballast.visible = p.counter.visible && !packed && (crane === "heavy" || crane === "lattice" || crane === "crawler");
  put(p.beacon, 0, houseY + 1.15, -0.1, 1, 1, 1);
  p.beacon.scale.set(1, 1, 1);
  put(p.winch, -0.35, houseY + 0.15, -0.35, 0.55, 0.7, 0.55);
  put(p.winch2, 0.35, houseY + 0.15, -0.35, 0.45, 0.55, 0.45);
  p.winch.visible = crane === "rental" || crane === "crawler" || crane === "lattice";
  p.winch2.visible = p.winch.visible && crane !== "rental";
  p.pedestal.visible = !tower;
  if (!tower) {
    p.pedestal.scale.set(look.thick, 0.7 + look.thick * 0.35, look.thick);
    p.pedestal.position.y = 0.12;
  }

  const gantry = crane === "crawler" || crane === "lattice";
  p.aLeft.visible = gantry && !packed;
  p.aRight.visible = p.aLeft.visible;
  if (gantry) {
    put(p.aLeft, -0.45, 1.35, 0.15, 0.08, 1.5, 0.08);
    put(p.aRight, 0.45, 1.35, 0.15, 0.08, 1.5, 0.08);
    p.aLeft.rotation.x = -0.45;
    p.aRight.rotation.x = -0.45;
  }

  p.counterJib.visible = tower && !packed;

  p.tele.visible = tele;
  p.teleMid.visible = tele && !packed;
  p.teleIn.visible = tele && !packed && slide > 1;
  p.ram.visible = tele && !packed;
  p.head.visible = tele;
  p.sheave.visible = tele && !packed;
  if (tele) {
    const thick = look.thick;
    p.tele.scale.set(thick, thick * 0.82, shown / 8);
    p.tele.position.set(0, 0.22, -shown / 2);
    p.teleMid.scale.set(thick * 0.72, thick * 0.6, Math.max(0.3, slide) / 8);
    p.teleMid.position.set(0, 0.22, -shown + Math.max(0.3, slide) / 2);
    p.teleIn.scale.set(thick * 0.5, thick * 0.42, Math.max(0.2, slide * 0.62) / 8);
    p.teleIn.position.set(0, 0.22, -shown + slide * 0.25);
    put(p.ram, 0, -0.05, -shown * 0.28, 0.1 * thick, 0.1 * thick, shown * 0.45);
    put(p.head, 0, 0.22, -shown, 0.5 * thick, 0.22 * thick, 0.36);
    p.sheave.position.set(0, 0.05, -shown);
    p.sheave.scale.set(0.28 * thick, 0.22, 0.28 * thick);
    const sections = crane === "heavy" ? 4 : crane === "yard" ? 3 : 2;
    p.rings.forEach((ringMesh, i) => {
      ringMesh.visible = i < sections;
      if (i >= sections) return;
      const along = shown * ((i + 1) / (sections + 1));
      put(ringMesh, 0, 0.22, -along, 0.5 * thick, 0.46 * thick, 0.06);
    });
  } else {
    for (const ringMesh of p.rings) ringMesh.visible = false;
  }

  if (lattice) {
    showTruss(p.truss, shown, crane === "crawler" ? 0.42 : 0.38, crane === "crawler" ? 0.7 : 0.85, 0.05);
  } else hideTruss(p.truss);
  if (tower && !packed) showTruss(p.jib, shown, 0.46, 0.32, 0.15);
  else hideTruss(p.jib);

  model.tip.position.set(0, tele ? 0.22 : 0.28, -shown);
  model.tip.visible = true;
}
