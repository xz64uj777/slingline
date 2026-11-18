import type { CraneId, CraneSim } from "@/game/sim";

type Voice = {
  power: "diesel" | "electric";
  idle: number;
  rev: number;
  hyd: number;
  body: number;
  winch: boolean;
  tracks: boolean;
  backup: boolean;
  slewBell: boolean;
};

const VOICE: Record<CraneId, Voice> = {
  rental: { power: "diesel", idle: 72, rev: 118, hyd: 390, body: 0.7, winch: false, tracks: false, backup: true, slewBell: false },
  yard: { power: "diesel", idle: 58, rev: 96, hyd: 280, body: 0.85, winch: false, tracks: false, backup: true, slewBell: false },
  heavy: { power: "diesel", idle: 42, rev: 74, hyd: 190, body: 1, winch: false, tracks: false, backup: true, slewBell: false },
  lattice: { power: "diesel", idle: 48, rev: 82, hyd: 150, body: 0.9, winch: true, tracks: false, backup: true, slewBell: true },
  tower: { power: "electric", idle: 50, rev: 50, hyd: 0, body: 0.4, winch: true, tracks: false, backup: false, slewBell: true },
  crawler: { power: "diesel", idle: 38, rev: 64, hyd: 160, body: 1, winch: true, tracks: true, backup: false, slewBell: true },
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 1;
let noise: AudioBuffer | null = null;
let engineNoise: AudioBufferSourceNode | null = null;
let engineFilter: BiquadFilterNode | null = null;
let engineGain: GainNode | null = null;
let thump: OscillatorNode | null = null;
let thumpGain: GainNode | null = null;
let hyd: OscillatorNode | null = null;
let hydGain: GainNode | null = null;
let hum: OscillatorNode | null = null;
let humGain: GainNode | null = null;
let lastCable = 0;
let lastBeep = 0;
let lastClank = 0;
let lastWinch = 0;
let lastWindAmp = 0;
let lastGust = 0;
let started = false;
let ambienceGain: GainNode | null = null;
let ambienceFilter: BiquadFilterNode | null = null;
let cueTotal = 0;
const lastCue: Record<string, number> = {};

/** How many confirmation cues have played, for the dev probe. */
export function cueCount() {
  return cueTotal;
}

export function audioContext() {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) ctx = new AudioCtx();
  return ctx;
}

export function unlockAudio() {
  const audio = audioContext();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();
  boot(audio);
}

/** Master output level, 0 to 1. Muting is volume 0. */
export function setAudioVolume(next: number) {
  volume = Math.max(0, Math.min(1, next));
  if (master) master.gain.setTargetAtTime(volume, master.context.currentTime, 0.02);
}

export function audioVolume() {
  return volume;
}

/** Everything that makes noise routes through here so one gain mutes it all. */
export function audioOutput(): AudioNode | null {
  return master;
}

function boot(audio: AudioContext) {
  if (started) return;
  started = true;
  master = audio.createGain();
  master.gain.value = volume;
  master.connect(audio.destination);
  const samples = audio.sampleRate * 2;
  noise = audio.createBuffer(1, samples, audio.sampleRate);
  const data = noise.getChannelData(0);
  let last = 0;
  for (let i = 0; i < samples; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.96 + white * 0.04;
    data[i] = last * 0.55;
  }
  engineFilter = audio.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 80;
  engineFilter.Q.value = 0.7;
  engineGain = audio.createGain();
  engineGain.gain.value = 0;
  engineNoise = audio.createBufferSource();
  engineNoise.buffer = noise;
  engineNoise.loop = true;
  engineNoise.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(master);
  engineNoise.start();

  thump = audio.createOscillator();
  thump.type = "triangle";
  thump.frequency.value = 40;
  thumpGain = audio.createGain();
  thumpGain.gain.value = 0;
  thump.connect(thumpGain);
  thumpGain.connect(master);
  thump.start();

  hyd = audio.createOscillator();
  hyd.type = "triangle";
  hyd.frequency.value = 240;
  hydGain = audio.createGain();
  hydGain.gain.value = 0;
  const hydFilter = audio.createBiquadFilter();
  hydFilter.type = "lowpass";
  hydFilter.frequency.value = 900;
  hyd.connect(hydFilter);
  hydFilter.connect(hydGain);
  hydGain.connect(master);
  hyd.start();

  hum = audio.createOscillator();
  hum.type = "sine";
  hum.frequency.value = 60;
  humGain = audio.createGain();
  humGain.gain.value = 0;
  hum.connect(humGain);
  humGain.connect(master);
  hum.start();

  // One site bed: a filtered noise loop that reads as yard hum in town and as
  // ridge wind on the turbine pad. The level follows the live gust strength.
  ambienceFilter = audio.createBiquadFilter();
  ambienceFilter.type = "bandpass";
  ambienceFilter.frequency.value = 300;
  ambienceFilter.Q.value = 0.6;
  ambienceGain = audio.createGain();
  ambienceGain.gain.value = 0;
  const bed = audio.createBufferSource();
  bed.buffer = noise;
  bed.loop = true;
  bed.connect(ambienceFilter);
  ambienceFilter.connect(ambienceGain);
  ambienceGain.connect(master);
  bed.start();
}

