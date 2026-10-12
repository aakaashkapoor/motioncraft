// SVG path data measured in code, with no DOM (`getTotalLength` needs a
// browser): the path is read command by command (M/L/H/V/C/S/Q/T/A/Z, absolute
// and relative) into straight pieces, curves and arcs sampled finely enough to
// land within a fraction of a percent of their true length. Pure.

export interface Point {
  x: number;
  y: number;
}

/** One straight piece of a traced path, `at` along it from the path's start. */
interface Piece {
  a: Point;
  b: Point;
  at: number;
}

/** A path as straight pieces: what is drawn, in order. Moves add no length. */
export interface PathTrace {
  pieces: Piece[];
  /** Where the path starts, even when it draws nothing. */
  start: Point;
  length: number;
}

/** Samples per curve or per quarter turn of an arc. */
const SAMPLES = 48;

const COMMAND = /[MmLlHhVvCcSsQqTtAaZz]/;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** The commands of `d`, each with its numbers: implicit repeats split out, moves' extra pairs as lines. */
function parse(d: string): Array<{ cmd: string; args: number[] }> {
  const out: Array<{ cmd: string; args: number[] }> = [];
  let i = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i]!)) i++;
  };
  const number = (flag: boolean): number => {
    skip();
    if (flag) {
      const ch = d[i];
      if (ch !== "0" && ch !== "1") throw new Error(`pathLength: expected an arc flag at ${i} in "${d}"`);
      i++;
      return Number(ch);
    }
    const m = NUMBER.exec(d.slice(i));
    if (m === null) throw new Error(`pathLength: expected a number at ${i} in "${d}"`);
    i += m[0].length;
    return Number(m[0]);
  };
  let cmd = "";
  for (skip(); i < d.length; skip()) {
    if (COMMAND.test(d[i]!)) cmd = d[i++]!;
    else if (cmd === "" || /[zZ]/.test(cmd)) throw new Error(`pathLength: unexpected "${d[i]}" at ${i} in "${d}"`);
    const count = ARGS[cmd.toLowerCase()]!;
    const args = Array.from({ length: count }, (_, k) => number(cmd.toLowerCase() === "a" && (k === 3 || k === 4)));
    if (out.length === 0 && cmd.toLowerCase() !== "m") throw new Error(`pathLength: "${d}" must start with a move`);
    out.push({ cmd, args });
    // After a move's first pair, more pairs are lines.
    if (cmd === "M") cmd = "L";
    else if (cmd === "m") cmd = "l";
  }
  return out;
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const [a, b, c, e] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: a * p0.x + b * p1.x + c * p2.x + e * p3.x, y: a * p0.y + b * p1.y + c * p2.y + e * p3.y };
}

const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);

/** Points along an elliptical arc from `p0` to `p1`, `p0` excluded (SVG 1.1 appendix F.6.5). */
function arcPoints(p0: Point, rx0: number, ry0: number, rotationDeg: number, large: number, sweep: number, p1: Point): Point[] {
  let rx = Math.abs(rx0);
  let ry = Math.abs(ry0);
  if (rx === 0 || ry === 0 || (p0.x === p1.x && p0.y === p1.y)) return [p1];
  const phi = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1) / ry;
  const cyp = (-coef * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (p0.x + p1.x) / 2;
  const cy = sin * cxp + cos * cyp + (p0.y + p1.y) / 2;
  const theta = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let delta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (sweep === 0 && delta > 0) delta -= 2 * Math.PI;
  if (sweep === 1 && delta < 0) delta += 2 * Math.PI;
  const steps = Math.max(4, Math.ceil((Math.abs(delta) / (Math.PI / 2)) * SAMPLES));
  return Array.from({ length: steps }, (_, k) => {
    if (k === steps - 1) return p1;
    const t = theta + (delta * (k + 1)) / steps;
    return { x: cos * rx * Math.cos(t) - sin * ry * Math.sin(t) + cx, y: sin * rx * Math.cos(t) + cos * ry * Math.sin(t) + cy };
  });
}

