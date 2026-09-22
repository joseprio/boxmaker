import { Boxes, place } from '../engine/boxes';
import { CabinetHingeEdge } from '../engine/edges';
import { rotatePlacement, type Placement } from '../engine/part';
import { CabinetHingeSettings } from '../engine/settings';
import { dimParam, fingerJointGroup, fingerJointParams, materialGroup, outsideParam } from './common';
import { lidOpenParam } from './integratedhingebox';
import { bool, finishModel, num, type BoxModel, type GeneratorDef, type ParamGroup, type ParamValues } from './types';

const X = { x: 1, y: 0, z: 0 };
const Y = { x: 0, y: 1, z: 0 };
const Z = { x: 0, y: 0, z: 1 };
const neg = (p: { x: number; y: number; z: number }) => ({ x: -p.x, y: -p.y, z: -p.z });

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  let x = num(v, 'x');
  let y = num(v, 'y');
  let h = num(v, 'h');
  const hl = num(v, 'lidheight');
  let s = num(v, 'splitlid');
  if (bool(v, 'outside')) {
    x = b.adjustSize(x);
    y = b.adjustSize(y);
    h = b.adjustSize(h);
    s = Math.max(0, s - t);
  }
  if (s >= y || s < 0) s = 0;

  const hs = cabinetHingeSettings(t, v);
  addCabinetHinges(b, hs);
  const open = num(v, 'lid_open');

  // box space: X = width, Y = 0 at the front .. y at the back, Z up.
  // Hinge pins run along X on the outer face of the hinged wall, level with its top.
  const backAxis = { x: 0, y: y + t, z: h };
  const frontAxis = { x: 0, y: -t, z: h };
  const back = (p: Placement) => rotatePlacement(p, backAxis, X, -open);
  const front = (p: Placement) => rotatePlacement(p, frontAxis, X, open);

  // box ---------------------------------------------------------------------
  b.rectangularWall(x, h, s ? 'FFuF' : 'FFeF', { label: 'front', placement: place.wallXZ(0, 0, 0) });
  b.rectangularWall(y, h, 'Ffef', { label: 'left side', placement: place.wallYZ(-t, 0, 0) });
  b.rectangularWall(y, h, 'Ffef', { label: 'right side', placement: place.wallYZ(x, 0, 0) });
  b.rectangularWall(x, h, 'FFuF', { label: 'back', placement: place.wallXZ(0, y + t, 0) });
  b.rectangularWall(x, y, 'ffff', { label: 'bottom', placement: place.plateXY(0, 0, -t) });

  // lid ---------------------------------------------------------------------
  // the hinged lid walls run from X = x towards 0, like the hinge edges on the box
  b.rectangularWall(x, hl, 'UFFF', { label: 'lid back', group: 'lid', placement: back({ origin: { x, y, z: h }, u: neg(X), v: Z }) });
  if (s) {
    // split lid: a front flap (depth s) hinged on the front wall, the rest on the back
    b.rectangularWall(s, hl, 'eeFf', { label: 'lid front left', group: 'lid', placement: front(place.wallYZ(-t, 0, h)) });
    b.rectangularWall(s, hl, 'eeFf', { label: 'lid front right', group: 'lid', placement: front(place.wallYZ(x, 0, h)) });
    b.rectangularWall(y - s, hl, 'efFe', { label: 'lid back left', group: 'lid', placement: back(place.wallYZ(-t, s, h)) });
    b.rectangularWall(y - s, hl, 'efFe', { label: 'lid back right', group: 'lid', placement: back(place.wallYZ(x, s, h)) });
    b.rectangularWall(x, hl, 'UFFF', { label: 'lid front', group: 'lid', placement: front({ origin: { x, y: -t, z: h }, u: neg(X), v: Z }) });
    b.rectangularWall(x, s, 'ffef', { label: 'lid top front', group: 'lid', placement: front(place.plateXY(0, 0, h + hl)) });
    b.rectangularWall(x, y - s, 'efff', { label: 'lid top back', group: 'lid', placement: back(place.plateXY(0, s, h + hl)) });
  } else {
    b.rectangularWall(y, hl, 'efFf', { label: 'lid left side', group: 'lid', placement: back(place.wallYZ(-t, 0, h)) });
    b.rectangularWall(y, hl, 'efFf', { label: 'lid right side', group: 'lid', placement: back(place.wallYZ(x, 0, h)) });
    b.rectangularWall(x, hl, 'eFFF', { label: 'lid front', group: 'lid', placement: back(place.wallXZ(0, 0, h)) });
    b.rectangularWall(x, y, 'ffff', { label: 'lid top', group: 'lid', placement: back(place.plateXY(0, 0, h + hl)) });
  }

  // hinge eyes ----------------------------------------------------------------
  // the hinge edges run from X = x towards 0
  addCabinetHingeEyes(b, hs, { edgeStartX: x, length: x, axisY: y + t, z: h, inward: 1, turn: back, label: 'back hinge' });
  if (s) addCabinetHingeEyes(b, hs, { edgeStartX: x, length: x, axisY: -t, z: h, inward: -1, turn: front, label: 'front hinge' });
  return finishModel(b);
}

