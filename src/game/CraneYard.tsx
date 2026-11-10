import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { CraneSim, type Mode, type Pace } from "@/game/sim";
import {
  idleActions,
  installInput,
  readActions,
  setQaKeys,
  setSteerOverride,
  setTouchAxes,
  setTouchHoist,
} from "@/game/input";
import { createYard, type CamView } from "@/game/world";

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
  const [cam, setCam] = useState<CamView>("chase");
  const [best, setBest] = useState(0);
  const [glError, setGlError] = useState("");

  const scoreRef = useRef<HTMLSpanElement>(null);
  const bestRef = useRef<HTMLSpanElement>(null);
  const coachRef = useRef<HTMLParagraphElement>(null);
  const swayNumRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const meterRef = useRef<HTMLSpanElement>(null);
  const deployRef = useRef<HTMLButtonElement>(null);
  const liftRef = useRef<HTMLButtonElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
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
      if (coachRef.current) coachRef.current.textContent = sim.message;
      if (swayNumRef.current) swayNumRef.current.textContent = `${sim.swayDeg.toFixed(0)}°`;
      if (speedRef.current) {
        speedRef.current.textContent =
          sim.state === "lifting"
            ? `${sim.hookSpeed.toFixed(1)} m/s`
            : sim.mode === "hard"
              ? `${sim.lateralG.toFixed(2)} g`
              : `${Math.abs(sim.speed).toFixed(1)} m/s`;
      }
      if (meterRef.current) meterRef.current.textContent = sim.state === "lifting" ? "HOOK" : sim.mode === "hard" ? "LAT G" : "SPEED";
      if (deployRef.current) deployRef.current.textContent = sim.outrigger > 0.5 && sim.deployDir >= 0 ? "STOW" : "DEPLOY";
      if (liftRef.current) liftRef.current.textContent = sim.flipped ? "RIGHT" : sim.state === "lifting" ? "DRIVE" : "LIFT";
      const dot = dotRef.current;
      if (dot) {
        const reach = 28;
        const mag = Math.hypot(sim.side, sim.along);
        const scale = mag > 2.2 ? 2.2 / mag : 1;
        dot.style.transform = `translate(${sim.side * scale * reach}px, ${-sim.along * scale * reach}px)`;
        dot.dataset.level = sim.swayDeg < 8 ? "ok" : sim.swayDeg < 15 ? "warn" : "hot";
      }
      const hot = sim.warn ? "hold-hot" : "";
      if (upRef.current) upRef.current.classList.toggle("hold-hot", hot === "hold-hot");
      if (downRef.current) downRef.current.classList.toggle("hold-hot", hot === "hold-hot");
      const banner = bannerRef.current;
      if (banner) {
        if (sim.phase === "broke") {
          banner.textContent = "Sling parted";
          banner.dataset.show = "break";
        } else if (sim.phase === "done") {
          banner.textContent = "Clean set";
          banner.dataset.show = "set";
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

  const cycleCam = () => {
    const order: CamView[] = ["chase", "cab", "hook", "high"];
    const next = order[(order.indexOf(cam) + 1) % order.length] ?? "chase";
    setCam(next);
    yardRef.current?.setView(next);
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
          <p className="font-display text-sm tracking-widest text-primary">YARD CRANE</p>
          <h1 className="font-display text-4xl leading-none text-fg">SLINGLINE</h1>
        </div>
        <div className="bg-surface px-3 py-2 text-right">
          <p className="font-display text-sm tracking-widest text-muted">SETS</p>
          <p className="font-display text-4xl leading-none text-fg">
            <span ref={scoreRef}>0</span>
            <span className="text-muted"> / </span>
            <span ref={bestRef}>{best}</span>
          </p>
        </div>
      </header>

      <div
        ref={bannerRef}
        data-show=""
        className="banner pointer-events-none absolute inset-x-0 top-16 px-4 text-center font-display text-2xl tracking-wide"
      />

      {playing ? (
        <div className="pointer-events-none absolute inset-x-0 top-24 flex flex-col items-center gap-2 px-3">
          <p ref={coachRef} className="max-w-sm bg-surface px-3 py-2 text-center text-base text-fg">
            Lower the hook onto the crate.
          </p>
          <div className="sway-well">
            <span ref={dotRef} className="sway-dot" />
          </div>
          <p className="bg-surface px-3 py-1 font-display text-base tracking-wide text-fg">
            SWAY <span ref={swayNumRef} className="text-fg">0°</span>
            <span className="px-2 text-line">|</span>
            <span ref={meterRef}>SPEED</span> <span ref={speedRef} className="text-fg">0.0</span>
          </p>
          <button
            type="button"
            onClick={cycleCam}
            className="pointer-events-auto bg-surface px-3 py-1 font-display text-base tracking-wide text-fg"
          >
            CAM {cam === "chase" ? "CHASE" : cam === "cab" ? "CAB" : cam === "hook" ? "HOOK" : "HIGH"}
          </button>
        </div>
      ) : null}

      {!playing ? (
        <div className="absolute inset-0 flex items-end justify-center overflow-y-auto p-4 pb-24 sm:items-center">
          <section className="w-full max-w-md border border-line border-t-4 border-t-primary bg-surface p-5">
            <p className="font-display text-sm tracking-widest text-primary">YARD CRANE</p>
            <h2 className="mt-1 font-display text-5xl leading-none">Hook. Carry. Set.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Slew the jib, run the trolley, and pay out cable. Drive to the crate first. Stop, deploy the pads, then lift.
              Set it inside the amber ring. Hard mode can roll the truck in a fast corner.
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
              <ModeButton active={pace === "slow"} onClick={() => setPace("slow")} label="Slow" detail="Careful" />
              <ModeButton active={pace === "steady"} onClick={() => setPace("steady")} label="Steady" detail="Yard pace" />
              <ModeButton active={pace === "fast"} onClick={() => setPace("fast")} label="Fast" detail="Full travel" />
            </div>
            <p className="mt-3 hidden text-xs text-steel sm:block">
              A D slew · W S trolley · Q up · E down · H flips mode
            </p>
            <p className="mt-3 text-xs text-muted">Drag the open yard to look around. CAM steps through chase, cab, hook, and high.</p>
            <button
              type="button"
              className="mt-4 h-12 w-full bg-primary font-display text-xl tracking-wide text-bg"
              onClick={() => {
                playingRef.current = true;
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
              ref={deployRef}
              type="button"
              onClick={() => simRef.current?.requestDeploy()}
              className="h-11 min-w-20 border border-line bg-surface px-3 font-display text-lg tracking-wide text-fg"
            >
              DEPLOY
            </button>
            <button
              ref={liftRef}
              type="button"
              onClick={() => simRef.current?.requestLift()}
              className="h-11 min-w-20 border border-primary bg-surface px-3 font-display text-lg tracking-wide text-fg"
            >
              LIFT
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

function syncHoist() {
  setTouchHoist((held.up ? 1 : 0) + (held.down ? -1 : 0));
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
