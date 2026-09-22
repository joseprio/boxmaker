import type { Vec3 } from './geometry';
import type { Part } from './part';

export interface Bounds3 {
  min: Vec3;
  max: Vec3;
}

/** Axis-aligned bounds of all placed parts in box space. */
export function modelBounds(parts: Part[]): Bounds3 {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  const add = (x: number, y: number, z: number) => {
    if (x < min.x) min.x = x;
    if (y < min.y) min.y = y;
    if (z < min.z) min.z = z;
    if (x > max.x) max.x = x;
    if (y > max.y) max.y = y;
    if (z > max.z) max.z = z;
  };
  for (const p of parts) {
    if (!p.placement) continue;
    const { origin: o, u, v } = p.placement;
    const w = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
    for (const pt of p.outline) {
      for (const d of [0, p.thickness]) {
        add(
          o.x + u.x * pt.x + v.x * pt.y + w.x * d,
          o.y + u.y * pt.x + v.y * pt.y + w.y * d,
          o.z + u.z * pt.x + v.z * pt.y + w.z * d,
        );
      }
    }
  }
  if (!isFinite(min.x)) return { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  return { min, max };
}