export type Cue = "latch" | "release" | "ready" | "grade";

/** What the grade cue should say. A clean set gets a brighter, longer sting. */
export type CueDetail = { grade?: "S" | "A" | "B" | "C"; error?: number; limit?: number };

/**
 * Short confirmation sounds for the controls: spliced, set, ready, graded.
 * Throttled per cue so a bouncing state cannot machine-gun the output.
 */
export function rigCue(kind: Cue, now = performance.now(), detail: CueDetail = {}) {
  const audio = audioContext();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();
  boot(audio);
  if (now - (lastCue[kind] ?? 0) < 180) return;
  lastCue[kind] = now;
  cueTotal += 1;
  if (kind === "latch") {
    clank(audio, 0.05);
    tone(audio, 170, 90, 0.03, "triangle");
  } else if (kind === "release") {
    clank(audio, 0.035);
    tone(audio, 96, 180, 0.035, "sine");
  } else if (kind === "ready") {
    tone(audio, 760, 110, 0.03, "sine");
    window.setTimeout(() => tone(audio, 1140, 150, 0.028, "sine"), 120);
  } else {
    // The grade sting carries the result before the debrief is read: S is a
    // rising major third, A a smaller rise, B a flat pair, C a low thud.
    const error = Math.max(0, Math.min(1, detail.error ?? 0.5));
    const base = 700 - error * 220;
    if (detail.grade === "S") {
      tone(audio, base, 150, 0.034, "triangle");
      window.setTimeout(() => tone(audio, base * 1.26, 170, 0.032, "triangle"), 110);
      window.setTimeout(() => tone(audio, base * 1.5, 240, 0.03, "sine"), 230);
    } else if (detail.grade === "A") {
      tone(audio, base, 140, 0.032, "triangle");
      window.setTimeout(() => tone(audio, base * 1.19, 190, 0.03, "triangle"), 120);
    } else if (detail.grade === "C") {
      tone(audio, base * 0.62, 230, 0.036, "sine");
      window.setTimeout(() => tone(audio, base * 0.5, 260, 0.03, "sine"), 140);
    } else {
      tone(audio, base, 140, 0.03, "triangle");
      window.setTimeout(() => tone(audio, base, 170, 0.028, "triangle"), 130);
    }
  }
}

function tone(audio: AudioContext, freq: number, ms: number, volume: number, type: OscillatorType) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = audio.currentTime;
  gain.gain.setValueAtTime(Math.min(volume, 0.018), t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
  osc.connect(gain);
  gain.connect(master ?? audio.destination);
  osc.start();
  osc.stop(t + ms / 1000 + 0.02);
}

function clank(audio: AudioContext, volume: number) {
  if (!noise) return;
  const src = audio.createBufferSource();
  src.buffer = noise;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 640;
  filter.Q.value = 1.4;
  const gain = audio.createGain();
  const t = audio.currentTime;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master ?? audio.destination);
  src.start();
  src.stop(t + 0.08);
}

