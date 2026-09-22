import { describe, expect, it } from 'vitest';
import { hingeBox } from '../generators/hingebox';
import { hingeCardBox } from '../generators/hingecardbox';
import { integratedHingeBox } from '../generators/integratedhingebox';
import { pirateChest } from '../generators/piratechest';
import { sideHingeBox } from '../generators/sidehingebox';
import { modelBounds } from './bounds3d';
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

describe('chest hinges', () => {
  // both default to a pivot at Y = y + t, Z = 100
  const cases: Array<[GeneratorDef, object, string[]]> = [
    [integratedHingeBox, {}, ['left side', 'right side']],
    [pirateChest, {}, ['left', 'right']],
    [pirateChest, { n: 3 }, ['left', 'right']],
  ];
  for (const [gen, extra, sideLabels] of cases) for (const lid_open of [0, 45, 100]) {
    it(`${gen.id} ${JSON.stringify(extra)}: discs on the pivot, pins in their slots (lid open ${lid_open})`, () => {
      const m = build(gen, { ...extra, lid_open });
      checkOutlines(m.parts);
      for (const label of sideLabels) {
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

describe('side hinge box', () => {
  for (const lid_open of [0, 40, 90]) {
    it(`slots, holes and pins line up on the pivot (lid open ${lid_open})`, () => {
      const m = build(sideHingeBox, { lid_open });
      checkOutlines(m.parts);
      const t3 = 3;
      const hc = 2 * t3 + 5.5;
      const pivot = { x: 100 - hc + t3, z: hc - t3 };
      const holeBox = (label: string) => {
        const p = m.parts.find((q) => q.label === label)!;
        expect(p.holes, label).toHaveLength(1);
        const pts = p.holes[0].map((q) => placePoint(p.placement!, q.x, q.y, 0));
        const xs = pts.map((q) => q.x);
        const zs = pts.map((q) => q.z);
        return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
      };
      const centred = (b: { x0: number; x1: number; z0: number; z1: number }) => {
        expect((b.x0 + b.x1) / 2).toBeCloseTo(pivot.x, 6);
        expect((b.z0 + b.z1) / 2).toBeCloseTo(pivot.z, 6);
      };
      // the outer walls turn about the pivot, so their holes stay on it
      for (const l of ['outer hinge side A', 'outer hinge side C']) centred(holeBox(l));
      for (const side of ['A', 'C']) {
        const inner = holeBox(`inner hinge side ${side}`);
        const disc = holeBox(`hinge disc ${side}`);
        centred(inner);
        centred(disc);
        // both slots are t wide and 1.5 t tall, like the pin's cross-section
        const pin = modelBounds(m.parts.filter((q) => q.label === `hinge pin ${side}`));
        for (const s of [inner, disc]) {
          expect(s.x1 - s.x0).toBeCloseTo(t3, 6);
          expect(s.z1 - s.z0).toBeCloseTo(1.5 * t3, 6);
          expect(pin.min.x).toBeCloseTo(s.x0, 6);
          expect(pin.max.x).toBeCloseTo(s.x1, 6);
          expect(pin.min.z).toBeCloseTo(s.z0, 6);
          expect(pin.max.z).toBeCloseTo(s.z1, 6);
        }
      }
    });
  }
});

describe('hinge card box', () => {
  for (const o of [{}, { lid_open: 70, open_lid: 2 }, { sx: [40, 90], fingerhole: 'none', hinge_count: 2 }, { outside: true, fingerhole: 'deep' }]) {
    it(`each lid has its own hinge on the pin axis ${JSON.stringify(o)}`, () => {
      const m = build(hingeCardBox, o);
      checkOutlines(m.parts);
      const lidTops = m.parts.filter((p) => /^lid \d+ top$/.test(p.label));
      const n = ((o as { sx?: number[] }).sx ?? [65, 65, 65, 65]).length;
      expect(lidTops).toHaveLength(n);
      const e = 1.5 * t;
      const y = (o as { outside?: boolean }).outside ? 68 - 2 * t : 68;
      const h = (o as { outside?: boolean }).outside ? 92 - 2 * t : 92;
      // lid outlines (closed ones) must not overlap their neighbours
      const spans: Array<[number, number]> = [];
      for (let i = 1; i <= n; i++) {
        const lid = modelBounds(m.parts.filter((p) => p.label === `lid ${i} top`));
        spans.push([lid.min.x, lid.max.x]);
        const eyes = m.parts.filter((p) => p.label.startsWith(`lid ${i} hinge eye`));
        expect(eyes.length).toBeGreaterThan(0);
        for (const eye of eyes) {
          for (const z of [0, t]) {
            const bore = placePoint(eye.placement!, 0, e, z);
            expect(bore.y, eye.label).toBeCloseTo(y + t, 6);
            expect(bore.z, eye.label).toBeCloseTo(h, 6);
            // every eye of this lid's hinge sits under this lid
            expect(bore.x).toBeGreaterThan(lid.min.x);
            expect(bore.x).toBeLessThan(lid.max.x);
          }
        }
      }
      if (!(o as { lid_open?: number }).lid_open) {
        // neighbouring lids are separated by twice the lid gap
        for (let i = 1; i < spans.length; i++) expect(spans[i][0] - spans[i - 1][1]).toBeCloseTo(2 * 0.5, 6);
        // and the outer lids are flush with the box's outer faces
        const box = modelBounds(m.parts.filter((p) => ['left side', 'right side'].includes(p.label)));
        expect(spans[0][0]).toBeCloseTo(box.min.x, 6);
        expect(spans[spans.length - 1][1]).toBeCloseTo(box.max.x, 6);
      }
    });
  }
});
