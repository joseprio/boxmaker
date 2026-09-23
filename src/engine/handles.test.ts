import { describe, expect, it } from 'vitest';
import { generators } from '../generators';
import { defaultValues } from '../generators/types';
import { boundsOf } from './geometry';
import { placePoint } from './part';

const labels: Record<string, Record<string, string>> = {
  universalbox: { front: 'front', back: 'back', left: 'left', right: 'right' },
  openbox: { front: 'front', back: 'back', left: 'left', right: 'right' },
  closedbox: { front: 'Wall 1', back: 'Wall 3', left: 'Wall 2', right: 'Wall 4' },
};
const gen = (id: string) => generators.find((d) => d.id === id)!;

describe('handles', () => {
  for (const id of Object.keys(labels)) {
    for (const side of ['front', 'back', 'left', 'right']) {
      it(`${id}: ${side} handle`, () => {
        const g = gen(id);
        const o = { [`handle_${side}`]: true, [`handle_${side}_offset`]: 12, [`handle_${side}_width`]: 60, [`handle_${side}_height`]: 20, [`handle_${side}_radius`]: 10 };
        const m = g.build({ ...defaultValues(g), ...o });
        for (const p of m.parts) {
          const isWall = Object.values(labels[id]).includes(p.label);
          if (!isWall) continue;
          if (p.label !== labels[id][side]) {
            expect(p.holes, p.label).toHaveLength(0);
            continue;
          }
          expect(p.holes).toHaveLength(1);
          const hb = boundsOf(p.holes);
          expect(hb.maxX - hb.minX).toBeCloseTo(60, 6);
          expect(hb.maxY - hb.minY).toBeCloseTo(20, 6);
          // centred along the 100 mm wall, its top 12 mm below the top edge (at 100)
          expect((hb.minX + hb.maxX) / 2).toBeCloseTo(50, 6);
          expect(hb.maxY).toBeCloseTo(100 - 12, 6);
          // and cut through the wall where it stands in 3D
          const c = placePoint(p.placement!, 50, 100 - 12 - 10, 0);
          expect(c.z).toBeCloseTo(78, 6);
        }
      });
    }
  }

  it('can have all four at once, on a closed top too', () => {
    const g = gen('universalbox');
    const all = Object.fromEntries(['front', 'back', 'left', 'right'].map((s) => [`handle_${s}`, true]));
    const m = g.build({ ...defaultValues(g), ...all, top_edge: 'F', h: 120 });
    for (const l of ['front', 'back', 'left', 'right']) expect(m.parts.find((p) => p.label === l)!.holes, l).toHaveLength(1);
  });

  it('explains handles that do not fit', () => {
    const g = gen('closedbox');
    expect(() => g.build({ ...defaultValues(g), handle_left: true, handle_left_width: 150 })).toThrow(/left handle is wider/);
    expect(() => g.build({ ...defaultValues(g), handle_front: true, handle_front_offset: 90 })).toThrow(/front handle reaches below/);
  });

  it('changes nothing when off', () => {
    for (const id of Object.keys(labels)) {
      const g = gen(id);
      expect(g.build(defaultValues(g)).parts.every((p) => p.holes.length === 0)).toBe(true);
    }
  });
});