export function rigAudio(sim: CraneSim, now: number) {
  const audio = audioContext();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();
  boot(audio);
  if (!engineFilter || !engineGain || !thump || !thumpGain || !hyd || !hydGain || !hum || !humGain) return;

  const voice = VOICE[sim.crane];
  const drive = Math.min(1, Math.abs(sim.speed) / 8);
  const work =
    Math.min(1, Math.abs(sim.yawRate) * 1.4 + Math.abs(sim.pitchRate) * 3 + Math.abs(sim.extendRate) * 0.2);
  const cableDelta = Math.abs(sim.cable - lastCable);
  lastCable = sim.cable;
  const hoist = Math.min(1, cableDelta * 8);
  const alive = sim.flipped ? 0 : 1;
  const t = audio.currentTime;

  if (voice.power === "diesel") {
    const rpm = voice.idle + (voice.rev - voice.idle) * Math.max(drive, work * 0.65);
    engineFilter.frequency.setTargetAtTime(90 + rpm * 1.6, t, 0.12);
    engineGain.gain.setTargetAtTime(alive * voice.body * (0.012 + drive * 0.014 + work * 0.008), t, 0.1);
    thump.frequency.setTargetAtTime(rpm * 0.5, t, 0.1);
    thumpGain.gain.setTargetAtTime(alive * voice.body * 0.0035, t, 0.1);
    humGain.gain.setTargetAtTime(0, t, 0.1);
  } else {
    engineGain.gain.setTargetAtTime(0, t, 0.15);
    thumpGain.gain.setTargetAtTime(0, t, 0.15);
    hum.frequency.setTargetAtTime(58 + work * 8, t, 0.1);
    humGain.gain.setTargetAtTime(alive * (0.012 + work * 0.01 + hoist * 0.012), t, 0.1);
  }

  const hydOn = voice.hyd > 0 && (work > 0.04 || sim.deployDir !== 0);
  hyd.frequency.setTargetAtTime(voice.hyd + work * 90 + hoist * 40, t, 0.08);
  hydGain.gain.setTargetAtTime(hydOn ? alive * 0.0055 * voice.body : 0, t, 0.08);

  if (ambienceGain && ambienceFilter) {
    const site = sim.career.job;
    const outdoor = site === "wind" || site === "rotor" || site === "container" || site === "tracks";
    const wind = sim.mode === "hard" ? sim.windAmp : 0.25;
    const level = outdoor ? 0.005 + wind * 0.007 : 0.0035;
    ambienceGain.gain.setTargetAtTime(alive * level, t, 0.5);
    ambienceFilter.frequency.setTargetAtTime(outdoor ? 380 + wind * 320 : 150, t, 0.5);
    ambienceFilter.Q.setTargetAtTime(outdoor ? 0.7 : 1.1, t, 0.5);
  }

  // A rising gust gets a low swell before it reaches the load, so the HUD
  // forecast has an audible twin for players watching the hook.
  if (sim.mode === "hard" && sim.windAmp > lastWindAmp + 0.2 && now - lastGust > 900) {
    lastGust = now;
    tone(audio, 120, 320, 0.018, "sine");
    clank(audio, 0.01);
  }
  lastWindAmp = sim.windAmp;

  if (voice.backup && sim.state === "driving" && sim.speed < -0.35 && now - lastBeep > 720) {
    lastBeep = now;
    tone(audio, voice.body > 0.9 ? 780 : 980, 140, 0.05, "square");
  }

  if (sim.deployDir !== 0 && now - lastBeep > 460) {
    lastBeep = now;
    tone(audio, 1240, 90, 0.045, "square");
  }

  if (voice.slewBell && sim.state === "lifting" && (Math.abs(sim.yawRate) > 0.04 || hoist > 0.2) && now - lastBeep > 1100) {
    lastBeep = now;
    tone(audio, voice.power === "electric" ? 880 : 740, 160, 0.04, "square");
  }

  if (voice.tracks && drive > 0.04 && now - lastClank > Math.max(120, 460 - drive * 300)) {
    lastClank = now;
    clank(audio, 0.012 * voice.body);
  }

  if (voice.winch && hoist > 0.08 && now - lastWinch > Math.max(80, 260 - hoist * 140)) {
    lastWinch = now;
    clank(audio, 0.009);
    if (voice.power === "electric") tone(audio, 210, 70, 0.02, "sine");
  }
}
