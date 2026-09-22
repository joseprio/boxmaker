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

describe('bent parts', () => {
  it('subdivide only where they bend and stay on the model', async () => {
    const THREE = await import('three');
    const { buildModelGroup } = await import('./buildScene');
    const { modelBounds } = await import('../engine/bounds3d');
    const g = generators.find((d) => d.id === 'roundedbox')!;
    const model = g.build(defaultValues(g));
    const b = modelBounds(model.parts);
    let tris = 0;
    const group = buildModelGroup(model);
    group.updateMatrixWorld(true);
    const inner = group.userData.inner as InstanceType<typeof THREE.Group>;
    const toBox = new THREE.Matrix4().copy(inner.matrixWorld).invert();
    const v = new THREE.Vector3();
    group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.getAttribute('position');
      tris += pos.count / 3;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(toBox);
        expect(v.x).toBeGreaterThan(b.min.x - 1e-3);
        expect(v.x).toBeLessThan(b.max.x + 1e-3);
        expect(v.y).toBeGreaterThan(b.min.y - 1e-3);
        expect(v.y).toBeLessThan(b.max.y + 1e-3);
      }
    });
    // was ~170k triangles before cutting each triangle only at the bends it crosses
    expect(tris).toBeLessThan(40000);
  });
});
