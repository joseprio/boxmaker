import { describe, expect, it } from 'vitest';
import { gridfinityBase, gridfinityBin } from '../generators/gridfinity';
import { defaultValues } from '../generators/types';
import { modelBounds } from './bounds3d';
import { boundsOf } from './geometry';

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

  it('adds dividers for the compartments', () => {
    const m = bin({ cx: 3, cy: 2 });
    expect(m.parts.filter((p) => p.group === 'divider')).toHaveLength(2 + 1);
  });
});
