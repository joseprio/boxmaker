import { Boxes, place } from '../engine/boxes';
import { BaseEdge } from '../engine/edges';
import { rotatePlacement, type Placement } from '../engine/part';
import { dimParam, fingerJointGroup, fingerJointParams, materialGroup, outsideParam } from './common';
import { lidOpenParam } from './integratedhingebox';
import { bool, finishModel, num, type BoxModel, type GeneratorDef, type ParamValues } from './types';

const X = { x: 1, y: 0, z: 0 };
const Y = { x: 0, y: 1, z: 0 };
const Z = { x: 0, y: 0, z: 1 };
const neg = (p: { x: number; y: number; z: number }) => ({ x: -p.x, y: -p.y, z: -p.z });

/** Edge that does nothing but cancel the corner after it (boxes.py NoopEdge). */
class NoopEdge extends BaseEdge {
  readonly char = '';
  readonly description = 'No-op edge';

  draw(): void {
    this.boxes.corner(-90);
  }
}

interface HingeGeo {
  length: number;
  height: number;
  hc: number;
  fingered: number;
  reverse: boolean;
}

/**
 * Right and top edge of an inner hinge side in one go (the next edge must be a
 * NoopEdge): a slot for the pin near the bottom corner, fingers for the small
 * side, then the top corner rounded about the pin so the outer shell can turn.
 */
class Inner2SidesEdge extends BaseEdge {
  readonly char = '';
  readonly description = 'Inner hinge side';

  constructor(
    boxes: Boxes,
    private g: HingeGeo,
  ) {
    super(boxes);
  }

  draw(): void {
    const actions = [() => this.hingeHole(), () => this.boxes.getEdge('f').draw(this.g.fingered), () => this.smoothCorner()];
    for (const a of this.g.reverse ? actions.reverse() : actions) a();
  }

  private smoothCorner(): void {
    const t = this.boxes.thickness;
    const { length, height, hc, fingered } = this.g;
    const toLid = height + t - hc;
    const toSide = hc - t;
    const cornerHeight = toLid - Math.sqrt(toLid ** 2 - toSide ** 2);
    const angle = (Math.asin(toSide / toLid) * 180) / Math.PI;
    const path: Array<number | [number, number]> = [height - fingered - cornerHeight, [90 - angle, 0], 0, [angle, toLid], t + length - hc];
    this.boxes.polyline(...(this.g.reverse ? path.reverse() : path));
  }

  private hingeHole(): void {
    const t = this.boxes.thickness;
    const dir = this.g.reverse ? -1 : 1;
    this.boxes.rectangularHole(dir * (this.g.hc - t), this.g.hc - t, 1.5 * t, t);
  }
}

/**
 * Same for the outer hinge sides: fingers, a rounded corner about the pin, and
 * the round hole the hinge disc turns in.
 */
class Outer2SidesEdge extends BaseEdge {
  readonly char = '';
  readonly description = 'Outer hinge side';

  constructor(
    boxes: Boxes,
    private g: HingeGeo,
    private radius: number,
  ) {
    super(boxes);
  }

  draw(): void {
    const actions = [() => this.boxes.getEdge('f').draw(this.g.fingered), () => this.smoothCorner(), () => this.hingeHole()];
    for (const a of this.g.reverse ? actions.reverse() : actions) a();
  }

  private smoothCorner(): void {
    const t = this.boxes.thickness;
    const { length, height, hc, fingered } = this.g;
    const path: Array<number | [number, number]> = [0, [-90, 0], t, [90, 0], height - fingered - hc, [90, hc], t + length - hc];
    this.boxes.polyline(...(this.g.reverse ? path.reverse() : path));
  }

