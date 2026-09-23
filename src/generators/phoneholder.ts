import { Boxes } from '../engine/boxes';
import { BaseEdge } from '../engine/edges';
import { fingerJointGroup, fingerJointParams, materialGroup } from './common';
import { finishModel, num, type BoxModel, type GeneratorDef, type ParamValues } from './types';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const CABLE_R = 2.5;
const HOOK = 5;

/** An edge drawn by a function; `width` is how far its baseline lies outside the nominal edge. */
class DrawnEdge extends BaseEdge {
  readonly char = '';
  readonly description = 'Custom edge';

  constructor(
    boxes: Boxes,
    private fn: (length: number) => void,
    private width = 0,
  ) {
    super(boxes);
  }

  draw(length: number): void {
    this.fn(length);
  }

  startWidth(): number {
    return this.width;
  }
}

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  const W = num(v, 'phone_width');
  const depth = num(v, 'phone_depth');
  const angle = num(v, 'angle');
  const sm = num(v, 'bottom_margin');
  const tl = num(v, 'tab_size');
  const spacing = Math.max(num(v, 'bottom_support_spacing'), 2 * CABLE_R);
  const h = num(v, 'phone_height') + sm;
  if (angle <= 0 || angle >= 90) throw new Error('The angle must be between 0 and 90 degrees');
  if (tl > h - sm) throw new Error('The tabs can’t be longer than the phone');
  if (tl < 2 * depth) throw new Error('The tabs must be at least twice the phone depth');
  const side = (W - spacing - 2 * t) / 2;
  if (side <= 0) throw new Error('The phone is too narrow for the bottom support spacing');

  const th = rad(angle);
  const standDepth = h * Math.sin(th);
  const standHeight = h * Math.cos(th);

  // bottom of the front and back plates: slots for the bottom supports and a cable notch
  const bottomEdge = (slot: number) =>
    new DrawnEdge(b, (length) => {
      const s = (length - spacing - 2 * t) / 2;
      const half: Array<number | [number, number]> = [s, 90, slot, -90, t, -90, slot, 90, spacing / 2 - CABLE_R, 90, 2 * CABLE_R];
      b.polyline(...half, [-180, CABLE_R], ...[...half].reverse());
    });
  // sides of the front plate: into the side walls, with a tab of fingers into their tabs
  const sideEdge = (reverse: boolean) =>
    new DrawnEdge(
      b,
      (length) => {
        let [start, end] = [sm, length - sm - tl];
        if (reverse) [start, end] = [end, start];
        b.getEdge('F').draw(start);
        b.polyline(0, 90, t, -90);
        b.getEdge('f').draw(tl);
        b.polyline(0, -90, t, 90);
        b.getEdge('F').draw(end);
      },
      t,
    );

  // box space: X across the phone, the front plate rises from Y = 0 on the floor, leaning
  // back towards +Y; its back face is on the side walls' slope
  const up = { x: 0, y: Math.sin(th), z: Math.cos(th) };
  b.rectangularWall(W, h, [bottomEdge(sm), sideEdge(false), 'e', sideEdge(true)], {
    label: 'front plate',
    callback: [
      () => {
        const m = (W - spacing - t) / 2;
        b.fingerHolesAt(m, sm, tl);
        b.fingerHolesAt(W - m, sm, tl);
      },
    ],
    placement: { origin: { x: 0, y: 0, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: up },
  });
  b.rectangularWall(W, standHeight, [bottomEdge(0), 'F', 'e', 'F'], {
    label: 'back plate',
    placement: { origin: { x: 0, y: standDepth + t, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 } },
  });

  // side walls: right triangles, the slope with a tab each side of the phone
  const alpha = deg(Math.atan2(standHeight, standDepth));
  const sideWall = () => {
    b.edge(standDepth);
    b.corner(90);
    b.getEdge('f').draw(standHeight);
    b.corner(90 + alpha);
    // down the slope: fingers, the tab (finger holes for the front plate), fingers
    b.getEdge('f').draw(h - sm - tl);
    b.fingerHolesAt(0, -t / 2, tl, 0);
    b.polyline(0, -90, t, [90, depth], tl - 2 * depth, [90, depth], t, -90);
    b.getEdge('f').draw(sm);
    b.corner(90 - alpha);
    b.corner(90);
  };
  for (const [label, x0] of [['left side', -t], ['right side', W]] as const) {
    b.freePart(sideWall, { label, placement: { origin: { x: x0, y: 0, z: 0 }, u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 1 } } });
  }

  // bottom supports: behind the front plate through its slots, hooking under the phone in front
  const fh = sm + tl;
  const floor = fh * Math.sin(th);
  const angled = fh * Math.cos(th);
  const br = Math.min(sm, 3 * t + depth);
  const support = () => {
    b.polyline(
      floor, angle,
      3 * t + depth - br, [90, br],
      HOOK + sm - br, [180, t],
      HOOK - 0.5, [-90, 0.5],
      t + depth - 0.5, -90,
    );
    b.getEdge('f').draw(tl);
    b.polyline(0, 180 - angle, angled, 90);
  };
  // local x runs forward (-Y) from the back end on the floor
  const m = (W - spacing - t) / 2;
  for (const [i, xc] of [m, W - m].entries()) {
    b.freePart(support, {
      label: `bottom support ${i + 1}`,
      placement: { origin: { x: xc + t / 2, y: floor, z: 0 }, u: { x: 0, y: -1, z: 0 }, v: { x: 0, y: 0, z: 1 } },
    });
  }
  return finishModel(b);
}

export const phoneHolder: GeneratorDef = {
  id: 'phoneholder',
  name: 'Phone Holder',
  category: 'Misc',
  description: 'Smartphone desk stand holding the phone between two tabs, leaving its bottom free for a charger, headphones and the mic.',
  groups: [
    {
      id: 'phone',
      title: 'Phone',
      params: [
        { id: 'phone_height', label: 'Phone height', type: 'number', default: 142, unit: 'mm', min: 40, max: 400, step: 1 },
        { id: 'phone_width', label: 'Phone width', type: 'number', default: 73, unit: 'mm', min: 30, max: 300, step: 1 },
        { id: 'phone_depth', label: 'Phone depth', type: 'number', default: 11, unit: 'mm', min: 1, max: 50, step: 0.5, help: 'Depth of the bottom supports’ hook and of the side tabs; at least the material thickness' },
        { id: 'angle', label: 'Angle', type: 'number', default: 25, unit: 'deg', min: 1, max: 80, step: 1, help: 'Lean of the phone; 0 is vertical' },
        { id: 'bottom_margin', label: 'Bottom margin', type: 'number', default: 30, unit: 'mm', min: 5, max: 200, step: 1, help: 'Height of the support below the phone' },
        { id: 'tab_size', label: 'Tab length', type: 'number', default: 76, unit: 'mm', min: 5, max: 400, step: 1, help: 'Length of the tabs holding the phone' },
        { id: 'bottom_support_spacing', label: 'Support spacing', type: 'number', default: 16, unit: 'mm', min: 5, max: 200, step: 1, help: 'Gap between the two bottom supports, wide enough for the charging cable' },
      ],
    },
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
