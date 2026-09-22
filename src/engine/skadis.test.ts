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