export interface HingeEyeOptions {
  /** X where the hinge edge starts; it runs towards -X for `length` */
  edgeStartX: number;
  length: number;
  /** Y of the hinged wall's outer face (the pin axis) */
  axisY: number;
  /** Z of the pin axis (top of the hinged wall) */
  z: number;
  /** +1 when the box lies at lower Y than the axis (a back wall), -1 for a front wall */
  inward: number;
  /** placement transform for the eyes that move with the lid */
  turn: (p: Placement) => Placement;
  label: string;
}

/**
 * Cabinet hinge eyes for one 'u'/'U' edge pair: box eyes hang into the wall,
 * lid eyes stand up into the lid, every bore on the pin axis.
 */
export function addCabinetHingeEyes(b: Boxes, hs: CabinetHingeSettings, o: HingeEyeOptions): void {
  const t = b.thickness;
  const e = hs.eye;
  // Eye outline: bore at (0, e) on the pin axis, local x = 0 on the wall's outer
  // face with the body at negative x (inside), local y along the wall away from the pin.
  const drawEye = () => {
    b.hole(0, e, 0, hs.bore);
    const corner: Array<number | [number, number]> =
      e <= 2 * t ? [2 * e, [90, 2 * t]] : (() => {
        const a = Math.asin((2 * t) / e);
        const ang = (a * 180) / Math.PI;
        return [e * (1 - Math.cos(a)) + 2 * t, -90 + ang, 0, [180 - ang, e] as [number, number]];
      })();
    b.polyline(0, [180, e], 0, -90, t, 90, t, -90, t, -90, t, 90, t, 90, t, [90, t], ...corner);
  };
  let k = 0;
  for (const start of hs.layout(o.length)) {
    for (let i = 0; i < hs.eyes_per_hinge; i++) {
      const onLid = i % 2 === 1;
      const cx = o.edgeStartX - start - hs.eyeCentre(i);
      const u = o.inward > 0 ? Y : neg(Y);
      const vv = onLid ? Z : neg(Z);
      // extrusion is along u x v: start on whichever side keeps the eye centred on cx
      const w = u.y * vv.z; // x component of u x v (u along Y, v along Z)
      const p: Placement = { origin: { x: cx - (w * t) / 2, y: o.axisY, z: o.z + (onLid ? -e : e) }, u, v: vv };
      b.freePart(drawEye, { label: `${o.label} eye ${++k}`, group: onLid ? 'lid' : 'handle', placement: onLid ? o.turn(p) : p });
    }
  }
}

export function cabinetHingeSettings(t: number, v: ParamValues): CabinetHingeSettings {
  return new CabinetHingeSettings(t, {
    bore: num(v, 'hinge_bore'),
    eyes_per_hinge: num(v, 'hinge_eyes'),
    hinges: num(v, 'hinge_count'),
    eye: num(v, 'hinge_eye'),
    play: num(v, 'hinge_play'),
    spacing: num(v, 'hinge_spacing'),
  });
}

/** Register the cabinet hinge edges u (box) and U (lid). */
export function addCabinetHinges(b: Boxes, hs: CabinetHingeSettings): void {
  b.addEdge(new CabinetHingeEdge(b, hs));
  b.addEdge(new CabinetHingeEdge(b, hs, true));
}

export const cabinetHingeGroup: ParamGroup = {
  id: 'hinge',
  title: 'Hinges',
  collapsed: true,
  params: [
    { id: 'hinge_count', label: 'Hinges', type: 'number', default: 2, min: 1, max: 10, step: 1, help: 'Per hinged edge (fewer if the edge is too short)' },
    { id: 'hinge_eyes', label: 'Eyes per hinge', type: 'number', default: 5, min: 2, max: 15, step: 1 },
    { id: 'hinge_bore', label: 'Pin diameter', type: 'number', default: 3.2, unit: 'mm', min: 0.5, max: 20, step: 0.1 },
    { id: 'hinge_eye', label: 'Eye radius', type: 'number', default: 1.5, unit: 'x t', min: 0.5, max: 5, step: 0.1 },
    { id: 'hinge_play', label: 'Play', type: 'number', default: 0.05, unit: 'x t', min: 0, max: 1, step: 0.01 },
    { id: 'hinge_spacing', label: 'Spacing', type: 'number', default: 2, unit: 'x t', min: 0, max: 10, step: 0.5, help: 'Room around each hinge (multiples of thickness)' },
  ],
};

export const hingeBox: GeneratorDef = {
  id: 'hingebox',
  name: 'Hinge Box',
  category: 'Box',
  description:
    'Box with a lid on cabinet hinges: laser-cut eyes on a metal pin (a piece of nail does fine). The lid can be split to open from the middle.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        dimParam('x', 'Width (x)', 100, 'Inner width'),
        dimParam('y', 'Depth (y)', 100, 'Inner depth'),
        dimParam('h', 'Height (h)', 100, 'Inner height of the box'),
        { id: 'lidheight', label: 'Lid height', type: 'number', default: 20, unit: 'mm', min: 5, max: 500, step: 1 },
        { id: 'splitlid', label: 'Split lid', type: 'number', default: 0, unit: 'mm', min: 0, max: 2000, step: 1, help: 'Depth of a front flap hinged on the front wall (0 for a single lid)' },
        outsideParam,
        lidOpenParam,
      ],
    },
    cabinetHingeGroup,
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
