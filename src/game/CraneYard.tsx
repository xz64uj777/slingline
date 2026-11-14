import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import { CraneSim, CRANE_CHOICES, type CraneId, type Mode, type Pace } from "@/game/sim";
import {
  ECONOMY,
  RENTAL_LEVELS,
  activeOffer,
  canFound,
  careerSummary,
  freshCareer,
  jobBoard,
  levelOf,
  money,
  type CareerState,
  type JobId,
  type JobOffer,
} from "@/game/career";
import { SITE_THEME_LABEL } from "@/game/levels";
import { loadSpec } from "@/game/loads";
import {
  idleActions,
  installInput,
  readActions,
  setQaKeys,
  setSteerOverride,
  setTouchAxes,
  setTouchExtend,
  setTouchHoist,
  setTouchSensitivity,
} from "@/game/input";
import { createYard, type CamView } from "@/game/world";
import { limitAlarm } from "@/game/alarm";
import { rigAudio, setAudioVolume, unlockAudio } from "@/game/rig-audio";
import {
  readSettingsStore,
  sensitivityScale,
  writeSettingsStore,
  type Scheme,
  type Sensitivity,
} from "@/game/settings";

const STEP = 1 / 60;

const VOLUME_STEPS = [
  { label: "Off", detail: "Muted", value: 0 },
  { label: "Low", detail: "Quiet", value: 0.4 },
  { label: "Full", detail: "Loud", value: 1 },
] as const;

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
  const [workLights, setWorkLights] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [crane, setCrane] = useState<CraneId>("rental");
  const [cam, setCam] = useState<CamView>("chase");
  const [best, setBest] = useState(0);
  const [glError, setGlError] = useState("");
  const [books, setBooks] = useState<CareerState>(() => freshCareer());
  const [practiceId, setPracticeId] = useState<CraneId | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [beat, setBeat] = useState<string | null>(null);
  const summary = careerSummary(books);
  const currentOffer = activeOffer(books);
  const currentCargo = loadSpec(currentOffer.kind).label;
  const careerSnapshotRef = useRef<CareerState | null>(null);

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
  const swayNumRef = useRef<HTMLSpanElement>(null);
  const limitRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const meterRef = useRef<HTMLSpanElement>(null);
  const deployRef = useRef<HTMLButtonElement>(null);
  const deployLabelRef = useRef<HTMLSpanElement>(null);
  const hookLabelRef = useRef<HTMLSpanElement>(null);
  const hookBtnRef = useRef<HTMLButtonElement>(null);
  const gapRef = useRef<HTMLParagraphElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const swayWrapRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
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
  const debriefRef = useRef<HTMLDivElement>(null);
  const debriefGradeRef = useRef<HTMLSpanElement>(null);
  const debriefRingRef = useRef<HTMLSpanElement>(null);
  const debriefImpactRef = useRef<HTMLSpanElement>(null);
  const debriefSwayRef = useRef<HTMLSpanElement>(null);
  const debriefChartRef = useRef<HTMLSpanElement>(null);
  const debriefPayRef = useRef<HTMLSpanElement>(null);
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
    writeSettingsStore({ mode, pace, scheme, sensitivity, volume, night: nightAny });
  }, [mode, pace, scheme, sensitivity, volume, nightAny]);

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
      };
    }

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
          bookRef.current.textContent = `${mark}${note}${down}`;
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
        coachRef.current.style.display = text === sim.contractLabel() ? "none" : "block";
      }
      if (swayNumRef.current) swayNumRef.current.textContent = `${sim.swayDeg.toFixed(0)}°`;
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
        hookBtnRef.current.dataset.ready = ready ? "true" : "false";
        hookBtnRef.current.dataset.on = sim.attached ? "true" : "false";
        if (hookLabelRef.current) hookLabelRef.current.textContent = sim.attached ? "RELEASE" : "HOOK";
      }
      if (gapRef.current) {
        const show = !sim.attached && sim.hookGap < 12;
        gapRef.current.style.display = show ? "block" : "none";
        if (show) gapRef.current.textContent = `${sim.hookLabel} · ${sim.hookGap.toFixed(1)} m to hook`;
      }
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
            : "SETUP · Stop in the work area, then deploy the pads.";
        } else if (sim.attached && sim.landed) {
          objective = "SET · Load is resting in the zone. Press RELEASE LOAD to finish.";
        } else if (sim.attached) {
          objective = `DELIVER · Carry the ${liveCargo} into the amber ring; slow down and let it settle.`;
        } else if (sim.hookReady) {
          objective = `PICKUP READY · Press HOOK to attach the ${liveCargo}.`;
        } else if (sim.hookGap < 12) {
          objective = `PICKUP · Align the hook with the ${liveCargo}, then connect.`;
        } else {
          objective = `PICKUP · Find the marked ${liveCargo}; use the HOOK camera if needed.`;
        }
        objectiveRef.current.textContent = objective;
      }
      if (alignmentRef.current) {
        const alignment = sim.hookAlignment();
        const show =
          sim.state === "lifting" &&
          !sim.attached &&
          sim.hookGap < 12 &&
          alignment != null;
        alignmentRef.current.style.display = show ? "block" : "none";
        if (show && alignment) {
          const corrections: string[] = [];
          if (Math.abs(alignment.slew) > 0.3) {
            corrections.push(
              `${alignment.slew > 0 ? "SLEW LEFT" : "SLEW RIGHT"} ${Math.abs(alignment.slew).toFixed(1)} m`,
            );
          }
          if (Math.abs(alignment.reach) > 0.3) {
            corrections.push(
              `${alignment.reach > 0 ? "REACH OUT" : "REACH IN"} ${Math.abs(alignment.reach).toFixed(1)} m`,
            );
          }
          if (Math.abs(alignment.hoist) > 0.18) {
            corrections.push(
              `${alignment.hoist > 0 ? "HOIST UP" : "HOIST DOWN"} ${Math.abs(alignment.hoist).toFixed(1)} m`,
            );
          }
          alignmentRef.current.textContent = alignment.ready
            ? `${alignment.target} CENTERED · HOOK READY`
            : `${alignment.target} ALIGN · ${corrections.join(" · ") || "Center the hook"}`;
          alignmentRef.current.dataset.ready = alignment.ready
            ? "true"
            : "false";
          alignmentRef.current.style.color = alignment.ready ? "#8fc17a" : "";
        }
      }
      const debrief = debriefRef.current;
      if (debrief) {
        const report = sim.lastSet;
        const show = sim.debriefLeft > 0 && report != null;
        debrief.style.display = show ? "block" : "none";
        if (show && report) {
          const tint =
            report.grade === "S" ? "#e3a23a" : report.grade === "A" ? "#8fc17a" : report.grade === "B" ? "#cfd6dd" : "#e05252";
          if (debriefGradeRef.current) {
            debriefGradeRef.current.textContent = report.grade;
            debriefGradeRef.current.style.color = tint;
          }
          if (debriefRingRef.current) {
            debriefRingRef.current.textContent = `${report.off.toFixed(1)} / ${report.tolerance.toFixed(1)} m`;
          }
          if (debriefImpactRef.current) debriefImpactRef.current.textContent = `${report.impact.toFixed(1)} m/s`;
          if (debriefSwayRef.current) debriefSwayRef.current.textContent = `${report.sway.toFixed(1)}°`;
          if (debriefChartRef.current) debriefChartRef.current.textContent = `${Math.round(report.chart * 100)}%`;
          if (debriefPayRef.current) {
            const repLabel = sim.career.status === "hired" ? "STANDING" : "REP";
            debriefPayRef.current.textContent =
              report.pay > 0
                ? `${money(report.pay)}${report.rep > 0 ? ` · +${report.rep} ${repLabel}` : ""}`
                : "Practice — no pay";
          }
        }
        if (chartPanelRef.current) chartPanelRef.current.style.display = show ? "none" : "block";
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
      const hot = sim.warn ? "hold-hot" : "";
      if (upRef.current) upRef.current.classList.toggle("hold-hot", hot === "hold-hot");
      if (downRef.current) downRef.current.classList.toggle("hold-hot", hot === "hold-hot");
      const lampBtn = lightsBtnRef.current;
      if (lampBtn) {
        const dark = nightRef.current || sim.career.job === "night";
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
      paintHud();
    });

    return () => {
      yard.renderer.setAnimationLoop(null);
      yard.dispose();
      yardRef.current = null;
      removeInput();
      if (import.meta.env.DEV) delete window.__controlsTest;
    };
  }, []);

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
    setTrainingOpen(true);
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
    camPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (camPointers.current.size === 2) {
      const points = [...camPointers.current.values()];
      pinchDistance.current = Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y);
    }
  };

  const onCamMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    camPointers.current.delete(e.pointerId);
    if (camPointers.current.size < 2) pinchDistance.current = null;
  };

  return (
    <main
      className="yard relative h-dvh w-full overflow-hidden bg-bg text-fg"
      onContextMenu={(e) => e.preventDefault()}
    >
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
        <div className="bg-surface px-3 py-2">
          <p ref={companyRef} className="font-display text-sm tracking-widest text-primary">
            TEMP HIRE
          </p>
          <h1 className="font-display text-3xl leading-none text-fg sm:text-4xl">SLINGLINE</h1>
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
          <p className="font-display text-4xl leading-none text-fg">
            <span ref={scoreRef}>0</span>
            <span className="text-muted"> / </span>
            <span ref={bestRef}>{best}</span>
          </p>
          <p className="mt-1 font-display text-sm tracking-widest text-muted">
            CASH <span ref={cashRef} className="text-fg">NOW RENTAL  $0</span>
          </p>
          <p ref={bookRef} className="font-display text-xs tracking-widest text-steel">
            STANDING 70
          </p>
          <button
            ref={buyRef}
            type="button"
            onClick={() => {
              simRef.current?.buyNext();
              refreshBooks();
            }}
            className="pointer-events-auto mt-1 min-h-11 w-full border border-primary bg-bg px-2 py-1 font-display text-xs leading-tight tracking-wide text-fg"
          >
            HARGROVE'S CRANE
          </button>
          {playing ? (
            <div className="mt-2 border-t border-line pt-2 font-display text-sm tracking-wide text-fg">
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
                "Lower with DOWN or E/F. Use the HOOK view and live alignment cue. HOOK only connects when centered: within 0.3 m horizontally and 0.25 m vertically.",
                "Use UP or Q/R gently to lift clear. Watch the load-limit percentage and sway meter. Easy mode keeps its 44° safety interlock; raise the boom to clear it. The angle stop is separate from the load-chart limit.",
                "Move the load with small joystick inputs. Let it settle before changing direction. Slow pace gives you finer control; avoid dragging a swinging load across the site.",
                "Lower with DOWN until the load is resting in the marked set zone, then press RELEASE LOAD. A clean, controlled placement completes the job.",
              ][trainingStep]}
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setTrainingOpen(false)} className="min-h-11 flex-1 border border-line bg-bg px-3 font-display text-sm tracking-wide text-fg">CLOSE GUIDE</button>
              {trainingStep > 0 ? <button type="button" onClick={() => setTrainingStep((step) => Math.max(0, step - 1))} className="min-h-11 border border-line bg-bg px-3 font-display text-sm text-fg">BACK</button> : null}
              <button type="button" onClick={() => { if (trainingStep === 5) setTrainingOpen(false); else setTrainingStep((step) => Math.min(5, step + 1)); }} className="min-h-11 flex-1 bg-primary px-3 font-display text-sm tracking-wide text-bg">{trainingStep === 5 ? "START LIFTING" : "NEXT"}</button>
            </div>
          </section>
        </div>
      ) : null}

      {playing ? (
        <div className="pointer-events-none absolute left-3 top-36 flex max-w-[11.5rem] flex-col items-start gap-2 sm:max-w-xs">
          <p ref={callRef} className="bg-surface px-3 py-2 font-display text-base leading-tight tracking-wide text-primary">
            YARD MOVE: CRATE · WAGE $315 OF $900
          </p>
          <p ref={coachRef} className="bg-surface px-3 py-2 text-left text-base text-fg">
            Find the marked load. Lower the hook until it is over the crate, attach it, then carry it to the amber set ring.
          </p>
          <p
            ref={objectiveRef}
            className="border-l-2 border-primary bg-surface px-3 py-2 text-left font-display text-sm tracking-wide text-fg"
          >
            SETUP · Stop in the work area, then deploy the pads.
          </p>
          <p
            ref={alignmentRef}
            data-ready="false"
            style={{ display: "none" }}
            className="border-l-2 border-line bg-surface px-3 py-2 text-left font-display text-sm tracking-wide text-fg"
          >
            ALIGN · SLEW · REACH · HOIST
          </p>
          <details className="pointer-events-auto w-full max-w-[13rem] bg-surface px-3 py-2">
            <summary className="cursor-pointer font-display text-sm tracking-wide text-primary">SHOW JOB MAP</summary>
            <div className="mt-2 rounded border border-line bg-bg p-2 text-center text-xs">
              <p className="font-display tracking-widest text-muted">
                LIFT ROUTE · {currentOffer.title} · LV {String(currentOffer.no).padStart(2, "0")}
              </p>
              <div className="my-2 flex items-center justify-between gap-1">
                <span className="rounded border border-primary px-2 py-2 font-display">
                  {currentCargo}
                </span>
                <span className="text-primary">→</span>
                <span className="rounded border border-primary px-2 py-2 font-display">
                  {SITE_THEME_LABEL[currentOffer.theme]} SET
                </span>
              </div>
              <p className="text-muted">
                {currentOffer.brief} Set within {currentOffer.ring.toFixed(1)} m of the ring center.
              </p>
            </div>
          </details>
          <p
            ref={gapRef}
            style={{ display: "none" }}
            className="bg-surface px-3 py-2 text-left font-display text-lg tracking-wide text-fg"
          >
            0.0 m
          </p>
          <div className="pointer-events-auto flex flex-wrap gap-1">
            <button
              ref={soloRef}
              type="button"
              onClick={fileCompany}
              style={{ display: "none" }}
              className="h-11 bg-primary px-3 font-display text-base tracking-wide text-bg"
            >
              FILE SLINGLINE
            </button>
            <details className="pointer-events-auto relative">
              <summary className="cursor-pointer bg-surface px-2 py-1 font-display text-base tracking-wide text-fg">
                VIEW · {cam === "operator" ? "SEAT" : cam.toUpperCase()}
              </summary>
              <div className="absolute left-0 top-full z-20 mt-1 grid grid-cols-2 gap-1 border border-line bg-surface p-1">
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
          </div>
        </div>
      ) : null}

      {playing ? (
        <div className="pointer-events-auto absolute right-3 top-64 z-20 flex flex-col items-end gap-2">
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
            aria-label="Open game settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
            className="flex size-12 items-center justify-center rounded-full border border-primary bg-surface text-2xl text-fg shadow-lg"
          >
            ⚙
          </button>
          {settingsOpen ? (
            <section className="max-h-[62dvh] w-[min(17rem,calc(100vw-1.5rem))] overflow-y-auto border border-primary bg-surface p-2 text-xs shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base tracking-wide">GAME OPTIONS</h2>
                <button type="button" onClick={() => setSettingsOpen(false)} className="min-h-10 border border-line px-3 font-display text-sm">CLOSE</button>
              </div>
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

      {playing ? (
        <div
          ref={debriefRef}
          style={{ display: "none" }}
          className="pointer-events-none absolute bottom-24 left-1/2 w-56 -translate-x-1/2 border border-line bg-surface px-3 py-2 font-display tracking-wide text-fg"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs tracking-widest text-muted">SET DEBRIEF</span>
            <span ref={debriefGradeRef} className="text-3xl leading-none">
              B
            </span>
          </div>
          <p className="mt-1 flex justify-between gap-2 text-xs">
            <span className="text-muted">RING</span>
            <span ref={debriefRingRef}>0.0 / 0.0 m</span>
          </p>
          <p className="flex justify-between gap-2 text-xs">
            <span className="text-muted">IMPACT</span>
            <span ref={debriefImpactRef}>0.0 m/s</span>
          </p>
          <p className="flex justify-between gap-2 text-xs">
            <span className="text-muted">SWAY</span>
            <span ref={debriefSwayRef}>0.0°</span>
          </p>
          <p className="flex justify-between gap-2 text-xs">
            <span className="text-muted">CHART</span>
            <span ref={debriefChartRef}>0%</span>
          </p>
          <p className="mt-1 border-t border-line pt-1 text-right text-sm">
            <span ref={debriefPayRef}>—</span>
          </p>
        </div>
      ) : null}

      {!playing ? (
        <div className="absolute inset-0 overflow-y-auto p-3 pb-8 sm:p-6">
          <section className="mx-auto w-full max-w-md border border-line border-t-4 border-t-primary bg-surface p-4 sm:max-w-3xl sm:p-5">
            <p className="font-display text-sm tracking-widest text-primary">SLINGLINE CAREER</p>
            <h2 className="mt-1 font-display text-4xl leading-none sm:text-5xl">Ready for work?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              You start on Hargrove&apos;s rental: four paid shifts, one new load at a time. File Slingline, then buy your own crane and take the
              contracts that pay.
            </p>
            <button type="button" className="mt-4 h-14 w-full bg-primary font-display text-2xl tracking-wide text-bg" onClick={startCareer}>
              {summary.hired ? "START CAREER" : "CONTINUE CAREER"}
            </button>
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
                        {String(lv.no).padStart(2, "0")} · {lv.title}
                      </span>
                      <span className="font-display text-[10px] tracking-widest">{done ? "DONE" : next ? "NEXT" : "—"}</span>
                    </li>
                  );
                })}
              </ol>
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
                        simRef.current?.acceptJob(id);
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
              </>
            ) : null}
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
          <div className="machine-plate pointer-events-auto flex items-center gap-3 px-3 py-2 max-sm:absolute max-sm:bottom-44 max-sm:left-1/2 max-sm:-translate-x-1/2">
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
      {boardOpen ? (
        <JobSheet
          offers={jobBoard(simRef.current?.career ?? books)}
          hired={(simRef.current?.career.status ?? books.status) === "hired"}
          onPick={(id) => {
            simRef.current?.acceptJob(id);
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
        LV {String(offer.no).padStart(2, "0")} · {SITE_THEME_LABEL[offer.theme]} · {loadSpec(offer.kind).label}
      </span>
      <span className="block font-display text-xl leading-none text-fg">{offer.title}</span>
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
