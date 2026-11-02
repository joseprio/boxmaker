import { describe, expect, it } from 'vitest';
import { bottleOrganizer } from '../generators/bottleorganizer';
import { defaultValues } from '../generators/types';
import { modelBounds } from './bounds3d';
import { signedArea } from './geometry';

const build = (o: object = {}) => bottleOrganizer.build({ ...defaultValues(bottleOrganizer), ...o });

describe('bottle organizer', () => {
  const variants: Record<string, unknown>[] = [{}, { ribs: 2 }, { n: 1 }, { ribs: 5, n: 6, bottle_diam: 60 }, { floor_thickness: 5 }, { gap: 0, end_margin: 0 }];
  for (const o of variants) {
    it(`ribs close and cradle every bottle ${JSON.stringify(o)}`, () => {
      const v: Record<string, unknown> = { ...defaultValues(bottleOrganizer), ...o };
      const m = build(o);
      const h = Number(v.h);
      const depth = Number(v.depth);
      const r = (Number(v.bottle_diam) + Number(v.clearance)) / 2;
      const pitch = 2 * r + Number(v.gap);
      const ribs = m.parts.filter((p) => p.label.includes('rib'));
      expect(ribs).toHaveLength(Number(v.ribs));
      for (const p of m.parts) {
        expect(signedArea(p.outline), p.label).toBeGreaterThan(0);
        expect(p.openPaths, p.label).toHaveLength(0);
      }
      for (const rib of ribs) {
        // ridges at the full height
        expect(Math.max(...rib.outline.map((q) => q.y))).toBeCloseTo(h, 6);
        // one lowest point per cradle, `pitch` apart
        const bottoms = rib.outline.filter((q) => Math.abs(q.y - (h - depth)) < 1e-6).map((q) => q.x).sort((a, b) => a - b);
        expect(bottoms).toHaveLength(Number(v.n));
        for (let i = 1; i < bottoms.length; i++) expect(bottoms[i] - bottoms[i - 1]).toBeCloseTo(pitch, 6);
        // the bottle (centre above the lowest point) never cuts into the rib
        for (const cx of bottoms) {
          for (const q of rib.outline) expect(Math.hypot(q.x - cx, q.y - (h - depth + r))).toBeGreaterThan(r - 1e-6);
        }
      }
    });
  }

  it('is a closed tray: end walls and a floor jointed on all four sides', () => {
    const t = 3;
    const m = build({ thickness: t, ribs: 4 });
    const labels = m.parts.map((p) => p.label);
    expect(labels).toEqual(expect.arrayContaining(['front rib', 'back rib', 'left end', 'right end', 'rib 1', 'rib 2', 'bottom']));
    const ribLength = Math.max(...m.parts.find((p) => p.label === 'rib 1')!.outline.map((q) => q.x));
    const floor = m.parts.find((p) => p.label === 'bottom')!;
    const xs = floor.outline.map((q) => q.x);
    const ys = floor.outline.map((q) => q.y);
    // fingers stick out on every side, into the walls
    expect(Math.min(...ys)).toBeCloseTo(-t, 6);
    expect(Math.min(...xs)).toBeCloseTo(-t, 6);
    expect(Math.max(...xs)).toBeCloseTo(ribLength, 6);
    // the end walls carry finger holes for both inner ribs (plus the floor's)
    const left = m.parts.find((p) => p.label === 'left end')!;
    expect(left.holes.length).toBeGreaterThan(0);
    const ends = m.parts.filter((p) => p.label.endsWith(' end'));
    for (const e of ends) expect(Math.max(...e.outline.map((q) => q.y))).toBeCloseTo(Number(defaultValues(bottleOrganizer).h), 6);
  });

  it('spans the depth with the front and back ribs', () => {
    const m = build({ y: 120, thickness: 3 });
    const bb = modelBounds(m.parts);
    expect(bb.max.y - bb.min.y).toBeCloseTo(126, 6);
  });

  it('explains cradles deeper than the bottle radius', () => {
    expect(() => build({ depth: 50, h: 80 })).toThrow(/bottle radius/);
  });
});
