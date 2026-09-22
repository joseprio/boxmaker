import { Boxes, CompoundEdge, place } from '../engine/boxes';
import type { Placement } from '../engine/part';
import { dimParam, fingerJointGroup, fingerJointParams, materialGroup, outsideParam, stackableGroup, stackableParams } from './common';
import { bool, finishModel, num, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';

const X = { x: 1, y: 0, z: 0 };
const NX = { x: -1, y: 0, z: 0 };
const Y = { x: 0, y: 1, z: 0 };
const NY = { x: 0, y: -1, z: 0 };
const Z = { x: 0, y: 0, z: 1 };
const P = (origin: { x: number; y: number; z: number }, u: typeof X, v: typeof X): Placement => ({ origin, u, v });

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v), stackable: stackableParams(v) });
  let x = num(v, 'x');
  let y = num(v, 'y');
  let h = num(v, 'h');
  const bottom = str(v, 'bottom_edge');
  const lidType = str(v, 'lid_type');
  const gap = (1 + num(v, 'margin_t')) * t;
  if (bool(v, 'outside')) {
    x = b.adjustSize(x);
    y = b.adjustSize(y);
    h = b.adjustSize(h, 'F', bottom) - gap;
  }
  const railMm = num(v, 'rail') * t;
  const railMargin = railMm - b.burn;
  const hPlus = h + gap;

  const lowerRailHoles = () => b.fingerHolesAt(h - 0.5 * t, 0, y);
  const backHoles = () => {
    b.fingerHolesAt(0, h - 0.5 * t, railMm, 0);
    b.fingerHolesAt(x, h - 0.5 * t, railMm, 180);
  };

  // side walls: local x runs from the back (0) to the front (y)
  const sidesEdge = new CompoundEdge(b, ['f', 'E'], [h, gap]);
  b.rectangularWall(y, hPlus, [bottom, sidesEdge, 'F', 'f'], {
    label: 'left side',
    callback: [null, lowerRailHoles],
    placement: P({ x: 0, y, z: 0 }, NY, Z),
  });
  b.rectangularWall(y, hPlus, [bottom, sidesEdge, 'F', 'f'], {
    label: 'right side',
    callback: [null, lowerRailHoles],
    placement: P({ x: x + t, y, z: 0 }, NY, Z),
  });

  if (bottom !== 'e') {
    b.rectangularWall(y, x, 'ffff', { label: 'bottom', placement: P({ x: 0, y: 0, z: 0 }, Y, X) });
  }

  // rails
  b.rectangularWall(y, railMm, 'fEee', { label: 'top left rail', group: 'extra', placement: P({ x: 0, y, z: hPlus }, NY, X) });
  b.rectangularWall(y, railMm, 'fEee', { label: 'top right rail', group: 'extra', placement: P({ x, y, z: hPlus + t }, NY, NX) });
  b.rectangularWall(y, railMm, 'feef', { label: 'bottom left rail', group: 'extra', placement: P({ x: 0, y, z: h - t }, NY, X) });
  b.rectangularWall(y, railMm, 'feef', { label: 'bottom right rail', group: 'extra', placement: P({ x, y, z: h }, NY, NX) });

  // lid
  const lidY = x - 2 * num(v, 'margin_s') * t;
  const lidX0 = (x - lidY) / 2;
  const lidPlacement = P({ x: lidX0, y, z: h }, NY, X);
  if (lidType === 'lip') {
    const lip = new CompoundEdge(b, ['E', 'f', 'E'], [railMargin, lidY - 2 * railMargin, railMargin]);
    b.rectangularWall(y, lidY, ['e', lip, 'e', 'e'], { label: 'lid', group: 'lid', placement: lidPlacement });
    b.rectangularWall(lidY - 2 * railMargin, gap, 'Feee', {
      label: 'lid lip',
      group: 'lid',
      placement: place.wallXZ(lidX0 + railMargin, 0, h + t),
    });
  } else {
    const gripHole = () => {
      if (lidType !== 'hole') return;
      b.rectangularHole(y - num(v, 'hole_width'), lidY / 2, num(v, 'hole_width'), num(v, 'hole_length'), num(v, 'hole_radius'));
    };
    b.rectangularWall(y, lidY, 'eEee', { label: 'lid', group: 'lid', callback: [gripHole], placement: lidPlacement });
  }

  // back and front
  const backTop = new CompoundEdge(b, ['E', 'f', 'E'], [railMargin, x - 2 * railMargin, railMargin]);
  b.rectangularWall(x, hPlus, [bottom, 'F', backTop, 'F'], { label: 'back', callback: [backHoles], placement: place.wallXZ(0, y + t, 0) });
  b.rectangularWall(x, h, [bottom, 'F', 'e', 'F'], { label: 'front', placement: place.wallXZ(0, 0, 0) });
  b.rectangularWall(x - 2 * railMargin, railMm, 'Feee', {
    label: 'back rail',
    group: 'extra',
    placement: P({ x: x - railMargin, y, z: hPlus }, NX, NY),
  });

  return finishModel(b);
}

export const slidingLidBox: GeneratorDef = {
  id: 'slidinglidbox',
  name: 'Sliding Lid Box',
  category: 'Box',
  description: 'Box with a lid that slides in rails along the long side. Optional grip hole or lip on the lid.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        dimParam('x', 'Width (x)', 60, 'Inner width (front)'),
        dimParam('y', 'Depth (y)', 220, 'Inner depth - the lid slides along this side'),
        dimParam('h', 'Height (h)', 60, 'Inner height below the lid'),
        outsideParam,
      ],
    },
    {
      id: 'lid',
      title: 'Sliding lid',
      params: [
        {
          id: 'lid_type',
          label: 'Lid type',
          type: 'select',
          default: 'hole',
          options: [
            { value: 'hole', label: 'Grip hole' },
            { value: 'lip', label: 'Lip' },
            { value: 'none', label: 'Plain' },
          ],
        },
        { id: 'rail', label: 'Rail width', type: 'number', default: 1.5, unit: 'x t', min: 1, max: 5, step: 0.1 },
        { id: 'margin_t', label: 'Vertical margin', type: 'number', default: 0.1, unit: 'x t', min: 0, max: 1, step: 0.05, help: 'Play above the lid' },
        { id: 'margin_s', label: 'Side margin', type: 'number', default: 0.05, unit: 'x t', min: 0, max: 1, step: 0.05, help: 'Play at both sides of the lid' },
        { id: 'hole_length', label: 'Hole length', type: 'number', default: 40, unit: 'mm', min: 1, max: 500, step: 1, showIf: (v) => v.lid_type === 'hole' },
        { id: 'hole_width', label: 'Hole width', type: 'number', default: 20, unit: 'mm', min: 1, max: 500, step: 1, showIf: (v) => v.lid_type === 'hole' },
        { id: 'hole_radius', label: 'Hole radius', type: 'number', default: 10, unit: 'mm', min: 0, max: 100, step: 1, showIf: (v) => v.lid_type === 'hole' },
        {
          id: 'bottom_edge',
          label: 'Bottom edge',
          type: 'select',
          default: 'F',
          options: [
            { value: 'F', label: 'Finger joints' },
            { value: 'h', label: 'Finger holes' },
            { value: 's', label: 'Stackable feet' },
          ],
        },
      ],
    },
    materialGroup,
    fingerJointGroup,
    stackableGroup,
  ],
  build,
};
