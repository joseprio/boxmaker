import { Boxes, CompoundEdge, place, type EdgeSpec } from '../engine/boxes';
import { rotatePlacement, type Placement } from '../engine/part';
import { dimParam, fingerJointGroup, fingerJointParams, materialGroup, outsideParam } from './common';
import { addChestHinges, addHingeDisc, chestHingeGroup, chestHingeSettings, lidOpenParam } from './integratedhingebox';
import { bool, finishModel, num, type BoxModel, type GeneratorDef, type ParamValues } from './types';

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
  const n = Math.round(num(v, 'n'));
  if (n < 3) throw new Error('The lid needs at least 3 sides');
  if (bool(v, 'outside')) {
    x = b.adjustSize(x);
    y = b.adjustSize(y);
    h = b.adjustSize(h, 'f', false);
  }
  addChestHinges(b, chestHingeSettings(t, v));
  const hy = b.getEdge('O').startWidth();
  h -= hy;
  if (h < 0) throw new Error('Box too low for the hinge');

  // the lid is half a regular 2(n-1)-gon over the depth, joined at angled finger joints
  const step = 180 / (n - 1);
  b.addAngledFingerJoints(step);
  const [, , side] = b.regularPolygon(2 * (n - 1), { h: y / 2 });
  const w = b.getEdge('P').startWidth(); // how far the lid reaches below its polygon, down to the pivot

  // box space: X = width, Y = 0 at the front .. y at the back, Z up. The lid
  // turns about the X axis through the hinge holes at (y + t, zp).
  const zp = h + hy;
  const turn = (p: Placement): Placement => rotatePlacement(p, { x: 0, y: y + t, z: zp }, X, -num(v, 'lid_open'));

  // box -----------------------------------------------------------------------
  b.rectangularWall(x, y, 'FFFF', { label: 'bottom', placement: place.plateXY(0, 0, -t) });
  b.rectangularWall(x, h, 'fFQF', { label: 'front', ignoreWidths: [2, 5], placement: place.wallXZ(0, 0, 0) });
  const right: Placement = { origin: { x, y: 0, z: 0 }, u: Y, v: Z };
  b.rectangularWall(y, h, 'ffof', { label: 'right', ignoreWidths: [5], placement: right });
  addHingeDisc(b, 'o', 'hinge disc right', turn(right));
  const left: Placement = { origin: { x: 0, y, z: 0 }, u: neg(Y), v: Z };
  b.rectangularWall(y, h, 'ffOf', { label: 'left', ignoreWidths: [2], placement: left });
  addHingeDisc(b, 'O', 'hinge disc left', turn(left));
  const back: EdgeSpec[] = ['f', new CompoundEdge(b, ['F', 'e'], [h, hy]), 'e', new CompoundEdge(b, ['e', 'F'], [hy, h])];
  b.rectangularWall(x, h + hy, back, { label: 'back', placement: place.wallXZ(0, y + t, 0) });

  // lid -------------------------------------------------------------------------
  // profile ends: the lid's polygon sits w above the pivot; its sides reach down to it
  const zb = zp + w;
  const lidSide = (bottom: 'p' | 'P') => () => {
    b.getEdge(bottom).draw(y);
    b.corner(90);
    b.getEdge('f').draw(side / 2 + (bottom === 'p' ? w : 0));
    for (let i = 0; i < n - 2; i++) {
      b.corner(step);
      b.getEdge('f').draw(side);
    }
    b.corner(step);
    b.getEdge('f').draw(side / 2 + (bottom === 'P' ? w : 0));
    b.corner(90);
  };
  // 'p' runs back -> front on the polygon line; 'P' front -> back from the pivot level
  b.freePart(lidSide('p'), { label: 'lid left', group: 'lid', placement: turn({ origin: { x: 0, y, z: zb }, u: neg(Y), v: Z }) });
  b.freePart(lidSide('P'), { label: 'lid right', group: 'lid', placement: turn({ origin: { x, y: 0, z: zp }, u: Y, v: Z }) });

  // panels, walking the profile from the back (pins at the bottom) over the top to the front
  const lengths = [side / 2, ...Array(n - 2).fill(side), side / 2 + w];
  const edges: string[][] = [['q', 'F', 'g', 'F'], ...Array(n - 2).fill(['G', 'F', 'g', 'F']), ['G', 'F', 'e', 'F']];
  const labels = ['lid back', ...Array.from({ length: n - 2 }, (_, i) => `lid top ${i + 1}`), 'lid front'];
  let py = y;
  let pz = zb;
  lengths.forEach((l, k) => {
    const a = (k * step * Math.PI) / 180;
    const d = { x: 0, y: -Math.sin(a), z: Math.cos(a) };
    // local x runs from X = x to 0 so the material faces outwards
    b.rectangularWall(x, l, edges[k], { label: labels[k], group: 'lid', placement: turn({ origin: { x, y: py, z: pz }, u: neg(X), v: d }) });
    py += d.y * l;
    pz += d.z * l;
  });
  return finishModel(b);
}

export const pirateChest: GeneratorDef = {
  id: 'piratechest',
  name: 'Pirate Chest',
  category: 'Box',
  description:
    'Chest with a rounded lid of angled panels, pivoting on pins in round holes in the sides. Fit the lid into the hinges before gluing the second side.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        dimParam('x', 'Width (x)', 100, 'Inner width'),
        dimParam('y', 'Depth (y)', 100, 'Inner depth'),
        dimParam('h', 'Height (h)', 100, 'Height of the box up to the lid'),
        { id: 'n', label: 'Lid panels', type: 'number', default: 5, min: 3, max: 20, step: 1, help: 'Number of panels in the rounded lid' },
        outsideParam,
        lidOpenParam,
      ],
    },
    chestHingeGroup,
    materialGroup,
    {
      ...fingerJointGroup,
      params: fingerJointGroup.params.map((p) => (p.id === 'fj_finger' || p.id === 'fj_space' ? { ...p, default: 1 } : p)),
    },
  ],
  build,
};
