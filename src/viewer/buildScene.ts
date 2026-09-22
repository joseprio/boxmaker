import * as THREE from 'three';
import type { Part, Placement } from '../engine/part';
import type { BoxModel } from '../generators/types';

export const GROUP_COLORS: Record<string, string> = {
  box: '#d9b27c',
  lid: '#c79a5c',
  divider: '#e2c493',
  handle: '#b98a4f',
  extra: '#cfa871',
};

export function partShape(part: Part): THREE.Shape {
  const shape = new THREE.Shape(part.outline.map((p) => new THREE.Vector2(p.x, p.y)));
  for (const h of part.holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))));
  return shape;
}

export function partGeometry(part: Part): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(partShape(part), {
    depth: part.thickness,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.computeVertexNormals();
  return geo;
}

/**
 * Outline edges of an extruded part, built from its contours rather than the
 * triangulation: the triangulated faces contain zero-area slivers wherever
 * holes line up, which EdgesGeometry would draw as stray lines.
 */
export function partEdges(part: Part, thresholdDeg = 20): THREE.BufferGeometry {
  const t = part.thickness;
  const cosThreshold = Math.cos((thresholdDeg * Math.PI) / 180);
  const pts: number[] = [];
  for (const c of [part.outline, ...part.holes]) {
    const n = c.length;
    for (let i = 0; i < n; i++) {
      const prev = c[(i + n - 1) % n];
      const p = c[i];
      const q = c[(i + 1) % n];
      // contour on both faces
      pts.push(p.x, p.y, 0, q.x, q.y, 0, p.x, p.y, t, q.x, q.y, t);
      // side edge only at real corners, not along flattened arcs
      const ax = p.x - prev.x;
      const ay = p.y - prev.y;
      const bx = q.x - p.x;
      const by = q.y - p.y;
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      if (la > 0 && lb > 0 && (ax * bx + ay * by) / (la * lb) < cosThreshold) pts.push(p.x, p.y, 0, p.x, p.y, t);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

export function placementMatrix(p: Placement): THREE.Matrix4 {
  const u = new THREE.Vector3(p.u.x, p.u.y, p.u.z).normalize();
  const v = new THREE.Vector3(p.v.x, p.v.y, p.v.z).normalize();
  const w = new THREE.Vector3().crossVectors(u, v).normalize();
  const m = new THREE.Matrix4();
  m.makeBasis(u, v, w);
  m.setPosition(p.origin.x, p.origin.y, p.origin.z);
  return m;
}

export interface SceneOptions {
  explode?: number; // 0..1
  wireframe?: boolean;
}

/** Build a THREE.Group for the model in box space (Z up), centred at the origin. */
export function buildModelGroup(model: BoxModel, opts: SceneOptions = {}): THREE.Group {
  const group = new THREE.Group();
  const explode = opts.explode ?? 0;
  const center = new THREE.Vector3();
  const box = new THREE.Box3();
  const meshes: THREE.Mesh[] = [];

  for (const part of model.parts) {
    if (!part.placement) continue;
    const geo = partGeometry(part);
    const color = GROUP_COLORS[part.group] ?? GROUP_COLORS.box;
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.75,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.applyMatrix4(placementMatrix(part.placement));
    mesh.userData.part = part;
    const edges = new THREE.LineSegments(
      partEdges(part),
      new THREE.LineBasicMaterial({ color: '#4a3418', transparent: true, opacity: 0.55 }),
    );
    mesh.add(edges);
    meshes.push(mesh);
    group.add(mesh);
    box.expandByObject(mesh);
  }

  box.getCenter(center);
  if (explode > 0) {
    const size = new THREE.Vector3();
    box.getSize(size);
    const amount = explode * Math.max(size.x, size.y, size.z) * 0.5;
    for (const mesh of meshes) {
      const part = mesh.userData.part as Part;
      const m = placementMatrix(part.placement as Placement);
      const normal = new THREE.Vector3().setFromMatrixColumn(m, 2);
      // move parts outward from the model centre along their normal direction
      const partCenter = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
      const dir = partCenter.clone().sub(center);
      const sign = dir.dot(normal) >= 0 ? 1 : -1;
      mesh.position.add(normal.multiplyScalar(sign * amount));
    }
  }

  group.position.sub(center);
  // box space is Z-up; three.js is Y-up
  const wrapper = new THREE.Group();
  wrapper.add(group);
  wrapper.rotation.x = -Math.PI / 2;
  return wrapper;
}

export function disposeGroup(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    }
  });
}

export function modelRadius(model: BoxModel): number {
  const { x, y, z } = model.size;
  return Math.sqrt(x * x + y * y + z * z) / 2;
}
