import { Boxes, place, type EdgeSpec } from '../engine/boxes';
import {
  dimParam,
  fingerJointGroup,
  fingerJointParams,
  floorThickness,
  handleGroups,
  handleHole,
  materialWithFloorGroup,
  outsideParam,
  rowEngraving,
  rowEngravingGroup,
  type HandleSide,
} from './common';
import { bool, finishModel, num, type BoxModel, type GeneratorDef, type ParamValues } from './types';

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  let x = num(v, 'x');
  let y = num(v, 'y');
  let h = num(v, 'h');
  const tf = floorThickness(v);
  const bottom = b.floorEdge('F', tf);
  if (bool(v, 'outside')) {
    x = b.adjustSize(x);
    y = b.adjustSize(y);
    h = b.adjustSize(h, bottom, true);
  }

  const rows = rowEngraving(b, v);
  const fb = rows.sides === 'frontback' ? rows.rows(x, h) : undefined;
  const lr = rows.sides === 'sides' ? rows.rows(y, h) : undefined;
  // Wall 1 is the front, Wall 3 the back, Wall 2 the left and Wall 4 the right
  const walls: Array<[number, EdgeSpec[], string, HandleSide, ReturnType<typeof place.wallXZ>, (() => void) | undefined]> = [
    [x, [bottom, 'F', 'F', 'F'], 'Wall 1', 'front', place.wallXZ(0, 0, 0), fb],
    [x, [bottom, 'F', 'F', 'F'], 'Wall 3', 'back', place.wallXZ(0, y + t, 0), fb],
    [y, [bottom, 'f', 'F', 'f'], 'Wall 2', 'left', place.wallYZ(-t, 0, 0), lr],
    [y, [bottom, 'f', 'F', 'f'], 'Wall 4', 'right', place.wallYZ(x, 0, 0), lr],
  ];
  for (const [l, edges, label, side, placement, cb] of walls) {
    const handle = handleHole(b, v, side, l, h);
    const part = b.rectangularWall(l, h, edges, { label, callback: [cb, null, handle], placement });
    if (cb) part.engraveFace = 'inner';
  }
  b.rectangularWall(x, y, 'ffff', { label: 'Top', placement: place.plateXY(0, 0, h) });
  b.rectangularWall(x, y, 'ffff', { label: 'Bottom', thickness: tf, placement: place.plateXY(0, 0, -tf) });

  return finishModel(b);
}

export const closedBox: GeneratorDef = {
  id: 'closedbox',
  name: 'Closed Box',
  category: 'Box',
  description:
    'Fully closed box with finger joints on all edges. More of a building block than a finished item - cut it open or add holes as needed.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        dimParam('x', 'Width (x)', 100, 'Inner width'),
        dimParam('y', 'Depth (y)', 100, 'Inner depth'),
        dimParam('h', 'Height (h)', 100, 'Inner height'),
        outsideParam,
      ],
    },
    ...handleGroups,
    rowEngravingGroup,
    materialWithFloorGroup,
    fingerJointGroup,
  ],
  build,
};
