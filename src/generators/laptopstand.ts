import { Boxes } from '../engine/boxes';
import { materialGroup } from './common';
import { finishModel, num, type BoxModel, type GeneratorDef, type ParamValues } from './types';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn') });
  const depth = num(v, 'l_depth');
  const lt = num(v, 'l_thickness');
  const a = num(v, 'angle');
  const g = num(v, 'ground_offset');
  const nub = num(v, 'nub_size');
  if (a <= 0 || a >= 90) throw new Error('The angle must be between 0 and 90 degrees');
  if (nub < 2) throw new Error('The nub must be at least 2 mm');

  // the two triangles run along the diagonals under the laptop and cross in the middle
  const ra = rad(a);
  const height = depth * Math.sin(ra);
  const base = Math.SQRT2 * depth * Math.cos(ra);
  const hyp = depth * Math.sqrt(Math.cos(ra) ** 2 + 1);
  // slope of the laptop along a diagonal
  const rb = Math.atan(Math.tan(ra) / Math.SQRT2);
  const baseExtra = (nub - g * Math.sin(rb)) / Math.cos(rb);
  const lipOuter = g / Math.cos(rb) + lt - nub * Math.tan(rb);
  const bottomSlot = height / 4 + g / 2;
  const topSlotBig = height / 4 + g / 2 + (t * height) / (2 * base);
  const topSlotSmall = height / 4 + g / 2 - (t * height) / (2 * base);
  const halfHyp = (hyp * (base - t)) / (2 * base);

  const foot = 10 + nub;
  // the feet step down 5 mm at 45 degrees; upstream subtracts 7 for both steps, which
  // leaves the outline open by 0.07 mm, so use the exact run
  const step = 5 * Math.SQRT1_2;
  const middle = base - 2 * foot - 2 * step;
  if (middle - t <= 0) throw new Error('The laptop is too short for this angle and nub size');
  if (bottomSlot - step <= 0 || topSlotSmall <= 0) throw new Error('The angle is too shallow for the slots');
  // at 0 the nub's inner corner would touch the bottom edge
  if (g <= 0) throw new Error('The ground offset must be greater than 0');
  if (foot + baseExtra <= 0) throw new Error('The ground offset is too large for the nub size');

  const bd = deg(rb);
  // local (0,0) is the rear end on the floor; x runs forward to the nub, y up
  const drawTriangle = (top: boolean) => () => {
    b.moveTo(0, height + g, -90);
    b.edge(height + g);
    b.corner(90);
    if (top) {
      b.polyline(foot, 45, 5, -45, middle, -45, 5, 45, foot + baseExtra, 0);
    } else {
      // slot up from the bottom, half the height at the crossing
      b.polyline(
        foot, 45, 5, -45,
        (middle - t) / 2, 90,
        bottomSlot - step, -90,
        t, -90,
        bottomSlot - step, 90,
        (middle - t) / 2, -45,
        5, 45,
        foot + baseExtra, 0,
      );
    }
    // the nub holding the laptop's front edge
    b.corner(90 - bd);
    b.edge(lipOuter);
    b.corner(90, 1);
    b.edge(nub - 2);
    b.corner(90, 1);
    b.edge(lt);
    b.corner(-90);
    if (top) {
      // slot down from the top, meeting the other triangle's
      b.edge(halfHyp);
      b.corner(90 + bd);
      b.edge(topSlotSmall);
      b.corner(-90);
      b.edge(t);
      b.corner(-90);
      b.edge(topSlotBig);
      b.corner(90 - bd);
      b.edge(halfHyp);
    } else {
      b.edge(hyp);
    }
    b.corner(90 + bd);
  };

  // box space: the laptop's front edge faces -Y and it rises towards +Y; the triangles
  // stand upright along the diagonals, crossing at the origin
  const s = Math.SQRT1_2;
  for (const [top, ux] of [[false, 1], [true, -1]] as const) {
    const u = { x: ux * s, y: -s, z: 0 };
    const n = { x: u.y, y: -u.x };
    b.freePart(drawTriangle(top), {
      label: top ? 'triangle (slot on top)' : 'triangle (slot below)',
      placement: {
        origin: { x: -u.x * (base / 2) - (n.x * t) / 2, y: -u.y * (base / 2) - (n.y * t) / 2, z: 0 },
        u,
        v: { x: 0, y: 0, z: 1 },
      },
    });
  }
  return finishModel(b);
}

export const laptopStand: GeneratorDef = {
  id: 'laptopstand',
  name: 'Laptop Stand',
  category: 'Misc',
  description: 'A simple X-shaped frame of two crossed triangles holding a laptop at an angle, with nubs catching its front edge.',
  groups: [
    {
      id: 'stand',
      title: 'Stand',
      params: [
        { id: 'l_depth', label: 'Laptop depth', type: 'number', default: 250, unit: 'mm', min: 100, max: 1000, step: 1, help: 'Laptop depth, front to back' },
        { id: 'l_thickness', label: 'Laptop thickness', type: 'number', default: 10, unit: 'mm', min: 1, max: 100, step: 0.5, help: 'Thickness of the laptop at its front edge' },
        { id: 'angle', label: 'Angle', type: 'number', default: 15, unit: 'deg', min: 1, max: 60, step: 1, help: 'Tilt of the keyboard' },
        { id: 'ground_offset', label: 'Ground offset', type: 'number', default: 10, unit: 'mm', min: 1, max: 200, step: 1, help: 'Height of the laptop’s front edge above the table' },
        { id: 'nub_size', label: 'Nub size', type: 'number', default: 10, unit: 'mm', min: 2, max: 50, step: 1, help: 'Thickness of the lip in front of the laptop' },
      ],
    },
    materialGroup,
  ],
  build,
};
