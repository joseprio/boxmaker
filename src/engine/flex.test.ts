import { describe, expect, it } from 'vitest';
import { flexBox } from '../generators/flexbox';
import { roundedBox } from '../generators/roundedbox';
import { defaultValues, type GeneratorDef } from '../generators/types';
import { placePoint } from './part';
import { signedArea } from './geometry';

const build = (g: GeneratorDef, o: object) => g.build({ ...defaultValues(g), ...o });
const close = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
  expect(a.z).toBeCloseTo(b.z, 6);
};
const pathLength = (p: { placement?: { path?: { length: number }[] } }) => (p.placement?.path ?? []).reduce((a, s) => a + s.length, 0);

describe('placePoint', () => {
  it('bends a quarter circle about v on the inner face', () => {
    const r = 10;
    const pl = { origin: { x: 0, y: 0, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, path: [{ length: 7, angle: 90, radius: r }] };
    close(placePoint(pl, 7, 0, 0), { x: r, y: r, z: 0 });
    // outer face on the larger radius, straight on past the end
    close(placePoint(pl, 7, 5, 2), { x: r + 2, y: r, z: 5 });
    close(placePoint(pl, 12, 0, 0), { x: r, y: r + 5, z: 0 });
  });
});

describe('rounded box', () => {
  for (const o of [{}, { wallpieces: 2 }, { wallpieces: 3 }, { wallpieces: 4, edge_style: 'h', sh: [40, 60], top: 'lid' }, { edge_style: 'F', top: 'closed' }, { y: 30 }, { y: 30, wallpieces: 2 }]) {
    it(JSON.stringify(o), () => {
      const m = build(roundedBox, o);
      const walls = m.parts.filter((p) => p.label.startsWith('wall'));
      expect(walls).toHaveLength((o as { wallpieces?: number }).wallpieces ?? 1);
      for (const p of m.parts) {
        expect(signedArea(p.outline), p.label).toBeGreaterThan(0);
        expect(p.openPaths, p.label).toHaveLength(0);
      }
      // the pieces join up into one closed loop around the plates
      walls.forEach((w, i) => {
        const next = walls[(i + 1) % walls.length];
        close(placePoint(w.placement!, pathLength(w), 0, 0), next.placement!.origin);
      });
      expect(walls.every((w) => w.cuts.length > 0)).toBe(true);
    });
  }
});

describe('flex box', () => {
  for (const o of [{}, { sx: [50, 50] }, { y: 30 }, { radius: 0 }]) {
    it(JSON.stringify(o), () => {
      const m = build(flexBox, o);
      for (const p of m.parts) {
        expect(signedArea(p.outline), p.label).toBeGreaterThan(0);
        expect(p.openPaths, p.label).toHaveLength(0);
      }
      const wall = m.parts.find((p) => p.label === 'wall')!;
      // wraps all the way round the side profile back to where it started
      close(placePoint(wall.placement!, pathLength(wall), 0, 0), wall.placement!.origin);
    });
  }
});