/** `d` as straight pieces. Throws on path data it cannot read. */
export function tracePath(d: string): PathTrace {
  const pieces: Piece[] = [];
  let length = 0;
  let pen: Point = { x: 0, y: 0 };
  let subpath: Point = pen;
  let start: Point | undefined;
  /** The last curve's second control point, for S and T to reflect. */
  let control: Point | undefined;
  let lastKind = "";
  const lineTo = (b: Point) => {
    const piece = Math.hypot(b.x - pen.x, b.y - pen.y);
    if (piece > 0) pieces.push({ a: pen, b, at: length });
    length += piece;
    pen = b;
  };

  for (const { cmd, args } of parse(d)) {
    const rel = cmd === cmd.toLowerCase() && cmd.toLowerCase() !== "z";
    const at = (x: number, y: number): Point => (rel ? { x: pen.x + x, y: pen.y + y } : { x, y });
    const kind = cmd.toLowerCase();
    const reflected = (kinds: string): Point =>
      control !== undefined && kinds.includes(lastKind) ? { x: 2 * pen.x - control.x, y: 2 * pen.y - control.y } : pen;
    let nextControl: Point | undefined;
    switch (kind) {
      case "m":
        pen = at(args[0]!, args[1]!);
        subpath = pen;
        start ??= pen;
        break;
      case "l":
        lineTo(at(args[0]!, args[1]!));
        break;
      case "h":
        lineTo({ x: rel ? pen.x + args[0]! : args[0]!, y: pen.y });
        break;
      case "v":
        lineTo({ x: pen.x, y: rel ? pen.y + args[0]! : args[0]! });
        break;
      case "c":
      case "s": {
        const c1 = kind === "c" ? at(args[0]!, args[1]!) : reflected("cs");
        const [c2, end] = kind === "c" ? [at(args[2]!, args[3]!), at(args[4]!, args[5]!)] : [at(args[0]!, args[1]!), at(args[2]!, args[3]!)];
        const p0 = pen;
        for (let k = 1; k <= SAMPLES; k++) lineTo(k === SAMPLES ? end : cubicAt(p0, c1, c2, end, k / SAMPLES));
        nextControl = c2;
        break;
      }
      case "q":
      case "t": {
        const c = kind === "q" ? at(args[0]!, args[1]!) : reflected("qt");
        const end = kind === "q" ? at(args[2]!, args[3]!) : at(args[0]!, args[1]!);
        const p0 = pen;
        // A quadratic as the cubic with controls two thirds of the way to its control point.
        const c1 = lerp(p0, c, 2 / 3);
        const c2 = lerp(end, c, 2 / 3);
        for (let k = 1; k <= SAMPLES; k++) lineTo(k === SAMPLES ? end : cubicAt(p0, c1, c2, end, k / SAMPLES));
        nextControl = c;
        break;
      }
      case "a":
        for (const p of arcPoints(pen, args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, at(args[5]!, args[6]!))) lineTo(p);
        break;
      case "z":
        lineTo(subpath);
        break;
    }
    control = nextControl;
    lastKind = kind;
  }
  return { pieces, start: start ?? { x: 0, y: 0 }, length };
}

/** The length of SVG path data `d`, in its own units. Throws on path data it cannot read. */
export function pathLength(d: string): number {
  return tracePath(d).length;
}

/** The point `distance` along a path (path data or a trace), clamped to its ends. */
export function pathPointAt(path: string | PathTrace, distance: number): Point {
  const { pieces, start } = typeof path === "string" ? tracePath(path) : path;
  if (pieces.length === 0) return start;
  if (distance <= 0) return pieces[0]!.a;
  // Binary search for the last piece starting at or before `distance`.
  let lo = 0;
  let hi = pieces.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pieces[mid]!.at <= distance) lo = mid;
    else hi = mid - 1;
  }
  const piece = pieces[lo]!;
  const span = Math.hypot(piece.b.x - piece.a.x, piece.b.y - piece.a.y);
  return lerp(piece.a, piece.b, Math.min(1, (distance - piece.at) / span));
}

/** Whether path data ends by closing its shape. */
export const isClosedPath = (d: string) => /[zZ]\s*$/.test(d);

/** An icon's `circle` or `rect` as path data, drawn from its left (circle) or top-left corner (rect), clockwise and closed. */
export function shapePath(tag: "circle" | "rect", attrs: Readonly<Record<string, string | number>>): string {
  const num = (key: string, fallback = 0) => (attrs[key] === undefined ? fallback : Number(attrs[key]));
  if (tag === "circle") {
    const [cx, cy, r] = [num("cx"), num("cy"), num("r")];
    return `M${cx - r} ${cy}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1 ${-2 * r} 0Z`;
  }
  const [x, y, w, h] = [num("x"), num("y"), num("width"), num("height")];
  const rx = Math.min(w / 2, num("rx", num("ry")));
  const ry = Math.min(h / 2, num("ry", num("rx")));
  if (rx <= 0 || ry <= 0) return `M${x} ${y}h${w}v${h}h${-w}Z`;
  const arc = (dx: number, dy: number) => `a${rx} ${ry} 0 0 1 ${dx} ${dy}`;
  return `M${x + rx} ${y}h${w - 2 * rx}${arc(rx, ry)}v${h - 2 * ry}${arc(-rx, ry)}h${-(w - 2 * rx)}${arc(-rx, -ry)}v${-(h - 2 * ry)}${arc(rx, -ry)}Z`;
}
