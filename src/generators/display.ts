import { Boxes } from '../engine/boxes';
import { materialGroup } from './common';
import { finishModel, num, type BoxModel, type GeneratorDef, type ParamValues } from './types';

const rad = (d: number) => (d * Math.PI) / 180;

// 3D preview only: the back leans back this much, propped up by the shelf, which runs
// from the table behind it up through the slot; this share of the shelf is behind the back
const LEAN = 10;
const BEHIND = 0.6;

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn') });
  const x = num(v, 'x');
  const h = num(v, 'h');
  const r = num(v, 'radius');
  const a = num(v, 'angle');
  if (2 * r >= 0.7 * x) throw new Error('The corner radius is too large for the width');
  const oh = 1.2 * h - 2 * r;
  if (oh <= 0) throw new Error('The corner radius is too large for the height');

  const lean = rad(LEAN);
  const back = { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: Math.sin(lean), z: Math.cos(lean) } };
  // back's normal, u x v, points forward; centre the board on its plane
  const bn = { y: -Math.cos(lean), z: Math.sin(lean) };
  const slot = { y: 0.2 * h * back.v.y, z: 0.2 * h * back.v.z };
  const shelfDir = Math.asin(Math.min(1, (slot.z - t / 2) / (BEHIND * x)));

  // the shelf the leaflets stand on; it goes through the slot in the back
  const sv = { x: 0, y: -Math.cos(shelfDir), z: Math.sin(shelfDir) };
  const sn = { y: -sv.z, z: sv.y };
  b.roundedPlate(0.7 * x, x, r, 'e', {
    label: 'shelf',
    extendCorners: false,
    placement: {
      origin: { x: -0.35 * x, y: slot.y - sv.y * BEHIND * x - (sn.y * t) / 2, z: slot.z - sv.z * BEHIND * x - (sn.z * t) / 2 },
      u: { x: 1, y: 0, z: 0 },
      v: sv,
    },
  });

  // the back, wider at the top for angle > 0; local (0,0) is left of its bottom edge
  const dx = Math.sin(rad(a)) * oh;
  b.freePart(
    () => {
      b.moveTo(dx);
      b.rectangularHole(x / 2, h * 0.2, 0.7 * x + 0.1 * t, 1.3 * t);
      b.moveTo(r);
      b.polyline(x - 2 * r, [90 - a, r], oh, [90 + a, r], x - 2 * r + 2 * dx, [90 + a, r], oh, [90 - a, r]);
    },
    {
      label: 'back',
      placement: { origin: { x: -dx - x / 2, y: (-bn.y * t) / 2, z: (-bn.z * t) / 2 }, ...back },
    },
  );
  return finishModel(b);
}

export const display: GeneratorDef = {
  id: 'display',
  name: 'Display',
  category: 'Misc',
  description: 'Stand for flyers or leaflets: a rounded back with a slot, and a shelf pushed through it that props it up.',
  groups: [
    {
      id: 'display',
      title: 'Display',
      params: [
        { id: 'x', label: 'Width', type: 'number', default: 150, unit: 'mm', min: 30, max: 1000, step: 1, help: 'Width of the back; the shelf is 0.7 × this wide and this deep' },
        { id: 'h', label: 'Height', type: 'number', default: 200, unit: 'mm', min: 30, max: 1000, step: 1, help: 'The back is 1.2 × this tall' },
        { id: 'radius', label: 'Corner radius', type: 'number', default: 5, unit: 'mm', min: 0, max: 100, step: 0.5, help: 'Radius of the corners' },
        { id: 'angle', label: 'Angle', type: 'number', default: 0, unit: 'deg', min: 0, max: 30, step: 1, help: 'Greater than 0 for a back wider at the top than at the bottom' },
      ],
    },
    materialGroup,
  ],
  build,
};
