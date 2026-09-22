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
