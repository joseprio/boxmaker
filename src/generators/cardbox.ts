import { Boxes, place } from '../engine/boxes';
import { BaseEdge } from '../engine/edges';
import type { Placement } from '../engine/part';
import { fingerJointGroup, fingerJointParams, materialGroup, outsideParam } from './common';
import { bool, finishModel, num, sections, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';

/** Edge recessed by one thickness, leaving room to slide the lid in ('a'). */
class InsetEdge extends BaseEdge {
  readonly char = 'a';
  readonly description = 'Inset edge for a sliding lid';

  draw(length: number): void {
    const t = this.boxes.thickness;
    this.boxes.polyline(0, 90, t, -90, length, -90, t, 90);
  }
}

/** Edge with a deep rounded notch to get your fingers around the cards ('A'). */
export class CardGripEdge extends BaseEdge {
  readonly char = 'A';
  readonly description = 'Edge with a finger notch';

  constructor(
    boxes: Boxes,
    private depth: number,
  ) {
    super(boxes);
  }

  draw(length: number): void {
    const d = this.depth - 10;
    this.boxes.polyline(length / 2 - 10, 90, d, [-180, 10], d, 90, length / 2 - 10);
  }
}

const X = { x: 1, y: 0, z: 0 };
const Y = { x: 0, y: 1, z: 0 };
const Z = { x: 0, y: 0, z: 1 };
const neg = (p: { x: number; y: number; z: number }) => ({ x: -p.x, y: -p.y, z: -p.z });

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  const sx = sections(v, 'sx');
  const outside = bool(v, 'outside');
  const right = str(v, 'openingdirection') === 'right';
  const hIn = num(v, 'h');

  // inner size of the surrounding box; x includes the glued-in grip walls
  const h = outside ? hIn - 3 * t : hIn;
  const x = (sx.length + 1) * t + sx.reduce((a, c) => a + c, 0);
  const y = outside ? num(v, 'y') - 2 * t : right ? num(v, 'y') + 2 * t : num(v, 'y');
  if (h <= 10 || y <= 20) throw new Error('Box too small for the finger notches');

  const fh = str(v, 'fingerhole');
  const depth = fh === 'custom' ? num(v, 'fingerhole_depth') : fh === 'deep' ? h - t - 10 : Math.min(h / 4, 35);
  b.addEdge(new InsetEdge(b));
  b.addEdge(new CardGripEdge(b, Math.max(depth, 10)));

  // divider positions (centres), after the left grip wall
  const centres: number[] = [];
  {
    let pos = 0.5 * t;
    for (const s of sx.slice(0, -1)) {
      pos += s + t;
      centres.push(pos);
    }
  }
  const holes = (l: number) => () => centres.forEach((c) => b.fingerHolesAt(c, 0, l, 90));

  // box space: cavity X in [0, x], Y in [0, y], floor top at z = 0.
  // The lid slides in the gap between the top of the grip walls (h) and the lips (h + t).
  b.rectangularWall(x, y, 'ffff', { label: 'bottom', callback: [holes(y)], placement: place.plateXY(0, 0, -t) });

  const gripWall = (x0: number): Placement => ({ origin: { x: x0, y: 0, z: h }, u: Y, v: neg(Z) });
  b.rectangularWall(y, h, 'Aeee', { label: 'inner side left', placement: gripWall(t) });
  b.rectangularWall(y, h, 'Aeee', { label: 'inner side right', placement: gripWall(x) });
  centres.forEach((c, i) =>
    b.rectangularWall(h, y, 'fAff', { label: `divider ${i + 1}`, group: 'divider', placement: { origin: { x: c + t / 2, y: 0, z: 0 }, u: Z, v: Y } }),
  );

  if (!right) {
    b.rectangularWall(x, h + t, 'FFEF', { label: 'back', callback: [holes(h)], placement: place.wallXZ(0, y + t, 0) });
    b.rectangularWall(x, h + t, 'FFaF', { label: 'front', callback: [holes(h)], placement: place.wallXZ(0, 0, 0) });
    b.rectangularWall(y, h + t, 'FfFf', { label: 'outer side left', placement: place.wallYZ(-t, 0, 0) });
    b.rectangularWall(y, h + t, 'FfFf', { label: 'outer side right', placement: place.wallYZ(x, 0, 0) });
    // lips on the side walls hold the lid down
    b.rectangularWall(y, t, 'eefe', { label: 'lip left', placement: { origin: { x: t, y: 0, z: h + t }, u: Y, v: neg(X) } });
    b.rectangularWall(y, t, 'feee', { label: 'lip right', placement: { origin: { x, y: 0, z: h + t }, u: Y, v: neg(X) } });
    // lid slides out to the front; its grip rail stands on the front end
    b.rectangularWall(x - 0.2 * t, y, 'eeFe', { label: 'lid', group: 'lid', placement: { origin: { x: 0.1 * t, y, z: h + t }, u: X, v: neg(Y) } });
    b.rectangularWall(x - 0.2 * t, t, 'fEeE', { label: 'lid lip', group: 'lid', placement: place.wallXZ(0.1 * t, 0, h + t) });
    if (bool(v, 'add_lidtopper')) {
      b.rectangularWall(x - 2.2 * t, y, 'eeee', { label: 'lid topper', group: 'lid', placement: place.plateXY(1.1 * t, 0, h + t) });
    }
  } else {
    b.rectangularWall(x, h + t, 'FfFf', { label: 'back', callback: [holes(h)], placement: place.wallXZ(0, y + t, 0) });
    b.rectangularWall(x, h + t, 'FfFf', { label: 'front', callback: [holes(h)], placement: place.wallXZ(0, 0, 0) });
    b.rectangularWall(y, h + t, 'FFEF', { label: 'outer side left', placement: place.wallYZ(-t, 0, 0) });
    b.rectangularWall(y, h + t, 'FFaF', { label: 'outer side right', placement: place.wallYZ(x, 0, 0) });
    b.rectangularWall(x, t, 'feee', { label: 'lip front', placement: place.plateXY(0, 0, h + t) });
    b.rectangularWall(x, t, 'eefe', { label: 'lip back', placement: place.plateXY(0, y - t, h + t) });
    // lid slides out to the right
    b.rectangularWall(x, y - 0.2 * t, 'eFee', { label: 'lid', group: 'lid', placement: place.plateXY(0, 0.1 * t, h) });
    b.rectangularWall(y - 0.2 * t, t, 'fEeE', { label: 'lid lip', group: 'lid', placement: place.wallYZ(x, 0.1 * t, h + t) });
    // spacers glued to the front and back walls inside each compartment
    let pos = t;
    sx.forEach((c, i) => {
      b.rectangularWall(c, h, 'eeee', { label: `front inlay ${i + 1}`, group: 'extra', placement: place.wallXZ(pos, t, 0) });
      b.rectangularWall(c, h, 'eeee', { label: `back inlay ${i + 1}`, group: 'extra', placement: place.wallXZ(pos, y, 0) });
      pos += c + t;
    });
    if (bool(v, 'add_lidtopper')) {
      b.rectangularWall(x, y - 2.2 * t, 'eeee', { label: 'lid topper', group: 'lid', placement: place.plateXY(0, 1.1 * t, h + t) });
    }
  }
  return finishModel(b);
}

