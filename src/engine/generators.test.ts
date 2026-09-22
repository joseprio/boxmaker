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
