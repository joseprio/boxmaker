import { describe, expect, it } from 'vitest';
import { generators } from '../generators';
import { defaultValues } from '../generators/types';
import { partEdges } from './buildScene';

describe('part edges', () => {
  it('only draws contour segments on the faces (no triangulation slivers)', () => {
    for (const [id, o] of [
      ['universalbox', { vertical_edges: 'finger holes' }],
      ['typetray', {}],
    ] as const) {
      const g = generators.find((d) => d.id === id)!;
      for (const part of g.build({ ...defaultValues(g), ...o }).parts) {
        const key = (x: number, y: number) => `${x.toFixed(4)},${y.toFixed(4)}`;
        const allowed = new Set<string>();
        for (const c of [part.outline, ...part.holes]) {
          c.forEach((p, i) => {
            const q = c[(i + 1) % c.length];
            allowed.add(`${key(p.x, p.y)}|${key(q.x, q.y)}`);
          });
        }
        const pos = partEdges(part).getAttribute('position');
        for (let i = 0; i < pos.count; i += 2) {
          if (pos.getZ(i) !== 0 || pos.getZ(i + 1) !== 0) continue;
          const seg = `${key(pos.getX(i), pos.getY(i))}|${key(pos.getX(i + 1), pos.getY(i + 1))}`;
          expect(allowed.has(seg), `${id} ${part.label} ${seg}`).toBe(true);
        }
      }
    }
  });
});
