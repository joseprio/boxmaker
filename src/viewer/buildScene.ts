import * as THREE from 'three';
import { modelBounds } from '../engine/bounds3d';
import { boundsOf, type Vec2 } from '../engine/geometry';
import { bendStations, pathFrame, placePoint, type Part, type Placement } from '../engine/part';
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
export function partEdges(part: Part, thresholdDeg = 20, etchFaces?: number[]): THREE.BufferGeometry {
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
  // flex cuts on both faces, engraving on its face
  const lines = (paths: Vec2[][], faces: number[]) => {
    for (const c of paths) {
      for (let i = 0; i + 1 < c.length; i++) {
        for (const z of faces) pts.push(c[i].x, c[i].y, z, c[i + 1].x, c[i + 1].y, z);
      }
    }
  };
  lines(part.cuts, [0, t]);
  lines(part.openPaths, etchFaces ?? [0, t]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

/** First index in the sorted list with value > x. */
function upperBound(xs: number[], x: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Cut triangles (non-indexed xyz triples) at every station x they straddle.
 * Each triangle is clipped only against the stations inside its own x range,
 * slab by slab, so the work is proportional to the output.
 */
function splitTriangles(pos: ArrayLike<number>, stations: number[], out: number[]): void {
  const eps = 1e-9;
  let poly: number[] = [];
  let right: number[] = [];
  const fan = (pts: number[]) => {
    for (let k = 3; k + 3 < pts.length; k += 3) {
      out.push(pts[0], pts[1], pts[2], pts[k], pts[k + 1], pts[k + 2], pts[k + 3], pts[k + 4], pts[k + 5]);
    }
  };
  for (let i = 0; i < pos.length; i += 9) {
    const x0 = Math.min(pos[i], pos[i + 3], pos[i + 6]);
    const x1 = Math.max(pos[i], pos[i + 3], pos[i + 6]);
    let j = upperBound(stations, x0 + eps);
    if (j >= stations.length || stations[j] >= x1 - eps) {
      for (let k = 0; k < 9; k++) out.push(pos[i + k]);
      continue;
    }
    poly = [pos[i], pos[i + 1], pos[i + 2], pos[i + 3], pos[i + 4], pos[i + 5], pos[i + 6], pos[i + 7], pos[i + 8]];
    for (; j < stations.length && stations[j] < x1 - eps; j++) {
      const c = stations[j];
      const left: number[] = [];
      right = [];
      const n = poly.length / 3;
      for (let k = 0; k < n; k++) {
        const a = k * 3;
        const b = ((k + 1) % n) * 3;
        const da = poly[a] - c;
        const db = poly[b] - c;
        if (da <= 0) left.push(poly[a], poly[a + 1], poly[a + 2]);
        if (da >= 0) right.push(poly[a], poly[a + 1], poly[a + 2]);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const f = da / (da - db);
          const q = [poly[a] + (poly[b] - poly[a]) * f, poly[a + 1] + (poly[b + 1] - poly[a + 1]) * f, poly[a + 2] + (poly[b + 2] - poly[a + 2]) * f];
          left.push(q[0], q[1], q[2]);
          right.push(q[0], q[1], q[2]);
        }
      }
      if (left.length >= 9) fan(left);
      poly = right;
      if (poly.length < 9) break;
    }
    if (poly.length >= 9) fan(poly);
  }
}

/** Split line segments (pairs of xyz points) at every station they straddle. */
function splitSegments(pos: ArrayLike<number>, stations: number[], out: number[]): void {
  const eps = 1e-9;
  for (let i = 0; i < pos.length; i += 6) {
    let ax = pos[i];
    let ay = pos[i + 1];
    let az = pos[i + 2];
    const bx = pos[i + 3];
    const by = pos[i + 4];
    const bz = pos[i + 5];
    const lo = Math.min(ax, bx);
    const hi = Math.max(ax, bx);
    const cuts: number[] = [];
    for (let j = upperBound(stations, lo + eps); j < stations.length && stations[j] < hi - eps; j++) cuts.push(stations[j]);
    if (bx < ax) cuts.reverse();
    for (const c of cuts) {
      const f = (c - ax) / (bx - ax);
      const mx = c;
      const my = ay + (by - ay) * f;
      const mz = az + (bz - az) * f;
      out.push(ax, ay, az, mx, my, mz);
      ax = mx;
      ay = my;
      az = mz;
    }
    out.push(ax, ay, az, bx, by, bz);
  }
}

/** Subdivide a local-space geometry across the bends and map it into box space. */
function bendGeometry(geo: THREE.BufferGeometry, placement: Placement, triangles: boolean): THREE.BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const stations = [...new Set(bendStations(placement))].sort((a, b) => a - b);
  const pos: number[] = [];
  if (triangles) splitTriangles(src.getAttribute('position').array, stations, pos);
  else splitSegments(src.getAttribute('position').array, stations, pos);
  // most vertices sit on a few station lines: compute each x's frame once
  const frames = new Map<number, ReturnType<typeof pathFrame>>();
  const v = placement.v;
  const arr = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    let f = frames.get(pos[i]);
    if (!f) {
      f = pathFrame(placement, pos[i]);
      frames.set(pos[i], f);
    }
    const y = pos[i + 1];
    const z = pos[i + 2];
    arr[i] = f.pos.x + v.x * y + f.normal.x * z;
    arr[i + 1] = f.pos.y + v.y * y + f.normal.y * z;
    arr[i + 2] = f.pos.z + v.z * y + f.normal.z * z;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(arr, 3));
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
/** Local z of the face a part's engraving belongs on, judged by which face lies nearer the model centre. */
function engraveFaces(part: Part, centre: { x: number; y: number; z: number }): number[] | undefined {
  if (!part.engraveFace || !part.placement || !part.openPaths.length) return undefined;
  const b = boundsOf([part.outline]);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const d = (z: number) => {
    const q = placePoint(part.placement as Placement, cx, cy, z);
    return Math.hypot(q.x - centre.x, q.y - centre.y, q.z - centre.z);
  };
  const innerIsZero = d(0) < d(part.thickness);
  return [(part.engraveFace === 'inner') === innerIsZero ? 0 : part.thickness];
}

export function buildModelGroup(model: BoxModel, opts: SceneOptions = {}): THREE.Group {
  const mb = modelBounds(model.parts);
  const modelCentre = { x: (mb.min.x + mb.max.x) / 2, y: (mb.min.y + mb.max.y) / 2, z: (mb.min.z + mb.max.z) / 2 };
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
    const edgeGeo = partEdges(part, 20, engraveFaces(part, modelCentre));
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
  const size = new THREE.Vector3();
  box.getSize(size);
  const reach = Math.max(size.x, size.y, size.z) * 0.5;
  for (const mesh of meshes) {
    const part = mesh.userData.part as Part;
    mesh.userData.basePosition = mesh.position.clone();
    // bent walls wrap around the model: they stay put
    if (part.placement?.path?.length) continue;
    const m = placementMatrix(part.placement as Placement);
    const normal = new THREE.Vector3().setFromMatrixColumn(m, 2);
    // move parts outward from the model centre along their normal direction
    const partCenter = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    const sign = partCenter.clone().sub(center).dot(normal) >= 0 ? 1 : -1;
    mesh.userData.explodeOffset = normal.multiplyScalar(sign * reach);
  }
  group.userData.meshes = meshes;
  applyExplode(group, explode);

  group.position.sub(center);
  // box space is Z-up; three.js is Y-up
  const wrapper = new THREE.Group();
  wrapper.add(group);
  wrapper.rotation.x = -Math.PI / 2;
  wrapper.userData.inner = group;
  return wrapper;
}

/** Move the parts of a built model apart (0..1) without rebuilding any geometry. */
export function applyExplode(obj: THREE.Object3D, explode: number): void {
  const group = (obj.userData.inner as THREE.Group | undefined) ?? obj;
  for (const mesh of (group.userData.meshes as THREE.Mesh[] | undefined) ?? []) {
    const base = mesh.userData.basePosition as THREE.Vector3;
    const off = mesh.userData.explodeOffset as THREE.Vector3 | undefined;
    mesh.position.copy(base);
    if (off && explode > 0) mesh.position.addScaledVector(off, explode);
  }
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
