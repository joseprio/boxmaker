import { Boxes, CompoundEdge, place, type EdgeSpec } from '../engine/boxes';
import { ChestHinge, ChestHingeFront, ChestHingePin, ChestHingeTop } from '../engine/edges';
import { rotatePlacement, type Placement } from '../engine/part';
import { ChestHingeSettings } from '../engine/settings';
import { dimParam, fingerJointGroup, fingerJointParams, materialGroup, outsideParam } from './common';
import { bool, finishModel, num, type BoxModel, type GeneratorDef, type ParamGroup, type ParamValues } from './types';

const X = { x: 1, y: 0, z: 0 };
const Y = { x: 0, y: 1, z: 0 };
const Z = { x: 0, y: 0, z: 1 };
const neg = (p: { x: number; y: number; z: number }) => ({ x: -p.x, y: -p.y, z: -p.z });

export const lidOpenParam = {
  id: 'lid_open',
  label: 'Preview: lid open',
  type: 'number' as const,
  default: 0,
  unit: 'deg',
  min: 0,
  max: 110,
  step: 5,
  help: 'Only changes the 3D preview',
};

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  let x = num(v, 'x');
  let y = num(v, 'y');
  let h = num(v, 'h');
  const hl = num(v, 'lidheight');
  if (bool(v, 'outside')) {
    x = b.adjustSize(x);
    y = b.adjustSize(y);
    h = b.adjustSize(h);
  }

  const hs = new ChestHingeSettings(t, {
    pin_height: num(v, 'ch_pin_height'),
    hinge_strength: num(v, 'ch_hinge_strength'),
    play: num(v, 'ch_play'),
  });
  for (const e of [new ChestHinge(b, hs), new ChestHinge(b, hs, true), new ChestHingeTop(b, hs), new ChestHingeTop(b, hs, true), new ChestHingePin(b, hs), new ChestHingeFront(b, hs)]) {
    b.addEdge(e);
  }
  const hy = b.getEdge('O').startWidth();
  const hy2 = b.getEdge('P').startWidth();
  if (h - hy <= 0 || hl - hy2 <= 0) throw new Error('Box or lid too low for the hinge');

  // box space: X = width, Y = 0 at the front .. y at the back, Z up; the lid
  // turns about the X axis through (y + t, h): the pins' corners at the back.
  const turn = (p: Placement): Placement => rotatePlacement(p, { x: 0, y: y + t, z: h }, X, -num(v, 'lid_open'));

  // box: the hinge edges cut round holes at the back top corners of the sides
  const sides: Array<[string, string, Placement, number[]]> = [
    ['left side', 'FfOf', { origin: { x: 0, y, z: 0 }, u: neg(Y), v: Z }, [2]],
    ['right side', 'Ffof', { origin: { x, y: 0, z: 0 }, u: Y, v: Z }, [5]],
  ];
  for (const [label, edges, placement, ignoreWidths] of sides) {
    b.rectangularWall(y, h - hy, edges, { label, ignoreWidths, placement });
    // the disc cut out of the hole turns in it, holding the lid's pin in its slot
    const hinge = b.getEdge(edges[2]) as ChestHinge;
    const disc = hinge.discs[hinge.discs.length - 1];
    b.freePart(
      () => {
        b.hole(disc.centre.x, disc.centre.y, disc.radius);
        b.closedPath(disc.slot);
      },
      { label: `hinge disc ${label.split(' ')[0]}`, group: 'handle', placement: turn(placement) },
    );
  }
  b.rectangularWall(x, h, 'FFeF', { label: 'front', placement: place.wallXZ(0, 0, 0) });
  const back: EdgeSpec[] = ['F', new CompoundEdge(b, ['F', 'e'], [h - hy, hy]), 'e', new CompoundEdge(b, ['e', 'F'], [hy, h - hy])];
  b.rectangularWall(x, h, back, { label: 'back', placement: place.wallXZ(0, y + t, 0) });
  b.rectangularWall(y, x, 'ffff', { label: 'bottom', placement: { origin: { x: 0, y: 0, z: 0 }, u: Y, v: X } });

  // lid (drawn as a box standing on its top plate)
  b.rectangularWall(y, hl - hy2, 'pfFf', {
    label: 'lid left side',
    group: 'lid',
    ignoreWidths: [1],
    placement: turn({ origin: { x: 0, y, z: h + hy2 }, u: neg(Y), v: Z }),
  });
  b.rectangularWall(y, hl - hy2, 'PfFf', {
    label: 'lid right side',
    group: 'lid',
    ignoreWidths: [6],
    placement: turn({ origin: { x, y: 0, z: h + hy2 }, u: Y, v: Z }),
  });
  b.rectangularWall(x, hl, 'FFeF', { label: 'lid front', group: 'lid', placement: turn({ origin: { x, y: 0, z: h + hl }, u: neg(X), v: neg(Z) }) });
  b.rectangularWall(x, hl - hy2, 'FFqF', { label: 'lid back', group: 'lid', placement: turn({ origin: { x: 0, y, z: h + hl }, u: X, v: neg(Z) }) });
  b.rectangularWall(y, x, 'ffff', { label: 'lid top', group: 'lid', placement: turn({ origin: { x: 0, y: 0, z: h + hl + t }, u: Y, v: X }) });
  return finishModel(b);
}

const hingeGroup: ParamGroup = {
  id: 'chesthinge',
  title: 'Hinge',
  collapsed: true,
  params: [
    { id: 'ch_pin_height', label: 'Pin radius', type: 'number', default: 2, unit: 'x t', min: 1.2, max: 10, step: 0.1, help: 'Radius of the round hole the pins turn in (multiples of thickness)' },
    { id: 'ch_hinge_strength', label: 'Hinge strength', type: 'number', default: 1, unit: 'x t', min: 0.5, max: 5, step: 0.1, help: 'Material around the hole (multiples of thickness)' },
    { id: 'ch_play', label: 'Play', type: 'number', default: 0.1, unit: 'x t', min: 0, max: 1, step: 0.05, help: 'Gap between the lid and the hinge (multiples of thickness)' },
  ],
};

export const integratedHingeBox: GeneratorDef = {
  id: 'integratedhingebox',
  name: 'Integrated Hinge Box',
  category: 'Box',
  description: 'Box with a lid that pivots on pins cut into its back wall, turning in round holes in the box sides. No hardware needed.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        dimParam('x', 'Width (x)', 100, 'Inner width'),
        dimParam('y', 'Depth (y)', 100, 'Inner depth'),
        dimParam('h', 'Height (h)', 100, 'Inner height of the box'),
        { id: 'lidheight', label: 'Lid height', type: 'number', default: 20, unit: 'mm', min: 5, max: 500, step: 1 },
        outsideParam,
        lidOpenParam,
      ],
    },
    hingeGroup,
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
