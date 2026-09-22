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

