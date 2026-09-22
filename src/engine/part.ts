import type { Vec2, Vec3 } from './geometry';

/**
 * Where a flat part sits in 3D box space (Z up).
 * Local (0,0) of the part maps to `origin`; the local x axis maps to `u` and
 * the local y axis to `v`. The material is extruded by the thickness along
 * u × v.
 */
export interface Placement {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  /**
   * Bent parts (flex walls): local x runs along this path instead of a
   * straight line. Each segment covers `length` mm of local x; segments with
   * an `angle` bend the part about the v axis (positive = right-handed about
   * v) on a circle of `radius` measured at the local z = 0 face. Past the end
   * the part continues straight.
   */
  path?: PathSegment[];
}

export interface PathSegment {
  length: number;
  /** turn in degrees over this segment; 0 or undefined for straight */
  angle?: number;
  radius?: number;
}

type V3 = { x: number; y: number; z: number };
const add = (a: V3, b: V3, s: number): V3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Frame (position and in-plane axes) at local x along a placement's path. */
export function pathFrame(p: Placement, x: number): { pos: V3; dir: V3; normal: V3 } {
  let pos: V3 = { ...p.origin };
  let dir: V3 = p.u;
  let normal = cross(p.u, p.v);
  let rest = x;
  for (const seg of p.path ?? []) {
    if (rest <= 0) break;
    const l = Math.min(rest, seg.length);
    if (seg.angle && seg.radius !== undefined) {
      const a = ((seg.angle * Math.PI) / 180) * (l / seg.length);
      // turning about v: the centre lies on the -normal side for a positive angle
      const r = seg.radius;
      const c = add(pos, normal, -r * Math.sign(seg.angle));
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rel = add({ x: 0, y: 0, z: 0 }, normal, r * Math.sign(seg.angle));
      // rotate rel and dir about v by a
      const rot = (w: V3): V3 => add(add(add({ x: 0, y: 0, z: 0 }, w, ca), cross(p.v, w), sa), p.v, (p.v.x * w.x + p.v.y * w.y + p.v.z * w.z) * (1 - ca));
      pos = add(c, rot(rel), 1);
      dir = rot(dir);
      normal = rot(normal);
    } else {
      pos = add(pos, dir, l);
    }
    rest -= seg.length;
  }
  if (rest > 0) pos = add(pos, dir, rest);
  return { pos, dir, normal };
}

/** Map a part-local point (x, y on the sheet, z through the thickness) into box space. */
export function placePoint(p: Placement, x: number, y: number, z: number): V3 {
  if (!p.path) {
    const w = cross(p.u, p.v);
    return {
      x: p.origin.x + p.u.x * x + p.v.x * y + w.x * z,
      y: p.origin.y + p.u.y * x + p.v.y * y + w.y * z,
      z: p.origin.z + p.u.z * x + p.v.z * y + w.z * z,
    };
  }
  const f = pathFrame(p, x);
  return add(add(f.pos, p.v, y), f.normal, z);
}

/** Local x positions where a bent part needs subdividing to follow its path smoothly. */
export function bendStations(p: Placement, maxStepDeg = 6): number[] {
  const out: number[] = [];
  let x0 = 0;
  for (const seg of p.path ?? []) {
    if (seg.angle) {
      const n = Math.max(1, Math.ceil(Math.abs(seg.angle) / maxStepDeg));
      for (let i = 0; i <= n; i++) out.push(x0 + (seg.length * i) / n);
    }
    x0 += seg.length;
  }
  return out;
}

export interface Part {
  label: string;
  /** Counter-clockwise outer contour in part-local mm. */
  outline: Vec2[];
  /** Inner contours (holes). */
  holes: Vec2[][];
  /** Open polylines (etchings, labels...) - exported to SVG only. */
  openPaths: Vec2[][];
  /** Open cut lines inside the part (e.g. flex hinge cuts) - cut like contours. */
  cuts: Vec2[][];
  thickness: number;
  placement?: Placement;
  /** Logical group for the viewer (e.g. "box", "lid", "divider"). */
  group: string;
}
