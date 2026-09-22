import type { Vec3 } from './geometry';
import { bendStations, placePoint, type Part } from './part';

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
    for (const pt of p.outline) {
      for (const d of [0, p.thickness]) {
        const q = placePoint(p.placement, pt.x, pt.y, d);
        add(q.x, q.y, q.z);
      }
    }
    if (p.placement.path) {
      // outline vertices are sparse along bends: sample the bent stretch too
      const ys = p.outline.map((pt) => pt.y);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      for (const x of bendStations(p.placement)) {
        for (const yy of [y0, y1]) {
          for (const d of [0, p.thickness]) {
            const q = placePoint(p.placement, x, yy, d);
            add(q.x, q.y, q.z);
          }
        }
      }
    }
  }
  if (!isFinite(min.x)) return { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  return { min, max };
}
