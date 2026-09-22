/** Basic 2D/3D vector helpers used by the box engine. */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const EPS = 1e-6;

export function nearlyEqual(a: Vec2, b: Vec2, eps = EPS): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

export function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Signed area of a closed polygon (positive = counter-clockwise). */
export function signedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(paths: Vec2[][]): Bounds {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const path of paths) {
    for (const p of path) {
      if (p.x < b.minX) b.minX = p.x;
      if (p.y < b.minY) b.minY = p.y;
      if (p.x > b.maxX) b.maxX = p.x;
      if (p.y > b.maxY) b.maxY = p.y;
    }
  }
  if (!isFinite(b.minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return b;
}

/** Remove consecutive duplicate points (and a trailing duplicate of the first point). */
export function dedupe(pts: Vec2[], eps = EPS): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    if (out.length === 0 || !nearlyEqual(out[out.length - 1], p, eps)) out.push(p);
  }
  while (out.length > 1 && nearlyEqual(out[0], out[out.length - 1], eps)) out.pop();
  return out;
}

/** Remove collinear points from a closed polygon. */
export function simplify(pts: Vec2[], eps = 1e-7): Vec2[] {
  const p = dedupe(pts);
  if (p.length < 3) return p;
  const out: Vec2[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[(i + p.length - 1) % p.length];
    const b = p[i];
    const c = p[(i + 1) % p.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    // keep the point unless it lies on a straight line going forward
    if (Math.abs(cross) > eps || dot < 0) out.push(b);
  }
  return out;
}

/**
 * Offset a closed polygon by `d` along its outward normal using mitered corners.
 * For a counter-clockwise polygon a positive `d` grows the shape; for holes
 * (drawn clockwise) the same positive `d` shrinks them - which is exactly the
 * kerf compensation a laser cutter needs.
 */
export function offsetPolygon(ptsIn: Vec2[], d: number): Vec2[] {
  const pts = simplify(ptsIn);
  const n = pts.length;
  if (n < 3 || d === 0) return pts;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    // right-hand normals (outward for CCW polygons)
    let n1x = b.y - a.y, n1y = -(b.x - a.x);
    let n2x = c.y - b.y, n2y = -(c.x - b.x);
    const l1 = Math.hypot(n1x, n1y) || 1;
    const l2 = Math.hypot(n2x, n2y) || 1;
    n1x /= l1; n1y /= l1; n2x /= l2; n2y /= l2;
    const dot = n1x * n2x + n1y * n2y;
    let denom = 1 + dot;
    if (denom < 0.05) denom = 0.05; // clamp near-reversals (should not occur in sane parts)
    const mx = (n1x + n2x) / denom;
    const my = (n1y + n2y) / denom;
    out.push({ x: b.x + mx * d, y: b.y + my * d });
  }
  return out;
}

/** Transform a set of 2D points with a 2x3 affine matrix [a b c d e f]. */
export interface Affine {
  a: number; b: number; c: number; d: number; e: number; f: number;
}

export function applyAffine(m: Affine, p: Vec2): Vec2 {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}
