import { describe, expect, it } from 'vitest';
import { kerfTest } from '../generators/kerftest';
import { defaultValues } from '../generators/types';
import { toSVG } from './export';
import { boundsOf } from './geometry';
import { cutContours } from './layout';
import { textStrokes, textWidth } from './text';

const build = (o: object = {}) => kerfTest.build({ ...defaultValues(kerfTest), ...o });
const width = (pts: Parameters<typeof boundsOf>[0]) => {
  const b = boundsOf(pts);
  return b.maxX - b.minX;
};

describe('kerf test', () => {
  it('makes a labelled tab and slot piece per burn value, cut with that burn', () => {
    const m = build({ count: 4, burn_start: 0.05, burn_step: 0.05 });
    const labels = ['0.05', '0.10', '0.15', '0.20'];
    expect(m.parts.map((p) => p.label)).toEqual(labels.flatMap((l) => [`tab ${l}`, `slots ${l}`]));
    labels.forEach((l, i) => {
      const tab = m.parts.find((p) => p.label === `tab ${l}`)!;
      const slots = m.parts.find((p) => p.label === `slots ${l}`)!;
      expect(tab.burn).toBeCloseTo(0.05 * (i + 1), 9);
      expect(slots.burn).toBeCloseTo(0.05 * (i + 1), 9);
      // the burn the model would otherwise use is ignored
      expect(width([cutContours(tab, 0).outline]) - width([tab.outline])).toBeCloseTo(2 * tab.burn!, 6);
      expect(tab.openPaths.length).toBeGreaterThan(0);
      expect(slots.openPaths.length).toBeGreaterThan(0);
      expect(tab.holes).toHaveLength(0);
      expect(slots.holes.length).toBeGreaterThan(0);
    });
  });

  it('has as many holes in the slot piece as fingers on the tab', () => {
    const m = build({ count: 1, length: 50, thickness: 3 });
    const [tab, slots] = m.parts;
    // fingers stick out above the tab's 20 mm body
    const tops = tab.outline.filter((q) => Math.abs(q.y - 23) < 1e-6);
    expect(tops.length / 2).toBe(slots.holes.length);
    expect(slots.holes).toHaveLength(3);
  });

  it('varies the finger play at a fixed burn', () => {
    const m = build({ vary: 'play', count: 3, play_start: 0, play_step: 0.05, burn: 0.12, thickness: 4 });
    expect(m.parts.every((p) => p.burn === undefined)).toBe(true);
    expect(m.burn).toBeCloseTo(0.12, 9);
    const holeW = (label: string) => width([m.parts.find((p) => p.label === label)!.holes[0]]);
    // play widens each hole by play x t
    expect(holeW('slots 0.05') - holeW('slots 0.00')).toBeCloseTo(0.2, 6);
    expect(holeW('slots 0.10') - holeW('slots 0.00')).toBeCloseTo(0.4, 6);
  });

  it('exports each pair with its own burn', () => {
    const svg = toSVG(build({ count: 2 }).parts, { burn: 0 });
    expect(svg).toContain('id="tab 0.050"');
    expect(svg).toContain('id="slots 0.075"');
  });

  it('rejects values below zero and pieces too small to label', () => {
    expect(() => build({ burn_start: 0.05, burn_step: -0.05, count: 3 })).toThrow();
    expect(() => build({ height: 8, thickness: 3 })).toThrow();
  });

  it('engraves a narrow decimal point', () => {
    expect(textStrokes('0.1', 10).length).toBe(3);
    expect(textWidth('0.1', 10)).toBeLessThan(textWidth('001', 10) - 2);
    const b = boundsOf(textStrokes('0.1', 10));
    expect(b.maxX - b.minX).toBeLessThanOrEqual(textWidth('0.1', 10));
  });
});
