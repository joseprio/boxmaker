import { describe, expect, it } from 'vitest';
import { magazineFile } from '../generators/magazinefile';
import { penHolderBox } from '../generators/penholderbox';
import { defaultValues, type GeneratorDef } from '../generators/types';
import { modelBounds } from './bounds3d';
import { boundsOf, signedArea } from './geometry';
import { placePoint } from './part';

const build = (g: GeneratorDef, o: object = {}) => g.build({ ...defaultValues(g), ...o });
const clean = (parts: ReturnType<GeneratorDef['build']>['parts']) => {
  for (const p of parts) {
    expect(signedArea(p.outline), p.label).toBeGreaterThan(0);
    expect(p.openPaths.every((q) => q.length > 1), p.label).toBe(true);
  }
};

describe('pen holder box', () => {
  for (const o of [{}, { bottom_edge: 'F' }, { bottom_edge: 's', floor_thickness: 5 }, { bottom_edge: 'e', cap_rings: false }, { outside: true, nx: 3, ny: 2 }]) {
    it(JSON.stringify(o), () => {
      const m = build(penHolderBox, o);
      clean(m.parts);
      const nx = (o as { nx?: number }).nx ?? 4;
      const ny = (o as { ny?: number }).ny ?? 4;
      const plates = m.parts.filter((p) => p.label.startsWith('plate'));
      expect(plates).toHaveLength(2);
      const front = m.parts.find((p) => p.label === 'front')!;
      // the finger holes in the walls, by height (world z of their centres)
      const holeZ = [...new Set(front.holes.map((hl) => {
        const b = boundsOf([hl]);
        return Math.round(placePoint(front.placement!, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0).z * 1e3) / 1e3;
      }))].filter((z) => z > 1);
      for (const plate of plates) {
        expect(plate.holes).toHaveLength(nx * ny);
        expect(plate.openPaths).toHaveLength((o as { cap_rings?: boolean }).cap_rings === false ? 0 : nx * ny);
        const b = modelBounds([plate]);
        // each plate sits centred on a row of the walls' finger holes
        expect(holeZ.some((z) => Math.abs(z - (b.min.z + b.max.z) / 2) < 1e-3)).toBe(true);
      }
    });
  }

  it('refuses a grid that does not fit', () => {
    expect(() => build(penHolderBox, { nx: 8 })).toThrow(/does not fit/);
  });
});

describe('magazine file', () => {
  for (const o of [{}, { hi: 250 }, { y: 80 }, { top_edge: 'G', mount_num: 2 }, { outside: true, floor_thickness: 6 }]) {
    it(JSON.stringify(o), () => {
      const m = build(magazineFile, o);
      clean(m.parts);
      const out = (o as { outside?: boolean }).outside;
      const h = out ? 300 - 6 : 300;
      const hi = (o as { hi?: number }).hi ?? h / 2;
      for (const label of ['left side', 'right side']) {
        const side = m.parts.find((p) => p.label === label)!;
        const pts = side.outline.map((q) => placePoint(side.placement!, q.x, q.y, 0));
        // tall at the back, low at the front
        const depth = ((o as { y?: number }).y ?? 200) - (out ? 6 : 0);
        const backTop = Math.max(...pts.filter((q) => q.y > depth - 1).map((q) => q.z));
        const frontTop = Math.max(...pts.filter((q) => q.y < 1).map((q) => q.z));
        expect(backTop).toBeCloseTo(h, 6);
        expect(frontTop).toBeCloseTo(hi, 6);
      }
      if ((o as { top_edge?: string }).top_edge === 'G') {
        expect(m.parts.find((p) => p.label === 'back')!.holes.length).toBe(2);
      }
      if (out) {
        const b = modelBounds(m.parts);
        expect(b.max.z - b.min.z).toBeCloseTo(300, 6);
      }
    });
  }
});
