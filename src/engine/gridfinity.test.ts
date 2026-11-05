import { describe, expect, it } from 'vitest';
import { gridfinityBase, gridfinityBin } from '../generators/gridfinity';
import { defaultValues } from '../generators/types';
import { modelBounds } from './bounds3d';
import { boundsOf } from './geometry';
import { placePoint } from './part';

const base = (o: object = {}) => gridfinityBase.build({ ...defaultValues(gridfinityBase), ...o });
const bin = (o: object = {}) => gridfinityBin.build({ ...defaultValues(gridfinityBin), ...o });
const size = (pts: Parameters<typeof boundsOf>[0]) => {
  const b = boundsOf(pts);
  return { w: b.maxX - b.minX, h: b.maxY - b.minY, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 };
};

describe('gridfinity baseplate', () => {
  it('has a 38 mm opening per 42 mm cell', () => {
    const m = base({ x: 4, y: 3 });
    const grid = m.parts.find((p) => p.label === 'grid')!;
    const o = size([grid.outline]);
    expect(o.w).toBeCloseTo(168, 6);
    expect(o.h).toBeCloseTo(126, 6);
    expect(grid.holes).toHaveLength(12);
    for (const hl of grid.holes) {
      const s = size([hl]);
      expect(s.w).toBeCloseTo(38, 6);
      expect(s.h).toBeCloseTo(38, 6);
      // centred in its cell
      expect(((s.cx - (o.cx - 84)) / 42) % 1).toBeCloseTo(0.5, 6);
      expect(((s.cy - (o.cy - 63)) / 42) % 1).toBeCloseTo(0.5, 6);
    }
    const bottom = m.parts.find((p) => p.label === 'bottom')!;
    expect(bottom.holes).toHaveLength(0);
  });

  it('puts magnet holes 26 mm apart in the bottom', () => {
    const bottom = base({ x: 1, y: 1, magnets: true }).parts.find((p) => p.label === 'bottom')!;
    expect(bottom.holes).toHaveLength(4);
    const centres = bottom.holes.map((hl) => size([hl]));
    const xs = [...new Set(centres.map((c) => Math.round(c.cx * 1000) / 1000))].sort((a, b) => a - b);
    expect(xs).toHaveLength(2);
    expect(xs[1] - xs[0]).toBeCloseTo(26, 3);
    expect(centres[0].w).toBeCloseTo(6.5, 3);
  });

  it('stacks grid layers and adds walls', () => {
    const m = base({ layers: 2, h: 30 });
    expect(m.parts.filter((p) => p.label.startsWith('grid'))).toHaveLength(2);
    expect(m.parts.filter((p) => ['front', 'back', 'left side', 'right side'].includes(p.label))).toHaveLength(4);
    const bb = modelBounds(m.parts);
    // three plates under the walls
    expect(bb.min.z).toBeCloseTo(-9, 6);
    expect(bb.max.z).toBeCloseTo(30, 6);
  });
});

describe('gridfinity bin', () => {
  it('is half a millimetre smaller than its cells and 7 mm per height unit', () => {
    const m = bin({ x: 2, y: 1, hu: 6 });
    const body = modelBounds(m.parts.filter((p) => p.group !== 'extra'));
    expect(body.max.x - body.min.x).toBeCloseTo(83.5, 6);
    expect(body.max.y - body.min.y).toBeCloseTo(41.5, 6);
    expect(body.max.z - body.min.z).toBeCloseTo(42, 6);
  });

  it('has a foot under each cell, centred like the baseplate openings', () => {
    const t = 3;
    const m = bin({ x: 3, y: 2, layers: 2, thickness: t });
    const body = modelBounds(m.parts.filter((p) => p.group !== 'extra'));
    const feet = m.parts.filter((p) => p.label.startsWith('foot'));
    expect(feet).toHaveLength(3 * 2 * 2);
    for (const f of feet) {
      const fb = modelBounds([f]);
      expect(fb.max.x - fb.min.x).toBeCloseTo(37.5, 6);
      // the cell grid starts 0.25 mm outside the bin
      const cx = (fb.min.x + fb.max.x) / 2 - (body.min.x - 0.25);
      const cy = (fb.min.y + fb.max.y) / 2 - (body.min.y - 0.25);
      expect((cx / 42) % 1).toBeCloseTo(0.5, 6);
      expect((cy / 42) % 1).toBeCloseTo(0.5, 6);
      expect(fb.max.z).toBeLessThanOrEqual(body.min.z + 1e-9);
      expect(fb.min.z).toBeGreaterThanOrEqual(body.min.z - 2 * t - 1e-9);
    }
  });

  describe('magnet holes', () => {
    const feetOf = (m: ReturnType<typeof bin>) => m.parts.filter((p) => p.label.startsWith('foot'));
    // hole centres in box space, rounded so they can be compared as a set
    const centres = (parts: ReturnType<typeof feetOf>, ox = 0, oy = 0) =>
      parts
        .flatMap((p) =>
          p.holes.map((hl) => {
            const c = size([hl]);
            const q = placePoint(p.placement!, c.cx, c.cy, 0);
            return `${(q.x - ox).toFixed(3)},${(q.y - oy).toFixed(3)}`;
          }),
        )
        .sort();

    it('has none by default', () => {
      expect(feetOf(bin()).every((f) => f.holes.length === 0)).toBe(true);
    });

    it('line up with the magnet holes of the baseplate', () => {
      for (const opening_radius of [2, 0]) {
        const m = bin({ x: 3, y: 2, magnets: true, opening_radius });
        const body = modelBounds(m.parts.filter((p) => p.group !== 'extra'));
        // the cell grid starts 0.25 mm outside the bin
        const feet = centres(feetOf(m), body.min.x - 0.25, body.min.y - 0.25);
        expect(feet).toHaveLength(3 * 2 * 4);
        const plate = base({ x: 3, y: 2, magnets: true, opening_radius }).parts.filter((p) => p.label === 'bottom');
        expect(feet).toEqual(centres(plate));
      }
    });

    it('go through every pad of the stack, leaving the floor closed', () => {
      const m = bin({ x: 1, y: 1, layers: 2, magnets: true, magnet_d: 6 });
      const feet = feetOf(m);
      expect(feet).toHaveLength(2);
      for (const f of feet) {
        expect(f.holes).toHaveLength(4);
        expect(size([f.holes[0]]).w).toBeCloseTo(6, 3);
      }
      expect(centres([feet[0]])).toEqual(centres([feet[1]]));
      expect(m.parts.filter((p) => p.group !== 'extra').flatMap((p) => p.holes.map((hl) => size([hl]).w))).not.toContain(6);
    });

    it('are refused when they do not fit in the feet', () => {
      expect(() => bin({ magnets: true, magnet_d: 12 })).toThrow('do not fit');
      expect(() => bin({ magnets: true, opening_radius: 16 })).toThrow('do not fit');
      expect(() => bin({ magnet_d: 12 })).not.toThrow();
    });
  });

  it('adds dividers for the compartments', () => {
    const m = bin({ cx: 3, cy: 2 });
    expect(m.parts.filter((p) => p.group === 'divider')).toHaveLength(2 + 1);
  });
});
