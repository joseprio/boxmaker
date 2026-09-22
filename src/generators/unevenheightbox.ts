import { Boxes, place, type EdgeSpec } from '../engine/boxes';
import type { Placement } from '../engine/part';
import { dimParam, fingerJointGroup, fingerJointParams, materialGroup, outsideParam } from './common';
import { bool, finishModel, num, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  let x = num(v, 'x');
  let y = num(v, 'y');
  const bot = str(v, 'bottom_edge');
  const addLid = bool(v, 'add_lid');
  const lidHeight = num(v, 'lid_height');
  let heights = [num(v, 'height0'), num(v, 'height1'), num(v, 'height2'), num(v, 'height3')];

  if (bool(v, 'outside')) {
    x = b.adjustSize(x);
    y = b.adjustSize(y);
    heights = heights.map((hh) => b.adjustSize(hh, bot, addLid));
  }

  // Walls run counter-clockwise starting at the front-left corner.
  // Corner heights: 0 = front left, 1 = front right, 2 = back right, 3 = back left.
  const wallPlacements: Placement[] = [
    place.wallXZ(0, 0, 0), // front, left -> right
    place.wallYZ(x, 0, 0), // right, front -> back
    { origin: { x, y: y + t, z: 0 }, u: { x: -1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 } }, // back, right -> left
    place.wallYZ(-t, y, 0), // left, back -> front
  ];
  // left wall runs back -> front
  wallPlacements[3] = { origin: { x: -t, y, z: 0 }, u: { x: 0, y: -1, z: 0 }, v: { x: 0, y: 0, z: 1 } };

  const wallEdges: EdgeSpec[][] = [
    [bot, 'F', 'e', 'F'],
    [bot, 'f', 'e', 'f'],
    [bot, 'F', 'e', 'F'],
    [bot, 'f', 'e', 'f'],
  ];
  const widths = [x, y, x, y];
  const labels = ['front', 'right', 'back', 'left'];
  for (let i = 0; i < 4; i++) {
    b.trapezoidWall(widths[i], heights[i], heights[(i + 1) % 4], wallEdges[i], {
      label: labels[i],
      placement: wallPlacements[i],
    });
  }

  if (bot !== 'e') {
    b.rectangularWall(x, y, 'ffff', { label: 'bottom', placement: place.plateXY(0, 0, -t) });
  }

  if (addLid) {
    const maxh = Math.max(...heights);
    const lidHeights = heights.map((hh) => maxh - hh + lidHeight);
    const plateEdges: EdgeSpec[] = [0, 1, 2, 3].map((i) =>
      lidHeights[i] === 0 && lidHeights[(i + 1) % 4] === 0 ? 'E' : 'f',
    );
    const zLid = maxh + lidHeight;
    b.rectangularWall(x, y, plateEdges, { label: 'lid top', group: 'lid', placement: place.plateXY(0, 0, zLid) });
    // lid walls hang down from the lid plate, mirroring the box walls
    const lidWallEdges: EdgeSpec[][] = [
      ['F', 'F', 'e', 'F'],
      ['F', 'f', 'e', 'f'],
      ['F', 'F', 'e', 'F'],
      ['F', 'f', 'e', 'f'],
    ];
    // Each lid wall sits above its box wall, drawn upside down: local y points downwards.
    const lidPlacements: Placement[] = [
      { origin: { x, y: 0, z: zLid }, u: { x: -1, y: 0, z: 0 }, v: { x: 0, y: 0, z: -1 } },
      { origin: { x: -t, y: 0, z: zLid }, u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: -1 } },
      { origin: { x: 0, y: y + t, z: zLid }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: -1 } },
      { origin: { x: x + t, y: y + t, z: zLid }, u: { x: 0, y: -1, z: 0 }, v: { x: 0, y: 0, z: -1 } },
    ];
    // walls go the other way round when mirrored: front wall spans corner 1 -> 0
    const lidPairs: Array<[number, number, number]> = [
      [lidHeights[1], lidHeights[0], x],
      [lidHeights[2], lidHeights[1], y],
      [lidHeights[3], lidHeights[2], x],
      [lidHeights[0], lidHeights[3], y],
    ];
    for (let i = 0; i < 4; i++) {
      const [ha, hb, w] = lidPairs[i];
      if (ha === 0 && hb === 0) continue;
      b.trapezoidWall(w, ha, hb, lidWallEdges[i], {
        label: `lid ${labels[i]}`,
        group: 'lid',
        placement: lidPlacements[i],
      });
    }
  }
  return finishModel(b);
}

export const unevenHeightBox: GeneratorDef = {
  id: 'unevenheightbox',
  name: 'Uneven Height Box',
  category: 'Box',
  description: 'Box with a different height at each corner, with an optional lid that makes up the difference. Works best with the high corners opposite each other.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        dimParam('x', 'Width (x)', 100, 'Inner width'),
        dimParam('y', 'Depth (y)', 100, 'Inner depth'),
        { id: 'height0', label: 'Height front left', type: 'number', default: 50, unit: 'mm', min: 0, max: 1000, step: 1 },
        { id: 'height1', label: 'Height front right', type: 'number', default: 50, unit: 'mm', min: 0, max: 1000, step: 1 },
        { id: 'height2', label: 'Height back right', type: 'number', default: 100, unit: 'mm', min: 0, max: 1000, step: 1 },
        { id: 'height3', label: 'Height back left', type: 'number', default: 100, unit: 'mm', min: 0, max: 1000, step: 1 },
        outsideParam,
      ],
    },
    {
      id: 'edges',
      title: 'Lid & bottom',
      params: [
        { id: 'add_lid', label: 'Add a lid', type: 'boolean', default: true, help: 'The lid fills the difference up to the highest corner' },
        { id: 'lid_height', label: 'Extra lid height', type: 'number', default: 0, unit: 'mm', min: 0, max: 500, step: 1, showIf: (v) => Boolean(v.add_lid) },
        {
          id: 'bottom_edge',
          label: 'Bottom edge',
          type: 'select',
          default: 'F',
          options: [
            { value: 'F', label: 'Finger joints' },
            { value: 'h', label: 'Finger holes' },
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
