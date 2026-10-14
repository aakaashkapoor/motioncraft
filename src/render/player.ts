// Player mode for an exported page (scripts/page.ts): the frame scaled to fit
// the window, driven by a host page with `postMessage`. Only `mountPage` with
// `player: true` starts it; a render never does.
//
// Protocol (host -> page): { type: "motioncraft:seek", ms }, { type:
// "motioncraft:play", loop?, fromMs? }, { type: "motioncraft:pause" }.
// Page -> host, once fonts are loaded and frame 0 is drawn: { type:
// "motioncraft:ready", fps, totalFrames, durationMs, width, height }.

import type { Size } from "../layout/frame";

export type HostMessage =
  | { type: "motioncraft:seek"; ms: number }
  | { type: "motioncraft:play"; loop: boolean; fromMs?: number }
  | { type: "motioncraft:pause" };

export interface ReadyMessage {
  type: "motioncraft:ready";
  fps: number;
  totalFrames: number;
  durationMs: number;
  width: number;
  height: number;
}

export interface Playback {
  fps: number;
  totalFrames: number;
}

/** The scale and offset (px) that fit `frame` inside `view`, centered. Pure. */
export function fitFrame(frame: Size, view: Size): { scale: number; x: number; y: number } {
  const scale = Math.max(1e-3, Math.min(view.width / frame.width, view.height / frame.height));
  return { scale, x: (view.width - frame.width * scale) / 2, y: (view.height - frame.height * scale) / 2 };
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** A host message, or undefined for anything that is not a plain object with a known `type` and valid fields. Pure. */
export function parseHostMessage(data: unknown): HostMessage | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const proto = Object.getPrototypeOf(data) as unknown;
  if (proto !== Object.prototype && proto !== null) return undefined;
  const message = data as Record<string, unknown>;
  switch (message.type) {
    case "motioncraft:seek":
      return isFiniteNumber(message.ms) ? { type: "motioncraft:seek", ms: message.ms } : undefined;
    case "motioncraft:play": {
      const { loop, fromMs } = message;
      if (loop !== undefined && typeof loop !== "boolean") return undefined;
      if (fromMs !== undefined && !isFiniteNumber(fromMs)) return undefined;
      return { type: "motioncraft:play", loop: loop === true, ...(fromMs === undefined ? {} : { fromMs }) };
    }
    case "motioncraft:pause":
      return { type: "motioncraft:pause" };
    default:
      return undefined;
  }
}

/** The frame on screen `ms` into the timeline, clamped to its frames. Pure. */
export function frameAtMs(ms: number, fps: number, totalFrames: number): number {
  return Math.max(0, Math.min(totalFrames - 1, Math.floor((ms * fps) / 1000 + 1e-9)));
}

/** The frame `elapsedMs` after playing from `fromMs`; without `loop` it ends on the last frame. Pure. */
export function playbackFrame(elapsedMs: number, options: Playback & { fromMs: number; loop: boolean }): { frame: number; ended: boolean } {
  const { fps, totalFrames, fromMs, loop } = options;
  const frame = Math.floor(((fromMs + elapsedMs) * fps) / 1000 + 1e-9);
  if (frame < totalFrames) return { frame: Math.max(0, frame), ended: false };
  return loop ? { frame: frame % totalFrames, ended: false } : { frame: totalFrames - 1, ended: true };
}

/** Where a play starts: `fromMs` (clamped), else the frame on screen, else (on the last frame) the start. Pure. */
export function playStartMs(fromMs: number | undefined, current: number, { fps, totalFrames }: Playback): number {
  const durationMs = (totalFrames * 1000) / fps;
  if (fromMs !== undefined) return Math.max(0, Math.min(durationMs, fromMs));
  return current >= totalFrames - 1 ? 0 : (current * 1000) / fps;
}

export interface PlayerOptions extends Playback {
  /** The element holding the frame (the page's root). */
  container: HTMLElement;
  size: Size;
  /** The letterbox colour: the first scene's ground. */
  ground: string;
  renderFrame(frame: number): void;
  /** Resolves once the frame on screen is fully drawn (fonts loaded). */
  waitUntilReady(): Promise<void>;
}

/** Scales the frame to the window, draws frame 0, answers host messages and posts `motioncraft:ready`. */
export function startPlayer(options: PlayerOptions): void {
  const { container, size, ground, fps, totalFrames } = options;

  document.documentElement.style.cssText = `height:100%;background:${ground}`;
  document.body.style.cssText = `height:100%;background:${ground}`;
  container.style.cssText = `position:absolute;left:0;top:0;width:${size.width}px;height:${size.height}px;transform-origin:0 0`;
  const fit = () => {
    const { scale, x, y } = fitFrame(size, { width: window.innerWidth, height: window.innerHeight });
    container.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };
  fit();
  window.addEventListener("resize", fit);

  let current = 0;
  // Seeks arriving faster than frames draw: only the latest is drawn, on the next animation frame.
  let pendingSeek: number | undefined;
  let playing: { fromMs: number; loop: boolean; startedAt?: number } | undefined;
  let scheduled = false;

  const draw = (frame: number) => {
    current = frame;
    options.renderFrame(frame);
  };
  const tick = (now: number) => {
    scheduled = false;
    if (pendingSeek !== undefined) {
      const frame = pendingSeek;
      pendingSeek = undefined;
      draw(frame);
    } else if (playing !== undefined) {
      playing.startedAt ??= now;
      const { frame, ended } = playbackFrame(now - playing.startedAt, { fps, totalFrames, fromMs: playing.fromMs, loop: playing.loop });
      if (frame !== current) draw(frame);
      if (ended) playing = undefined;
    }
    if (playing !== undefined) schedule();
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(tick);
  };

  draw(0);
  window.addEventListener("message", (event: MessageEvent) => {
    const message = parseHostMessage(event.data);
    if (message === undefined) return;
    if (message.type === "motioncraft:seek") {
      playing = undefined;
      pendingSeek = frameAtMs(message.ms, fps, totalFrames);
      schedule();
    } else if (message.type === "motioncraft:play") {
      pendingSeek = undefined;
      playing = { fromMs: playStartMs(message.fromMs, current, { fps, totalFrames }), loop: message.loop };
      schedule();
    } else {
      playing = undefined;
    }
  });

  options.waitUntilReady().then(
    () => {
      const ready: ReadyMessage = { type: "motioncraft:ready", fps, totalFrames, durationMs: (totalFrames * 1000) / fps, ...size };
      window.parent.postMessage(ready, "*");
    },
    (error: unknown) => console.error("motioncraft player: the first frame did not get ready:", error),
  );
}
