import { Boxes, place } from '../engine/boxes';
import { dimParam, fingerJointGroup, fingerJointParams, materialGroup, outsideParam } from './common';
import { bool, finishModel, num, type BoxModel, type GeneratorDef, type ParamValues } from './types';

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  let x = num(v, 'x');
  let y = num(v, 'y');
  let h = num(v, 'h');
  if (bool(v, 'outside')) {
    x = b.adjustSize(x);
    y = b.adjustSize(y);
    h = b.adjustSize(h);
  }

  b.rectangularWall(x, h, 'FFFF', { label: 'Wall 1', placement: place.wallXZ(0, 0, 0) });
  b.rectangularWall(x, h, 'FFFF', { label: 'Wall 3', placement: place.wallXZ(0, y + t, 0) });
  b.rectangularWall(y, h, 'FfFf', { label: 'Wall 2', placement: place.wallYZ(-t, 0, 0) });
  b.rectangularWall(y, h, 'FfFf', { label: 'Wall 4', placement: place.wallYZ(x, 0, 0) });
  b.rectangularWall(x, y, 'ffff', { label: 'Top', placement: place.plateXY(0, 0, h) });
  b.rectangularWall(x, y, 'ffff', { label: 'Bottom', placement: place.plateXY(0, 0, -t) });

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
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
