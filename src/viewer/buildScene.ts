import * as THREE from 'three';
import { bendStations, placePoint, type Part, type Placement } from '../engine/part';
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
  // flex cuts on both faces
  for (const c of part.cuts) {
    for (let i = 0; i + 1 < c.length; i++) {
      for (const z of [0, t]) pts.push(c[i].x, c[i].y, z, c[i + 1].x, c[i + 1].y, z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

type P3 = [number, number, number];

/** Split triangles (non-indexed positions) along the plane x = c. */
function splitTriangles(pos: number[], c: number): number[] {
  const out: number[] = [];
  const eps = 1e-9;
  for (let i = 0; i < pos.length; i += 9) {
    const tri: P3[] = [
      [pos[i], pos[i + 1], pos[i + 2]],
      [pos[i + 3], pos[i + 4], pos[i + 5]],
      [pos[i + 6], pos[i + 7], pos[i + 8]],
    ];
    const d = tri.map((p) => p[0] - c);
    if (Math.max(...d) <= eps || Math.min(...d) >= -eps) {
      out.push(...tri.flat());
      continue;
    }
    // clip the triangle into the two sides of the plane, keeping the winding
    for (const side of [-1, 1]) {
      const poly: P3[] = [];
      for (let k = 0; k < 3; k++) {
        const a = tri[k];
        const b = tri[(k + 1) % 3];
        const da = d[k] * side;
        const db = d[(k + 1) % 3] * side;
        if (da >= 0) poly.push(a);
        if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
          const f = da / (da - db);
          poly.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
        }
      }
      for (let k = 1; k + 1 < poly.length; k++) out.push(...poly[0], ...poly[k], ...poly[k + 1]);
    }
  }
  return out;
}

/** Split line segments (pairs of points) at the plane x = c. */
function splitSegments(pos: number[], c: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < pos.length; i += 6) {
    const a = pos.slice(i, i + 3);
    const b = pos.slice(i + 3, i + 6);
    const da = a[0] - c;
    const db = b[0] - c;
    if ((da > 1e-9 && db < -1e-9) || (da < -1e-9 && db > 1e-9)) {
      const f = da / (da - db);
      const m = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      out.push(...a, ...m, ...m, ...b);
    } else {
      out.push(...a, ...b);
    }
  }
  return out;
}

/** Subdivide a local-space geometry across the bends and map it into box space. */
function bendGeometry(geo: THREE.BufferGeometry, placement: Placement, triangles: boolean): THREE.BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo;
  let pos = Array.from(src.getAttribute('position').array as ArrayLike<number>);
  for (const c of bendStations(placement)) pos = triangles ? splitTriangles(pos, c) : splitSegments(pos, c);
  for (let i = 0; i < pos.length; i += 3) {
    const q = placePoint(placement, pos[i], pos[i + 1], pos[i + 2]);
    pos[i] = q.x;
    pos[i + 1] = q.y;
    pos[i + 2] = q.z;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (triangles) out.computeVertexNormals();
  return out;
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
    const bent = Boolean(part.placement.path?.length);
    const mesh = new THREE.Mesh(bent ? bendGeometry(geo, part.placement, true) : geo, mat);
    if (bent) geo.dispose();
    else mesh.applyMatrix4(placementMatrix(part.placement));
    mesh.userData.part = part;
    const edgeGeo = partEdges(part);
    const edges = new THREE.LineSegments(
      bent ? bendGeometry(edgeGeo, part.placement, false) : edgeGeo,
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
      // bent walls wrap around the model: they stay put
      if (part.placement?.path?.length) continue;
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