  private hingeHole(): void {
    const t = this.boxes.thickness;
    const dir = this.g.reverse ? -1 : 1;
    const x = dir * (this.g.hc - this.g.length - t);
    this.boxes.hole(x, this.g.hc, this.radius);
  }
}

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  let x = num(v, 'x');
  let yi = num(v, 'y');
  let hi = num(v, 'h');
  const p = num(v, 'play') * t;
  const hr = num(v, 'hinge_radius');
  const hc = num(v, 'hinge_center') || 2 * t + hr;
  if (bool(v, 'outside')) {
    x -= 2 * t;
    yi -= 4 * t + 2 * p;
    hi -= 2 * t;
  }
  const yo = yi + 2 * (t + p);
  const ho = hi + t;
  // the inner and outer small sides share the end wall, with a gap so they turn freely
  const fingeredHi = 2 * hc - t;
  const gap = Math.sqrt(Math.abs((hc * Math.SQRT2) ** 2 - (hc - t) ** 2)) - hc;
  const fingeredHo = ho - gap - 2 * hc;
  if (fingeredHo <= 0 || hi <= fingeredHi + t || x <= 2 * hc) throw new Error('Box too small for this hinge');
  if (hr >= hc - t) throw new Error('Hinge radius too large for the hinge position');

  // box space: X = width (small hinged side B at X = x, full side D at X = 0),
  // Y = depth (inner walls at the ends of [0, yi], outer walls outside them),
  // Z up with the inner floor top at 0. The outer shell turns about the pins'
  // axis (along Y) near the bottom of side B.
  const pivot = { x: x - hc + t, y: 0, z: hc - t };
  const turn = (pl: Placement): Placement => rotatePlacement(pl, pivot, Y, num(v, 'lid_open'));
  const noop = new NoopEdge(b);

  // inner box ---------------------------------------------------------------
  const innerGeo = (reverse: boolean): HingeGeo => ({ length: x, height: hi, hc, fingered: fingeredHi, reverse });
  b.rectangularWall(x, hi, ['f', 'f', new Inner2SidesEdge(b, innerGeo(true)), noop], {
    label: 'inner hinge side A',
    placement: { origin: { x, y: yi, z: 0 }, u: neg(X), v: Z },
  });
  b.rectangularWall(yi, hi, 'fFeF', { label: 'inner full side D', placement: place.wallYZ(-t, 0, 0) });
  b.rectangularWall(x, hi, ['f', new Inner2SidesEdge(b, innerGeo(false)), noop, 'f'], {
    label: 'inner hinge side C',
    placement: place.wallXZ(0, 0, 0),
  });
  // hangs upside down from the top of its fingers
  b.rectangularWall(yi, fingeredHi, 'eFfF', { label: 'inner small side B', placement: { origin: { x: x + t, y: 0, z: fingeredHi }, u: Y, v: neg(Z) } });
  b.rectangularWall(x, yi, 'FFFF', { label: 'inner bottom', placement: place.plateXY(0, 0, -t) });

  // outer shell (the lid), drawn upside down from the top plate --------------
  const outerGeo = (reverse: boolean): HingeGeo => ({ length: x, height: ho, hc, fingered: fingeredHo, reverse });
  const outers: Array<[string, boolean, Placement]> = [
    ['outer hinge side A', false, { origin: { x: 0, y: yi + t + p, z: hi }, u: X, v: neg(Z) }],
    ['outer hinge side C', true, { origin: { x, y: -t - p, z: hi }, u: neg(X), v: neg(Z) }],
  ];
  for (const [label, reverse, placement] of outers) {
    const sides = new Outer2SidesEdge(b, outerGeo(reverse), hr);
    const edges = reverse ? ['f', 'E', sides, noop] : ['f', sides, noop, 'E'];
    b.rectangularWall(x, ho, edges, { label, group: 'lid', placement: turn(placement) });
    // the disc cut from the round hole holds the pin; it stays with the inner box
    const yFace = reverse ? -t - p : yi + 2 * t + p;
    b.freePart(
      () => {
        b.hole(0, 0, hr);
        // matches the inner wall's slot: t wide, 1.5 t tall
        b.rectangularHole(0, 0, t, 1.5 * t);
      },
      { label: `hinge disc ${label.endsWith('A') ? 'A' : 'C'}`, group: 'handle', placement: { origin: { x: pivot.x, y: yFace, z: pivot.z }, u: X, v: Z } },
    );
  }
  b.rectangularWall(yo, fingeredHo, 'fFeF', { label: 'outer small side B', group: 'lid', placement: turn({ origin: { x: x + t, y: -t - p, z: hi }, u: Y, v: neg(Z) }) });
  b.rectangularWall(x, yo, 'FEFF', { label: 'outer upper lid', group: 'lid', placement: turn({ origin: { x, y: -t - p, z: hi + t }, u: neg(X), v: Y }) });

  // the pins: through the inner wall's slot into the disc
  for (const [label, yc] of [
    ['hinge pin A', yi + t + p / 2],
    ['hinge pin C', -t - p / 2],
  ] as const) {
    // 2 t along the axis, 1.5 t tall, t thick (along X)
    b.rectangularWall(2 * t, 1.5 * t, 'eeee', {
      label,
      group: 'handle',
      placement: { origin: { x: pivot.x - t / 2, y: yc - t, z: pivot.z - 0.75 * t }, u: Y, v: Z },
    });
  }
  return finishModel(b);
}

export const sideHingeBox: GeneratorDef = {
  id: 'sidehingebox',
  name: 'Side Hinge Box',
  category: 'Box',
  description:
    'Box with hidden hinges: an outer shell (top, two sides and an end) turns about two pins near the bottom, opening the top and one end together. The sides are double walls.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        dimParam('x', 'Width (x)', 100, 'Inner width'),
        dimParam('y', 'Depth (y)', 100, 'Inner depth'),
        dimParam('h', 'Height (h)', 100, 'Inner height'),
        outsideParam,
        lidOpenParam,
      ],
    },
    {
      id: 'hinge',
      title: 'Hinge',
      collapsed: true,
      params: [
        { id: 'play', label: 'Play', type: 'number', default: 0.15, unit: 'x t', min: 0, max: 1, step: 0.05, help: 'Gap between the inner and outer walls (multiples of thickness)' },
        { id: 'hinge_center', label: 'Hinge position', type: 'number', default: 0, unit: 'mm', min: 0, max: 200, step: 0.5, help: 'Distance of the pins from the adjacent sides (0 = default)' },
        { id: 'hinge_radius', label: 'Disc radius', type: 'number', default: 5.5, unit: 'mm', min: 2, max: 50, step: 0.5, help: 'Radius of the hinge disc turning in the outer walls' },
      ],
    },
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
