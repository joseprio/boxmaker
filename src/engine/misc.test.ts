import { describe, expect, it } from 'vitest';
import { bookHolder } from '../generators/bookholder';
import { display } from '../generators/display';
import { laptopStand } from '../generators/laptopstand';
import { phoneHolder } from '../generators/phoneholder';
import { defaultValues } from '../generators/types';
import { modelBounds } from './bounds3d';
import { boundsOf } from './geometry';

describe('laptop stand', () => {
  const build = (o: object = {}) => laptopStand.build({ ...defaultValues(laptopStand), ...o });

  for (const o of [{}, { angle: 5 }, { angle: 30, ground_offset: 2 }, { l_depth: 350, l_thickness: 20, nub_size: 15, thickness: 6 }]) {
    it(`triangles close, hold the laptop and their slots meet ${JSON.stringify(o)}`, () => {
      const v: Record<string, unknown> = { ...defaultValues(laptopStand), ...o };
      const t = Number(v.thickness);
      const a = (Number(v.angle) * Math.PI) / 180;
      const depth = Number(v.l_depth);
      const g = Number(v.ground_offset);
      const base = Math.SQRT2 * depth * Math.cos(a);
      const m = build(o);
      expect(m.parts).toHaveLength(2);
      const [below, above] = m.parts;
      for (const p of m.parts) {
        expect(p.openPaths).toHaveLength(0);
        expect(p.holes).toHaveLength(0);
        // the laptop's front bottom edge sits in the nub's corner
        expect(p.outline.some((q) => Math.abs(q.x - base) < 1e-6 && Math.abs(q.y - g) < 1e-6)).toBe(true);
        // rear end as tall as the laptop's back edge
        expect(boundsOf([p.outline]).maxY).toBeCloseTo(depth * Math.sin(a) + g, 6);
      }
      // the slots sit at the middle and meet
      for (const sx of [base / 2 - t / 2, base / 2 + t / 2]) {
        const ys = (p: typeof below) => p.outline.filter((q) => Math.abs(q.x - sx) < 1e-6).map((q) => q.y);
        expect(ys(below)).toHaveLength(2);
        expect(ys(above)).toHaveLength(2);
        expect(Math.max(...ys(below))).toBeCloseTo(Math.min(...ys(above)), 6);
      }
      // standing on the table, crossing at the origin
      const bb = modelBounds(m.parts);
      expect(bb.min.z).toBeCloseTo(0, 6);
      expect((bb.min.x + bb.max.x) / 2).toBeCloseTo(0, 6);
    });
  }

  it('explains a laptop too short for the nubs', () => {
    expect(() => build({ l_depth: 100, angle: 60, nub_size: 50 })).toThrow(/too short/);
  });
});

describe('display', () => {
  const build = (o: object = {}) => display.build({ ...defaultValues(display), ...o });

  for (const o of [{}, { angle: 10 }, { radius: 0 }]) {
    it(`shelf fits through the back's slot ${JSON.stringify(o)}`, () => {
      const v: Record<string, unknown> = { ...defaultValues(display), ...o };
      const x = Number(v.x);
      const h = Number(v.h);
      const t = Number(v.thickness);
      const m = build(o);
      const shelf = m.parts.find((p) => p.label === 'shelf')!;
      const back = m.parts.find((p) => p.label === 'back')!;
      const sb = boundsOf([shelf.outline]);
      expect(sb.maxX - sb.minX).toBeCloseTo(0.7 * x, 6);
      expect(sb.maxY - sb.minY).toBeCloseTo(x, 6);
      expect(back.holes).toHaveLength(1);
      const slot = boundsOf(back.holes);
      expect(slot.maxX - slot.minX).toBeCloseTo(0.7 * x + 0.1 * t, 6);
      expect(slot.maxY - slot.minY).toBeCloseTo(1.3 * t, 6);
      const bb = boundsOf([back.outline]);
      const a = (Number(v.angle) * Math.PI) / 180;
      const r = Number(v.radius);
      expect(bb.maxY - bb.minY).toBeCloseTo((1.2 * h - 2 * r) * Math.cos(a) + 2 * r, 6);
      // slot centred on the bottom edge
      const bottom = back.outline.filter((q) => Math.abs(q.y - bb.minY) < 1e-6).map((q) => q.x);
      expect((slot.minX + slot.maxX) / 2).toBeCloseTo((Math.min(...bottom) + Math.max(...bottom)) / 2, 6);
      expect(modelBounds(m.parts).min.z).toBeGreaterThan(-t);
    });
  }
});

