import { describe, expect, it } from 'vitest';
import { hingeCardBox } from '../generators/hingecardbox';
import { defaultValues } from '../generators/types';
import { toDXF, toSVG } from './export';
import { boundsOf } from './geometry';
import { placePoint } from './part';
import { outlineStrokes, textStrokes } from './text';

const build = (o: object) => hingeCardBox.build({ ...defaultValues(hingeCardBox), ...o });

describe('engraving text', () => {
  it('has every digit, centred on the origin', () => {
    const s = textStrokes('0123456789', 10);
    expect(s.length).toBeGreaterThanOrEqual(10);
    const b = boundsOf(s);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(0, 6);
    expect(b.maxY - b.minY).toBeLessThanOrEqual(10);
  });

  it('merges outlines into closed, non-overlapping contours with holes', () => {
    // 0, 6, 8 and 9 have counters: 1 outer + 1 hole each for 0/6/9, 1 + 2 for 8
    const rings = outlineStrokes(textStrokes('8', 20), 2);
    expect(rings).toHaveLength(3);
    for (const r of rings) expect(Math.hypot(r[0].x - r[r.length - 1].x, r[0].y - r[r.length - 1].y)).toBeLessThan(1e-9);
  });
});

describe('hinge card box numbers', () => {
  for (const num_style of ['stroke', 'outline']) {
    for (const num_front of ['box', 'lid']) {
      it(`${num_style} on the lid tops and ${num_front} front`, () => {
        const m = build({ num_top: true, num_front, num_style, num_start: 7 });
        const tops = m.parts.filter((p) => /^lid \d+ top$/.test(p.label));
        const fronts = num_front === 'box' ? m.parts.filter((p) => p.label === 'front') : m.parts.filter((p) => /^lid \d+ front$/.test(p.label));
        for (const p of [...tops, ...fronts]) {
          expect(p.openPaths.length, p.label).toBeGreaterThan(0);
          const face = boundsOf([p.outline]);
          const e = boundsOf(p.openPaths);
          expect(e.minX).toBeGreaterThan(face.minX);
          expect(e.maxX).toBeLessThan(face.maxX);
          expect(e.minY).toBeGreaterThan(face.minY);
          expect(e.maxY).toBeLessThan(face.maxY);
        }
        // nothing else gets engraved
        const others = m.parts.filter((p) => ![...tops, ...fronts].includes(p));
        for (const p of others) expect(p.openPaths, p.label).toHaveLength(0);

        const svg = toSVG(m.parts, { burn: 0.1 });
        expect(svg).toContain('<g id="engrave"');
        expect(toDXF(m.parts, { burn: 0.1 })).toContain('ENGRAVE');
      });
    }
  }

  it('reads the right way round from outside', () => {
    // the first number is a 7: its top bar runs left to right along the top
    const m = build({ num_top: true, num_front: 'box', num_start: 7 });
    const bar = (label: string) => {
      const p = m.parts.find((q) => q.label === label)!;
      const [a, b] = p.openPaths[0].map((q) => placePoint(p.placement!, q.x, q.y, p.thickness));
      const all = p.openPaths.flat().map((q) => placePoint(p.placement!, q.x, q.y, p.thickness));
      return { a, b, all };
    };
    // box front, seen from the front (looking towards +Y): X runs left to right, Z up
    const f = bar('front');
    expect(f.b.x).toBeGreaterThan(f.a.x);
    expect(f.a.z).toBeCloseTo(Math.max(...f.all.map((q) => q.z)), 6);
    expect(f.a.y).toBeLessThan(0); // engraved on the outer face
    // lid top, seen from above with the front towards you: X left to right, the top of the digit at the back
    const t = bar('lid 1 top');
    expect(t.b.x).toBeGreaterThan(t.a.x);
    expect(t.a.y).toBeCloseTo(Math.max(...t.all.map((q) => q.y)), 6);
    expect(t.a.z).toBeGreaterThan(92 + 15); // on the outer (upper) face
  });
});

describe('engraved rows', () => {
  const gens = ['universalbox', 'closedbox', 'openbox'];
  const walls: Record<string, Record<string, string[]>> = {
    universalbox: { sides: ['left', 'right'], frontback: ['front', 'back'] },
    openbox: { sides: ['left', 'right'], frontback: ['front', 'back'] },
    closedbox: { sides: ['Wall 2', 'Wall 4'], frontback: ['Wall 1', 'Wall 3'] },
  };
  for (const id of gens) {
    for (const rows_sides of ['sides', 'frontback']) {
      for (const rows_dir of ['vertical', 'horizontal']) {
        it(`${id}: ${rows_sides} ${rows_dir}`, async () => {
          const { generators } = await import('../generators');
          const g = generators.find((d) => d.id === id)!;
          const w = 1.5;
          const s = 10.4;
          const m = 5;
          const model = g.build({ ...defaultValues(g), rows_sides, rows_dir, rows_width: w, rows_spacing: s, rows_margin: m, rows_inset: 2 });
          const chosen = walls[id][rows_sides];
          for (const p of model.parts) {
            if (!chosen.includes(p.label)) {
              expect(p.openPaths, p.label).toHaveLength(0);
              continue;
            }
            expect(p.engraveFace).toBe('inner');
            // 100 mm walls: floor((100 - 2*5 + 10.4) / 11.9) = 8 bands, centred
            expect(p.openPaths, p.label).toHaveLength(8);
            const e = boundsOf(p.openPaths);
            const [lo, hi] = rows_dir === 'vertical' ? [e.minX, e.maxX] : [e.minY, e.maxY];
            const span = 8 * w + 7 * s;
            expect(hi - lo).toBeCloseTo(span, 6);
            expect((lo + hi) / 2).toBeCloseTo(50, 6);
            const [c0, c1] = rows_dir === 'vertical' ? [e.minY, e.maxY] : [e.minX, e.maxX];
            expect(c0).toBeCloseTo(2, 6);
            expect(c1).toBeCloseTo(98, 6);
            // closed bands for fill engraving
            for (const band of p.openPaths) expect(band[0]).toEqual(band[band.length - 1]);
          }
        });
      }
    }
  }

  it('gives single lines at width 0 and nothing when switched off', async () => {
    const { universalBox } = await import('../generators/universalbox');
    const lines = universalBox.build({ ...defaultValues(universalBox), rows_sides: 'sides', rows_width: 0 });
    const left = lines.parts.find((p) => p.label === 'left')!;
    expect(left.openPaths.every((l) => l.length === 2)).toBe(true);
    const off = universalBox.build(defaultValues(universalBox));
    expect(off.parts.every((p) => p.openPaths.length === 0)).toBe(true);
  });
});
