import { describe, expect, it } from 'vitest';
import { bottleHolder } from '../generators/bottleholder';
import { defaultValues } from '../generators/types';
import { modelBounds } from './bounds3d';
import { signedArea } from './geometry';

const build = (o: object = {}) => bottleHolder.build({ ...defaultValues(bottleHolder), ...o });

describe('bottle holder', () => {
  const variants: Record<string, unknown>[] = [
    {},
    { handle: false },
    { handle: false, nx: 1, ny: 1 },
    { nx: 4, ny: 4, bottle_diam: 80 },
    { bottom_edge: 'F' },
    { bottom_edge: 's', floor_thickness: 5 },
    { floor_thickness: 2, thickness: 4 },
  ];
  for (const o of variants) {
    it(`parts close and hold one hole per bottle ${JSON.stringify(o)}`, () => {
      const v: Record<string, unknown> = { ...defaultValues(bottleHolder), ...o };
      const m = build(o);
      for (const p of m.parts) {
        expect(signedArea(p.outline), p.label).toBeGreaterThan(0);
        expect(p.openPaths, p.label).toHaveLength(0);
      }
      const plates = m.parts.filter((p) => p.label.startsWith('plate'));
      const d = Number(v.bottle_diam) + Number(v.clearance);
      // bottle holes are the round holes as wide as a bottle
      const bottleHoles = plates.flatMap((p) =>
        p.holes.filter((hole) => {
          const xs = hole.map((q) => q.x);
          return Math.abs(Math.max(...xs) - Math.min(...xs) - d) < 0.5;
        }),
      );
      expect(bottleHoles).toHaveLength(Number(v.nx) * Number(v.ny));
      expect(m.parts.some((p) => p.label === 'handle')).toBe(Boolean(v.handle));
    });
  }

  it('sizes the box round the bottles', () => {
    const m = build({ handle: false, nx: 3, ny: 2, bottle_diam: 60, clearance: 0, spacing: 10, thickness: 3 });
    const bb = modelBounds(m.parts);
    expect(bb.max.x - bb.min.x).toBeCloseTo(3 * 60 + 4 * 10 + 2 * 3, 6);
    expect(bb.max.y - bb.min.y).toBeCloseTo(2 * 60 + 3 * 10 + 2 * 3, 6);
  });

  it('raises the handle above the walls', () => {
    const m = build({ h: 100, handle_height: 80 });
    const bb = modelBounds(m.parts);
    expect(bb.max.z).toBeCloseTo(180, 6);
  });

  it('explains an odd number of rows with a handle', () => {
    expect(() => build({ ny: 3 })).toThrow(/even number of rows/);
  });
});
