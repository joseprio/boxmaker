import { describe, expect, it } from 'vitest';
import { generators } from '../generators';
import { defaultValues } from '../generators/types';
import { modelBounds } from './bounds3d';
import { boundsOf, type Vec2 } from './geometry';

const t = 3;
const tf = 6;
const build = (id: string, o: object) => {
  const g = generators.find((d) => d.id === id)!;
  return g.build({ ...defaultValues(g), thickness: t, floor_thickness: tf, ...o });
};

/** x-intervals where a closed outline runs along the horizontal line y = level. */
function runsAt(outline: Vec2[], level: number, x0: number, x1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length];
    if (Math.abs(a.y - level) < 1e-6 && Math.abs(b.y - level) < 1e-6) {
      const lo = Math.max(Math.min(a.x, b.x), x0);
      const hi = Math.min(Math.max(a.x, b.x), x1);
      if (hi - lo > 1e-6) out.push([lo, hi]);
    }
  });
  return out.sort((p, q) => p[0] - q[0]);
}

describe('floor thickness', () => {
  for (const [id, bottom] of [
    ['universalbox', 'F'],
    ['openbox', 'F'],
    ['closedbox', 'F'],
  ] as const) {
    it(`${id}: the floor is ${tf} mm and its fingers fill the wall pockets`, () => {
      const m = build(id, { bottom_edge: bottom });
      const floor = m.parts.find((p) => /^bottom$/i.test(p.label))!;
      expect(floor.thickness).toBe(tf);
      const fb = modelBounds([floor]);
      expect(fb.min.z).toBeCloseTo(-tf, 6);
      expect(fb.max.z).toBeCloseTo(0, 6);
      for (const p of m.parts) if (p !== floor) expect(p.thickness, p.label).toBe(t);

      // front wall (local x along X, y up): pockets are where the outline stays at y = 0
      const front = m.parts.find((p) => /^(front|Wall 1)$/.test(p.label))!;
      expect(boundsOf([front.outline]).minY).toBeCloseTo(-tf, 6);
      const pockets = runsAt(front.outline, 0, 0, 100);
      // floor fingers along its front edge (local y = 0, fingers out to y = -t)
      const fingers = runsAt(floor.outline, -t, 0, 100);
      expect(fingers.length).toBeGreaterThan(3);
      expect(pockets).toHaveLength(fingers.length);
      pockets.forEach(([a, b], i) => {
        expect(a).toBeCloseTo(fingers[i][0], 6);
        expect(b).toBeCloseTo(fingers[i][1], 6);
      });
    });
  }

  for (const bottom of ['h', 's']) {
    it(`universalbox ${bottom} bottom: holes are as tall as the floor is thick`, () => {
      const m = build('universalbox', { bottom_edge: bottom });
      const front = m.parts.find((p) => p.label === 'front')!;
      const holes = front.holes.map((hl) => boundsOf([hl]));
      expect(holes.length).toBeGreaterThan(3);
      for (const hb of holes) {
        expect(hb.maxY - hb.minY).toBeCloseTo(tf, 6);
        // centred on the floor, which sits at z in [-tf, 0]
        expect((hb.minY + hb.maxY) / 2).toBeCloseTo(-tf / 2, 6);
      }
    });
  }

  it('outside measurements account for the floor', () => {
    const m = build('closedbox', { outside: true });
    const b = modelBounds(m.parts);
    expect(b.max.z - b.min.z).toBeCloseTo(100, 6);
  });

  it('leaves everything unchanged when not set', () => {
    const g = generators.find((d) => d.id === 'universalbox')!;
    const a = g.build({ ...defaultValues(g) });
    const b = g.build({ ...defaultValues(g), floor_thickness: 3 });
    expect(JSON.stringify(a.parts.map((p) => [p.outline, p.holes]))).toBe(JSON.stringify(b.parts.map((p) => [p.outline, p.holes])));
  });
});
