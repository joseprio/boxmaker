import { Boxes, place, type EdgeSpec } from '../engine/boxes';
import { dimParam, fingerJointGroup, fingerJointParams, floorThickness, materialWithFloorGroup, outsideParam } from './common';
import { bool, finishModel, num, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  let x = num(v, 'x');
  let y = num(v, 'y');
  let h = num(v, 'h');
  const bot = str(v, 'bottom_edge');
  const tf = floorThickness(v);
  const botEdge = b.floorEdge(bot, tf);
  const side = 'F';
  if (bool(v, 'outside')) {
    x = b.adjustSize(x, side, side);
    y = b.adjustSize(y);
    h = b.adjustSize(h, botEdge, 'e');
  }

  // the two hole plates, measured from the floor (their centre lines)
  const y1 = h - num(v, 'plate1_offset') - t / 2;
  const y2 = y1 - num(v, 'plate_gap');
  if (y2 - t / 2 <= 0) throw new Error('The plates do not fit: reduce the plate gap or the top offset');

  const nx = Math.max(1, Math.round(num(v, 'nx')));
  const ny = Math.max(1, Math.round(num(v, 'ny')));
  const pen = num(v, 'pen_diam');
  const cap = num(v, 'cap_diam');
  if (cap < pen) throw new Error('The cap diameter must be at least the pen diameter');
  // the grid (cap diameter apart) must leave half a cap free all round
  if (nx * cap > x - cap || ny * cap > y - cap) throw new Error(`A ${nx} x ${ny} grid of ${cap} mm caps does not fit the plate`);

  const plateHoles = () => {
    const x0 = (x - (nx - 1) * cap) / 2;
    const y0 = (y - (ny - 1) * cap) / 2;
    for (let row = 0; row < ny; row++) {
      for (let col = 0; col < nx; col++) {
        const cx = x0 + col * cap;
        const cy = y0 + row * cap;
        b.hole(cx, cy, pen / 2);
        if (bool(v, 'cap_rings') && cap > pen) {
          // the space each cap needs, engraved round the hole
          const ring = Array.from({ length: 61 }, (_, i) => {
            const a = (2 * Math.PI * i) / 60;
            return { x: cx + (cap / 2) * Math.cos(a), y: cy + (cap / 2) * Math.sin(a) };
          });
          b.engravePath(ring);
        }
      }
    }
  };
  const wallHoles = (l: number) => () => {
    b.fingerHolesAt(0, y1, l, 0);
    b.fingerHolesAt(0, y2, l, 0);
  };

  const ignoreWidths = [1, 6];
  const walls: Array<[number, EdgeSpec[], string, ReturnType<typeof place.wallXZ>]> = [
    [x, [botEdge, side, 'e', side], 'front', place.wallXZ(0, 0, 0)],
    [x, [botEdge, side, 'e', side], 'back', place.wallXZ(0, y + t, 0)],
    [y, [botEdge, 'f', 'e', 'f'], 'left', place.wallYZ(-t, 0, 0)],
    [y, [botEdge, 'f', 'e', 'f'], 'right', place.wallYZ(x, 0, 0)],
  ];
  for (const [l, edges, label, placement] of walls) b.rectangularWall(l, h, edges, { label, ignoreWidths, callback: [wallHoles(l)], placement });
  if (bot !== 'e') b.rectangularWall(x, y, 'ffff', { label: 'bottom', thickness: tf, placement: place.plateXY(0, 0, -tf) });
  for (const [label, yc] of [
    ['plate 1', y1],
    ['plate 2', y2],
  ] as const) {
    const part = b.rectangularWall(x, y, 'ffff', { label, group: 'divider', callback: [plateHoles], placement: place.plateXY(0, 0, yc - t / 2) });
    part.engraveFace = 'outer';
  }
  return finishModel(b);
}

export const penHolderBox: GeneratorDef = {
  id: 'penholderbox',
  name: 'Pen Holder Box',
  category: 'Tray',
  description: 'Box with two plates of pen holes, one under the rim and one lower down, holding pens upright in a grid.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        dimParam('x', 'Width (x)', 100, 'Inner width'),
        dimParam('y', 'Depth (y)', 100, 'Inner depth'),
        dimParam('h', 'Height (h)', 100, 'Inner height'),
        outsideParam,
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
    {
      id: 'plates',
      title: 'Hole plates',
      params: [
        { id: 'plate1_offset', label: 'Top offset', type: 'number', default: 3, unit: 'mm', min: 0, max: 500, step: 0.5, help: 'From the rim down to the upper plate' },
        { id: 'plate_gap', label: 'Plate gap', type: 'number', default: 80, unit: 'mm', min: 1, max: 1000, step: 1, help: 'Distance between the two plates' },
        { id: 'nx', label: 'Holes across (x)', type: 'number', default: 4, min: 1, max: 50, step: 1 },
        { id: 'ny', label: 'Holes deep (y)', type: 'number', default: 4, min: 1, max: 50, step: 1 },
        { id: 'pen_diam', label: 'Pen diameter', type: 'number', default: 12, unit: 'mm', min: 1, max: 100, step: 0.5, help: 'Size of the holes' },
        { id: 'cap_diam', label: 'Cap diameter', type: 'number', default: 16, unit: 'mm', min: 1, max: 100, step: 0.5, help: 'Room each pen needs; also the hole spacing' },
        { id: 'cap_rings', label: 'Engrave cap rings', type: 'boolean', default: true, help: 'Mark the room for each cap around its hole' },
      ],
    },
    materialWithFloorGroup,
    fingerJointGroup,
  ],
  build,
};
