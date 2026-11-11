import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { CraneSim, CRANE_CHOICES, type CraneId, type Mode, type Pace } from "@/game/sim";
import {
  idleActions,
  installInput,
  readActions,
  setQaKeys,
  setSteerOverride,
  setTouchAxes,
  setTouchExtend,
  setTouchHoist,
} from "@/game/input";
import { createYard, type CamView } from "@/game/world";
import { limitAlarm } from "@/game/alarm";
import { rigAudio, unlockAudio } from "@/game/rig-audio";

const STEP = 1 / 60;

type Scheme = "stick" | "arrows";

export function CraneYard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(false);
  const modeRef = useRef<Mode>("easy");
  const paceRef = useRef<Pace>("steady");
  const simRef = useRef<CraneSim | null>(null);
  const yardRef = useRef<ReturnType<typeof createYard> | null>(null);
  const camDrag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<Mode>("easy");
  const [pace, setPace] = useState<Pace>("steady");
  const [scheme, setScheme] = useState<Scheme>("stick");
  const [crane, setCrane] = useState<CraneId>("rental");
  const [cam, setCam] = useState<CamView>("chase");
  const [best, setBest] = useState(0);
  const [glError, setGlError] = useState("");

  const scoreRef = useRef<HTMLSpanElement>(null);
  const bestRef = useRef<HTMLSpanElement>(null);
  const cashRef = useRef<HTMLSpanElement>(null);
  const companyRef = useRef<HTMLParagraphElement>(null);
  const buyRef = useRef<HTMLButtonElement>(null);
  const coachRef = useRef<HTMLParagraphElement>(null);
  const callRef = useRef<HTMLParagraphElement>(null);
  const swayNumRef = useRef<HTMLSpanElement>(null);
  const limitRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const meterRef = useRef<HTMLSpanElement>(null);
  const deployRef = useRef<HTMLButtonElement>(null);
  const safetyRef = useRef<HTMLButtonElement>(null);
  const hookBtnRef = useRef<HTMLButtonElement>(null);
  const gapRef = useRef<HTMLParagraphElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const swayWrapRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    modeRef.current = mode;
    if (simRef.current) simRef.current.mode = mode;
  }, [mode]);

  useEffect(() => {
    paceRef.current = pace;
    if (simRef.current) simRef.current.pace = pace;
  }, [pace]);

  const shownBest = useRef(0);

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

    let yard: ReturnType<typeof createYard>;
    try {
      yard = createYard(canvas);
      yardRef.current = yard;
    } catch (err) {
      setGlError(err instanceof Error ? err.message : "The yard couldn't start.");
      return;
    }

    const removeInput = installInput();
    let last = performance.now();
    let acc = 0;
    let prevMode = false;

    window.__controlsTest = {
      getYaw: () => sim.yaw,
      getSpeed: () => sim.trolleySpeed,
      setKeys: (codes) => setQaKeys(codes),
      setSteer: (v) => setSteerOverride(v),
    };

    const paintHud = () => {
      if (scoreRef.current) scoreRef.current.textContent = String(sim.score);
      if (bestRef.current) bestRef.current.textContent = String(sim.best);
      if (cashRef.current) cashRef.current.textContent = `${sim.craneLabel()}  $${sim.cash}`;
      if (companyRef.current) companyRef.current.textContent = sim.companyName().toUpperCase();
      if (buyRef.current) buyRef.current.textContent = sim.buyLabel();
      if (callRef.current) callRef.current.textContent = sim.contractLabel();
      if (coachRef.current) {
        coachRef.current.textContent = sim.message;
        coachRef.current.style.display = sim.message === sim.contractLabel() ? "none" : "block";
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
      if (deployRef.current) {
        deployRef.current.textContent = sim.flipped
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
      }
      if (safetyRef.current) safetyRef.current.style.display = sim.safetyLock ? "block" : "none";
      if (hookBtnRef.current) hookBtnRef.current.style.display = sim.hookReady && !sim.attached ? "block" : "none";
      if (gapRef.current) {
        const show = !sim.attached && sim.hookGap < 12;
        gapRef.current.style.display = show ? "block" : "none";
        if (show) gapRef.current.textContent = `${sim.hookLabel}  ${sim.hookGap.toFixed(1)} m`;
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
      const banner = bannerRef.current;
      if (banner) {
        if (sim.phase === "broke") {
          banner.textContent = sim.flipped ? "Crane over" : "Wire snapped";
          banner.dataset.show = "break";
        } else if (sim.phase === "done") {
          banner.textContent = sim.message.startsWith("Call done") ? "Call done" : "Clean set";
          banner.dataset.show = "set";
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
      delete window.__controlsTest;
    };
  }, []);

  const pickScheme = (next: Scheme) => {
    releaseArrows();
    setTouchAxes(0, 0);
    setScheme(next);
  };

  const pickCrane = (id: CraneId) => {
    setCrane(id);
    simRef.current?.selectCrane(id);
  };

  const cycleCrane = () => {
    const ids = CRANE_CHOICES.map((choice) => choice.id);
    const index = ids.indexOf(simRef.current?.crane ?? crane);
    pickCrane(ids[(index + 1) % ids.length] ?? "rental");
  };

  const onCamDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    camDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCamMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = camDrag.current;
    if (!drag || drag.id !== e.pointerId) return;
    yardRef.current?.nudge(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX;
    drag.y = e.clientY;
  };

  const onCamEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (camDrag.current?.id !== e.pointerId) return;
    camDrag.current = null;
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
          <h1 className="font-display text-4xl leading-none text-fg">SLINGLINE</h1>
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
          <button
            ref={buyRef}
            type="button"
            onClick={() => simRef.current?.buyNext()}
            className="pointer-events-auto mt-1 h-9 w-full border border-primary bg-bg px-2 font-display text-sm tracking-wide text-fg"
          >
            BUY YARD $250
          </button>
          {playing ? (
            <div className="mt-2 border-t border-line pt-2 font-display text-sm tracking-wide text-fg">
              <p>
                SWAY <span ref={swayNumRef}>0°</span>
              </p>
              <p>
                LIMIT <span ref={limitRef} data-level="ok" className="limit-read">0%</span>
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

      {playing ? (
        <div className="pointer-events-none absolute left-3 top-28 flex max-w-[16rem] flex-col items-start gap-2">
          <p ref={callRef} className="bg-surface px-3 py-2 font-display text-lg tracking-wide text-primary">
            YARD MOVE
          </p>
          <p ref={coachRef} className="bg-surface px-3 py-2 text-left text-base text-fg">
            Lower the hook onto the crate.
          </p>
          <p
            ref={gapRef}
            style={{ display: "none" }}
            className="bg-surface px-3 py-2 text-left font-display text-lg tracking-wide text-fg"
          >
            0.0 m
          </p>
          <div className="pointer-events-auto flex flex-wrap gap-1">
            {(["chase", "wide", "truck", "cab", "hook", "high"] as CamView[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setCam(id);
                  yardRef.current?.setView(id);
                }}
                className={`px-2 py-1 font-display text-base tracking-wide ${cam === id ? "bg-primary text-bg" : "bg-surface text-fg"}`}
              >
                {id === "chase"
                  ? "CHASE"
                  : id === "wide"
                    ? "WIDE"
                    : id === "truck"
                      ? "TRUCK"
                      : id === "cab"
                        ? "CAB"
                        : id === "hook"
                          ? "HOOK"
                          : "HIGH"}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <button
        ref={hookBtnRef}
        type="button"
        onClick={() => simRef.current?.requestHook()}
        style={{ display: "none" }}
        className="pointer-events-auto absolute left-1/2 top-1/2 z-10 h-16 min-w-28 -translate-x-1/2 -translate-y-1/2 border border-primary bg-surface px-4 font-display text-2xl tracking-wide text-fg"
      >
        HOOK
      </button>
      {!playing ? (
        <div className="absolute inset-0 flex items-end justify-center overflow-y-auto p-4 pb-24 sm:items-center">
          <section className="w-full max-w-md border border-line border-t-4 border-t-primary bg-surface p-5">
            <p className="font-display text-sm tracking-widest text-primary">YARD CRANE</p>
            <h2 className="mt-1 font-display text-5xl leading-none">Hook. Carry. Set.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Drive to the crate, stop, and deploy the pads. Then pitch the boom, telescope with Out and In, and run the hook.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <ModeButton active={mode === "easy"} onClick={() => setMode("easy")} label="Easy" detail="Swing dies on its own" />
              <ModeButton active={mode === "hard"} onClick={() => setMode("hard")} label="Hard" detail="Raw swing and wind" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ModeButton active={scheme === "stick"} onClick={() => pickScheme("stick")} label="Stick" detail="Thumb, eased" />
              <ModeButton active={scheme === "arrows"} onClick={() => pickScheme("arrows")} label="Arrows" detail="Hold a direction" />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {CRANE_CHOICES.map((choice) => (
                <ModeButton
                  key={choice.id}
                  active={crane === choice.id}
                  onClick={() => pickCrane(choice.id)}
                  label={choice.label}
                  detail="Test this crane"
                />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <ModeButton active={pace === "slow"} onClick={() => setPace("slow")} label="Slow" detail="Careful" />
              <ModeButton active={pace === "steady"} onClick={() => setPace("steady")} label="Steady" detail="Yard pace" />
              <ModeButton active={pace === "fast"} onClick={() => setPace("fast")} label="Fast" detail="Full travel" />
            </div>
            <p className="mt-3 hidden text-xs text-steel sm:block">
              A D slew · W S trolley · Q up · E down · H flips mode
            </p>
            <p className="mt-3 text-xs text-muted">Drag the yard to look around. CAM includes a wide view of the whole crane.</p>
            <button
              type="button"
              className="mt-4 h-12 w-full bg-primary font-display text-xl tracking-wide text-bg"
              onClick={() => {
                playingRef.current = true;
                unlockAudio();
                setPlaying(true);
              }}
            >
              Start
            </button>
          </section>
        </div>
      ) : (
        <div className="hud-safe pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between">
          {scheme === "stick" ? <Stick /> : <ArrowPad />}
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={cycleCrane}
              className="h-11 min-w-20 border border-primary bg-surface px-3 font-display text-lg tracking-wide text-fg"
            >
              {crane.toUpperCase()}
            </button>
            <button
              ref={safetyRef}
              type="button"
              onClick={() => simRef.current?.requestSafety()}
              style={{ display: "none" }}
              className="h-11 min-w-20 border border-primary bg-surface px-3 font-display text-lg tracking-wide text-fg"
            >
              SAFETY
            </button>
            <button
              ref={deployRef}
              type="button"
              onClick={() => {
                const sim = simRef.current;
                if (!sim) return;
                if (sim.flipped) sim.recover();
                else sim.requestDeploy();
              }}
              className="h-11 min-w-20 border border-line bg-surface px-3 font-display text-lg tracking-wide text-fg"
            >
              DEPLOY
            </button>
            <button
              type="button"
              onClick={() => pickScheme(scheme === "stick" ? "arrows" : "stick")}
              className="h-11 min-w-20 border border-line bg-surface px-3 font-display text-lg tracking-wide text-fg"
            >
              {scheme === "stick" ? "STICK" : "ARROWS"}
            </button>
            <button
              type="button"
              onClick={() => setPace(pace === "slow" ? "steady" : pace === "steady" ? "fast" : "slow")}
              className="h-11 min-w-20 border border-line bg-surface px-3 font-display text-lg tracking-wide text-fg"
            >
              {pace === "slow" ? "SLOW" : pace === "steady" ? "STEADY" : "FAST"}
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "easy" ? "hard" : "easy")}
              className="h-11 min-w-20 border border-line bg-surface px-3 font-display text-lg tracking-wide text-fg"
            >
              {mode === "easy" ? "EASY" : "HARD"}
            </button>
            <div className="flex gap-2">
              <ExtendHold label="Out" dir={1} />
              <ExtendHold label="In" dir={-1} />
            </div>
            <div className="flex gap-2">
              <Hold
                buttonRef={upRef}
                label="Up"
                icon={<ArrowUp className="size-5" aria-hidden />}
                dir={1}
              />
              <Hold
                buttonRef={downRef}
                label="Down"
                icon={<ArrowDown className="size-5" aria-hidden />}
                dir={-1}
              />
            </div>
          </div>
        </div>
      )}
    </main>
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

const held = { up: false, down: false };
const telescope = { out: false, inn: false };

function syncHoist() {
  setTouchHoist((held.up ? 1 : 0) + (held.down ? -1 : 0));
}

function syncExtend() {
  setTouchExtend((telescope.out ? 1 : 0) + (telescope.inn ? -1 : 0));
}

function ExtendHold({ label, dir }: { label: string; dir: 1 | -1 }) {
  const key = dir === 1 ? "out" : "inn";
  return (
    <button
      type="button"
      className="flex h-11 w-16 touch-none items-center justify-center border border-line bg-surface font-display text-base text-fg"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        telescope[key] = true;
        syncExtend();
      }}
      onPointerUp={(e) => {
        telescope[key] = false;
        syncExtend();
      }}
      onPointerCancel={() => {
        telescope[key] = false;
        syncExtend();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
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
      className="flex h-16 w-24 touch-none flex-col items-center justify-center gap-0.5 border border-line bg-surface font-display text-lg text-fg"
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
      {label}
    </button>
  );
}
