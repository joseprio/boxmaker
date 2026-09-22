import { Boxes, CompoundEdge, place, type EdgeSpec } from '../engine/boxes';
import type { Placement } from '../engine/part';
import { fingerJointGroup, fingerJointParams, materialGroup } from './common';
import { bool, finishModel, num, sections, type BoxModel, type GeneratorDef, type ParamValues } from './types';

type V3 = { x: number; y: number; z: number };
const add = (a: V3, b: V3, s = 1): V3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const X: V3 = { x: 1, y: 0, z: 0 };
const NY: V3 = { x: 0, y: -1, z: 0 };
const Z: V3 = { x: 0, y: 0, z: 1 };

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  let sx = sections(v, 'sx');
  let y = num(v, 'y');
  const h = num(v, 'h');
  const numShelves = Math.max(1, Math.round(num(v, 'num')));
  const front = num(v, 'front_wall_height');
  const angle = num(v, 'angle');
  const includeBack = bool(v, 'include_back');
  const includeFront = bool(v, 'include_front');
  const includeBottom = bool(v, 'include_bottom');
  const slopeTop = bool(v, 'slope_top');
  const dividerH = num(v, 'divider_wall_height');
  const bottomDistance = num(v, 'bottom_distance');
  const topDistance = num(v, 'top_distance');

  const hEdgeWidth = b.getEdge('h').startWidth();
  if (bool(v, 'outside')) {
    sx = b.adjustSizes(sx);
    y = b.adjustSize(y, includeBack, includeFront);
  }
  const x = sx.reduce((a, c) => a + c, 0) + t * (sx.length - 1);
  const a = (angle * Math.PI) / 180;
  const sl = (y - t * (Math.cos(a) + Math.abs(Math.sin(a))) - Math.max(0, Math.sin(a) * front)) / Math.cos(a);
  if (sl <= 0) throw new Error('Shelf depth too small for this angle');

  // shelf positions in side-wall coordinates (u: back -> front, v: up)
  const hs = (sl + t) * Math.sin(a) + Math.cos(a) * t;
  const hAvail = h - bottomDistance - topDistance;
  if (hAvail - Math.abs(hs) - 3 * t * (numShelves - 1) < 0) throw new Error('Need more height to fit shelves');
  const shelfPositions: Array<{ sx: number; sy: number; lx: number; ly: number }> = [];
  for (let i = 0; i < numShelves; i++) {
    let px = Math.abs(0.5 * t * Math.sin(a));
    let py = hs - Math.cos(a) * 0.5 * t + (i * (hAvail - Math.abs(hs))) / (numShelves - 0.5) + bottomDistance;
    if (a < 0) py += -Math.sin(a) * sl;
    const s = { sx: px, sy: py, lx: 0, ly: 0 };
    px += Math.cos(-a) * (sl + 0.5 * t) + Math.sin(a) * 0.5 * t;
    py += Math.sin(-a) * (sl + 0.5 * t) + Math.cos(a) * 0.5 * t;
    s.lx = px;
    s.ly = py;
    shelfPositions.push(s);
  }
  const sideHoles = () => {
    for (const s of shelfPositions) {
      b.fingerHolesAt(s.sx, s.sy, sl, -angle);
      b.fingerHolesAt(s.lx, s.ly, front, 90 - angle);
    }
  };

  // side walls ---------------------------------------------------------
  const sideLeft: Placement = { origin: { x: 0, y, z: 0 }, u: NY, v: Z };
  const sideRight: Placement = { origin: { x: x + t, y, z: 0 }, u: NY, v: Z };
  let frontH = h;
  if (slopeTop) {
    const topSegment = h / numShelves;
    let verticalCut = topSegment - front;
    let hyp = verticalCut / Math.sin(a);
    let horizontalCut = Math.sqrt(hyp * hyp - verticalCut * verticalCut);
    if (horizontalCut > y) {
      horizontalCut = y - 1;
      verticalCut = horizontalCut * Math.tan(a);
      hyp = Math.hypot(horizontalCut, verticalCut);
    }
    const top = y - horizontalCut;
    frontH = h - verticalCut;
    const le = includeBottom ? hEdgeWidth : 0;
    const edges: EdgeSpec[] = [includeBottom ? 'h' : 'e', 'e', includeFront ? 'f' : 'e', 'e', 'e', includeBack ? 'f' : 'e', 'e'];
    const borders = [y, 90, le, 0, frontH, 90 - angle, hyp, angle, top, 90, h, 0, le, 90];
    const cb = () => {
      // shelf positions are relative to the nominal bottom (above the finger hole band)
      b.moveTo(0, le);
      sideHoles();
    };
    for (const [label, p] of [
      ['left side', sideLeft],
      ['right side', sideRight],
    ] as const) {
      b.polygonWall(borders, edges, { label, callback: [cb], placement: { ...p, origin: { ...p.origin, z: -le } } });
    }
  } else {
    const edges: EdgeSpec[] = [includeBottom ? 'h' : 'e', includeFront ? 'f' : 'e', 'e', includeBack ? 'f' : 'e'];
    b.rectangularWall(y, h, edges, { label: 'left side', callback: [sideHoles], placement: sideLeft });
    b.rectangularWall(y, h, edges, { label: 'right side', callback: [sideHoles], placement: sideRight });
  }

  // shelves, lips and dividers -------------------------------------------
  const shelfV: V3 = { x: 0, y: Math.cos(a), z: Math.sin(a) }; // shelf local y: front -> back, up the slope
  const shelfW = cross(X, shelfV);
  const lipV: V3 = { x: 0, y: -Math.sin(a), z: Math.cos(a) }; // lip local y: perpendicular to the shelf, upwards
  const lipW = cross(X, lipV);
  const shelfHoles = () => {
    let px = -0.5 * t;
    for (const s of sx.slice(0, -1)) {
      px += s + t;
      b.fingerHolesAt(px, 0, sl, 90);
    }
  };
  const lipHoles = () => {
    const hh = Math.min(front, dividerH);
    let px = -0.5 * t;
    for (const s of sx.slice(0, -1)) {
      px += s + t;
      b.fingerHolesAt(px, 0, hh, 90);
    }
  };
  let dividerEdges: EdgeSpec[] = ['f', 'e', 'e', 'e'];
  if (front) {
    dividerEdges = ['f', 'f', 'e', 'e'];
    if (dividerH > front) dividerEdges = ['f', new CompoundEdge(b, ['f', 'e'], [front, dividerH - front]), 'e', 'e'];
  }

  shelfPositions.forEach((s, i) => {
    // side coords -> world: u (from the back) -> Y = y - u ; v -> Z
    const shelfFrontMid: V3 = { x: 0, y: y - (s.sx + sl * Math.cos(a)), z: s.sy - sl * Math.sin(a) };
    const shelfOrigin = add(shelfFrontMid, shelfW, -t / 2);
    if (front) {
      b.rectangularWall(x, sl, 'ffef', {
        label: `shelf ${i + 1}`,
        group: 'extra',
        callback: [shelfHoles],
        placement: { origin: shelfOrigin, u: X, v: shelfV },
      });
      const lipMid: V3 = { x: 0, y: y - s.lx, z: s.ly };
      b.rectangularWall(x, front, 'Ffef', {
        label: `front lip ${i + 1}`,
        group: 'extra',
        callback: [lipHoles],
        placement: { origin: add(lipMid, lipW, -t / 2), u: X, v: lipV },
      });
    } else {
      b.rectangularWall(x, sl, 'Efef', {
        label: `shelf ${i + 1}`,
        group: 'extra',
        callback: [shelfHoles],
        placement: { origin: shelfOrigin, u: X, v: shelfV },
      });
    }
    // dividers stand on the shelf top surface, back edge at the shelf's back edge
    const backTop = add(add(shelfOrigin, shelfV, sl), shelfW, t);
    let px = -0.5 * t;
    sx.slice(0, -1).forEach((sec, j) => {
      px += sec + t;
      const u: V3 = { x: 0, y: -shelfV.y, z: -shelfV.z };
      b.rectangularWall(sl, dividerH, dividerEdges, {
        label: `divider ${j + 1} for shelf ${i + 1}`,
        group: 'divider',
        placement: { origin: add(backTop, X, px + t / 2), u, v: lipV },
      });
    });
  });

  // back / front / bottom panels -------------------------------------------
  const bot = includeBottom ? 'h' : 'e';
  if (includeBack) b.rectangularWall(x, h, [bot, 'F', 'e', 'F'], { label: 'back wall', placement: place.wallXZ(0, y + t, 0) });
  if (includeFront) b.rectangularWall(x, frontH, [bot, 'F', 'e', 'F'], { label: 'front wall', placement: place.wallXZ(0, 0, 0) });
  if (includeBottom) {
    const e: EdgeSpec[] = [includeFront ? 'f' : 'e', 'f', includeBack ? 'f' : 'e', 'f'];
    b.rectangularWall(x, y, e, { label: 'bottom wall', placement: place.plateXY(0, 0, -t) });
  }
  return finishModel(b);
}

