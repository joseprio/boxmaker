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

interface Frame {
  pos: V3;
  dir: V3;
  normal: V3;
}

/** Advance a frame by `l` of local x through one path segment. */
function advance(f: Frame, v: V3, seg: PathSegment, l: number): Frame {
  if (!seg.angle || seg.radius === undefined) return { pos: add(f.pos, f.dir, l), dir: f.dir, normal: f.normal };
  const a = ((seg.angle * Math.PI) / 180) * (l / seg.length);
  // turning about v: the centre lies on the -normal side for a positive angle
  const sign = Math.sign(seg.angle);
  const c = add(f.pos, f.normal, -seg.radius * sign);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const rot = (w: V3): V3 => add(add(add({ x: 0, y: 0, z: 0 }, w, ca), cross(v, w), sa), v, (v.x * w.x + v.y * w.y + v.z * w.z) * (1 - ca));
  const normal = rot(f.normal);
  return { pos: add(c, normal, seg.radius * sign), dir: rot(f.dir), normal };
}

/** Frames at the start of each path segment, cached per placement. */
const segmentStarts = new WeakMap<Placement, Array<{ x0: number; frame: Frame }>>();

function starts(p: Placement): Array<{ x0: number; frame: Frame }> {
  let s = segmentStarts.get(p);
  if (s) return s;
  s = [];
  let frame: Frame = { pos: { ...p.origin }, dir: p.u, normal: cross(p.u, p.v) };
  let x0 = 0;
  for (const seg of p.path ?? []) {
    s.push({ x0, frame });
    frame = advance(frame, p.v, seg, seg.length);
    x0 += seg.length;
  }
  s.push({ x0, frame });
  segmentStarts.set(p, s);
  return s;
}

/** Frame (position and in-plane axes) at local x along a placement's path. */
export function pathFrame(p: Placement, x: number): Frame {
  const path = p.path ?? [];
  const st = starts(p);
  if (x <= 0 || path.length === 0) {
    const f = st[0].frame;
    return x < 0 ? { ...f, pos: add(f.pos, f.dir, x) } : f;
  }
  let i = 0;
  while (i < path.length && x > st[i + 1].x0) i++;
  // past the end the part continues straight
  if (i === path.length) {
    const f = st[i].frame;
    return { pos: add(f.pos, f.dir, x - st[i].x0), dir: f.dir, normal: f.normal };
  }
  return advance(st[i].frame, p.v, path[i], x - st[i].x0);
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
  /**
   * Engraving (not cut through): open polylines, or closed contours (first
   * point repeated at the end is not required) for fill engraving.
   */
  openPaths: Vec2[][];
  /** Open cut lines inside the part (e.g. flex hinge cuts) - cut like contours. */
  cuts: Vec2[][];
  thickness: number;
  placement?: Placement;
  /** Logical group for the viewer (e.g. "box", "lid", "divider"). */
  group: string;
}

/** Rotate a placement by `degrees` about the axis through `center` along the unit vector `axis`. */
export function rotatePlacement(p: Placement, center: V3, axis: V3, degrees: number): Placement {
  if (!degrees) return p;
  const a = (degrees * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const rot = (w: V3): V3 => {
    const d = axis.x * w.x + axis.y * w.y + axis.z * w.z;
    const c = cross(axis, w);
    return { x: w.x * ca + c.x * sa + axis.x * d * (1 - ca), y: w.y * ca + c.y * sa + axis.y * d * (1 - ca), z: w.z * ca + c.z * sa + axis.z * d * (1 - ca) };
  };
  const rel = rot({ x: p.origin.x - center.x, y: p.origin.y - center.y, z: p.origin.z - center.z });
  return { ...p, origin: { x: center.x + rel.x, y: center.y + rel.y, z: center.z + rel.z }, u: rot(p.u), v: rot(p.v) };
}
