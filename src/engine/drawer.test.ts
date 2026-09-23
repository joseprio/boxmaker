import { describe, expect, it } from 'vitest';
import { slidingDrawer } from '../generators/slidingdrawer';
import { defaultValues } from '../generators/types';
import { modelBounds } from './bounds3d';
import { boundsOf } from './geometry';

const build = (o: object = {}) => slidingDrawer.build({ ...defaultValues(slidingDrawer), ...o });
const EPS = 1e-6;

describe('sliding drawer', () => {
  it('matches upstream for a single drawer', () => {
    const m = build();
    // case: bottom, top, two sides, back; drawer: front, back, two sides, bottom
    expect(m.parts).toHaveLength(10);
    const bb = modelBounds(m.parts.filter((p) => p.label.startsWith('case')));
    expect(bb.max.x - bb.min.x).toBeCloseTo(60, 6);
    expect(bb.max.y - bb.min.y).toBeCloseTo(100, 6);
    expect(bb.max.z - bb.min.z).toBeCloseTo(30, 6);
    // one arc pull in the front's top edge
    const front = m.parts.find((p) => p.label === 'drawer front')!;
    const fb = boundsOf([front.outline]);
    const t = 3;
    const p = 0.15 * t;
    expect(fb.maxY).toBeCloseTo(30 - 2 * t - t - 2 * p, 6);
    const x2 = 60 - 2 * t - 2 * t - 2 * p;
    const dip = front.outline.filter((q) => q.y < fb.maxY - EPS && q.y > fb.maxY - 5 && q.x > 0 && q.x < x2);
    expect(dip.length).toBeGreaterThan(0);
    for (const q of dip) expect(Math.abs(q.x - x2 / 2)).toBeLessThanOrEqual(0.2 * x2 + EPS);
  });

  for (const o of [{ sx: [60, 60, 80], sh: [30, 50] }, { sx: [50, 50], sh: [40] }, { sx: [80], sh: [30, 30, 30], hi: 15, outside: false }]) {
    it(`fits a drawer in every cell ${JSON.stringify(o)}`, () => {
      const v: Record<string, unknown> = { ...defaultValues(slidingDrawer), ...o };
      const t = Number(v.thickness);
      const p = Number(v.play) * t;
      const cols = (v.sx as number[]).length;
      const rows = (v.sh as number[]).length;
      const m = build(o);
      for (const part of m.parts) expect(part.openPaths, part.label).toHaveLength(0);
      const drawers = m.parts.filter((q) => q.label.startsWith('drawer'));
      expect(drawers).toHaveLength(5 * cols * rows);
      expect(m.parts.filter((q) => q.label.startsWith('divider'))).toHaveLength(cols - 1);
      expect(m.parts.filter((q) => q.label.startsWith('shelf'))).toHaveLength(rows - 1);
      const cb = modelBounds(m.parts.filter((q) => q.label.startsWith('case')));
      if (v.outside) {
        expect(cb.max.x - cb.min.x).toBeCloseTo((v.sx as number[]).reduce((a, c) => a + c, 0), 6);
        expect(cb.max.z - cb.min.z).toBeCloseTo((v.sh as number[]).reduce((a, c) => a + c, 0), 6);
      }
      // the drawers stay clear of each other and of the case, dividers and shelves
      const inner = m.parts.filter((q) => !q.label.startsWith('drawer'));
      const walls = inner.map((q) => modelBounds([q]));
      for (let j = 1; j <= rows; j++) {
        for (let i = 1; i <= cols; i++) {
          const tag = cols > 1 || rows > 1 ? `drawer ${j}.${i} ` : 'drawer ';
          const db = modelBounds(drawers.filter((q) => q.label.startsWith(tag)));
          expect(db.min.y).toBeGreaterThan(cb.min.y + p - EPS);
          expect(db.max.y).toBeLessThan(cb.max.y - t - p + EPS);
          for (const w of walls) {
            const overlap = Math.min(db.max.x, w.max.x) - Math.max(db.min.x, w.min.x);
            const overlapZ = Math.min(db.max.z, w.max.z) - Math.max(db.min.z, w.min.z);
            const overlapY = Math.min(db.max.y, w.max.y) - Math.max(db.min.y, w.min.y);
            // a wall the drawer sits in (the case) overlaps it on every axis; any other must not
            const contains = w.min.x <= db.min.x && w.max.x >= db.max.x && w.min.z <= db.min.z && w.max.z >= db.max.z;
            if (!contains) expect(Math.min(overlap, overlapZ, overlapY)).toBeLessThan(-p + 1e-6);
          }
        }
      }
    });
  }

  it('cuts a round finger hole in the middle of each front', () => {
    const t = 3;
    const m = build({ grip: 'hole', grip_diameter: 12, sx: [60, 60], sh: [30, 60] });
    const fronts = m.parts.filter((q) => q.label.endsWith(' front'));
    expect(fronts).toHaveLength(4);
    for (const f of fronts) {
      const ob = boundsOf([f.outline]);
      // straight top edge: no pull
      const x2 = ob.maxX - ob.minX - 2 * t;
      expect(f.outline.filter((q) => q.y < ob.maxY - EPS && q.y > ob.maxY - 5 && q.x > 0.2 * x2 && q.x < 0.8 * x2)).toHaveLength(0);
      const round = f.holes.filter((hl) => hl.length > 8);
      expect(round).toHaveLength(1);
      const hb = boundsOf(round);
      const h2 = ob.maxY;
      const d = Math.min(12, h2 - t);
      expect(hb.maxX - hb.minX).toBeCloseTo(d, 1);
      expect((hb.minX + hb.maxX) / 2).toBeCloseTo((ob.minX + ob.maxX) / 2, 6);
      // centred on the face, which runs from the bottom's lower face (-t) up to h2
      expect((hb.minY + hb.maxY) / 2).toBeCloseTo((ob.minY + ob.maxY) / 2, 1);
    }
  });

  it('crosses dividers and shelves with halving slots', () => {
    const m = build({ sx: [60, 60], sh: [30, 30] });
    const y = 100 - 3;
    const divider = m.parts.find((q) => q.label === 'divider')!;
    const shelf = m.parts.find((q) => q.label === 'shelf')!;
    // divider local x runs from the front; the slot reaches half way back
    const slotEnd = divider.outline.filter((q) => Math.abs(q.x - y / 2) < EPS);
    expect(slotEnd).toHaveLength(2);
    const shelfSlot = shelf.outline.filter((q) => Math.abs(q.y - y / 2) < EPS);
    expect(shelfSlot).toHaveLength(2);
  });
});
