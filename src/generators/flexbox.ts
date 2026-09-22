import { Boxes } from '../engine/boxes';
import type { FlexEdge } from '../engine/edges';
import type { PathSegment, Placement } from '../engine/part';
import { fingerJointGroup, fingerJointParams, flexGroup, flexParams, materialGroup, outsideParam } from './common';
import { bool, finishModel, num, sections, type BoxModel, type GeneratorDef, type ParamValues } from './types';

const X = { x: 1, y: 0, z: 0 };
const Y = { x: 0, y: 1, z: 0 };
const Z = { x: 0, y: 0, z: 1 };

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v), flex: flexParams(v) });
  let sx = sections(v, 'sx');
  let y = num(v, 'y');
  let h = num(v, 'h');
  if (bool(v, 'outside')) {
    sx = b.adjustSizes(sx);
    y = b.adjustSize(y);
    h = b.adjustSize(h);
  }
  const x = sx.reduce((a, c) => a + c, 0) + t * (sx.length - 1);
  const latch = num(v, 'latchsize') * t;
  let r = num(v, 'radius') || Math.min(y, h - latch) / 2;
  r = Math.min(r, y / 2, Math.max(0, (h - latch) / 2));
  if (h - 2 * r - latch < 0 || r <= 0) throw new Error('Box too low for this latch size');

  const flex = b.getEdge('X') as FlexEdge;
  const c4 = (Math.PI * r * 0.5) / flex.settings.stretch;
  const F = b.getEdge('F');
  const f = b.getEdge('f');

  // box space: X across the sections, Y = 0 at the front .. y at the back, Z up.
  // Side profile: y * h with rounded corners; the door (top) closes with a latch at the front.

  // sides and dividers ---------------------------------------------------------
  const side = (middle: boolean, label: string, x0: number) =>
    b.freePart(
      () => {
        b.moveTo(r, 0);
        f.draw(y - 2 * r);
        b.corner(90, r);
        f.draw(h - 2 * r);
        b.corner(90, r);
        b.edge(y - 2 * r);
        b.corner(90, r);
        if (middle) b.edge(latch);
        else b.latch(latch);
        f.draw(h - 2 * r - latch);
        b.corner(90, r);
      },
      { label, group: middle ? 'divider' : 'box', placement: { origin: { x: x0, y: 0, z: 0 }, u: Y, v: Z } },
    );
  side(false, 'left side', -t);
  {
    let posx = -0.5 * t;
    sx.slice(0, -1).forEach((s, i) => {
      posx += s + t;
      side(true, `divider ${i + 1}`, posx - 0.5 * t);
    });
  }
  side(false, 'right side', x);

  // the wall: starts at the front below the latch, runs down, round the bottom,
  // up the back and over the top as the door, ending in the latch at the front
  const holes = (l: number) => {
    let pos = t - 0.5 * t;
    for (const s of sx.slice(0, -1)) {
      pos += s + t;
      b.fingerHolesAt(0, pos, l, 0);
    }
  };
  const W = x + 2 * t;
  const shortY = y - 2 * r < t;
  const path: PathSegment[] = [];
  const bend = (l: number, angle: number) => path.push({ length: l, angle, radius: r });

  b.freePart(
    () => {
      const run = (l: number) => {
        holes(l);
        F.draw(l);
        path.push({ length: l });
      };
      run(h - 2 * r - latch);
      if (shortY) {
        flex.draw(2 * c4 + y - 2 * r, W);
        bend(2 * c4 + y - 2 * r, 180);
      } else {
        flex.draw(c4, W);
        bend(c4, 90);
        run(y - 2 * r);
        flex.draw(c4, W);
        bend(c4, 90);
      }
      run(h - 2 * r);
      if (shortY) {
        flex.draw(2 * c4 + y - 2 * r, W);
        bend(2 * c4 + y - 2 * r, 180);
      } else {
        flex.draw(c4, W);
        bend(c4, 90);
        b.edge(y - 2 * r);
        path.push({ length: y - 2 * r });
        flex.draw(c4, W);
        bend(c4, 90);
      }
      b.latch(latch, false);
      path.push({ length: latch });
      b.edge(W);
      // back along the other long edge
      b.latch(latch, false, true);
      if (shortY) b.edge(2 * c4 + y - 2 * r);
      else {
        b.edge(c4);
        b.edge(y - 2 * r);
        b.edge(c4);
      }
      F.draw(h - 2 * r);
      if (shortY) b.edge(2 * c4 + y - 2 * r);
      else {
        b.edge(c4);
        F.draw(y - 2 * r);
        b.edge(c4);
      }
      F.draw(h - 2 * r - latch);
      b.corner(90);
      b.edge(W);
      b.corner(90);
    },
    {
      label: 'wall',
      // inner face on the side profile, local y across the width from the left side's outer face
      placement: { origin: { x: -t, y: 0, z: h - r - latch }, u: { x: 0, y: 0, z: -1 }, v: X, path } as Placement,
    },
  );
  return finishModel(b);
}

export const flexBox: GeneratorDef = {
  id: 'flexbox',
  name: 'Flex Box',
  category: 'Flex',
  description: 'Box with a living hinge: one flex wall wraps round the sides and becomes the lid, which snaps shut with a latch at the front.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'sx', label: 'Sections (sx)', type: 'sections', default: [100], help: 'Width, or the widths of compartments separated by dividers, e.g. 50:50' },
        { id: 'y', label: 'Depth (y)', type: 'number', default: 100, unit: 'mm', min: 20, max: 1000, step: 1 },
        { id: 'h', label: 'Height (h)', type: 'number', default: 100, unit: 'mm', min: 20, max: 1000, step: 1 },
        { id: 'outside', label: outsideParam.label, type: 'boolean', default: true, help: outsideParam.help },
        { id: 'radius', label: 'Corner radius', type: 'number', default: 15, unit: 'mm', min: 0, max: 500, step: 1, help: '0 picks the largest that fits' },
        { id: 'latchsize', label: 'Latch size', type: 'number', default: 8, unit: 'x t', min: 2, max: 30, step: 0.5, help: 'Length of the latch at the front (multiples of thickness)' },
      ],
    },
    flexGroup,
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
