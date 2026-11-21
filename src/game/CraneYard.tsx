import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import { CraneSim, CRANE_CHOICES, HOUSES, MAPLE_LANE_SETUP, PADS, type CraneId, type Mode, type Pace, type SetReport } from "@/game/sim";
import {
  ECONOMY,
  ALL_JOBS,
  RENTAL_LEVELS,
  activeOffer,
  canFound,
  careerSummary,
  freshCareer,
  jobBoard,
  levelOf,
  money,
  gradeSpread,
  nextUpgradeCost,
  type CareerState,
  type JobId,
  type JobOffer,
} from "@/game/career";
import { SITE_THEME_LABEL } from "@/game/levels";
import { loadSpec } from "@/game/loads";
import {
  BIND_ACTIONS,
  DEFAULT_BINDS,
  bindLabel,
  idleActions,
  installInput,
  keyLabel,
  readActions,
  setKeyBinds,
  setQaKeys,
  setSteerOverride,
  setTouchAxes,
  setTouchExtend,
  setTouchHoist,
  setTouchSensitivity,
  type ActionId,
  type KeyBinds,
} from "@/game/input";
import { createYard, type CamView } from "@/game/world";
import { limitAlarm } from "@/game/alarm";
import { audioContext, audioVolume, cueCount, rigAudio, rigCue, setAudioVolume, unlockAudio } from "@/game/rig-audio";
import {
  readSettingsStore,
  sensitivityScale,
  writeSettingsStore,
  type Quality,
  type Scheme,
  type Sensitivity,
} from "@/game/settings";
import { dailyLine, dailyRecordLine, dailyRun, dailyStreak, readDailyHistory, readDailyResult, type DailyResult, type DailyHistoryEntry } from "@/game/daily";
import type { Grade } from "@/game/grade";
import { encodeSave, decodeSave, describeSave } from "@/game/save";
import { MAX_UPGRADE, UPGRADES, UPGRADE_IDS, wearLabel } from "@/game/upgrades";
import { haptic, setHapticsEnabled } from "@/game/haptics";
import { coachChecklist, coachPrompt } from "@/game/coach";
import { QualityGovernor } from "@/game/quality";
import { gradeColor, gradeGlyph } from "@/game/ring-palette";
import { challengeCode, paintShareCard, parseChallenge, shareText, type ShareCard } from "@/game/share";

const GUIDE_KEY = "slingline-guide";

function guideSeen() {
  try {
    return localStorage.getItem(GUIDE_KEY) === "1";
  } catch {
    return false;
  }
}

function markGuideSeen() {
  try {
    localStorage.setItem(GUIDE_KEY, "1");
  } catch {
    /* private mode */
  }
}

function paintJobMap(canvas: HTMLCanvasElement, sim: CraneSim) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 220;
  const h = 156;
  const pw = Math.floor(w * dpr);
  const ph = Math.floor(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#121418";
  ctx.fillRect(0, 0, w, h);

  const spot = sim.setSpot();
  const dest = { x: spot.x, z: spot.z };
  const spots = [
    { x: sim.truckX, z: sim.truckZ },
    dest,
    ...sim.pieces.map((piece) => ({ x: piece.x, z: piece.z })),
  ];
  // The far bearing of a two-pad call still has to fit on the map.
  const secondPad = sim.secondPad;
  if (secondPad !== null) spots.push({ x: PADS[secondPad]!.x, z: PADS[secondPad]!.z });
  if (sim.career.job === "spa") {
    spots.push({ x: MAPLE_LANE_SETUP.x, z: MAPLE_LANE_SETUP.z });
    for (const house of HOUSES) {
      spots.push({ x: house.x - house.hx, z: house.z - house.hz }, { x: house.x + house.hx, z: house.z + house.hz });
    }
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const spot of spots) {
    minX = Math.min(minX, spot.x);
    maxX = Math.max(maxX, spot.x);
    minZ = Math.min(minZ, spot.z);
    maxZ = Math.max(maxZ, spot.z);
  }
  const spanX = Math.max(16, maxX - minX);
  const spanZ = Math.max(16, maxZ - minZ);
  const scale = Math.min((w - 36) / spanX, (h - 36) / spanZ);
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;
  const px = (x: number) => w / 2 + (x - midX) * scale;
  // World +Z is north. North is up on the map.
  const py = (z: number) => h / 2 - (z - midZ) * scale;

  if (sim.career.job === "spa") {
    ctx.strokeStyle = "#6a5848";
    ctx.lineWidth = 1;
    for (const house of HOUSES) {
      const left = px(house.x - house.hx);
      const top = py(house.z + house.hz);
      ctx.strokeRect(left, top, px(house.x + house.hx) - left, py(house.z - house.hz) - top);
    }
    ctx.strokeStyle = "#8a98a8";
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(px(MAPLE_LANE_SETUP.x) - 7, py(MAPLE_LANE_SETUP.z) - 7, 14, 14);
    ctx.setLineDash([]);
    ctx.fillStyle = "#8a98a8";
    ctx.font = "10px sans-serif";
    ctx.fillText("PARK", px(MAPLE_LANE_SETUP.x) + 9, py(MAPLE_LANE_SETUP.z) + 3);
  }

  ctx.fillStyle = "#8a98a8";
  ctx.font = "11px sans-serif";
  ctx.fillText("N", w / 2 - 4, 12);

  const jobKind = activeOffer(sim.career).kind;
  const ring = Math.max(8, sim.setTolerance * scale);
  const dx = px(dest.x);
  const dz = py(dest.z);
  ctx.strokeStyle = "#e3a23a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(dx, dz, ring, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(dx - 7, dz);
  ctx.lineTo(dx + 7, dz);
  ctx.moveTo(dx, dz - 7);
  ctx.lineTo(dx, dz + 7);
  ctx.stroke();
  ctx.fillStyle = "#e3a23a";
  ctx.font = "10px sans-serif";
  ctx.fillText(spot.name, dx + 8, dz - 4);

  // A two-pad call has two bearings to land on, not one centre.
  if (secondPad !== null) {
    const bearing = PADS[secondPad]!;
    const bx = px(bearing.x);
    const bz = py(bearing.z);
    ctx.beginPath();
    ctx.arc(bx, bz, ring, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx - 5, bz);
    ctx.lineTo(bx + 5, bz);
    ctx.moveTo(bx, bz - 5);
    ctx.lineTo(bx, bz + 5);
    ctx.stroke();
  }

  // Live boom radius, so the set can be planned before slewing.
  const chart = sim.loadChart();
  if (sim.state === "lifting" && chart.radius > 0.5) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#6f7b88";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px(sim.truckX), py(sim.truckZ), chart.radius * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#9aa3ad";
    ctx.beginPath();
    ctx.moveTo(px(sim.truckX), py(sim.truckZ));
    ctx.lineTo(px(sim.hx), py(sim.hz));
    ctx.stroke();
    ctx.restore();
  }

  for (const piece of sim.pieces) {
    const job = piece.kind === jobKind;
    ctx.fillStyle = job ? "#8fc17a" : "#5c656e";
    ctx.fillRect(px(piece.x) - (job ? 5 : 3), py(piece.z) - (job ? 5 : 3), job ? 10 : 6, job ? 10 : 6);
    if (job) {
      ctx.fillStyle = "#f1f1ef";
      ctx.fillText(loadSpec(piece.kind).label, px(piece.x) + 8, py(piece.z) - 6);
    }
  }

  const tx = px(sim.truckX);
  const tz = py(sim.truckZ);
  ctx.save();
  ctx.translate(tx, tz);
  ctx.rotate(sim.bodyHeading());
  ctx.fillStyle = "#f1f1ef";
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const VOLUME_STEPS = [
  { label: "Off", detail: "Muted", value: 0 },
  { label: "Low", detail: "Quiet", value: 0.4 },
  { label: "Full", detail: "Loud", value: 1 },
] as const;

const STEP = 1 / 60;

function gradeTint(grade: Grade): string {
  return gradeColor(grade);
}

const PART_ROWS = ["off", "impact", "sway", "chart", "heading"] as const;

