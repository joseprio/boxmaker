import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import { signedArea, type Vec2 } from './geometry';

/**
 * A small single-stroke digit font for engraving numbers. Glyphs are drawn on
 * a 6 x 10 grid (y up, baseline at 0) with the stroke centre lines kept 0.6
 * inside the box, so outlines up to 1.2 grid units wide stay within it.
 */
const GRID_H = 10;
const GLYPH_W = 6;
const ADVANCE = 7.6;

/** Points on an elliptical arc from a0 to a1 degrees (either direction). */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Vec2[] {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 7.5));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return out;
}

const p = (x: number, y: number): Vec2 => ({ x, y });
/** Join polylines, dropping the duplicate point where one ends and the next starts. */
const chain = (...parts: Vec2[][]): Vec2[] =>
  parts.reduce<Vec2[]>((acc, part) => {
    const last = acc[acc.length - 1];
    const first = part[0];
    const skip = last && first && Math.hypot(last.x - first.x, last.y - first.y) < 1e-9 ? 1 : 0;
    return acc.concat(part.slice(skip));
  }, []);

// tail and bowl as separate strokes, so neither overlaps itself
const six: Vec2[][] = [arc(3.6, 3.0, 3.0, 6.4, 70, 180), arc(3, 3.0, 2.4, 2.4, 180, 540)];

const GLYPHS: Record<string, Vec2[][]> = {
  '0': [arc(3, 5, 2.4, 4.4, 0, 360)],
  '1': [[p(1.4, 7.8), p(3.4, 9.4), p(3.4, 0.6)]],
  '2': [chain(arc(3, 7.0, 2.4, 2.4, 165, -40), [p(0.6, 0.6), p(5.4, 0.6)])],
  '3': [chain(arc(3, 7.3, 2.2, 2.1, 155, -90), arc(3, 2.9, 2.4, 2.3, 90, -155))],
  '4': [[p(4.2, 0.6), p(4.2, 9.4), p(0.6, 3.2), p(5.4, 3.2)]],
  '5': [chain([p(5.0, 9.4), p(1.3, 9.4), p(1.0, 5.6)], arc(3, 3.2, 2.4, 2.6, 130, -140))],
  '6': six,
  '7': [[p(0.6, 9.4), p(5.4, 9.4), p(2.2, 0.6)]],
  '8': [arc(3, 7.2, 2.0, 2.2, -90, 270), arc(3, 2.8, 2.4, 2.2, 90, 450)],
  '9': six.map((s) => s.map((q) => p(GLYPH_W - q.x, GRID_H - q.y))),
};

/** Characters the font can draw. */
export const ENGRAVE_CHARS = Object.keys(GLYPHS).join('');

/**
 * Centre lines of `text` set `height` mm tall, centred on (0, 0). Unknown
 * characters are skipped (spaces advance).
 */
export function textStrokes(text: string, height: number): Vec2[][] {
  const s = height / GRID_H;
  const chars = [...text];
  const width = chars.length ? (chars.length - 1) * ADVANCE + GLYPH_W : 0;
  const out: Vec2[][] = [];
  chars.forEach((c, i) => {
    const g = GLYPHS[c];
    if (!g) return;
    const x0 = i * ADVANCE - width / 2;
    for (const stroke of g) out.push(stroke.map((q) => p((x0 + q.x) * s, (q.y - GRID_H / 2) * s)));
  });
  return out;
}

/** Width of `text` set `height` mm tall. */
export function textWidth(text: string, height: number): number {
  const n = [...text].length;
  return n ? (((n - 1) * ADVANCE + GLYPH_W) * height) / GRID_H : 0;
}

/** Stroke width that keeps outlines inside the glyph box, for a given text height. */
export const maxOutlineWidth = (height: number): number => (1.2 * height) / GRID_H;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Offset a smooth polyline by +-r (mitred); `closed` treats it as a ring. */
function offsetLine(pts: Vec2[], r: number, closed: boolean): [Vec2[], Vec2[]] {
  const n = pts.length;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  const dir = (a: Vec2, b: Vec2) => {
    const l = dist(a, b) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  for (let i = 0; i < n; i++) {
    const prev = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
    const next = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
    const d1 = i > 0 || closed ? dir(prev, pts[i]) : dir(pts[i], next);
    const d2 = i < n - 1 || closed ? dir(pts[i], next) : d1;
    let nx = -(d1.y + d2.y);
    let ny = d1.x + d2.x;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    // mitre: stretch so the offset lines stay r away from both segments
    const k = r / Math.max(0.5, nx * -d1.y + ny * d1.x);
    left.push({ x: pts[i].x + nx * k, y: pts[i].y + ny * k });
    right.push({ x: pts[i].x - nx * k, y: pts[i].y - ny * k });
  }
  return [left, right];
}

/** Split an open polyline at corners sharper than `maxTurn` degrees. */
function splitAtCorners(pts: Vec2[], maxTurn: number): Vec2[][] {
  const out: Vec2[][] = [];
  let cur: Vec2[] = [pts[0]];
  const cosMax = Math.cos((maxTurn * Math.PI) / 180);
  for (let i = 1; i < pts.length; i++) {
    cur.push(pts[i]);
    if (i === pts.length - 1) break;
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const dot = ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / ((dist(a, b) || 1) * (dist(b, c) || 1));
    if (dot < cosMax) {
      out.push(cur);
      cur = [b];
    }
  }
  out.push(cur);
  return out;
}

/**
 * Outlines of the strokes drawn `width` wide with round ends and corners,
 * merged into non-overlapping contours (outer boundaries and the holes inside
 * them), ready for fill engraving. Each smooth stretch becomes one band, with
 * a round piece at every end and sharp corner.
 */
export function outlineStrokes(strokes: Vec2[][], width: number): Vec2[][] {
  const r = width / 2;
  const pieces: Polygon[] = [];
  const ring = (pts: Vec2[]) => pts.map((q) => [q.x, q.y] as [number, number]);
  const circle = (c: Vec2): Polygon => [
    Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return [c.x + r * Math.cos(a), c.y + r * Math.sin(a)] as [number, number];
    }),
  ];
  for (const s of strokes) {
    if (s.length < 2) continue;
    if (s.length > 3 && dist(s[0], s[s.length - 1]) < 1e-9) {
      // closed loop: a band with a hole
      const [a, b] = offsetLine(s.slice(0, -1), r, true);
      // which offset is outside depends on the loop's direction
      const [outer, inner] = Math.abs(signedArea(a)) > Math.abs(signedArea(b)) ? [a, b] : [b, a];
      pieces.push([ring(outer), ring(inner)]);
      continue;
    }
    for (const part of splitAtCorners(s, 35)) {
      const [left, right] = offsetLine(part, r, false);
      pieces.push([ring([...left, ...right.reverse()])]);
      pieces.push(circle(part[0]), circle(part[part.length - 1]));
    }
  }
  if (pieces.length === 0) return [];
  let merged: MultiPolygon;
  try {
    merged = polygonClipping.union(pieces[0], ...pieces.slice(1));
  } catch {
    // the sweep line can trip over nearly coincident edges: snap to a fine grid and retry
    const snap = (n: number) => Math.round(n * 1e4) / 1e4;
    const snapped = pieces.map((poly) => poly.map((rg) => rg.map(([x, y]) => [snap(x), snap(y)] as [number, number])));
    merged = polygonClipping.union(snapped[0], ...snapped.slice(1));
  }
  const out: Vec2[][] = [];
  for (const poly of merged) for (const rg of poly) out.push(rg.map(([x, y]) => p(x, y)));
  return out;
}