describe('book holder', () => {
  const build = (o: object = {}) => bookHolder.build({ ...defaultValues(bookHolder), ...o });

  for (const o of [{}, { ledge_height: 15 }, { angle: 90, back_support: 0, radius: 0 }, { angle: 45, bottom_support: 4.25, radius: 8 }]) {
    it(`side walls carry both plates ${JSON.stringify(o)}`, () => {
      const v: Record<string, unknown> = { ...defaultValues(bookHolder), ...o };
      const t = Number(v.thickness);
      const a = (Number(v.angle) * Math.PI) / 180;
      const H = Number(v.book_height);
      const D = Number(v.book_depth);
      const bs = Number(v.bottom_support);
      const r = Number(v.radius) < 0 ? t : Number(v.radius);
      const m = build(o);
      const labels = m.parts.map((p) => p.label);
      expect(labels.includes('back support')).toBe(Number(v.back_support) > 0);
      expect(labels.includes('front ledge')).toBe(Number(v.ledge_height) > 0);
      for (const p of m.parts) expect(p.openPaths, p.label).toHaveLength(0);
      const sides = m.parts.filter((p) => p.label.endsWith('side'));
      expect(sides).toHaveLength(2);
      for (const s of sides) {
        // the corner where the book's back and bottom meet, and the top of each plate line
        const p2 = { x: r + r * Math.cos(a) + D * Math.sin(a), y: bs };
        const pts = [p2, { x: p2.x + H * Math.cos(a), y: bs + H * Math.sin(a) }, { x: p2.x - D * Math.sin(a), y: bs + D * Math.cos(a) }];
        for (const q of pts) expect(s.outline.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 1e-6)).toBe(true);
        expect(s.holes.length > 0).toBe(Number(v.back_support) > 0);
      }
      // nothing below the table, and the plates between the outer faces of the sides
      const bb = modelBounds(m.parts);
      expect(bb.min.z).toBeGreaterThan(-1e-6);
      expect(bb.max.x - bb.min.x).toBeCloseTo(Number(v.book_width), 6);
    });
  }

  it('keeps the plates off the table', () => {
    expect(() => build({ bottom_support: 0 })).toThrow(/at least/);
  });
});

describe('phone holder', () => {
  const build = (o: object = {}) => phoneHolder.build({ ...defaultValues(phoneHolder), ...o });

  for (const o of [{}, { angle: 10 }, { angle: 50, phone_width: 90, bottom_support_spacing: 30, thickness: 4 }]) {
    it(`parts close and fit together ${JSON.stringify(o)}`, () => {
      const v: Record<string, unknown> = { ...defaultValues(phoneHolder), ...o };
      const t = Number(v.thickness);
      const W = Number(v.phone_width);
      const h = Number(v.phone_height) + Number(v.bottom_margin);
      const th = (Number(v.angle) * Math.PI) / 180;
      const m = build(o);
      expect(m.parts).toHaveLength(6);
      for (const p of m.parts) expect(p.openPaths, p.label).toHaveLength(0);
      // the front plate spans the side walls' outer faces, the slope is h long
      const front = m.parts.find((p) => p.label === 'front plate')!;
      const fb = boundsOf([front.outline]);
      expect(fb.maxX - fb.minX).toBeCloseTo(W + 2 * t, 6);
      expect(fb.maxY).toBeCloseTo(h, 6);
      // two rows of finger holes for the supports, plus fingers of the side tabs
      expect(front.holes.length).toBeGreaterThan(0);
      for (const s of m.parts.filter((p) => p.label.endsWith('side'))) {
        const sb = boundsOf([s.outline]);
        expect(sb.maxX).toBeCloseTo(h * Math.sin(th) + t, 6);
        expect(sb.maxY).toBeCloseTo(h * Math.cos(th), 6);
        expect(s.holes.length).toBeGreaterThan(0);
      }
      // the supports go through the front plate's slots
      const slots = front.outline.filter((q) => Math.abs(q.y - Number(v.bottom_margin)) < 1e-6).map((q) => q.x);
      const supports = m.parts.filter((p) => p.label.startsWith('bottom support'));
      expect(supports).toHaveLength(2);
      for (const s of supports) {
        const sb = modelBounds([s]);
        expect(slots.some((x) => Math.abs(x - sb.min.x) < 1e-6)).toBe(true);
        expect(slots.some((x) => Math.abs(x - sb.max.x) < 1e-6)).toBe(true);
      }
      expect(modelBounds(m.parts).min.z).toBeGreaterThan(-1e-6);
    });
  }

  it('explains tabs longer than the phone', () => {
    expect(() => build({ tab_size: 200 })).toThrow(/longer than the phone/);
  });
});
