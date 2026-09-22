import { Boxes, place, type EdgeSpec } from '../engine/boxes';
import { fingerJointGroup, fingerJointParams, materialGroup, outsideParam } from './common';
import { bool, finishModel, num, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  let x = num(v, 'x');
  let y = num(v, 'y');
  let h = num(v, 'h');
  const n = Math.max(1, Math.round(num(v, 'n')));
  const bot = str(v, 'bottom_edge');
  const top = str(v, 'top');

  if (x < y) [x, y] = [y, x];
  if (bool(v, 'outside')) {
    x = b.adjustSize(x);
    y = b.adjustSize(y);
    if (top === 'none') h = b.adjustSize(h, false);
    else if (top === 'angled lid2') h = b.adjustSize(h) - t;
    else h = b.adjustSize(h);
  }

  // the base is a regular (2n+2)-gon stretched along x by lengthening two opposite sides
  const corners = 2 * n + 2;
  const turn = 360 / corners;
  const [r, hp, side] = b.regularPolygon(corners, { h: y / 2 });
  const lx = n % 2 ? x - 2 * hp + side : x - 2 * r + side;
  if (lx <= 0) throw new Error('Width must be larger than the depth for this number of walls');
  const sides = [lx, ...Array(n).fill(side), lx, ...Array(n).fill(side)];

  b.addAngledFingerJoints(turn);

  // polygon corners in box space: first (long) side along +X from the origin
  const pts: { x: number; y: number }[] = [];
  {
    let px = 0;
    let py = 0;
    let ang = 0;
    for (const l of sides) {
      pts.push({ x: px, y: py });
      px += Math.cos(ang) * l;
      py += Math.sin(ang) * l;
      ang += (turn * Math.PI) / 180;
    }
  }
  const x0 = (x - lx) / 2;

  const floor = (edge: string, z: number, label: string, group = 'box', hole = false) => {
    const e = b.getEdge(edge);
    b.freePart(
      () => {
        b.moveTo(0, -e.startWidth());
        if (hole) {
          const [, , hside] = b.regularPolygon(corners, { h: y / 2 - t });
          const dx = side - hside;
          b.saved(() => {
            b.moveTo(dx / 2, e.startWidth() + t);
            for (const l of [lx - dx, ...Array(n).fill(hside), lx - dx, ...Array(n).fill(hside)]) {
              b.edge(l);
              b.corner(turn);
            }
          });
        }
        for (const l of sides) {
          e.draw(l);
          b.edgeCorner(e, e, turn);
        }
      },
      { label, group, placement: place.plateXY(x0, 0, z) },
    );
  };

  if (bot !== 'e') floor('f', -t, 'bottom');
  if (top === 'angled lid') {
    floor('e', h - t, 'lower lid', 'lid');
    floor('E', h, 'upper lid', 'lid');
  } else if (top === 'angled hole' || top === 'angled lid2') {
    floor('F', h, 'top rim', 'box', true);
    if (top === 'angled lid2') floor('E', h + t, 'upper lid', 'lid');
  }

  const fingers = top === 'angled lid2' || top === 'angled hole';
  const topEdge = fingers ? 'f' : 'e';
  const wall = (l: number, cnt: number, flip: boolean) => {
    const c0 = pts[cnt - 1];
    const c1 = pts[cnt % pts.length];
    const s: EdgeSpec = flip ? 'G' : 'g';
    b.rectangularWall(l, h, [bot, s, topEdge, s], {
      label: `wall ${cnt}`,
      placement: {
        origin: { x: x0 + c0.x, y: c0.y, z: 0 },
        u: { x: (c1.x - c0.x) / l, y: (c1.y - c0.y) / l, z: 0 },
        v: { x: 0, y: 0, z: 1 },
      },
    });
  };
  // alternate the joint polarity so neighbours mate (same scheme as upstream)
  let cnt = 0;
  for (let j = 0; j < 2; j++) {
    wall(lx, ++cnt, j === 0 || n % 2 === 1);
    for (let i = 0; i < n; i++) wall(side, ++cnt, (i + j * ((n + 1) % 2)) % 2 === 1);
  }
  return finishModel(b);
}

export const angledBox: GeneratorDef = {
  id: 'angledbox',
  name: 'Angled Box',
  category: 'Box',
  description: 'Elongated box with both ends cornered like half a polygon. The walls meet at angled finger joints.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'x', label: 'Width (x)', type: 'number', default: 100, unit: 'mm', min: 10, max: 2000, step: 1, help: 'Inner width (the longer side)' },
        { id: 'y', label: 'Depth (y)', type: 'number', default: 100, unit: 'mm', min: 10, max: 2000, step: 1, help: 'Inner depth' },
        { id: 'h', label: 'Height (h)', type: 'number', default: 100, unit: 'mm', min: 5, max: 1000, step: 1, help: 'Inner height' },
        { id: 'n', label: 'Walls per end', type: 'number', default: 5, min: 1, max: 12, step: 1, help: 'Number of angled walls at each end' },
        outsideParam,
      ],
    },
    {
      id: 'ends',
      title: 'Top & bottom',
      params: [
        {
          id: 'top',
          label: 'Top',
          type: 'select',
          default: 'none',
          options: [
            { value: 'none', label: 'Open' },
            { value: 'angled hole', label: 'Rim with polygon hole' },
            { value: 'angled lid', label: 'Loose lid (two plates)' },
            { value: 'angled lid2', label: 'Rim with loose lid on top' },
          ],
        },
        {
          id: 'bottom_edge',
          label: 'Bottom edge',
          type: 'select',
          default: 'h',
          options: [
            { value: 'h', label: 'Finger holes (walls stand below the floor)' },
            { value: 'F', label: 'Finger joints' },
            { value: 's', label: 'Stackable feet with finger holes' },
            { value: 'e', label: 'Open (no floor)' },
          ],
        },
      ],
    },
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
