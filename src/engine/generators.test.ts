import { describe, expect, it } from 'vitest';
import { generators } from '../generators';
import { defaultValues } from '../generators/types';
import { signedArea } from './geometry';

describe('all generators build with defaults', () => {
  for (const g of generators) {
    it(g.id, () => {
      const model = g.build(defaultValues(g));
      expect(model.parts.length).toBeGreaterThan(0);
      for (const p of model.parts) {
        expect(signedArea(p.outline)).toBeGreaterThan(0);
        expect(p.placement).toBeDefined();
      }
      expect(model.size.x).toBeGreaterThan(0);
    });
  }
});

describe('universal box variants', () => {
  it('builds every top/bottom/lid/handle combination', async () => {
    const { universalBox } = await import('../generators/universalbox');
    for (const top of ['e', 'F', 'h', 'S', 'Z']) {
      for (const bottom of ['F', 'h', 's', 'e']) {
        for (const lid of ['none', 'flat', 'overthetop', 'ontop']) {
          for (const handle of ['none', 'long_rounded', 'long_trapezoid', 'long_doublerounded', 'knob']) {
            for (const vert of ['finger joints', 'finger holes']) {
              const v = { ...defaultValues(universalBox), top_edge: top, bottom_edge: bottom, lid_style: lid, lid_handle: handle, vertical_edges: vert };
              const model = universalBox.build(v);
              for (const p of model.parts) expect(signedArea(p.outline), `${top}${bottom}${lid}${handle} ${p.label}`).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });
});

describe('ported tray and box variants', () => {
  const variants: Record<string, Record<string, unknown>[]> = {
    trayinsert: [{ draft_angle: 10 }, { x: 200, y: 180 }, { x: 155 }, { outside: true }],
    angledbox: [1, 2, 5].flatMap((n) => ['none', 'angled hole', 'angled lid', 'angled lid2'].flatMap((top) => ['h', 'F', 'e'].map((bottom_edge) => ({ n, top, bottom_edge, x: 150, y: 80 })))),
    bintray: [{ sh: [30, 60, 40], sx: [40] }, { outside: true }, { hole_head: 0 }],
    cardbox: [{ openingdirection: 'right' }, { fingerhole: 'deep' }, { openingdirection: 'right', add_lidtopper: true, outside: true }],
    dividertray: ['single', 'full', 'half', 'asymmetric'].flatMap((divider_style) =>
      [{}, { slot_angle: 15 }, { sy: [0, 50, 50, 0] }, { left_wall: false }, { outside: true, bottom: true }].map((o) => ({ divider_style, ...o })),
    ),
  };
  for (const [id, list] of Object.entries(variants)) {
    it(id, () => {
      const g = generators.find((d) => d.id === id)!;
      for (const o of list) {
        const model = g.build({ ...defaultValues(g), ...(o as object) });
        for (const p of model.parts) {
          const what = `${JSON.stringify(o)} ${p.label}`;
          expect(signedArea(p.outline), what).toBeGreaterThan(0);
          // every contour must close: stray open paths mean a broken outline
          expect(p.openPaths, what).toHaveLength(0);
        }
      }
    });
  }
});

describe('uneven height box', () => {
  it('places walls on their corners and lid walls on top of them', async () => {
    const { unevenHeightBox } = await import('../generators/unevenheightbox');
    const { placePoint } = await import('./part');
    const heights = [40, 60, 100, 80];
    const v = { ...defaultValues(unevenHeightBox), height0: 40, height1: 60, height2: 100, height3: 80, lid_height: 5 };
    const model = unevenHeightBox.build(v);
    const x = 100;
    const y = 100;
    const corners = [
      [0, 0],
      [x, 0],
      [x, y],
      [0, y],
    ];
    const labels = ['front', 'right', 'back', 'left'];
    const zLid = 100 + 5;
    labels.forEach((label, i) => {
      const len = i % 2 ? y : x;
      const wall = model.parts.find((p) => p.label === label)!;
      const a = placePoint(wall.placement!, 0, heights[i], 0);
      const b = placePoint(wall.placement!, len, heights[(i + 1) % 4], 0);
      expect([a.x, a.y, a.z]).toEqual([corners[i][0], corners[i][1], heights[i]].map((n) => expect.closeTo(n, 6)));
      expect([b.x, b.y, b.z]).toEqual([corners[(i + 1) % 4][0], corners[(i + 1) % 4][1], heights[(i + 1) % 4]].map((n) => expect.closeTo(n, 6)));
      // lid wall runs corner i+1 -> i, hanging down to the box wall's top
      const lid = model.parts.find((p) => p.label === `lid ${label}`);
      if (!lid) return;
      const j = (i + 1) % 4;
      const la = placePoint(lid.placement!, 0, zLid - heights[j], 0);
      const lb = placePoint(lid.placement!, len, zLid - heights[i], 0);
      expect([la.x, la.y, la.z]).toEqual([corners[j][0], corners[j][1], heights[j]].map((n) => expect.closeTo(n, 6)));
      expect([lb.x, lb.y, lb.z]).toEqual([corners[i][0], corners[i][1], heights[i]].map((n) => expect.closeTo(n, 6)));
    });
  });
});
