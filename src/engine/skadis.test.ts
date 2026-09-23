import { describe, expect, it } from 'vitest';
import { skadisBoard } from '../generators/skadis';
import { defaultValues } from '../generators/types';
import { modelBounds } from './bounds3d';
import { boundsOf } from './geometry';

const build = (o: object = {}) => skadisBoard.build({ ...defaultValues(skadisBoard), ...o });

describe('skadis pegboard', () => {
  it('matches the original board size and slot pattern', () => {
    const m = build();
    const board = m.parts.find((p) => p.label === 'board')!;
    const b = boundsOf([board.outline]);
    expect(b.maxX - b.minX).toBeCloseTo(360, 6);
    expect(b.maxY - b.minY).toBeCloseTo(560, 6);
    expect(board.thickness).toBe(5);
    // 17 x 27 positions, every other one a slot
    expect(board.holes).toHaveLength(Math.floor((17 * 27) / 2));
    for (const hl of board.holes) {
      const s = boundsOf([hl]);
      expect(s.maxX - s.minX).toBeCloseTo(5, 6);
      expect(s.maxY - s.minY).toBeCloseTo(15, 6);
      // on the 20 mm grid
      const cx = (s.minX + s.maxX) / 2;
      const cy = (s.minY + s.maxY) / 2;
      expect(cx / 20).toBeCloseTo(Math.round(cx / 20), 6);
      expect(cy / 20).toBeCloseTo(Math.round(cy / 20), 6);
      // staggered: slot positions alternate like a checkerboard
      expect((Math.round(cx / 20) + Math.round(cy / 20)) % 2).toBe(1);
    }
  });

  it('adds centred washers behind the board', () => {
    const m = build({ washers: 8 });
    const washers = m.parts.filter((p) => p.label.startsWith('washer'));
    expect(washers).toHaveLength(8);
    for (const w of washers) {
      expect(w.holes).toHaveLength(1);
      const o = boundsOf([w.outline]);
      const h = boundsOf(w.holes);
      expect(o.maxX - o.minX).toBeCloseTo(15, 1);
      expect(h.maxX - h.minX).toBeCloseTo(5, 1);
      expect((o.minX + o.maxX) / 2).toBeCloseTo((h.minX + h.maxX) / 2, 6);
      // behind the board (the board's back face is at y = 0)
      expect(modelBounds([w]).min.y).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(build({ washers: 0 }).parts).toHaveLength(1);
  });

  it('keeps the washers from widening the sheet', async () => {
    const { layoutParts } = await import('./layout');
    const sheet = layoutParts(build().parts);
    // board 360 mm + margins: the washers go below it, not beside it
    expect(sheet.width).toBeLessThan(380);
  });
});

describe('skadis stand', () => {
  const stand = async (o: object = {}) => {
    const { skadisStand } = await import('../generators/skadisstand');
    return skadisStand.build({ ...defaultValues(skadisStand), ...o });
  };

  for (const o of [{}, { angle: 60 }, { angle: 90 }, { connectors: [2, 4, 6], extra_height_bottom: 10 }, { foot_front: 60 }]) {
    it(`legs close and their tabs meet the slot rows ${JSON.stringify(o)}`, async () => {
      const m = await stand(o);
      const a = (((o as { angle?: number }).angle ?? 70) * Math.PI) / 180;
      const hB = (o as { extra_height_bottom?: number }).extra_height_bottom ?? 0;
      const cons = (o as { connectors?: number[] }).connectors ?? [1, 3];
      const legs = m.parts.filter((p) => p.label.startsWith('leg'));
      expect(legs).toHaveLength(2);
      for (const leg of legs) {
        // the board rests on the leg's front edge, a line from the origin at the angle
        const d = { x: Math.cos(a), y: Math.sin(a) };
        const n = { x: -Math.sin(a), y: Math.cos(a) };
        const tabTips = leg.outline.filter((q) => Math.abs(q.x * n.x + q.y * n.y - 4.5) < 1e-6).map((q) => q.x * d.x + q.y * d.y);
        tabTips.sort((p, q) => p - q);
        expect(tabTips).toHaveLength(2 * cons.length);
        // each tab is 10 mm long, centred on a slot row (rows every 20 mm from the board's bottom edge)
        cons.forEach((c, i) => {
          expect(tabTips[2 * i]).toBeCloseTo(hB + c * 20 - 5, 6);
          expect(tabTips[2 * i + 1]).toBeCloseTo(hB + c * 20 + 5, 6);
        });
      }
      if ((o as { foot_front?: number }).foot_front) {
        const plates = m.parts.filter((p) => p.label.startsWith('front foot'));
        expect(plates).toHaveLength(2);
        for (const p of plates) expect(p.holes.length).toBeGreaterThan(0);
        // the legs stand on the plates
        expect(modelBounds(legs).min.z).toBeCloseTo(0, 6);
      }
    });
  }

  it('explains a foot too short for the height', async () => {
    await expect(stand({ foot: 10, angle: 30 })).rejects.toThrow(/too short/);
  });
});
