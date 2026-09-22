import { describe, expect, it } from 'vitest';
import { hingeBox } from '../generators/hingebox';
import { integratedHingeBox } from '../generators/integratedhingebox';
import { defaultValues, type GeneratorDef } from '../generators/types';
import { boundsOf, signedArea } from './geometry';
import { placePoint } from './part';

const build = (g: GeneratorDef, o: object) => g.build({ ...defaultValues(g), ...o });
const t = 3;

function checkOutlines(parts: { label: string; outline: { x: number; y: number }[]; openPaths: unknown[] }[]) {
  for (const p of parts) {
    expect(signedArea(p.outline), p.label).toBeGreaterThan(0);
    expect(p.openPaths, p.label).toHaveLength(0);
  }
}

describe('integrated hinge box', () => {
  for (const lid_open of [0, 45, 100]) {
    it(`pin holes sit on the pivot (lid open ${lid_open})`, () => {
      const m = build(integratedHingeBox, { lid_open });
      checkOutlines(m.parts);
      for (const label of ['left side', 'right side']) {
        const side = m.parts.find((p) => p.label === label)!;
        expect(side.holes).toHaveLength(1);
        const b = boundsOf(side.holes);
        const c = placePoint(side.placement!, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0);
        expect(c.y).toBeCloseTo(100 + t, 6);
        expect(c.z).toBeCloseTo(100, 6);
      }
    });
  }
});

describe('hinge box', () => {
  for (const o of [{}, { lid_open: 80 }, { splitlid: 30, lid_open: 60 }, { hinge_count: 1, hinge_eyes: 4 }]) {
    it(`eyes turn on the pin axis ${JSON.stringify(o)}`, () => {
      const m = build(hingeBox, o);
      checkOutlines(m.parts);
      const e = 1.5 * t;
      const eyes = m.parts.filter((p) => p.label.includes('eye'));
      const hinges = (o as { hinge_count?: number }).hinge_count ?? 2;
      const perHinge = (o as { hinge_eyes?: number }).hinge_eyes ?? 5;
      expect(eyes).toHaveLength(hinges * perHinge * ((o as { splitlid?: number }).splitlid ? 2 : 1));
      for (const eye of eyes) {
        const axisY = eye.label.startsWith('front') ? -t : 100 + t;
        for (const z of [0, t]) {
          const bore = placePoint(eye.placement!, 0, e, z);
          expect(bore.y, eye.label).toBeCloseTo(axisY, 6);
          expect(bore.z, eye.label).toBeCloseTo(100, 6);
        }
      }
    });
  }

  it('refuses edges too short for a hinge', () => {
    expect(() => build(hingeBox, { x: 20 })).toThrow(/too short/);
  });
});
