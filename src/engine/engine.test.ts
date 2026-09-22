import { describe, expect, it } from 'vitest';
import { closedBox } from '../generators/closedbox';
import { defaultValues } from '../generators/types';
import { boundsOf, signedArea } from './geometry';

describe('ClosedBox', () => {
  it('produces six closed parts with sane bounds', () => {
    const model = closedBox.build(defaultValues(closedBox));
    expect(model.parts).toHaveLength(6);
    for (const p of model.parts) {
      expect(p.outline.length).toBeGreaterThan(4);
      expect(signedArea(p.outline)).toBeGreaterThan(0);
      expect(p.holes).toHaveLength(0);
    }
    const wall = model.parts[0];
    const b = boundsOf([wall.outline]);
    // FFFF wall: 100 + 2*3 in both directions
    expect(b.maxX - b.minX).toBeCloseTo(106, 5);
    expect(b.maxY - b.minY).toBeCloseTo(106, 5);
    expect(b.minX).toBeCloseTo(-3, 5);
    expect(b.minY).toBeCloseTo(-3, 5);
    const top = model.parts[4];
    const bt = boundsOf([top.outline]);
    expect(bt.maxX - bt.minX).toBeCloseTo(106, 5);
    expect(bt.minX).toBeCloseTo(-3, 5);
    const side = model.parts[2]; // FfFf
    const bs = boundsOf([side.outline]);
    expect(bs.minX).toBeCloseTo(-3, 5); // fingers stick out
    expect(bs.maxX).toBeCloseTo(103, 5);
    expect(bs.minY).toBeCloseTo(-3, 5); // F edge band
  });
});