/** Trigger a browser download for the rendered result card. */
function downloadCard(card: ShareCard) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 500;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  paintShareCard(ctx, card);
  const link = document.createElement("a");
  link.download = `slingline-${card.day}-${card.grade}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CraneYard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(false);
  const modeRef = useRef<Mode>("easy");
  const paceRef = useRef<Pace>("steady");
  const simRef = useRef<CraneSim | null>(null);
  const yardRef = useRef<ReturnType<typeof createYard> | null>(null);
  const camPointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);
  const [storedSettings] = useState(readSettingsStore);
  const [playing, setPlaying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [trainingStep, setTrainingStep] = useState(0);
  const [mode, setMode] = useState<Mode>(storedSettings.mode);
  const [pace, setPace] = useState<Pace>(storedSettings.pace);
  const [scheme, setScheme] = useState<Scheme>(storedSettings.scheme);
  const [sensitivity, setSensitivity] = useState<Sensitivity>(storedSettings.sensitivity);
  const [volume, setVolume] = useState(storedSettings.volume);
  const [nightAny, setNightAny] = useState(storedSettings.night);
  const [quality, setQuality] = useState<Quality>(storedSettings.quality);
  const [contrast, setContrast] = useState(storedSettings.contrast);
  const [reduceMotion, setReduceMotion] = useState(storedSettings.reduceMotion);
  const [binds, setBinds] = useState<KeyBinds>(storedSettings.binds);
  const [capturing, setCapturing] = useState<ActionId | null>(null);
  const [paused, setPaused] = useState(false);
  const [debrief, setDebrief] = useState<SetReport | null>(null);
  const [daily] = useState(() => dailyRun());
  const [dailyResult, setDailyResult] = useState<DailyResult | null>(() => readDailyResult());
  const [dailyHistory, setDailyHistory] = useState<DailyHistoryEntry[]>(() => readDailyHistory());
  const [captions, setCaptions] = useState(storedSettings.captions);
  const [haptics, setHaptics] = useState(storedSettings.haptics);
  const [autoFrame, setAutoFrame] = useState(storedSettings.autoFrame);
  const [gestureSwing, setGestureSwing] = useState(storedSettings.gestureSwing);
  const [shareStatus, setShareStatus] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importNote, setImportNote] = useState("");
  const [challengeText, setChallengeText] = useState("");
  const [coachOpen, setCoachOpen] = useState(false);
  const [qualityNote, setQualityNote] = useState("");
  const [workLights, setWorkLights] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [crane, setCrane] = useState<CraneId>("rental");
  const [cam, setCam] = useState<CamView>("chase");
  const [best, setBest] = useState(0);
  const [glError, setGlError] = useState("");
  const [books, setBooks] = useState<CareerState>(() => freshCareer());
  const [practiceId, setPracticeId] = useState<CraneId | null>(null);
  const [testCrane, setTestCrane] = useState<CraneId>("rental");
  const [testOpen, setTestOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [beat, setBeat] = useState<string | null>(null);
  const summary = careerSummary(books);
  const careerSnapshotRef = useRef<CareerState | null>(null);

  const takeCall = (id: JobId) => {
    const sim = simRef.current;
    sim?.acceptJob(id);
    if (!sim || sim.practicing || sim.career.status !== "independent" || sim.career.job !== id) return;
    const nextCam: CamView = id === "spa" || id === "wind" ? "wide" : "chase";
    setCam(nextCam);
    yardRef.current?.setView(nextCam);
  };

  const scoreRef = useRef<HTMLSpanElement>(null);
  const bestRef = useRef<HTMLSpanElement>(null);
  const cashRef = useRef<HTMLSpanElement>(null);
  const companyRef = useRef<HTMLParagraphElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const bookRef = useRef<HTMLParagraphElement>(null);
  const buyRef = useRef<HTMLButtonElement>(null);
  const soloRef = useRef<HTMLButtonElement>(null);
  const jobsRef = useRef<HTMLButtonElement>(null);
  const coachRef = useRef<HTMLParagraphElement>(null);
  const callRef = useRef<HTMLParagraphElement>(null);
  const driveModeRef = useRef<HTMLSpanElement>(null);
  const objectiveRef = useRef<HTMLParagraphElement>(null);
  const alignmentRef = useRef<HTMLParagraphElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const mapBoxRef = useRef<HTMLDetailsElement>(null);
  const swayNumRef = useRef<HTMLSpanElement>(null);
  const limitRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const meterRef = useRef<HTMLSpanElement>(null);
  const deployRef = useRef<HTMLButtonElement>(null);
  const deployLabelRef = useRef<HTMLSpanElement>(null);
  const hookLabelRef = useRef<HTMLSpanElement>(null);
  const hookBtnRef = useRef<HTMLButtonElement>(null);
  const gapRef = useRef<HTMLParagraphElement>(null);
  const setRef = useRef<HTMLParagraphElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const swayWrapRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const coachCardRef = useRef<HTMLDivElement>(null);
  const coachWrapRef = useRef<HTMLDivElement>(null);
  const coachTitleRef = useRef<HTMLParagraphElement>(null);
  const coachBodyRef = useRef<HTMLParagraphElement>(null);
  const coachPadsRef = useRef<HTMLSpanElement>(null);
  const coachHookRef = useRef<HTMLSpanElement>(null);
  const coachSetRef = useRef<HTMLSpanElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const captionTextRef = useRef("");
  const announceRef = useRef<HTMLParagraphElement>(null);
  const captureRef = useRef(false);
  const captionTimer = useRef(0);
  const qualityGovRef = useRef(new QualityGovernor());
  const qualityRef = useRef<Quality>(storedSettings.quality);
  const autoFrameRef = useRef(storedSettings.autoFrame);
  const frameRestoreRef = useRef<CamView | null>(null);
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const gestureRef = useRef(storedSettings.gestureSwing);
  const hapticsRef = useRef(storedSettings.haptics);
  const captionsRef = useRef(storedSettings.captions);
  const camRef = useRef<CamView>("chase");
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const windWrapRef = useRef<HTMLParagraphElement>(null);
  const windArrowRef = useRef<SVGSVGElement>(null);
  const windLevelRef = useRef<HTMLSpanElement>(null);
  const chartRadiusRef = useRef<HTMLSpanElement>(null);
  const chartCapacityRef = useRef<HTMLSpanElement>(null);
  const chartLoadRef = useRef<HTMLSpanElement>(null);
  const chartPctRef = useRef<HTMLParagraphElement>(null);
  const chartBarRef = useRef<HTMLSpanElement>(null);
  const chartPanelRef = useRef<HTMLDivElement>(null);
  const lastReportRef = useRef<SetReport | null>(null);
  const chartChipRef = useRef<HTMLSpanElement>(null);
  const swayMiniRef = useRef<HTMLSpanElement>(null);
  const limitMiniRef = useRef<HTMLSpanElement>(null);
  const speedMiniRef = useRef<HTMLSpanElement>(null);
  const forecastRef = useRef<HTMLParagraphElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);
  const pausedRef = useRef(false);
  const prevAttached = useRef(false);
  const prevReady = useRef(false);
  const lightsBtnRef = useRef<HTMLButtonElement>(null);
  const lightsRef = useRef(false);
  const nightRef = useRef(storedSettings.night);

  useEffect(() => {
    modeRef.current = mode;
    if (simRef.current) simRef.current.mode = mode;
  }, [mode]);

  useEffect(() => {
    paceRef.current = pace;
    if (simRef.current) simRef.current.pace = pace;
  }, [pace]);

  useEffect(() => {
    setTouchSensitivity(sensitivityScale(sensitivity));
  }, [sensitivity]);

  useEffect(() => {
    setAudioVolume(volume);
  }, [volume]);

  useEffect(() => {
    nightRef.current = nightAny;
    if (simRef.current) simRef.current.night = nightAny;
  }, [nightAny]);

  useEffect(() => {
    writeSettingsStore({
      mode,
      pace,
      scheme,
      sensitivity,
      volume,
      night: nightAny,
      quality,
      contrast,
      reduceMotion,
      haptics,
      captions,
      autoFrame,
      gestureSwing,
      binds,
    });
  }, [mode, pace, scheme, sensitivity, volume, nightAny, quality, contrast, reduceMotion, haptics, captions, autoFrame, gestureSwing, binds]);

  useEffect(() => {
    setHapticsEnabled(haptics);
    hapticsRef.current = haptics;
  }, [haptics]);

  useEffect(() => {
    gestureRef.current = gestureSwing;
  }, [gestureSwing]);

  useEffect(() => {
    captionsRef.current = captions;
  }, [captions]);

  useEffect(() => {
    camRef.current = cam;
  }, [cam]);

  useEffect(() => {
    qualityRef.current = quality;
    qualityGovRef.current.reset();
  }, [quality]);

  useEffect(() => {
    autoFrameRef.current = autoFrame;
  }, [autoFrame]);

  useEffect(() => {
    setKeyBinds(binds);
  }, [binds]);

  useEffect(() => {
    const yard = yardRef.current;
    if (!yard) return;
    yard.setQuality(quality);
    yard.setContrast(contrast);
    yard.setReduceMotion(reduceMotion);
  }, [quality, contrast, reduceMotion]);

  // Pause whenever the tab loses focus, so a shift cannot run on unattended.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden || !playingRef.current || pausedRef.current) return;
      pausedRef.current = true;
      simRef.current?.setPaused(true);
      setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Capture the next physical key for a binding.
  useEffect(() => {
    if (!capturing) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        setCapturing(null);
        return;
      }
      const code = event.code;
      setBinds((current) => {
        const next: KeyBinds = { ...current };
        for (const action of BIND_ACTIONS) next[action] = next[action].filter((entry) => entry !== code);
        next[capturing] = [code];
        return next;
      });
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing]);

  const shownBest = useRef(0);
  const beatShown = useRef<string | null>(null);

  useEffect(() => {
    if (simRef.current) simRef.current.boardPause = boardOpen;
  }, [boardOpen]);

  useEffect(() => {
    const block = (event: Event) => event.preventDefault();
    document.addEventListener("selectstart", block);
    document.addEventListener("contextmenu", block);
    return () => {
      document.removeEventListener("selectstart", block);
      document.removeEventListener("contextmenu", block);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sim = new CraneSim();
    sim.mode = modeRef.current;
    simRef.current = sim;
    shownBest.current = sim.best;
    setBest(sim.best);
    setCrane(sim.crane);
    setBooks({ ...sim.career });

    let contextLostNow = false;
    let yard: ReturnType<typeof createYard>;
    try {
      yard = createYard(canvas, {
        onContextLost: () => {
          contextLostNow = true;
          setContextLost(true);
        },
        onContextRestored: () => {
          contextLostNow = false;
          setContextLost(false);
        },
      });
      yardRef.current = yard;
      yard.setQuality(storedSettings.quality);
      yard.setContrast(storedSettings.contrast);
      yard.setReduceMotion(storedSettings.reduceMotion);
      const initialCam: CamView = sim.career.job === "spa" || sim.windSite ? "wide" : "chase";
      setCam(initialCam);
      yard.setView(initialCam);
    } catch (err) {
      setGlError(err instanceof Error ? err.message : "The yard couldn't start.");
      return;
    }

    const removeInput = installInput();
    let last = performance.now();
    let acc = 0;
    let prevMode = false;

    if (import.meta.env.DEV) {
      window.__controlsTest = {
        getYaw: () => sim.yaw,
        getSpeed: () => sim.trolleySpeed,
        setKeys: (codes) => setQaKeys(codes),
        setSteer: (v) => setSteerOverride(v),
        getHook: () => ({ hy: sim.hy, extension: sim.extension, cable: sim.cable, state: sim.state, pitch: sim.boomPitch, safety: sim.safetyLock }),
        getInput: () => ({ playing: playingRef.current, actions: readActions(), boardPause: sim.boardPause, beat: sim.careerBeat }),
        getRig: () => ({
          state: sim.state,
          phase: sim.phase,
          attached: sim.attached,
          landed: sim.landed,
          canRelease: sim.canRelease,
          hookReady: sim.hookReady,
          outrigger: sim.outrigger,
          message: sim.message,
          debriefLeft: sim.debriefLeft,
          debriefHold: sim.debriefHold,
          lastSet: sim.lastSet,
          align: sim.hookAlignment(),
          carry: sim.carryAlignment(),
          spot: sim.setSpot(),
          paused: sim.paused,
          job: sim.career.job,
          leg: sim.career.leg,
          hx: sim.hx,
          hy: sim.hy,
          hz: sim.hz,
          yaw: sim.yaw,
          heading: sim.heading,
          speed: sim.speed,
          extension: sim.extension,
          pitch: sim.boomPitch,
          truckX: sim.truckX,
          truckZ: sim.truckZ,
        }),
        getRing: () => yardRef.current?.ringColor() ?? null,
        getAudio: () => ({ state: audioContext()?.state ?? "none", volume: audioVolume(), cues: cueCount() }),
        getCareer: () => ({ ...sim.career }),
      };
    }

    /** Short on-screen caption plus an assertive screen-reader announcement. */
    const flashCaption = (text: string) => {
      if (announceRef.current) announceRef.current.textContent = text;
      if (!captionsRef.current) {
        captionTextRef.current = "";
        return;
      }
      captionTextRef.current = text;
      window.clearTimeout(captionTimer.current);
      captionTimer.current = window.setTimeout(() => {
        captionTextRef.current = "";
      }, 1700);
    };

    const captureStill = () => {
      const link = document.createElement("a");
      link.download = `slingline-${new Date().toISOString().slice(0, 10)}.png`;
      try {
        link.href = canvas.toDataURL("image/png");
        link.click();
      } catch {
        setQualityNote("The browser would not save the still.");
      }
    };

    const paintHud = () => {
      if (scoreRef.current) scoreRef.current.textContent = String(sim.score);
      if (bestRef.current) bestRef.current.textContent = String(sim.best);
      if (cashRef.current) cashRef.current.textContent = `${sim.craneLabel()}  ${money(sim.cash)}`;
      if (companyRef.current) companyRef.current.textContent = sim.companyName().toUpperCase();
      if (statusRef.current) statusRef.current.textContent = sim.statusLine();
      if (bookRef.current) {
        if (sim.practicing) bookRef.current.textContent = "PRACTICE · NOT SAVED";
        else {
          const note = sim.career.note > 0 ? `  NOTE ${money(sim.career.note)}` : "";
          const down = sim.career.downtime > 0 ? `  DOWNTIME ${sim.career.downtime}` : "";
          const mark = sim.career.status === "hired" ? `STANDING ${sim.career.standing}` : `REP ${sim.career.reputation}`;
          const health = sim.career.status === "independent" && sim.career.wear > 0.5 ? `  ${wearLabel(sim.career.wear)}` : "";
          bookRef.current.textContent = `${mark}${note}${down}${health}`;
        }
      }
      if (buyRef.current) buyRef.current.textContent = sim.buyLabel();
      if (callRef.current) callRef.current.textContent = sim.contractLabel();
      if (driveModeRef.current) driveModeRef.current.textContent = sim.state === "driving" ? "STEER · DRIVE" : "SLEW · TROLLEY";
      if (soloRef.current) {
        const show = !sim.practicing && sim.career.status === "hired" && canFound(sim.career).ok;
        soloRef.current.style.display = show ? "block" : "none";
      }
      if (jobsRef.current) {
        const show = !sim.practicing && sim.career.status === "independent" && !sim.attached;
        jobsRef.current.style.display = show ? "block" : "none";
      }
      if (careerSnapshotRef.current !== sim.career) {
        careerSnapshotRef.current = sim.career;
        setBooks({ ...sim.career });
      }
      if (sim.careerBeat !== beatShown.current) {
        beatShown.current = sim.careerBeat;
        setBeat(sim.careerBeat);
      }
      if (coachRef.current) {
        const text = sim.toastLeft > 0 ? sim.toast : sim.message;
        coachRef.current.textContent = text;
        coachRef.current.dataset.live = sim.toastLeft > 0 ? "true" : "false";
        coachRef.current.style.display = text === sim.contractLabel() ? "none" : "block";
      }
      if (swayNumRef.current) swayNumRef.current.textContent = `${sim.swayDeg.toFixed(0)}°`;
      if (swayMiniRef.current) swayMiniRef.current.textContent = `${sim.swayDeg.toFixed(0)}°`;
      if (limitMiniRef.current) {
        limitMiniRef.current.textContent = `${Math.round(sim.limitRatio * 100)}%`;
        limitMiniRef.current.style.color =
          sim.limitState === "over" ? "#e05252" : sim.limitState === "near" ? "#e3a23a" : "";
      }
      if (speedMiniRef.current) {
        speedMiniRef.current.textContent =
          sim.state === "lifting" ? `${sim.hookSpeed.toFixed(1)}` : `${Math.abs(sim.speed).toFixed(1)}`;
      }
      if (limitRef.current) {
        const pct = Math.round(sim.limitRatio * 100);
        limitRef.current.textContent = `${pct}%`;
        limitRef.current.dataset.level = sim.limitState;
      }
      if (playingRef.current && sim.state === "lifting" && sim.phase !== "broke" && sim.phase !== "done") {
        limitAlarm(sim.limitState, performance.now());
      }
      if (playingRef.current) rigAudio(sim, performance.now());
      if (speedRef.current) {
        speedRef.current.textContent =
          sim.state === "lifting"
            ? `${sim.hookSpeed.toFixed(1)} m/s`
            : sim.mode === "hard"
              ? `${sim.lateralG.toFixed(2)} g`
              : `${Math.abs(sim.speed).toFixed(1)} m/s`;
      }
      if (meterRef.current) meterRef.current.textContent = sim.state === "lifting" ? "HOOK" : sim.mode === "hard" ? "LAT G" : "SPEED";
      if (windWrapRef.current) {
        const show = sim.mode === "hard" && sim.state === "lifting" && !sim.flipped;
        windWrapRef.current.style.display = show ? "flex" : "none";
        if (show) {
          const bearing = (Math.atan2(sim.windX, -sim.windZ) * 180) / Math.PI;
          if (windArrowRef.current) {
            windArrowRef.current.style.transform = `rotate(${bearing.toFixed(0)}deg)`;
          }
          if (windLevelRef.current) {
            const level = sim.windAmp < 0.8 ? "light" : sim.windAmp < 1.15 ? "steady" : "gusty";
            if (windLevelRef.current.dataset.level !== level) {
              windLevelRef.current.dataset.level = level;
              windLevelRef.current.textContent = level.toUpperCase();
            }
          }
        }
      }
      if (forecastRef.current) {
        const forecast = sim.windForecast();
        forecastRef.current.style.display = forecast.length ? "flex" : "none";
        const warning = sim.gustWarning();
        const soon =
          warning && warning.seconds <= 1.6 && warning.amp >= 1
            ? `GUST IN ${Math.max(1, Math.round(warning.seconds))}s · `
            : "";
        forecastRef.current.textContent = `${soon}NEXT ${forecast
          .map((gust) => `${Math.max(1, Math.round(gust.seconds))}s ${gust.amp < 0.8 ? "LIGHT" : gust.amp < 1.15 ? "STEADY" : "GUST"}`)
          .join(" · ")}`;
        forecastRef.current.dataset.soon = soon ? "true" : "false";
      }
      if (deployLabelRef.current) {
        const label = sim.flipped
          ? "RIGHT"
          : sim.hauling
            ? "UNLOAD"
            : !sim.usesOutriggers()
              ? sim.state === "lifting"
                ? "DRIVE"
                : "LIFT"
              : sim.outrigger > 0.5 && sim.deployDir >= 0
                ? "STOW"
                : "DEPLOY";
        deployLabelRef.current.textContent = label;
        if (deployRef.current) deployRef.current.dataset.on = label === "STOW" || label === "DRIVE" ? "true" : "false";
      }
      if (hookBtnRef.current) {
        const ready = sim.attached || sim.hookReady;
        hookBtnRef.current.disabled = !ready;
        hookBtnRef.current.dataset.ready = sim.canRelease ? "mark" : ready ? "true" : "false";
        hookBtnRef.current.dataset.on = sim.attached ? "true" : "false";
        if (hookLabelRef.current) hookLabelRef.current.textContent = sim.attached ? "RELEASE" : "HOOK";
      }
      if (gapRef.current) gapRef.current.style.display = "none";
      if (setRef.current) setRef.current.style.display = "none";
      const liveOffer = activeOffer(sim.career);
      const liveCargo = loadSpec(liveOffer.kind).label;
      if (objectiveRef.current) {
        let objective = `FIND THE MARKED ${liveCargo}.`;
        if (sim.phase === "done") {
          objective = `JOB COMPLETE${sim.lastSet ? ` · GRADE ${sim.lastSet.grade}` : ""}.`;
        } else if (sim.phase === "broke") {
          objective = "PICK FAILED · Check the warning, recover, and take another call.";
        } else if (sim.flipped) {
          objective = "CRANE OVER · Press RIGHT to recover, then stow the pads.";
        } else if (sim.safetyLock) {
          objective = "EASY SAFETY STOP · Raise the boom above 44° to clear the angle interlock.";
        } else if (sim.state !== "lifting") {
          objective = sim.hauling
            ? "SETUP · Stop the lowboy on its marked pad, then unload."
            : sim.career.job === "spa" && !sim.atMapleSetup
              ? "ARRIVE · Follow Maple Lane to the amber side-drive box by the backyard gate."
              : sim.career.job === "spa"
                ? Math.abs(sim.speed) > 0.2
                  ? "PARK · Stop the crane inside the setup box, then deploy the pads."
                  : "SITE READY · Press DEPLOY from the marked driveway box before lifting."
                : sim.career.job === "wind"
                  ? "RIDGE SETUP · Stop on the gravel workpad and deploy the outriggers before the blade pick."
                  : "SETUP · Stop in the work area, then deploy the pads.";
        } else if (sim.attached && sim.landed) {
          objective = sim.setSpot().meters <= sim.setTolerance
            ? "ON THE MARK · Press RELEASE to set the load."
            : "SET · Load is outside the amber ring. Hoist it, reposition, and lower it inside.";
        } else if (sim.attached && sim.setSpot().meters > 16) {
          objective = sim.state === "lifting"
            ? "HAUL · Pads are set. Stow them, then drive the load to the amber ring."
            : "DRIVE · Take the load to the amber ring, stop, and deploy again before you set it.";
        } else if (sim.attached) {
          objective = `DELIVER · Carry the ${liveCargo} into the amber ring; slow down and let it settle.`;
        } else if (sim.hookReady) {
          objective = `PICKUP READY · Press HOOK to attach the ${liveCargo}.`;
        } else if (sim.hookGap < 12) {
          objective = `PICKUP · Align the hook with the ${liveCargo}, then connect.`;
        } else {
          objective = `PICKUP · Find the marked ${liveCargo}; use the HOOK camera if needed.`;
        }
        const headingOff = sim.phase === "carry" ? sim.headingError() : sim.setupHeadingError();
        if (headingOff !== null) {
          objective += headingOff <= 2 ? " · SQUARE" : ` · ${Math.round(headingOff)}° OFF SQUARE`;
        }
        objectiveRef.current.textContent = objective;
      }
      if (liveRef.current) {
        const line = objectiveRef.current?.textContent ?? "";
        if (liveRef.current.textContent !== line) liveRef.current.textContent = line;
      }
      if (alignmentRef.current) {
        const pickup = !sim.attached ? sim.hookAlignment() : null;
        const carry = sim.attached ? sim.carryAlignment() : null;
        const alignment = pickup ?? carry;
        const show = sim.state === "lifting" && alignment != null && (sim.attached || sim.hookGap < 18);
        alignmentRef.current.style.display = show ? "block" : "none";
        if (show && alignment) {
          const corrections: string[] = [];
          if (Math.abs(alignment.slew) > 0.3) {
            corrections.push(`${alignment.slew > 0 ? "SLEW LEFT" : "SLEW RIGHT"} ${Math.abs(alignment.slew).toFixed(1)} m`);
          }
          if (Math.abs(alignment.reach) > 0.3) {
            corrections.push(`${alignment.reach > 0 ? "EXTEND" : "BRING IN"} ${Math.abs(alignment.reach).toFixed(1)} m`);
          }
          if (Math.abs(alignment.hoist) > 0.18) {
            corrections.push(`${alignment.hoist > 0 ? "HOIST UP" : "HOIST DOWN"} ${Math.abs(alignment.hoist).toFixed(1)} m`);
          }
          alignmentRef.current.textContent = alignment.ready
            ? sim.attached
              ? "ON THE MARK"
              : "HOOK READY"
            : corrections.join(" · ") || "HOLD";
          alignmentRef.current.dataset.ready = alignment.ready ? "true" : "false";
          alignmentRef.current.style.color = alignment.ready ? "#8fc17a" : "";
        }
      }
      if (mapRef.current && mapBoxRef.current?.open) paintJobMap(mapRef.current, sim);
      if (lastReportRef.current !== sim.lastSet) {
        lastReportRef.current = sim.lastSet;
        setDebrief(sim.lastSet);
        if (sim.lastSet) {
          const report = sim.lastSet;
          rigCue("grade", performance.now(), {
            grade: report.grade,
            error: report.impact / Math.max(0.1, report.impactLimit),
          });
          flashCaption(`SET — GRADE ${report.grade} ${gradeGlyph(report.grade)}`);
          haptic("grade");
          if (autoFrameRef.current && camRef.current !== "cab" && camRef.current !== "operator" && !frameRestoreRef.current) {
            frameRestoreRef.current = camRef.current;
            setCam("wide");
            yard.setView("wide");
          }
        }
        if (sim.lastSet && sim.daily) {
          setDailyResult(readDailyResult());
          setDailyHistory(readDailyHistory());
        }
      }
      if (chartPanelRef.current) {
        chartPanelRef.current.style.display = sim.lastSet && sim.debriefLeft > 0 ? "none" : "block";
      }
      if (sim.canRelease && !prevReady.current) {
        rigCue("ready");
        haptic("ready");
        flashCaption("ON THE MARK — RELEASE");
      }
      if (sim.attached && !prevAttached.current) {
        rigCue("latch");
        haptic("latch");
        flashCaption("LOAD ON THE HOOK");
      }
      if (!sim.attached && prevAttached.current) {
        rigCue("release");
        haptic("release");
        flashCaption("LOAD RELEASED");
      }
      prevReady.current = sim.canRelease;
      prevAttached.current = sim.attached;
      if (chartChipRef.current) {
        const readout = sim.loadChart();
        chartChipRef.current.textContent = sim.attached
          ? `${readout.radius.toFixed(1)} m · ${Math.round(readout.ratio * 100)}%`
          : "—";
      }
      if (chartRadiusRef.current) {
        const chart = sim.loadChart();
        chartRadiusRef.current.textContent = `${chart.radius.toFixed(1)} m`;
        if (chartCapacityRef.current) chartCapacityRef.current.textContent = `${chart.capacity.toFixed(1)} t`;
        if (chartLoadRef.current) chartLoadRef.current.textContent = chart.demand > 0 ? `${chart.demand.toFixed(1)} t` : "—";
        const overChart = chart.ratio > 1;
        const nearChart = chart.ratio > 0.78;
        if (chartPctRef.current) {
          chartPctRef.current.textContent = `${Math.round(chart.ratio * 100)}%`;
          chartPctRef.current.style.color = overChart ? "#e05252" : nearChart ? "#e3a23a" : "";
        }
        if (chartBarRef.current) {
          chartBarRef.current.style.width = `${Math.min(100, Math.max(0, chart.ratio * 100))}%`;
          chartBarRef.current.style.backgroundColor = overChart ? "#e05252" : nearChart ? "#e3a23a" : "#7fa6b8";
        }
      }
      const dot = dotRef.current;
      if (dot) {
        const reach = 28;
        const mag = Math.hypot(sim.side, sim.along);
        const scale = mag > 2.2 ? 2.2 / mag : 1;
        dot.style.transform = `translate(${sim.side * scale * reach}px, ${-sim.along * scale * reach}px)`;
        dot.dataset.level = sim.swayDeg < 8 ? "ok" : sim.swayDeg < 15 ? "warn" : "hot";
      }
      if (swayWrapRef.current) {
        const show = sim.state === "lifting" && sim.swayDeg > 3;
        swayWrapRef.current.style.display = show ? "block" : "none";
      }
      if (coachWrapRef.current) {
        const firstShift = sim.career.status === "hired" && sim.career.jobsDone === 0 && !sim.practicing;
        coachWrapRef.current.style.display = firstShift ? "flex" : "none";
        if (firstShift) {
          const spot = sim.setSpot();
          const input = {
            state: sim.state,
            usesOutriggers: sim.usesOutriggers(),
            outrigger: sim.outrigger,
            attached: sim.attached,
            landed: sim.landed,
            canRelease: sim.canRelease,
            phase: sim.phase,
            hookReady: sim.hookReady,
            hookGap: sim.hookGap,
            spotMeters: spot.meters,
            tolerance: sim.setTolerance,
            hauling: sim.hauling,
          };
          const prompt = coachPrompt(input);
          if (coachTitleRef.current) coachTitleRef.current.textContent = prompt.title;
          if (coachBodyRef.current) coachBodyRef.current.textContent = prompt.body;
          const checks = coachChecklist(input);
          const nodes = [coachPadsRef.current, coachHookRef.current, coachSetRef.current];
          checks.forEach((check, index) => {
            const node = nodes[index];
            if (!node) return;
            node.textContent = `${check.done ? "■" : "□"} ${check.label}`;
            node.dataset.done = check.done ? "true" : "false";
          });
          if (sim.phase === "done") setCoachOpen(false);
        }
      }
      if (captionRef.current) captionRef.current.textContent = captionTextRef.current;
      const hot = sim.warn ? "hold-hot" : "";
      if (upRef.current) upRef.current.classList.toggle("hold-hot", hot === "hold-hot");
      if (downRef.current) downRef.current.classList.toggle("hold-hot", hot === "hold-hot");
      const lampBtn = lightsBtnRef.current;
      if (lampBtn) {
        const dark = nightRef.current;
        // Lights go out with the night rather than staying on into daylight.
        if (!dark && sim.lightsOn) {
          lightsRef.current = false;
          sim.setWorkLights(false);
          setWorkLights(false);
        }
        lampBtn.dataset.on = sim.lightsOn ? "true" : "false";
        lampBtn.dataset.day = dark ? "false" : "true";
        lampBtn.setAttribute("aria-pressed", sim.lightsOn ? "true" : "false");
      }
      const banner = bannerRef.current;
      if (banner) {
        if (sim.phase === "broke") {
          banner.textContent = sim.flipped ? "Crane over" : "Wire snapped";
          banner.dataset.show = "break";
        } else if (sim.phase === "done") {
          const wrong = sim.message.startsWith("Wrong");
          banner.textContent = wrong ? "No pay" : sim.practicing ? "Practice set" : sim.career.status === "hired" ? "Wage paid" : "Call paid";
          banner.dataset.show = wrong ? "warn" : "set";
        } else if (sim.safetyLock) {
          banner.textContent = "Safety stop";
          banner.dataset.show = "warn";
        } else if (sim.state === "lifting" && sim.attached && Math.abs(sim.roll) > 0.1) {
          banner.textContent = "Tilting";
          banner.dataset.show = "warn";
        } else if (sim.limitState === "over" && sim.state === "lifting") {
          banner.textContent = "Over limit";
          banner.dataset.show = "warn";
        } else if (sim.limitState === "near" && sim.state === "lifting") {
          banner.textContent = "Near limit";
          banner.dataset.show = "warn";
        } else {
          banner.dataset.show = "";
        }
      }
    };

    yard.renderer.setAnimationLoop((now) => {
      if (contextLostNow) {
        last = now;
        return;
      }
      const frameDt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      if (qualityRef.current === "auto" && qualityGovRef.current.sample(frameDt, now)) {
        // Drop the render tier for this shift only. The saved setting stays on
        // auto, so the next device or session gets its own measurement.
        setQualityNote("Slow frames: auto quality dropped to LOW for this shift.");
        yard.setQuality("low");
      }
      acc += frameDt;
      let steps = 0;
      while (acc >= STEP && steps < 4) {
        const actions = playingRef.current ? readActions() : idleActions();
        if (steps === 0 && playingRef.current) {
          if (actions.modeDown && !prevMode) {
            const next: Mode = sim.mode === "easy" ? "hard" : "easy";
            sim.mode = next;
            modeRef.current = next;
            setMode(next);
          }
          prevMode = actions.modeDown;
          if (actions.pausePressed) {
            const next = !pausedRef.current;
            pausedRef.current = next;
            sim.setPaused(next);
            setPaused(next);
          }
          if (!sim.paused && actions.hookPressed) {
            if (sim.attached) sim.requestRelease();
            else sim.requestHook();
          }
          if (!sim.paused && actions.deployPressed) {
            if (sim.flipped) sim.recover();
            else sim.requestDeploy();
          }
        }
        sim.mode = modeRef.current;
        sim.pace = paceRef.current;
        sim.night = nightRef.current;
        sim.lightsOn = lightsRef.current;
        sim.step(STEP, actions);
        acc -= STEP;
        steps += 1;
      }
      if (sim.best !== shownBest.current) {
        shownBest.current = sim.best;
        setBest(sim.best);
      }
      yard.render(sim, frameDt || STEP);
      if (captureRef.current) {
        captureRef.current = false;
        captureStill();
      }
      paintHud();
    });

    return () => {
      yard.renderer.setAnimationLoop(null);
      yard.dispose();
      yardRef.current = null;
      removeInput();
      if (import.meta.env.DEV) delete window.__controlsTest;
    };
  }, [storedSettings]);

  const pickScheme = (next: Scheme) => {
    releaseArrows();
    setTouchAxes(0, 0);
    setScheme(next);
  };

  const pickCrane = (id: CraneId) => {
    setPracticeId(id);
    setCrane(id);
  };

  const refreshBooks = () => {
    const sim = simRef.current;
    if (!sim) return;
    setBooks({ ...sim.career });
  };

  const resetCareer = () => {
    simRef.current?.resetCareer();
    setPracticeId(null);
    setCrane("rental");
    setBeat(null);
    beatShown.current = null;
    setBoardOpen(false);
    setSettingsOpen(false);
    setConfirmReset(false);
    setTrainingOpen(false);
    setCoachOpen(false);
    setDebrief(null);
    frameRestoreRef.current = null;
    playingRef.current = false;
    setPlaying(false);
    refreshBooks();
  };

  const fileCompany = () => {
    const sim = simRef.current;
    if (!sim) return;
    sim.foundCompany();
    refreshBooks();
    setBeat(sim.careerBeat);
  };

  const startCareer = () => {
    const sim = simRef.current;
    if (!sim) return;
    sim.clockIn();
    setPracticeId(null);
    setCrane(sim.crane);
    refreshBooks();
    playingRef.current = true;
    unlockAudio();
    setTrainingStep(0);
    setTrainingOpen(sim.career.jobsDone === 0 && sim.career.status === "hired" && !guideSeen());
    setCoachOpen(sim.career.jobsDone === 0 && sim.career.status === "hired");
    setPlaying(true);
  };

  const startPractice = () => {
    const sim = simRef.current;
    if (!sim || !practiceId) return;
    sim.selectCrane(practiceId);
    setCrane(practiceId);
    playingRef.current = true;
    unlockAudio();
    setPlaying(true);
  };

  const startTest = (job: JobId) => {
    const sim = simRef.current;
    if (!sim) return;
    sim.practiceJob(job, testCrane);
    setPracticeId(testCrane);
    setCrane(testCrane);
    setTestOpen(false);
    setSettingsOpen(false);
    setBoardOpen(false);
    const nextCam: CamView = job === "spa" || job === "wind" ? "wide" : "chase";
    setCam(nextCam);
    yardRef.current?.setView(nextCam);
    playingRef.current = true;
    unlockAudio();
    setPlaying(true);
  };

  const startDaily = () => {
    const sim = simRef.current;
    if (!sim) return;
    sim.practiceDaily(daily);
    setPracticeId(daily.crane);
    setCrane(daily.crane);
    setDailyResult(readDailyResult());
    pausedRef.current = false;
    sim.setPaused(false);
    setPaused(false);
    playingRef.current = true;
    unlockAudio();
    setPlaying(true);
    setCam("wide");
    yardRef.current?.setView("wide");
  };

  const resumeShift = () => {
    pausedRef.current = false;
    simRef.current?.setPaused(false);
    setPaused(false);
  };

  const quitShift = () => {
    const sim = simRef.current;
    sim?.setPaused(false);
    sim?.clockIn();
    pausedRef.current = false;
    setPaused(false);
    playingRef.current = false;
    setPlaying(false);
    setDebrief(null);
    frameRestoreRef.current = null;
    refreshBooks();
  };

  const cycleCrane = () => {
    const ids = CRANE_CHOICES.map((choice) => choice.id);
    const index = ids.indexOf(simRef.current?.crane ?? crane);
    const next = ids[(index + 1) % ids.length] ?? "rental";
    setPracticeId(next);
    setCrane(next);
    simRef.current?.selectCrane(next);
  };

  const onCamDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const sim = simRef.current;
    if (gestureRef.current && playingRef.current && sim?.state === "lifting") {
      // Drag-to-swing: one finger in the yard maps straight onto the boom.
      gestureStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    camPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (camPointers.current.size === 2) {
      const points = [...camPointers.current.values()];
      pinchDistance.current = Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y);
    }
  };

  const onCamMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = gestureStartRef.current;
    if (start) {
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      setTouchAxes(clamp((start.x - e.clientX) / 90), clamp((start.y - e.clientY) / 90));
      return;
    }
    const previous = camPointers.current.get(e.pointerId);
    if (!previous) return;
    const next = { x: e.clientX, y: e.clientY };
    camPointers.current.set(e.pointerId, next);
    if (camPointers.current.size >= 2) {
      const points = [...camPointers.current.values()];
      const distance = Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y);
      const before = pinchDistance.current;
      if (before && distance > 0) yardRef.current?.zoomBy(distance / before);
      pinchDistance.current = distance;
      return;
    }
    yardRef.current?.nudge(next.x - previous.x, next.y - previous.y);
  };

  const onCamEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gestureStartRef.current) {
      gestureStartRef.current = null;
      setTouchAxes(0, 0);
    }
    camPointers.current.delete(e.pointerId);
    if (camPointers.current.size < 2) pinchDistance.current = null;
  };

  const buildCard = (): ShareCard | null => {
    const sim = simRef.current;
    const report = sim?.lastSet;
    if (!sim || !report) return null;
    const run = sim.daily;
    return {
      company: summary.company,
      job: levelOf(sim.career.job).title,
      grade: report.grade,
      pay: report.pay,
      off: report.off,
      tolerance: report.tolerance,
      impact: report.impact,
      sway: report.sway,
      chart: report.chart,
      day: run?.day ?? new Date().toISOString().slice(0, 10),
      streak: run ? dailyStreak(dailyHistory, run.day) : undefined,
    };
  };

  const importSave = () => {
    const decoded = decodeSave(importText);
    if (!decoded.ok) {
      setImportNote(decoded.message);
      return;
    }
    simRef.current?.importCareer(decoded.state);
    setBooks({ ...decoded.state });
    setCrane(decoded.state.crane);
    setPracticeId(null);
    playingRef.current = false;
    setPlaying(false);
    setImportNote(`Imported: ${describeSave(decoded.state)}`);
    setImportText("");
  };

  const startChallenge = () => {
    const code = parseChallenge(challengeText);
    if (!code) {
      setImportNote("That challenge code is not valid.");
      return;
    }
    const sim = simRef.current;
    if (!sim) return;
    const seeded = dailyRun(new Date(`${code.day}T12:00:00Z`));
    sim.practiceDaily({ ...seeded, job: code.job, crane: code.crane, day: code.day, label: code.day });
    setCrane(code.crane);
    setPracticeId(code.crane);
    playingRef.current = true;
    unlockAudio();
    setPlaying(true);
    setCam("wide");
    yardRef.current?.setView("wide");
    setChallengeText("");
    setImportNote(`Challenge ${code.day} loaded.`);
  };

  const liveJob = simRef.current?.career.job ?? books.job;
  const bestRun = books.bestRuns[liveJob];
  const isNewBest =
    !!debrief &&
    !!bestRun &&
    bestRun.grade === debrief.grade &&
    Math.abs(bestRun.off - debrief.off) < 0.02 &&
    Math.abs(bestRun.impact - debrief.impact) < 0.02;

  return (
    <main
      className="yard relative h-dvh w-full overflow-hidden bg-bg text-fg"
      data-reduce-motion={reduceMotion ? "true" : "false"}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p ref={liveRef} aria-live="polite" className="sr-only" />
      <p ref={announceRef} aria-live="assertive" className="sr-only" />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onCamDown}
        onPointerMove={onCamMove}
        onPointerUp={onCamEnd}
        onPointerCancel={onCamEnd}
      />
      {glError ? (
        <p className="absolute inset-x-0 top-16 px-6 text-center text-danger">{glError}</p>
      ) : null}

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <div className="bg-surface px-2 py-1.5 sm:px-3 sm:py-2">
          <p ref={companyRef} className="font-display text-xs tracking-widest text-primary sm:text-sm">
            TEMP HIRE
          </p>
          <h1 className="font-display text-2xl leading-none text-fg sm:text-4xl">SLINGLINE</h1>
          <p ref={statusRef} className="mt-1 font-display text-xs tracking-widest text-muted">
            FOR HARGROVE
          </p>
          <p className="mt-1 border-t border-line pt-1 font-display text-[10px] tracking-widest text-steel">
            {summary.hired ? `SHIFT ${summary.rentalStep}/${summary.rentalTotal}` : `LV ${summary.level}/${summary.levelCount}`} ·{" "}
            {SITE_THEME_LABEL[summary.levelTheme]}
          </p>
        </div>
        <div className="bg-surface px-3 py-2 text-right">
          <p className="font-display text-sm tracking-widest text-muted">SETS</p>
          <p className="font-display text-2xl leading-none text-fg sm:text-4xl">
            <span ref={scoreRef}>0</span>
            <span className="text-muted"> / </span>
            <span ref={bestRef}>{best}</span>
          </p>
          <p className="mt-1 font-display text-[11px] tracking-widest text-muted sm:text-sm">
            CASH <span ref={cashRef} className="text-fg">NOW RENTAL  $0</span>
          </p>
          <p ref={bookRef} className="hidden font-display text-xs tracking-widest text-steel sm:block">
            STANDING 70
          </p>
          <p className="hidden font-display text-[10px] tracking-widest text-steel sm:block">
            RADIUS <span ref={chartChipRef} className="text-fg">—</span>
          </p>
          <button
            ref={buyRef}
            type="button"
            onClick={() => {
              simRef.current?.buyNext();
              refreshBooks();
            }}
            className="pointer-events-auto mt-1 min-h-9 w-full border border-primary bg-bg px-1.5 py-0.5 font-display text-[10px] leading-tight tracking-wide text-fg sm:min-h-11 sm:px-2 sm:py-1 sm:text-xs"
          >
            HARGROVE'S CRANE
          </button>
          {playing ? (
            <div className="mt-2 hidden border-t border-line pt-2 font-display text-sm tracking-wide text-fg sm:block">
              <p>
                SWAY <span ref={swayNumRef}>0°</span>
              </p>
              <p>
                LIMIT <span ref={limitRef} data-level="ok" className="limit-read">0%</span>
              </p>
              <p ref={windWrapRef} className="wind-row" style={{ display: "none" }}>
                <span>WIND</span>
                <svg
                  ref={windArrowRef}
                  viewBox="0 0 10 10"
                  className="wind-arrow"
                  aria-hidden="true"
                >
                  <path d="M5 0.6 L8.8 9 L5 6.6 L1.2 9 Z" fill="currentColor" />
                </svg>
                <span ref={windLevelRef} className="wind-level" data-level="light">
                  LIGHT
                </span>
              </p>
              <p ref={forecastRef} className="wind-row text-[10px] tracking-wider text-muted" style={{ display: "none" }} />
              <p>
                <span ref={meterRef}>SPEED</span> <span ref={speedRef}>0.0</span>
              </p>
              <div ref={swayWrapRef} className="sway-well ml-auto mt-2" style={{ display: "none" }}>
                <span ref={dotRef} className="sway-dot" />
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <div
        ref={bannerRef}
        data-show=""
        className="banner pointer-events-none absolute inset-x-0 top-16 px-4 text-center font-display text-2xl tracking-wide"
      />
      {playing && captions ? (
        <p ref={captionRef} className="caption-line pointer-events-none absolute inset-x-0 bottom-44 px-4 text-center font-display text-sm tracking-widest text-fg" />
      ) : null}

      {playing && trainingOpen ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg/75 p-4">
          <section className="w-full max-w-sm border border-primary border-t-4 bg-surface p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-xs tracking-widest text-primary">SLINGLINE OPERATOR SCHOOL</p>
              <p className="font-display text-xs text-muted">{trainingStep + 1} / 6</p>
            </div>
            <div className="mt-3 h-1.5 bg-line">
              <div className="h-full bg-primary" style={{ width: `${((trainingStep + 1) / 6) * 100}%` }} />
            </div>
            <h2 className="mt-4 font-display text-2xl leading-tight text-fg">
              {[
                "1. Set up the crane",
                "2. Position the boom",
                "3. Make the connection",
                "4. Take the weight slowly",
                "5. Control the swing",
                "6. Land the load",
              ][trainingStep]}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-fg">
              {[
                "Drive forward with W/↑, reverse with S/↓, and steer left/right with A/← and D/→. Stop in the work area. Once lifting, those axes control boom pitch and slew instead.",
                "Slew left/right with the stick or A/D. Pitch the boom with forward/back or W/S; telescope with the right-side arrows or Z/C. Raise/lower the hook with Q/R or E/F. The on-screen controls work too.",
                "Lower with DOWN or E/F. The load does not hook itself. Press HOOK when the hook is on it. After it is on the hook, the slew and boom cues point at the set.",
                "Use UP or Q/R gently to lift clear. Watch the load-limit percentage and sway meter. Easy mode keeps its 44° safety interlock; raise the boom to clear it. The angle stop is separate from the load-chart limit.",
                "Move the load with small joystick inputs. Let it settle before changing direction. Slow pace gives you finer control; avoid dragging a swinging load across the site.",
                "Lower with DOWN until the load is resting in the marked amber ring. Press RELEASE to finish the set. If you set it down outside, hoist it and lower it again inside.",
              ][trainingStep]}
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => { markGuideSeen(); setTrainingOpen(false); }} className="min-h-11 flex-1 border border-line bg-bg px-3 font-display text-sm tracking-wide text-fg">CLOSE GUIDE</button>
              {trainingStep > 0 ? <button type="button" onClick={() => setTrainingStep((step) => Math.max(0, step - 1))} className="min-h-11 border border-line bg-bg px-3 font-display text-sm text-fg">BACK</button> : null}
              <button type="button" onClick={() => { if (trainingStep === 5) { markGuideSeen(); setTrainingOpen(false); } else setTrainingStep((step) => Math.min(5, step + 1)); }} className="min-h-11 flex-1 bg-primary px-3 font-display text-sm tracking-wide text-bg">{trainingStep === 5 ? "START LIFTING" : "NEXT"}</button>
            </div>
          </section>
        </div>
      ) : null}

      {playing ? (
        <div className="pointer-events-none absolute left-2 right-24 top-[9.5rem] flex flex-col items-start gap-1.5 sm:left-3 sm:right-auto sm:top-36 sm:max-w-xs sm:gap-2">
          <p ref={callRef} className="hidden w-full truncate bg-surface px-2 py-1 font-display text-[11px] leading-tight tracking-wide text-primary sm:block sm:whitespace-normal sm:px-3 sm:py-2 sm:text-base">
            YARD MOVE: CRATE · WAGE $810 OF $1,800
          </p>
          <p ref={coachRef} data-live="false" className="coach-line line-clamp-2 w-full bg-surface px-2 py-1 text-left text-[11px] leading-snug text-fg sm:line-clamp-none sm:px-3 sm:py-2 sm:text-base">
            Find the marked load. Lower the hook until it is over the crate, attach it, then carry it to the amber set ring.
          </p>
          <p
            ref={objectiveRef}
            className="w-full border-l-2 border-primary bg-surface px-2 py-1 text-left font-display text-[11px] leading-snug tracking-wide text-fg sm:px-3 sm:py-2 sm:text-sm"
          >
            SETUP · Stop in the work area, then deploy the pads.
          </p>
          {coachOpen ? (
            <section ref={coachWrapRef} className="pointer-events-auto w-full border border-primary border-t-2 bg-surface/95 px-2 py-1 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-[10px] tracking-widest text-primary">FIRST SHIFT</p>
                <button type="button" onClick={() => setCoachOpen(false)} className="min-h-7 border border-line px-1.5 font-display text-[10px] tracking-wide text-fg">CLOSE</button>
              </div>
              <div ref={coachCardRef}>
                <p ref={coachTitleRef} className="mt-0.5 font-display text-base leading-tight text-fg">Pads first</p>
                <p ref={coachBodyRef} className="mt-0.5 text-[11px] leading-snug text-muted">Stop the carrier, then press DEPLOY.</p>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 border-t border-line pt-1 text-[10px] tracking-wide">
                  <span ref={coachPadsRef} data-done="false" className="text-steel">□ Pads</span>
                  <span ref={coachHookRef} data-done="false" className="text-steel">□ Hook</span>
                  <span ref={coachSetRef} data-done="false" className="text-steel">□ Set</span>
                </div>
              </div>
            </section>
          ) : null}
          <p
            ref={alignmentRef}
            data-ready="false"
            style={{ display: "none" }}
            className="w-full border-l-2 border-line bg-surface px-2 py-1 text-left font-display text-[11px] leading-snug tracking-wide text-fg sm:px-3 sm:py-2 sm:text-sm"
          >
            ALIGN · SLEW · REACH · HOIST
          </p>
          <p className="flex w-full justify-between gap-2 bg-surface px-2 py-1 font-display text-[10px] tracking-wide text-fg sm:hidden">
            <span>
              SWAY <span ref={swayMiniRef}>0°</span>
            </span>
            <span>
              LIMIT <span ref={limitMiniRef}>0%</span>
            </span>
            <span>
              SPEED <span ref={speedMiniRef}>0.0</span>
            </span>
          </p>
          <details ref={mapBoxRef} className="short-hide pointer-events-auto w-full max-w-[16rem] bg-surface px-3 py-2">
            <summary className="cursor-pointer font-display text-sm tracking-wide text-primary">JOB MAP</summary>
            <canvas ref={mapRef} className="mt-2 h-[156px] w-full bg-bg" />
            <p className="mt-1 font-display text-[10px] tracking-widest text-muted">NORTH UP · CROSS IS THE EXACT SET</p>
          </details>
          <p
            ref={setRef}
            className="bg-surface px-3 py-2 text-left font-display text-lg tracking-wide text-primary"
          >
            SET · 0.0 m
          </p>
          <p
            ref={gapRef}
            style={{ display: "none" }}
            className="bg-surface px-3 py-2 text-left font-display text-lg tracking-wide text-fg"
          >
            0.0 m
          </p>
          <div className="pointer-events-auto flex flex-wrap gap-1">
            {summary.tutorial ? (
              <button
                type="button"
                onClick={() => {
                  simRef.current?.skipTutorial();
                  refreshBooks();
                }}
                className="hidden h-11 border border-line bg-surface px-3 font-display text-sm tracking-wide text-fg sm:block"
              >
                SKIP TUTORIAL
              </button>
            ) : null}
            <button
              ref={soloRef}
              type="button"
              onClick={fileCompany}
              style={{ display: "none" }}
              className="h-11 bg-primary px-3 font-display text-base tracking-wide text-bg"
            >
              FILE SLINGLINE · {money(ECONOMY.foundFee)}
            </button>
          </div>
        </div>
      ) : null}

      {playing ? (
        <div className="pointer-events-auto absolute right-2 top-[9.5rem] z-20 flex flex-col items-end gap-1 sm:right-3 sm:top-64 sm:gap-2">
          <button
            ref={lightsBtnRef}
            type="button"
            aria-label="Toggle work lights"
            aria-pressed={workLights}
            onClick={() => {
              const next = !lightsRef.current;
              lightsRef.current = next;
              setWorkLights(next);
              simRef.current?.setWorkLights(next);
            }}
            style={{ display: "none" }}
            className="flex size-12 items-center justify-center rounded-full border border-primary bg-surface text-fg shadow-lg"
          >
            <Lightbulb size={20} />
          </button>
          <button
            type="button"
            onClick={() => setTestOpen(true)}
            className="border border-primary bg-surface px-1.5 py-1 font-display text-[10px] tracking-widest text-primary shadow-lg sm:px-2 sm:py-1.5 sm:text-xs"
          >
            TEST JOB
          </button>
          <details className="pointer-events-auto relative">
            <summary className="cursor-pointer border border-line bg-surface px-1.5 py-1 font-display text-[10px] tracking-widest text-fg shadow-lg sm:px-2 sm:py-1.5 sm:text-xs">
              CAM · {cam === "operator" ? "SEAT" : cam.toUpperCase()}
            </summary>
            <div className="absolute right-0 top-full z-20 mt-1 grid grid-cols-2 gap-1 border border-line bg-surface p-1">
              {(["chase", "wide", "truck", "cab", "hook", "high", "operator"] as CamView[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={(event) => {
                    setCam(id);
                    yardRef.current?.setView(id);
                    const box = event.currentTarget.closest<HTMLDetailsElement>("details");
                    if (box) box.open = false;
                  }}
                  className={`px-2 py-1 font-display text-sm tracking-wide ${cam === id ? "bg-primary text-bg" : "bg-bg text-fg"}`}
                >
                  {id === "operator" ? "SEAT" : id.toUpperCase()}
                </button>
              ))}
            </div>
          </details>
          <button
            type="button"
            aria-label="Open game settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
            className="flex size-10 items-center justify-center rounded-full border border-primary bg-surface text-xl text-fg shadow-lg sm:size-12 sm:text-2xl"
          >
            ⚙
          </button>
          {settingsOpen ? (
            <section className="max-h-[62dvh] w-[min(17rem,calc(100vw-1.5rem))] overflow-y-auto border border-primary bg-surface p-2 text-xs shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base tracking-wide">GAME OPTIONS</h2>
                <button type="button" onClick={() => setSettingsOpen(false)} className="min-h-10 border border-line px-3 font-display text-sm">CLOSE</button>
              </div>
              <button type="button" onClick={() => { setTestOpen(true); setSettingsOpen(false); }} className="mt-2 min-h-9 w-full border border-primary bg-bg px-2 py-1 text-left font-display text-xs tracking-wide text-primary">TEST ANY JOB</button>
              <button ref={jobsRef} type="button" onClick={() => setBoardOpen(true)} className="mt-2 min-h-9 w-full border border-primary bg-bg px-2 py-1 text-left font-display text-xs tracking-wide text-fg">JOBS &amp; CONTRACTS</button>
              <button type="button" onClick={() => { setTrainingStep(0); setTrainingOpen(true); setSettingsOpen(false); }} className="mt-2 min-h-9 w-full border border-line bg-bg px-2 py-1 text-left font-display text-xs tracking-wide text-fg">OPERATOR TRAINING</button>
              <p className="mt-2 font-display text-[10px] tracking-widest text-muted">DIFFICULTY</p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <ModeButton active={mode === "easy"} onClick={() => setMode("easy")} label="Easy" detail="Assisted swing" />
                <ModeButton active={mode === "hard"} onClick={() => setMode("hard")} label="Hard" detail="Raw swing and wind" />
              </div>
              <p className="mt-3 font-display text-xs tracking-widest text-muted">CONTROL METHOD</p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <ModeButton active={scheme === "stick"} onClick={() => pickScheme("stick")} label="Stick" detail="Thumb control" />
                <ModeButton active={scheme === "arrows"} onClick={() => pickScheme("arrows")} label="Arrows" detail="Directional buttons" />
              </div>
              <p className="mt-3 font-display text-xs tracking-widest text-muted">MOVEMENT SPEED</p>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <ModeButton active={pace === "slow"} onClick={() => setPace("slow")} label="Slow" detail="Careful" />
                <ModeButton active={pace === "steady"} onClick={() => setPace("steady")} label="Steady" detail="Normal" />
                <ModeButton active={pace === "fast"} onClick={() => setPace("fast")} label="Fast" detail="Quick" />
              </div>
              <p className="mt-3 font-display text-xs tracking-widest text-muted">TOUCH SENSITIVITY</p>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <ModeButton active={sensitivity === "low"} onClick={() => { setSensitivity("low"); setTouchSensitivity(0.75); }} label="Low" detail="Fine" />
                <ModeButton active={sensitivity === "normal"} onClick={() => { setSensitivity("normal"); setTouchSensitivity(1); }} label="Normal" detail="Balanced" />
                <ModeButton active={sensitivity === "high"} onClick={() => { setSensitivity("high"); setTouchSensitivity(1.3); }} label="High" detail="Fast" />
              </div>
              <p className="mt-3 font-display text-xs tracking-widest text-muted">CAMERA VIEW</p>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(["chase", "wide", "truck", "cab", "hook", "high", "operator"] as CamView[]).map((id) => (
                  <button key={id} type="button" onClick={() => { setCam(id); yardRef.current?.setView(id); }} className={`min-h-10 border px-2 font-display text-xs tracking-wide ${cam === id ? "border-primary bg-primary text-bg" : "border-line bg-bg text-fg"}`}>
                    {id === "operator" ? "SEAT" : id.toUpperCase()}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => yardRef.current?.setView(cam)} className="mt-2 min-h-10 w-full border border-line bg-bg px-3 font-display text-sm">RESET CAMERA VIEW</button>
              <p className="mt-3 font-display text-xs tracking-widest text-muted">SOUND</p>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {VOLUME_STEPS.map((step) => (
                  <ModeButton
                    key={step.label}
                    active={volume === step.value}
                    onClick={() => setVolume(step.value)}
                    label={step.label}
                    detail={step.detail}
                  />
                ))}
              </div>
              <p className="mt-3 font-display text-xs tracking-widest text-muted">LIGHTING</p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <ModeButton active={!nightAny} onClick={() => setNightAny(false)} label="Day" detail="As the job says" />
                <ModeButton active={nightAny} onClick={() => setNightAny(true)} label="Night" detail="Every job after dark" />
              </div>
              <ExtraSettings
                quality={quality}
                onQuality={setQuality}
                contrast={contrast}
                onContrast={setContrast}
                reduceMotion={reduceMotion}
                onReduceMotion={setReduceMotion}
                haptics={haptics}
                onHaptics={setHaptics}
                captions={captions}
                onCaptions={setCaptions}
                autoFrame={autoFrame}
                onAutoFrame={setAutoFrame}
                gestureSwing={gestureSwing}
                onGestureSwing={setGestureSwing}
                binds={binds}
                onBinds={setBinds}
                capturing={capturing}
                onCapture={setCapturing}
              />
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  setConfirmReset(true);
                }}
                className="mt-3 min-h-10 w-full border border-danger bg-bg px-3 font-display text-sm tracking-wide text-danger"
              >
                RESET CAREER
              </button>
              <details className="mt-3 border border-line bg-bg p-2">
                <summary className="cursor-pointer font-display text-sm tracking-wide">OPERATING HELP</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">Stop the carrier and deploy the stabilizer pads before lifting. Use the joystick or arrows to position the crane, the left/right arrows to telescope, and the up/down arrows to raise or lower the hook. Drag the yard to look around; use two fingers to zoom. Hard mode adds a shifting wind: the arrow beside the sway meter shows which way it pushes the load.</p>
              </details>
            </section>
          ) : null}
        </div>
      ) : null}

      {playing && cam === "operator" ? (
        <div ref={chartPanelRef} className="pointer-events-none absolute bottom-24 left-1/2 w-44 -translate-x-1/2 border border-line bg-surface px-3 py-2 font-display text-xs tracking-wide text-fg">
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-muted">RADIUS</span>
            <span ref={chartRadiusRef}>0.0 m</span>
          </p>
          <p className="mt-0.5 flex items-baseline justify-between gap-2">
            <span className="text-muted">CHART</span>
            <span ref={chartCapacityRef}>0.0 t</span>
          </p>
          <p className="mt-0.5 flex items-baseline justify-between gap-2">
            <span className="text-muted">LOAD</span>
            <span ref={chartLoadRef}>—</span>
          </p>
          <div className="mt-1 h-1.5 w-full bg-bg">
            <span ref={chartBarRef} className="block h-full" style={{ width: "0%", backgroundColor: "#7fa6b8" }} />
          </div>
          <p ref={chartPctRef} className="mt-0.5 text-right text-sm">
            0%
          </p>
        </div>
      ) : null}

      {playing && debrief ? (
        <div className="pointer-events-auto absolute left-1/2 top-1/2 z-30 w-[min(17rem,calc(100vw-1rem))] -translate-x-1/2 -translate-y-1/2 border border-line bg-surface px-3 py-2 font-display tracking-wide text-fg sm:bottom-24 sm:top-auto sm:translate-y-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs tracking-widest text-muted">SET DEBRIEF · {debrief.cost}</span>
            <span className="text-3xl leading-none" style={{ color: gradeTint(debrief.grade) }} aria-label={`Grade ${debrief.grade}`}>
              {gradeGlyph(debrief.grade)} {debrief.grade}
            </span>
          </div>
          <div className="mt-1 divide-y divide-line/60 text-[11px]">
            {PART_ROWS.filter((part) => part !== "heading" || (debrief.headingTolerance ?? 0) > 0).map((part) => (
              <p key={part} className="flex items-baseline justify-between gap-2 py-0.5">
                <span className="text-muted">{part === "off" ? "RING" : part.toUpperCase()}</span>
                <span className="flex items-baseline gap-2 tabular-nums">
                  <span className="text-steel">
                    {part === "off"
                      ? `${debrief.off.toFixed(1)} / ${debrief.tolerance.toFixed(1)} m`
                      : part === "impact"
                        ? `${debrief.impact.toFixed(1)} m/s`
                        : part === "sway"
                          ? `${debrief.sway.toFixed(1)}°`
                          : part === "heading"
                            ? `${Math.round(debrief.heading ?? 0)}° / ${Math.round(debrief.headingTolerance ?? 0)}°`
                            : `${Math.round(debrief.chart * 100)}%`}
                  </span>
                  <span className="w-3 text-right" style={{ color: gradeTint(debrief.parts[part] ?? "C") }}>
                    {debrief.parts[part] ?? "—"}
                  </span>
                </span>
              </p>
            ))}
          </div>
          <p className="mt-1 border-t border-line pt-1 text-[11px] leading-snug text-steel">{debrief.tip}</p>
          <p className="mt-0.5 text-[10px] tracking-widest text-muted">
            {isNewBest
              ? "PERSONAL BEST ON THIS CALL"
              : bestRun
                ? `BEST ${bestRun.grade} · RING ${bestRun.off.toFixed(1)} m · IMPACT ${bestRun.impact.toFixed(1)} m/s`
                : "FIRST SET ON THIS CALL"}
          </p>
          <div className="mt-1 flex flex-wrap gap-1 border-t border-line pt-1">
            <button
              type="button"
              onClick={() => {
                const card = buildCard();
                if (!card) return;
                downloadCard(card);
                setShareStatus("CARD SAVED");
              }}
              className="min-h-8 flex-1 border border-line bg-bg px-2 font-display text-[10px] tracking-wide text-fg"
            >
              SAVE CARD
            </button>
            <button
              type="button"
              onClick={async () => {
                const card = buildCard();
                if (!card) return;
                const copied = await copyText(shareText(card));
                setShareStatus(copied ? "RESULT COPIED" : shareText(card));
              }}
              className="min-h-8 flex-1 border border-line bg-bg px-2 font-display text-[10px] tracking-wide text-fg"
            >
              COPY RESULT
            </button>
            {simRef.current?.daily ? (
              <button
                type="button"
                onClick={async () => {
                  const sim = simRef.current;
                  if (!sim?.daily || !sim.lastSet) return;
                  const copied = await copyText(challengeCode(sim.daily.day, sim.daily.job, sim.daily.crane, sim.lastSet.grade));
                  setShareStatus(copied ? "CHALLENGE COPIED" : challengeCode(sim.daily.day, sim.daily.job, sim.daily.crane, sim.lastSet.grade));
                }}
                className="min-h-8 flex-1 border border-primary bg-bg px-2 font-display text-[10px] tracking-wide text-primary"
              >
                CHALLENGE
              </button>
            ) : null}
          </div>
          {shareStatus ? <p className="mt-0.5 text-[10px] tracking-wide text-primary">{shareStatus}</p> : null}
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-line pt-1 text-sm">
            <span>
              {debrief.pay > 0
                ? `${money(debrief.pay)}${debrief.rep > 0 ? ` · +${debrief.rep} ${books.status === "hired" ? "STANDING" : "REP"}` : ""}`
                : "Practice — no pay"}
            </span>
            <button
              type="button"
              onClick={() => {
                simRef.current?.dismissDebrief();
                setDebrief(null);
                setShareStatus("");
                if (frameRestoreRef.current) {
                  setCam(frameRestoreRef.current);
                  yardRef.current?.setView(frameRestoreRef.current);
                  frameRestoreRef.current = null;
                }
              }}
              className="min-h-9 border border-primary bg-bg px-2 font-display text-xs tracking-wide text-fg"
            >
              DISMISS
            </button>
          </div>
        </div>
      ) : null}

      {!playing ? (
        <div className="absolute inset-0 overflow-y-auto p-3 pb-8 sm:p-6">
          <section className="mx-auto w-full max-w-md border border-line border-t-4 border-t-primary bg-surface p-4 sm:max-w-3xl sm:p-5">
            <p className="font-display text-sm tracking-widest text-primary">SLINGLINE CAREER</p>
            <h2 className="mt-1 font-display text-4xl leading-none sm:text-5xl">Ready for work?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Three tutorials, then two small jobs. You can skip a tutorial. The wages pay the filing fee. After that the calls change: a backyard, the docks, a roof, and a wind blade.
            </p>
            <button type="button" className="mt-4 h-14 w-full bg-primary font-display text-2xl tracking-wide text-bg" onClick={startCareer}>
              {summary.hired ? "START CAREER" : "CONTINUE CAREER"}
            </button>
            <button
              type="button"
              className="mt-2 h-12 w-full border border-primary bg-bg font-display text-lg tracking-wide text-primary"
              onClick={() => setTestOpen(true)}
            >
              TEST ANY JOB OR CRANE
            </button>
            <button
              type="button"
              className="mt-2 h-12 w-full border border-line bg-bg font-display text-lg tracking-wide text-fg"
              onClick={startDaily}
            >
              DAILY RUN · {levelOf(daily.job).title} · {daily.crane.toUpperCase()}
            </button>
            <p className="mt-1 text-center font-display text-[10px] tracking-widest text-muted">
              {dailyResult && dailyResult.day === daily.day
                ? `${dailyLine(daily, dailyResult)} · ${dailyRecordLine(dailyHistory, daily.day)}`
                : dailyRecordLine(dailyHistory, daily.day)}
            </p>
            {summary.tutorial ? (
              <button
                type="button"
                className="mt-2 h-12 w-full border border-line bg-bg font-display text-lg tracking-wide text-fg"
                onClick={() => {
                  simRef.current?.skipTutorial();
                  refreshBooks();
                }}
              >
                SKIP TUTORIAL
              </button>
            ) : null}
            <details className="mt-3 border border-line bg-bg p-3">
              <summary className="cursor-pointer font-display text-base tracking-wide">CAREER DETAILS · {summary.company}</summary>
            <p className="mt-2 text-sm leading-relaxed text-muted">{summary.employer}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <p className="bg-bg px-3 py-2">
                <span className="block font-display text-xs tracking-widest text-muted">CASH</span>
                <span className="font-display text-2xl leading-none">{summary.cash}</span>
              </p>
              <p className="bg-bg px-3 py-2">
                <span className="block font-display text-xs tracking-widest text-muted">{summary.hired ? "STANDING" : "REPUTATION"}</span>
                <span className="font-display text-2xl leading-none">{summary.hired ? summary.standing : summary.reputation}</span>
              </p>
              <p className="bg-bg px-3 py-2">
                <span className="block font-display text-xs tracking-widest text-muted">CRANE</span>
                <span className="font-display text-2xl leading-none">{summary.crane}</span>
              </p>
              <p className="bg-bg px-3 py-2">
                <span className="block font-display text-xs tracking-widest text-muted">{summary.note > 0 ? "NOTE" : "JOBS"}</span>
                <span className="font-display text-2xl leading-none">{summary.note > 0 ? money(summary.note) : summary.jobsDone}</span>
              </p>
            </div>
            <p className="mt-3 bg-bg px-3 py-2 font-display text-base leading-tight tracking-wide text-primary">{summary.call}</p>
            <p className="mt-1 font-display text-[10px] tracking-widest text-steel">
              LV {summary.level} · {SITE_THEME_LABEL[summary.levelTheme]} · {loadSpec(summary.levelKind).label}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-fg">{summary.levelBrief}</p>
            {summary.hired ? (
              <ol className="mt-3 grid gap-1">
                {RENTAL_LEVELS.map((id, i) => {
                  const lv = levelOf(id);
                  const done = summary.jobsDone > i;
                  const next = summary.jobsDone === i;
                  return (
                    <li
                      key={id}
                      className={`flex items-baseline justify-between gap-2 border px-2 py-1 text-xs ${next ? "border-primary text-fg" : "border-line text-muted"}`}
                    >
                      <span className="font-display tracking-wide">
                        {lv.phase === "tutorial" ? "TUTORIAL" : "ODD JOB"} · {lv.title}
                      </span>
                      <span className="font-display text-[10px] tracking-widest">{done ? "DONE" : next ? "NEXT" : "—"}</span>
                    </li>
                  );
                })}
              </ol>
            ) : null}
            {summary.campaignDone ? (
              <div className="mt-3 border border-primary bg-bg p-2">
                <p className="font-display text-xs tracking-widest text-primary">CAMPAIGN COMPLETE · SCORECARD</p>
                <div className="mt-1 grid grid-cols-4 gap-1 text-center">
                  {gradeSpread(books).map((row) => (
                    <p key={row.grade}>
                      <span className="block font-display text-2xl leading-none" style={{ color: gradeTint(row.grade) }}>
                        {row.count}
                      </span>
                      <span className="text-[10px] tracking-widest text-muted">{row.grade}</span>
                    </p>
                  ))}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {summary.sets} sets · {summary.cash} banked · {summary.note > 0 ? `note ${money(summary.note)} left` : "clear of the note"}
                </p>
              </div>
            ) : null}
            <p className="mt-2 text-sm leading-relaxed text-fg">{summary.hired ? summary.found.reason : summary.buyDetail}</p>
            {summary.downtime > 0 ? (
              <p className="mt-2 text-sm text-danger">Downtime {summary.downtime}. A yard move is the way back out.</p>
            ) : null}
            {summary.hired && summary.found.ok ? (
              <button
                type="button"
                onClick={fileCompany}
                className="mt-3 h-12 w-full bg-primary font-display text-xl tracking-wide text-bg"
              >
                FILE SLINGLINE · {money(ECONOMY.foundFee)}
              </button>
            ) : null}
            {!summary.hired ? (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {jobBoard(books).map((offer) => (
                    <JobButton
                      key={offer.id}
                      offer={offer}
                      hired={false}
                      onPick={(id) => {
                        takeCall(id);
                        refreshBooks();
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    simRef.current?.buyNext();
                    refreshBooks();
                    setCrane(simRef.current?.crane ?? crane);
                  }}
                  className="mt-3 h-12 w-full border border-primary bg-bg font-display text-lg tracking-wide text-fg"
                >
                  {summary.buy}
                </button>

                <div className="mt-3 border border-line bg-bg p-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-display text-xs tracking-widest text-primary">CRANE SHOP</p>
                    <p className="font-display text-[10px] tracking-widest text-steel">
                      WEAR {summary.wearLabel} · {Math.round(summary.wear)}%
                    </p>
                  </div>
                  <div className="mt-1 grid gap-1">
                    {UPGRADE_IDS.map((id) => {
                      const level = books.upgrades[id] ?? 0;
                      const cost = nextUpgradeCost(books, id);
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={cost == null}
                          onClick={() => {
                            simRef.current?.buyUpgrade(id);
                            refreshBooks();
                          }}
                          className="border border-line bg-surface px-2 py-1 text-left disabled:opacity-60"
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="font-display text-sm tracking-wide text-fg">
                              {UPGRADES[id].label}{" "}
                              <span className="text-primary">{"■".repeat(level)}</span>
                              <span className="text-muted">{"□".repeat(Math.max(0, MAX_UPGRADE - level))}</span>
                            </span>
                            <span className="font-display text-[11px] tracking-wide text-primary">
                              {cost == null ? "MAX" : money(cost)}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-snug text-muted">{UPGRADES[id].detail}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={summary.serviceCost === 0}
                    onClick={() => {
                      simRef.current?.serviceCrane();
                      refreshBooks();
                    }}
                    className="mt-1 min-h-9 w-full border border-primary bg-bg px-2 font-display text-xs tracking-wide text-fg disabled:opacity-50"
                  >
                    SERVICE THE CRANE{summary.serviceCost > 0 ? ` · ${money(summary.serviceCost)}` : " · TIGHT"}
                  </button>
                </div>

                <div className="mt-3 border border-line bg-bg p-2">
                  <p className="font-display text-xs tracking-widest text-primary">YOUR SETS</p>
                  {books.recentSets.length > 0 ? (
                    <>
                      <div className="relative mt-1 h-24 w-full border border-line bg-surface">
                        <span className="absolute left-1/2 top-0 h-full w-px bg-line" />
                        <span className="absolute left-0 top-1/2 h-px w-full bg-line" />
                        {books.recentSets.slice(-12).map((set, index) => {
                          const ratio = Math.min(1, set.off / Math.max(0.1, set.tolerance));
                          const angle = index * 2.39996;
                          const x = 50 + Math.cos(angle) * ratio * 44;
                          const y = 50 + Math.sin(angle) * ratio * 44;
                          return (
                            <span
                              key={`${set.job}-${index}`}
                              title={`${set.grade} · ${set.off.toFixed(1)} m`}
                              style={{ left: `${x}%`, top: `${y}%`, background: gradeTint(set.grade) }}
                              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                            />
                          );
                        })}
                      </div>
                      <p className="mt-1 text-[10px] tracking-wide text-muted">
                        LAST {books.recentSets.slice(-12).length} SETS · DISTANCE FROM THE MARK, AS A SHARE OF THE RING
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-[10px] leading-snug text-muted">No sets logged yet. The scatter fills as you work.</p>
                  )}
                  {summary.incidents.length > 0 ? (
                    <p className="mt-1 border-t border-line pt-1 text-[10px] leading-snug text-steel">
                      INCIDENTS {summary.incidents.length}:{" "}
                      {summary.incidents
                        .slice(-3)
                        .map((incident) => `${incident.kind.toUpperCase()} ${money(incident.cost + incident.insurance)}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}

            <details className="mt-2 border border-line bg-bg p-2">
              <summary className="cursor-pointer font-display text-sm tracking-wide">SAVE · EXPORT, IMPORT &amp; CHALLENGE</summary>
              <p className="mt-1 text-[10px] leading-snug text-muted">
                Copy this text to keep the career. Paste it back on another device to restore it.
              </p>
              <textarea
                readOnly
                value={encodeSave(books)}
                onFocus={(event) => event.currentTarget.select()}
                className="mt-1 h-16 w-full resize-none border border-line bg-surface p-1 font-display text-[10px] text-steel"
              />
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  onClick={async () => {
                    const copied = await copyText(encodeSave(books));
                    setImportNote(copied ? "Save copied to the clipboard." : "Copy the text in the box.");
                  }}
                  className="min-h-9 flex-1 border border-primary bg-bg px-2 font-display text-[10px] tracking-wide text-primary"
                >
                  COPY SAVE
                </button>
                <button
                  type="button"
                  onClick={() => setSaveOpen((open) => !open)}
                  className="min-h-9 flex-1 border border-line bg-bg px-2 font-display text-[10px] tracking-wide text-fg"
                >
                  {saveOpen ? "HIDE IMPORT" : "IMPORT SAVE"}
                </button>
              </div>
              {saveOpen ? (
                <>
                  <textarea
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    placeholder="Paste SLING1.…"
                    className="mt-1 h-16 w-full resize-none border border-line bg-surface p-1 font-display text-[10px] text-fg"
                  />
                  <button
                    type="button"
                    onClick={importSave}
                    className="mt-1 min-h-9 w-full bg-primary px-2 font-display text-[10px] tracking-wide text-bg"
                  >
                    IMPORT THIS SAVE
                  </button>
                </>
              ) : null}
              <p className="mt-2 font-display text-[10px] tracking-widest text-muted">CHALLENGE CODE</p>
              <div className="mt-1 flex gap-1">
                <input
                  value={challengeText}
                  onChange={(event) => setChallengeText(event.target.value)}
                  placeholder="SLING-CH|day|job|crane|grade"
                  className="min-w-0 flex-1 border border-line bg-surface px-1 font-display text-[10px] text-fg"
                />
                <button
                  type="button"
                  onClick={startChallenge}
                  className="min-h-9 border border-primary bg-bg px-2 font-display text-[10px] tracking-wide text-primary"
                >
                  PLAY
                </button>
              </div>
              {importNote ? <p className="mt-1 text-[10px] leading-snug text-primary">{importNote}</p> : null}
            </details>
            </details>
            <details className="mt-2 border border-line bg-bg p-3">
              <summary className="cursor-pointer font-display text-base tracking-wide">SETTINGS · CONTROLS &amp; DIFFICULTY</summary>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ModeButton active={mode === "easy"} onClick={() => setMode("easy")} label="Easy" detail="Swing dies on its own" />
              <ModeButton active={mode === "hard"} onClick={() => setMode("hard")} label="Hard" detail="Raw swing and wind" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ModeButton active={scheme === "stick"} onClick={() => pickScheme("stick")} label="Stick" detail="Thumb, eased" />
              <ModeButton active={scheme === "arrows"} onClick={() => pickScheme("arrows")} label="Arrows" detail="Hold a direction" />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <ModeButton active={pace === "slow"} onClick={() => setPace("slow")} label="Slow" detail="Careful" />
              <ModeButton active={pace === "steady"} onClick={() => setPace("steady")} label="Steady" detail="Yard pace" />
              <ModeButton active={pace === "fast"} onClick={() => setPace("fast")} label="Fast" detail="Full travel" />
            </div>
            <p className="mt-3 font-display text-xs tracking-widest text-muted">TOUCH SENSITIVITY</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <ModeButton active={sensitivity === "low"} onClick={() => { setSensitivity("low"); setTouchSensitivity(0.75); }} label="Low" detail="Fine movement" />
              <ModeButton active={sensitivity === "normal"} onClick={() => { setSensitivity("normal"); setTouchSensitivity(1); }} label="Normal" detail="Balanced" />
              <ModeButton active={sensitivity === "high"} onClick={() => { setSensitivity("high"); setTouchSensitivity(1.3); }} label="High" detail="Faster response" />
            </div>
            <p className="mt-4 font-display text-xs tracking-widest text-muted">PRACTICE A CRANE · NOT SAVED</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {CRANE_CHOICES.map((choice) => (
                <ModeButton
                  key={choice.id}
                  active={practiceId === choice.id}
                  onClick={() => pickCrane(choice.id)}
                  label={choice.label}
                  detail="Try it. Not saved"
                />
              ))}
            </div>
            <p className="mt-4 font-display text-xs tracking-widest text-muted">SOUND</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {VOLUME_STEPS.map((step) => (
                <ModeButton
                  key={step.label}
                  active={volume === step.value}
                  onClick={() => setVolume(step.value)}
                  label={step.label}
                  detail={step.detail}
                />
              ))}
            </div>
            <p className="mt-4 font-display text-xs tracking-widest text-muted">LIGHTING</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ModeButton active={!nightAny} onClick={() => setNightAny(false)} label="Day" detail="As the job says" />
              <ModeButton active={nightAny} onClick={() => setNightAny(true)} label="Night" detail="Every job after dark" />
            </div>
            <ExtraSettings
              quality={quality}
              onQuality={setQuality}
              contrast={contrast}
              onContrast={setContrast}
              reduceMotion={reduceMotion}
              onReduceMotion={setReduceMotion}
              haptics={haptics}
              onHaptics={setHaptics}
              captions={captions}
              onCaptions={setCaptions}
              autoFrame={autoFrame}
              onAutoFrame={setAutoFrame}
              gestureSwing={gestureSwing}
              onGestureSwing={setGestureSwing}
              binds={binds}
              onBinds={setBinds}
              capturing={capturing}
              onCapture={setCapturing}
            />
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="mt-3 min-h-10 w-full border border-danger bg-bg px-3 font-display text-sm tracking-wide text-danger"
            >
              RESET CAREER
            </button>
            <p className="mt-3 hidden text-xs text-steel sm:block">
              A/D steer or slew · W/S drive or pitch · Q/R raise · E/F lower · Z/C telescope · H flips mode
            </p>
            <p className="mt-3 text-xs text-muted">
              Stop, deploy the pads, then pitch, telescope, and hook. Drag the yard to look around.
            </p>
            {practiceId ? (
              <button type="button" className="mt-2 h-12 w-full border border-line bg-bg font-display text-lg tracking-wide text-fg" onClick={startPractice}>
                Practice {practiceId}
              </button>
            ) : null}
            </details>
          </section>
        </div>
      ) : (
        <div className="hud-safe pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between">
          <div className="flex flex-col items-center gap-1">
            <span ref={driveModeRef} className="border border-line bg-surface px-1.5 py-0.5 font-display text-[10px] tracking-widest text-muted">
              SLEW · TROLLEY
            </span>
            {scheme === "stick" ? <Stick /> : <ArrowPad />}
          </div>
          <div className="machine-plate pointer-events-auto flex items-center gap-3 px-3 py-2 max-sm:absolute max-sm:bottom-[13.5rem] max-sm:left-1/2 max-sm:-translate-x-1/2 max-sm:gap-2 max-sm:px-2">
            <button
              ref={deployRef}
              type="button"
              data-on="false"
              aria-label="Deploy or stow the outriggers"
              onClick={() => {
                const sim = simRef.current;
                if (!sim) return;
                if (sim.flipped) sim.recover();
                else sim.requestDeploy();
              }}
              className="machine-deploy flex flex-col items-center gap-1.5 px-1"
            >
              <span className="machine-lever" aria-hidden />
              <span ref={deployLabelRef} className="font-display text-[11px] tracking-widest text-fg">
                DEPLOY
              </span>
            </button>
            <button
              ref={hookBtnRef}
              type="button"
              data-ready="false"
              data-on="false"
              aria-label="Hook or release the load"
              onClick={() => {
                const sim = simRef.current;
                if (!sim) return;
                if (sim.attached) sim.requestRelease();
                else sim.requestHook();
              }}
              className="machine-trigger flex flex-col items-center gap-1.5 px-1 disabled:cursor-not-allowed"
            >
              <span className="machine-lever" aria-hidden />
              <span ref={hookLabelRef} className="font-display text-[11px] tracking-widest text-fg">
                HOOK
              </span>
            </button>
            <div className="flex flex-col items-center gap-1">
              <div className="machine-seg flex">
                {(["slow", "steady", "fast"] as Pace[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={pace === p}
                    onClick={() => setPace(p)}
                    className={`h-8 px-2 font-display text-[11px] tracking-wide ${pace === p ? "bg-primary text-bg" : "bg-surface text-muted"}`}
                  >
                    {p === "slow" ? "SLOW" : p === "steady" ? "STEADY" : "FAST"}
                  </button>
                ))}
              </div>
              <span className="font-display text-[9px] tracking-widest text-muted">CONTROL SPEED</span>
            </div>
            <button
              ref={lightsBtnRef}
              type="button"
              data-on="false"
              data-day="false"
              aria-label="Toggle work lights"
              aria-pressed={workLights}
              onClick={() => {
                const next = !lightsRef.current;
                lightsRef.current = next;
                setWorkLights(next);
                simRef.current?.setWorkLights(next);
              }}
              className="machine-lamp flex flex-col items-center gap-1 px-1"
            >
              <span className="machine-lamp-dial flex size-9 items-center justify-center rounded-full border border-line bg-bg text-fg">
                <Lightbulb size={17} />
              </span>
              <span className="font-display text-[9px] tracking-widest text-muted">LIGHTS</span>
            </button>
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            {practiceId ? (
              <button
                type="button"
                onClick={cycleCrane}
                className="h-11 min-w-20 border border-primary bg-surface px-3 font-display text-lg tracking-wide text-fg"
              >
                {crane.toUpperCase()}
              </button>
            ) : null}
            <div className="flex flex-col items-end gap-1">
              <span className="border border-primary bg-surface px-1.5 py-0.5 font-display text-[10px] tracking-widest text-primary">
                HOIST · TELESCOPE
              </span>
              <BoomPad upRef={upRef} downRef={downRef} />
            </div>
          </div>
        </div>
      )}
      {playing && paused ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg/80 p-4">
          <section className="w-full max-w-sm border border-primary border-t-4 bg-surface p-4">
            <p className="font-display text-xs tracking-widest text-primary">SHIFT PAUSED</p>
            <h2 className="mt-1 font-display text-3xl leading-none">Take a breath</h2>
            <p className="mt-2 text-sm leading-relaxed text-fg">{simRef.current?.message}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              W/A/S/D drive or slew, Q/R hoist, Z/C telescope, Space hooks or releases, Enter deploys the pads, Escape pauses.
            </p>
            <button type="button" onClick={resumeShift} className="mt-3 h-12 w-full bg-primary font-display text-xl tracking-wide text-bg">
              RESUME
            </button>
            {summary.tutorial ? (
              <button
                type="button"
                onClick={() => {
                  simRef.current?.skipTutorial();
                  refreshBooks();
                  resumeShift();
                }}
                className="mt-2 h-11 w-full border border-line bg-bg font-display text-base tracking-wide text-fg"
              >
                SKIP TUTORIAL
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                captureRef.current = true;
                setQualityNote("Saving the current view as a still.");
              }}
              className="mt-2 h-11 w-full border border-primary bg-bg font-display text-base tracking-wide text-fg"
            >
              SAVE A PHOTO
            </button>
            {qualityNote ? <p className="mt-1 text-center text-[10px] tracking-wide text-primary">{qualityNote}</p> : null}
            <button type="button" onClick={quitShift} className="mt-2 h-11 w-full border border-line bg-bg font-display text-base tracking-wide text-fg">
              QUIT TO START
            </button>
          </section>
        </div>
      ) : null}
      {testOpen ? (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-bg/80 p-3 sm:items-center">
          <section className="max-h-[86dvh] w-full max-w-md overflow-y-auto border border-line border-t-4 border-t-primary bg-surface p-4">
            <p className="font-display text-xs tracking-widest text-primary">TEST · NOT SAVED</p>
            <h2 className="mt-1 font-display text-3xl leading-none">Any job, any crane</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {CRANE_CHOICES.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => setTestCrane(choice.id)}
                  className={`min-h-11 border px-2 font-display text-sm tracking-wide ${testCrane === choice.id ? "border-primary bg-primary text-bg" : "border-line bg-bg text-fg"}`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-1">
              {ALL_JOBS.map((id) => {
                const lv = levelOf(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => startTest(id)}
                    className="min-h-11 border border-line bg-bg px-3 py-2 text-left"
                  >
                    <span className="block font-display text-lg leading-none text-fg">{lv.title}</span>
                    <span className="mt-1 block text-[10px] tracking-widest text-muted">{loadSpec(lv.kind).label}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => setTestOpen(false)} className="mt-3 h-12 w-full border border-line bg-bg font-display text-lg tracking-wide text-fg">
              CLOSE
            </button>
          </section>
        </div>
      ) : null}
      {boardOpen ? (
        <JobSheet
          offers={jobBoard(simRef.current?.career ?? books)}
          hired={(simRef.current?.career.status ?? books.status) === "hired"}
          onPick={(id) => {
            takeCall(id);
            refreshBooks();
            setBoardOpen(false);
          }}
          onClose={() => setBoardOpen(false)}
        />
      ) : null}
      {confirmReset ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg/85 p-4">
          <section className="w-full max-w-sm border border-danger border-t-4 bg-surface p-4">
            <p className="font-display text-xs tracking-widest text-danger">RESET CAREER</p>
            <h2 className="mt-1 font-display text-3xl leading-none">Start over?</h2>
            <p className="mt-2 text-sm leading-relaxed text-fg">
              This erases the career save: cash, standing, jobs done, the crane you own, and
              any note. Your best set count stays.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="min-h-11 flex-1 border border-line bg-bg px-3 font-display text-sm tracking-wide text-fg"
              >
                KEEP PLAYING
              </button>
              <button
                type="button"
                onClick={resetCareer}
                className="min-h-11 flex-1 bg-danger px-3 font-display text-sm tracking-wide text-bg"
              >
                RESET
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {contextLost ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg/85 p-4">
          <section className="w-full max-w-sm border border-primary border-t-4 bg-surface p-4 text-center">
            <p className="font-display text-xs tracking-widest text-primary">YARD PAUSED</p>
            <h2 className="mt-1 font-display text-3xl leading-none">Graphics lost</h2>
            <p className="mt-2 text-sm leading-relaxed text-fg">
              The browser dropped the graphics context. The yard pauses and picks up again as
              soon as the GPU comes back.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 min-h-11 w-full bg-primary px-3 font-display text-sm tracking-wide text-bg"
            >
              RELOAD THE YARD
            </button>
          </section>
        </div>
      ) : null}
      {beat ? (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-bg/80 p-4 sm:items-center">
          <section className="w-full max-w-md border border-line border-t-4 border-t-primary bg-surface p-5">
            <p className="font-display text-sm tracking-widest text-primary">YOUR COMPANY</p>
            <h2 className="mt-1 font-display text-4xl leading-none">The papers are filed</h2>
            <p className="mt-3 text-base leading-relaxed">{beat}</p>
            <button
              type="button"
              className="mt-4 h-12 w-full bg-primary font-display text-xl tracking-wide text-bg"
              onClick={() => {
                simRef.current?.dismissBeat();
                beatShown.current = null;
                setBeat(null);
                refreshBooks();
              }}
            >
              Open Slingline
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function JobButton({
  offer,
  hired,
  onPick,
}: {
  offer: JobOffer;
  hired: boolean;
  onPick: (id: JobId) => void;
}) {
  const pay = offer.locked
    ? offer.reason
    : offer.wage
      ? `Wage ${money(offer.take)} of ${money(offer.gross)}`
      : `Contract ${money(offer.gross)}`;
  return (
    <button
      type="button"
      onClick={() => onPick(offer.id)}
      className={
        offer.current
          ? "min-h-11 border border-primary bg-bg px-3 py-2 text-left"
          : "min-h-11 border border-line bg-bg px-3 py-2 text-left"
      }
    >
      <span className="block font-display text-[10px] tracking-widest text-steel">
        {offer.phase === "tutorial" ? "TUTORIAL" : offer.phase === "odd" ? "ODD JOB" : offer.id === "yard" ? "SHOP" : `LV ${String(offer.no).padStart(2, "0")}`} · {SITE_THEME_LABEL[offer.theme]} · {loadSpec(offer.kind).label}
      </span>
      <span className="block font-display text-xl leading-none text-fg">
        {offer.title}
        {offer.best ? (
          <span className="ml-2 border border-primary px-1 align-middle font-display text-[10px] tracking-widest text-primary">
            BEST {offer.best}
          </span>
        ) : null}
      </span>
      <span className={`mt-1 block text-xs leading-snug ${offer.locked ? "text-muted" : "text-steel"}`}>
        {hired && !offer.locked ? "Assigned. " : ""}
        {pay}
      </span>
      {!offer.locked ? <span className="mt-1 block text-xs leading-snug text-muted">{offer.brief}</span> : null}
      {!offer.locked && offer.reason ? <span className="mt-1 block text-xs leading-snug text-muted">{offer.reason}</span> : null}
    </button>
  );
}

function JobSheet({
  offers,
  hired,
  onPick,
  onClose,
}: {
  offers: JobOffer[];
  hired: boolean;
  onPick: (id: JobId) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-bg/75 p-3 sm:items-center">
      <section className="max-h-[86dvh] w-full max-w-lg overflow-y-auto border border-line border-t-4 border-t-primary bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-sm tracking-widest text-primary">{hired ? "ASSIGNED" : "JOB BOARD"}</p>
            <h2 className="font-display text-3xl leading-none">{hired ? "Hargrove picks the call" : "Pick a call"}</h2>
          </div>
          <button type="button" onClick={onClose} className="h-11 px-3 font-display text-lg text-fg">
            CLOSE
          </button>
        </div>
        <div className="mt-3 grid gap-2">
          {(hired ? offers.filter((offer) => RENTAL_LEVELS.includes(offer.id)) : offers).map((offer) => (
            <JobButton key={offer.id} offer={offer} hired={hired} onPick={onPick} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ModeButton({
  active,
  label,
  detail,
  onClick,
}: {
  active: boolean;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "border border-primary bg-bg px-3 py-2 text-left"
          : "border border-line bg-bg px-3 py-2 text-left"
      }
    >
      <span className="block font-display text-xl leading-none text-fg">{label}</span>
      <span className="mt-1 block text-xs text-muted">{detail}</span>
    </button>
  );
}

function Stick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<number | null>(null);

  const place = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    const thumb = thumbRef.current;
    if (!base || !thumb) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = rect.width * 0.36;
    const mag = Math.hypot(dx, dy);
    if (mag > max && mag > 0) {
      dx = (dx / mag) * max;
      dy = (dy / mag) * max;
    }
    thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const nx = dx / max;
    const ny = dy / max;
    const m = Math.hypot(nx, ny);
    const dz = 0.22;
    if (m < dz) {
      setTouchAxes(0, 0);
      return;
    }
    const along = (m - dz) / (1 - dz);
    const eased = along * along;
    setTouchAxes((-nx / m) * eased, (-ny / m) * eased);
  };

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (idRef.current !== e.pointerId) return;
    idRef.current = null;
    const thumb = thumbRef.current;
    if (thumb) thumb.style.transform = "translate(-50%, -50%)";
    setTouchAxes(0, 0);
  };

  return (
    <div
      ref={baseRef}
      className="pointer-events-auto relative size-28 touch-none rounded-full border border-line bg-surface"
      onPointerDown={(e) => {
        e.preventDefault();
        idRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        place(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (idRef.current !== e.pointerId) return;
        place(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      role="slider"
      aria-label="Slew and trolley"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={0}
    >
      <div
        ref={(node) => {
          thumbRef.current = node;
          if (node && node.style.transform === "") node.style.transform = "translate(-50%, -50%)";
        }}
        className="absolute top-1/2 left-1/2 size-12 rounded-full bg-primary"
      />
    </div>
  );
}

const arrows = { left: false, right: false, out: false, inn: false };

function syncArrows() {
  setTouchAxes((arrows.left ? 1 : 0) - (arrows.right ? 1 : 0), (arrows.out ? 1 : 0) - (arrows.inn ? 1 : 0));
}

function releaseArrows() {
  arrows.left = false;
  arrows.right = false;
  arrows.out = false;
  arrows.inn = false;
}

function ArrowPad() {
  return (
    <div className="pointer-events-auto grid grid-cols-3 gap-1">
      <span />
      <ArrowHold axis="out" label="Out">
        <ArrowUp className="size-5" aria-hidden />
      </ArrowHold>
      <span />
      <ArrowHold axis="left" label="Left">
        <ArrowLeft className="size-5" aria-hidden />
      </ArrowHold>
      <span className="size-14" />
      <ArrowHold axis="right" label="Right">
        <ArrowRight className="size-5" aria-hidden />
      </ArrowHold>
      <span />
      <ArrowHold axis="inn" label="In">
        <ArrowDown className="size-5" aria-hidden />
      </ArrowHold>
      <span />
    </div>
  );
}

function ArrowHold({
  axis,
  label,
  children,
}: {
  axis: keyof typeof arrows;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-14 touch-none flex-col items-center justify-center border border-line bg-surface font-display text-[10px] tracking-wide text-fg"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        arrows[axis] = true;
        syncArrows();
      }}
      onPointerUp={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        arrows[axis] = false;
        syncArrows();
      }}
      onPointerCancel={() => {
        arrows[axis] = false;
        syncArrows();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
      {label}
    </button>
  );
}

function BoomPad({
  upRef,
  downRef,
}: {
  upRef: React.RefObject<HTMLButtonElement | null>;
  downRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="pointer-events-auto grid grid-cols-3 gap-1">
      <span />
      <Hold buttonRef={upRef} label="Raise hook" icon={<ArrowUp className="size-5" aria-hidden />} dir={1} />
      <span />
      <ExtendHold label="Telescope in" dir={-1} icon={<ChevronLeft className="size-6" aria-hidden />} />
      <span className="size-14" />
      <ExtendHold label="Telescope out" dir={1} icon={<ChevronRight className="size-6" aria-hidden />} />
      <span />
      <Hold buttonRef={downRef} label="Lower hook" icon={<ArrowDown className="size-5" aria-hidden />} dir={-1} />
      <span />
    </div>
  );
}

const held = { up: false, down: false };
const telescope = { out: false, inn: false };

function syncHoist() {
  setTouchHoist((held.up ? 1 : 0) + (held.down ? -1 : 0));
}

function syncExtend() {
  setTouchExtend((telescope.out ? 1 : 0) + (telescope.inn ? -1 : 0));
}

function ExtendHold({ label, dir, icon }: { label: string; dir: 1 | -1; icon: React.ReactNode }) {
  const key = dir === 1 ? "out" : "inn";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex size-14 touch-none items-center justify-center border border-line bg-surface text-fg"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        telescope[key] = true;
        syncExtend();
      }}
      onPointerUp={() => {
        telescope[key] = false;
        syncExtend();
      }}
      onPointerCancel={() => {
        telescope[key] = false;
        syncExtend();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {icon}
    </button>
  );
}

function Hold({
  label,
  icon,
  dir,
  buttonRef,
}: {
  label: string;
  icon: React.ReactNode;
  dir: 1 | -1;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const key = dir === 1 ? "up" : "down";
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      className="flex size-14 touch-none items-center justify-center border border-line bg-surface text-fg"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        held[key] = true;
        syncHoist();
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerUp={() => {
        held[key] = false;
        syncHoist();
      }}
      onPointerCancel={() => {
        held[key] = false;
        syncHoist();
      }}
    >
      {icon}
    </button>
  );
}

function ExtraSettings({
  quality,
  onQuality,
  contrast,
  onContrast,
  reduceMotion,
  onReduceMotion,
  haptics,
  onHaptics,
  captions,
  onCaptions,
  autoFrame,
  onAutoFrame,
  gestureSwing,
  onGestureSwing,
  binds,
  onBinds,
  capturing,
  onCapture,
}: {
  quality: Quality;
  onQuality: (quality: Quality) => void;
  contrast: boolean;
  onContrast: (on: boolean) => void;
  reduceMotion: boolean;
  onReduceMotion: (on: boolean) => void;
  haptics: boolean;
  onHaptics: (on: boolean) => void;
  captions: boolean;
  onCaptions: (on: boolean) => void;
  autoFrame: boolean;
  onAutoFrame: (on: boolean) => void;
  gestureSwing: boolean;
  onGestureSwing: (on: boolean) => void;
  binds: KeyBinds;
  onBinds: React.Dispatch<React.SetStateAction<KeyBinds>>;
  capturing: ActionId | null;
  onCapture: (action: ActionId | null) => void;
}) {
  return (
    <div className="mt-3 border-t border-line pt-2">
      <p className="font-display text-xs tracking-widest text-muted">GRAPHICS QUALITY</p>
      <div className="mt-1 grid grid-cols-3 gap-2">
        <ModeButton active={quality === "auto"} onClick={() => onQuality("auto")} label="Auto" detail="Adapts" />
        <ModeButton active={quality === "high"} onClick={() => onQuality("high")} label="High" detail="Sharp" />
        <ModeButton active={quality === "low"} onClick={() => onQuality("low")} label="Low" detail="Fast" />
      </div>
      <p className="mt-3 font-display text-xs tracking-widest text-muted">ACCESSIBILITY</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <ModeButton active={contrast} onClick={() => onContrast(!contrast)} label="Ring" detail={contrast ? "High contrast" : "Amber"} />
        <ModeButton active={reduceMotion} onClick={() => onReduceMotion(!reduceMotion)} label="Motion" detail={reduceMotion ? "Reduced" : "Full"} />
        <ModeButton active={haptics} onClick={() => onHaptics(!haptics)} label="Haptics" detail={haptics ? "On" : "Off"} />
        <ModeButton active={captions} onClick={() => onCaptions(!captions)} label="Captions" detail={captions ? "Cue text" : "Off"} />
        <ModeButton active={autoFrame} onClick={() => onAutoFrame(!autoFrame)} label="Set frame" detail={autoFrame ? "Camera pulls out" : "Stay put"} />
        <ModeButton active={gestureSwing} onClick={() => onGestureSwing(!gestureSwing)} label="Drag swing" detail={gestureSwing ? "Drag the yard" : "Buttons only"} />
      </div>
      <p className="mt-3 font-display text-xs tracking-widest text-muted">KEYBOARD BINDINGS</p>
      <div className="mt-1 grid gap-1">
        {BIND_ACTIONS.map((action) => (
          <div key={action} className="flex items-center justify-between gap-2 border border-line bg-bg px-2 py-1">
            <span className="text-[11px] leading-tight text-muted">{bindLabel(action)}</span>
            <span className="flex items-center gap-1">
              {binds[action].map((code) => (
                <kbd key={code} className="border border-line px-1 font-display text-[10px] text-fg">
                  {keyLabel(code)}
                </kbd>
              ))}
              <button
                type="button"
                onClick={() => onCapture(action)}
                className="min-h-8 border border-primary px-1.5 font-display text-[10px] tracking-wide text-primary"
              >
                {capturing === action ? "PRESS…" : "BIND"}
              </button>
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onBinds({ ...DEFAULT_BINDS })}
        className="mt-1 min-h-8 w-full border border-line px-2 font-display text-[10px] tracking-wide text-muted"
      >
        RESET KEYS
      </button>
      <p className="mt-1 text-[10px] leading-snug text-steel">
        Space hooks or releases, Enter deploys, Escape pauses.
      </p>
    </div>
  );
}