export const displayShelf: GeneratorDef = {
  id: 'displayshelf',
  name: 'Display Shelf',
  category: 'Shelf',
  description: 'Shelf with slanted floors and front lips - for spice jars, paints, cards or anything you want to see at a glance.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'sx', label: 'Sections x', type: 'sections', default: [400], help: 'Compartment widths per shelf, e.g. 100:100:100' },
        { id: 'y', label: 'Depth (y)', type: 'number', default: 100, unit: 'mm', min: 20, max: 1000, step: 1 },
        { id: 'h', label: 'Height (h)', type: 'number', default: 300, unit: 'mm', min: 20, max: 2000, step: 1 },
        { id: 'outside', label: 'Outside measurements', type: 'boolean', default: true },
        { id: 'num', label: 'Number of shelves', type: 'number', default: 3, min: 1, max: 12, step: 1 },
        { id: 'angle', label: 'Shelf angle', type: 'number', default: 30, unit: 'deg', min: -60, max: 60, step: 1, help: 'Angle of the floors (negative values slant backwards)' },
        { id: 'front_wall_height', label: 'Front lip height', type: 'number', default: 20, unit: 'mm', min: 0, max: 200, step: 1 },
        { id: 'divider_wall_height', label: 'Divider height', type: 'number', default: 20, unit: 'mm', min: 0, max: 300, step: 1 },
        { id: 'bottom_distance', label: 'Bottom distance', type: 'number', default: 0, unit: 'mm', min: 0, max: 500, step: 1, help: 'Height below the bottom shelf' },
        { id: 'top_distance', label: 'Top distance', type: 'number', default: 0, unit: 'mm', min: 0, max: 500, step: 1, help: 'Extra height above the top shelf' },
      ],
    },
    {
      id: 'panels',
      title: 'Panels',
      params: [
        { id: 'include_back', label: 'Back panel', type: 'boolean', default: false },
        { id: 'include_front', label: 'Front panel', type: 'boolean', default: false, help: 'For using the shelf backwards' },
        { id: 'include_bottom', label: 'Bottom panel', type: 'boolean', default: false },
        { id: 'slope_top', label: 'Sloped top', type: 'boolean', default: false, help: 'Slope the sides and the top by the front lip height' },
      ],
    },
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
