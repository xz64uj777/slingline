import { audioContext, audioOutput } from "@/game/rig-audio";

let last = 0;

export function limitAlarm(level: "ok" | "near" | "over", now: number) {
  if (level === "ok") return;
  const gap = level === "over" ? 280 : 700;
  if (now - last < gap) return;
  last = now;
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const tone = ctx.createOscillator();
  const gain = ctx.createGain();
  tone.type = "square";
  tone.frequency.value = level === "over" ? 720 : 440;
  gain.gain.setValueAtTime(0.05, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  tone.connect(gain);
  gain.connect(audioOutput() ?? ctx.destination);
  tone.start();
  tone.stop(ctx.currentTime + 0.12);
}
