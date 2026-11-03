import { describe, expect, it } from 'vitest';
import { shelves } from '../generators/shelves';
import { defaultValues } from '../generators/types';
import { modelBounds } from './bounds3d';
import { signedArea } from './geometry';

const build = (o: object = {}) => shelves.build({ ...defaultValues(shelves), ...o });

describe('shelves', () => {
  const variants: Record<string, unknown>[] = [
    {},
    { back: false },
    { windows: false },
    { n: 1 },
    { n: 5, spacing: 80, thickness: 6 },
    { radius: 500 },
    { radius: 0, back: false, top: 3 },
    { window_margin: 80 },
  ];
  for (const o of variants) {
    it(`parts close and the unit has the right size ${JSON.stringify(o)}`, () => {
      const v: Record<string, unknown> = { ...defaultValues(shelves), ...o };
      const t = Number(v.thickness);
      const n = Number(v.n);
      const m = build(o);
      for (const p of m.parts) {
        expect(signedArea(p.outline), p.label).toBeGreaterThan(0);
        expect(p.openPaths, p.label).toHaveLength(0);
      }
      expect(m.parts.filter((p) => p.label.startsWith('shelf'))).toHaveLength(n);
      expect(m.parts.some((p) => p.label === 'back')).toBe(Boolean(v.back));
      const bb = modelBounds(m.parts);
      expect(bb.max.x - bb.min.x).toBeCloseTo(Number(v.x) + 2 * t, 6);
      expect(bb.max.y - bb.min.y).toBeCloseTo(Number(v.y) + (v.back ? t : 0), 6);
      const height = Number(v.bottom) + n * t + (n - 1) * Number(v.spacing) + Number(v.top);
      expect(bb.max.z - bb.min.z).toBeCloseTo(height, 6);
      expect(bb.min.z).toBeCloseTo(0, 6);
    });
  }

  it('cuts a window between each pair of shelves', () => {
    const side = (o: object) => build(o).parts.find((p) => p.label === 'left')!;
    const without = side({ windows: false, n: 4 }).holes.length;
    expect(side({ windows: true, n: 4 }).holes.length - without).toBe(3);
  });

  it('explains a bottom gap thinner than the material', () => {
    expect(() => build({ bottom: 1 })).toThrow(/bottom gap/);
  });
});