export const cardBox: GeneratorDef = {
  id: 'cardbox',
  name: 'Card Box',
  category: 'Box',
  description: 'Box for decks of playing cards with a sliding lid and finger notches to grab each stack.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'sx', label: 'Stacks (sx)', type: 'sections', default: [65, 65, 65, 65], help: 'Width of each card compartment, e.g. 4*65' },
        { id: 'y', label: 'Depth (y)', type: 'number', default: 68, unit: 'mm', min: 10, max: 1000, step: 1, help: 'Depth of the stacks' },
        { id: 'h', label: 'Height (h)', type: 'number', default: 92, unit: 'mm', min: 20, max: 1000, step: 1, help: 'Card height plus a little room' },
        outsideParam,
      ],
    },
    {
      id: 'lid',
      title: 'Lid & grip',
      params: [
        {
          id: 'openingdirection',
          label: 'Lid opens',
          type: 'select',
          default: 'front',
          options: [
            { value: 'front', label: 'To the front' },
            { value: 'right', label: 'To the right' },
          ],
          help: 'Direction the lid slides out. A lid longer than it is wide slides best.',
        },
        {
          id: 'fingerhole',
          label: 'Finger notch',
          type: 'select',
          default: 'regular',
          options: [
            { value: 'regular', label: 'Regular (quarter height, max 35 mm)' },
            { value: 'deep', label: 'Deep (almost to the floor)' },
            { value: 'custom', label: 'Custom depth' },
          ],
        },
        { id: 'fingerhole_depth', label: 'Notch depth', type: 'number', default: 20, unit: 'mm', min: 10, max: 500, step: 1, showIf: (v) => v.fingerhole === 'custom' },
        { id: 'add_lidtopper', label: 'Lid topper', type: 'boolean', default: false, help: 'Extra decorative plate on top of the lid' },
      ],
    },
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
