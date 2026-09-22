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
      // each side's bearing disc sits in its hole, with the slot the lid's pin goes into
      const lidBack = m.parts.find((p) => p.label === 'lid back')!;
      for (const side of ['left', 'right']) {
        const disc = m.parts.find((p) => p.label === `hinge disc ${side}`)!;
        expect(disc.holes).toHaveLength(1);
        const d = boundsOf([disc.outline]);
        const c = placePoint(disc.placement!, (d.minX + d.maxX) / 2, (d.minY + d.maxY) / 2, 0);
        expect(c.y).toBeCloseTo(100 + t, 6);
        expect(c.z).toBeCloseTo(100, 6);
        // the pin tip: the lid back's outline points beyond the side walls, on this
        // side, within the pin length of the axis (the neck above stays clear of the disc)
        const pinh = Math.sqrt((0.9 * 2 * t) ** 2 - t ** 2);
        const pin = lidBack.outline
          .map((q) => placePoint(lidBack.placement!, q.x, q.y, t / 2))
          .filter((q) => (side === 'left' ? q.x < -1e-6 : q.x > 100 + 1e-6))
          .filter((q) => Math.hypot(q.y - (100 + t), q.z - 100) <= pinh + 1e-6);
        expect(pin.length).toBeGreaterThan(0);
        // every pin point lies inside the slot (in the disc's plane, within the slot rectangle)
        const slot = disc.holes[0].map((q) => placePoint(disc.placement!, q.x, q.y, 0));
        const ys = slot.map((q) => q.y);
        const zs = slot.map((q) => q.z);
        const inSlot = (q: { y: number; z: number }) => {
          // slot is a rotated rectangle: test in its own axes
          const [a, b, , d2] = slot;
          const ux = b.y - a.y;
          const uz = b.z - a.z;
          const vx = d2.y - a.y;
          const vz = d2.z - a.z;
          const px = q.y - a.y;
          const pz = q.z - a.z;
          const s1 = (px * ux + pz * uz) / (ux * ux + uz * uz);
          const s2 = (px * vx + pz * vz) / (vx * vx + vz * vz);
          return s1 > -1e-6 && s1 < 1 + 1e-6 && s2 > -1e-6 && s2 < 1 + 1e-6;
        };
        expect(Math.max(...ys) - Math.min(...ys) + Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0);
        for (const q of pin) expect(inSlot(q), `${side} pin (${q.y.toFixed(2)}, ${q.z.toFixed(2)})`).toBe(true);
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
