import { Boxes, CompoundEdge, place, type EdgeSpec } from '../engine/boxes';
import { FingerJointEdge } from '../engine/edges';
import { FingerJointSettings } from '../engine/settings';
import { fingerJointGroup, fingerJointParams, floorThickness, materialWithFloorGroup } from './common';
import { bool, finishModel, num, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  const h = num(v, 'h');
  const tf = floorThickness(v);
  const botEdge = b.floorEdge(str(v, 'bottom_edge'), tf);

  const nx = Math.max(1, Math.round(num(v, 'nx')));
  const ny = Math.max(1, Math.round(num(v, 'ny')));
  const d = num(v, 'bottle_diam') + num(v, 'clearance');
  const s = num(v, 'spacing');
  const handle = bool(v, 'handle');
  if (handle && ny % 2) throw new Error('The carry handle runs between two rows: use an even number of rows');

  // the box is sized round the bottles: `s` between neighbouring holes and from each hole to the walls
  const span = (n: number) => n * d + (n + 1) * s;
  const x = span(nx);
  // with a handle, the plate is split into two halves on either side of it
  const halves = handle ? 2 : 1;
  const rowsPerPlate = ny / halves;
  const yp = span(rowsPerPlate);
  const y = halves * yp + (handle ? t : 0);

  // the hole plate's centre line, measured from the floor
  const y1 = h - num(v, 'plate_offset') - t / 2;
  if (y1 - t / 2 <= 0) throw new Error('The hole plate does not fit: reduce its offset or raise the walls');

  const plateHoles = () => {
    for (let row = 0; row < rowsPerPlate; row++) {
      for (let col = 0; col < nx; col++) b.hole(s + d / 2 + col * (d + s), s + d / 2 + row * (d + s), d / 2);
    }
  };

  // handle board: stands on the floor between the two plate halves and rises above the walls
  const hh = num(v, 'handle_height');
  const holeW = num(v, 'handle_width');
  const holeH = num(v, 'handle_hole_height');
  const holeOff = num(v, 'handle_offset');
  if (handle) {
    if (holeW >= x) throw new Error(`The handle hole is wider than the holder (${Math.round(x)} mm)`);
    if (holeOff + holeH > hh) throw new Error('The handle hole reaches below the top of the walls: raise the handle or reduce the hole');
  }
  const yHandle = yp; // the board's front face

  const sideHoles = (l: number) => () => {
    if (handle) {
      b.fingerHolesAt(0, y1, yp, 0);
      b.fingerHolesAt(yp + t, y1, yp, 0);
      b.fingerHolesAt(yHandle + t / 2, 0, h, 90);
    } else b.fingerHolesAt(0, y1, l, 0);
  };
  const frontHoles = (l: number) => () => b.fingerHolesAt(0, y1, l, 0);

  const walls: Array<[number, EdgeSpec[], string, ReturnType<typeof place.wallXZ>, () => void]> = [
    [x, [botEdge, 'F', 'e', 'F'], 'front', place.wallXZ(0, 0, 0), frontHoles(x)],
    [x, [botEdge, 'F', 'e', 'F'], 'back', place.wallXZ(0, y + t, 0), frontHoles(x)],
    [y, [botEdge, 'f', 'e', 'f'], 'left', place.wallYZ(-t, 0, 0), sideHoles(y)],
    [y, [botEdge, 'f', 'e', 'f'], 'right', place.wallYZ(x, 0, 0), sideHoles(y)],
  ];
  for (const [l, edges, label, placement, holes] of walls) b.rectangularWall(l, h, edges, { label, ignoreWidths: [1, 6], callback: [holes], placement });

  b.rectangularWall(x, y, 'ffff', {
    label: 'bottom',
    thickness: tf,
    callback: [handle ? () => b.fingerHolesAt(0, yHandle + t / 2, x, 0) : undefined],
    placement: place.plateXY(0, 0, -tf),
  });

  if (handle) {
    b.rectangularWall(x, yp, 'ffef', { label: 'plate front', group: 'divider', callback: [plateHoles], placement: place.plateXY(0, 0, y1 - t / 2) });
    b.rectangularWall(x, yp, 'efff', { label: 'plate back', group: 'divider', callback: [plateHoles], placement: place.plateXY(0, yp + t, y1 - t / 2) });

    // its fingers go as deep as the floor is thick
    const fs = new FingerJointSettings(t, fingerJointParams(v));
    fs.thickness = tf;
    const bottom = new FingerJointEdge(b, fs);
    const H = h + hh;
    b.rectangularWall(x, H, [bottom, new CompoundEdge(b, ['f', 'e'], [h, hh]), 'e', new CompoundEdge(b, ['e', 'f'], [hh, h])], {
      label: 'handle',
      group: 'divider',
      callback: [() => b.rectangularHole(x / 2, H - holeOff - holeH / 2, holeW, holeH, num(v, 'handle_radius'))],
      placement: place.wallXZ(0, yHandle + t, 0),
    });
  } else {
    b.rectangularWall(x, y, 'ffff', { label: 'plate', group: 'divider', callback: [plateHoles], placement: place.plateXY(0, 0, y1 - t / 2) });
  }
  return finishModel(b);
}

const handleOn = (v: ParamValues) => Boolean(v.handle);

export const bottleHolder: GeneratorDef = {
  id: 'bottleholder',
  name: 'Bottle Holder',
  category: 'Tray',
  description: 'Bottle carrier sized round its bottles: a grid of holes in a plate under the rim, with an optional carry handle between the rows.',
  groups: [
    {
      id: 'bottles',
      title: 'Bottles',
      params: [
        { id: 'bottle_diam', label: 'Bottle diameter', type: 'number', default: 65, unit: 'mm', min: 5, max: 300, step: 0.5, help: 'Widest part of the bottle' },
        { id: 'nx', label: 'Bottles per row', type: 'number', default: 3, min: 1, max: 20, step: 1 },
        { id: 'ny', label: 'Rows', type: 'number', default: 2, min: 1, max: 20, step: 1, help: 'Total bottles = bottles per row x rows' },
        { id: 'clearance', label: 'Clearance', type: 'number', default: 2, unit: 'mm', min: 0, max: 20, step: 0.5, help: 'Added to the bottle diameter for the holes' },
        { id: 'spacing', label: 'Spacing', type: 'number', default: 8, unit: 'mm', min: 1, max: 100, step: 0.5, help: 'Material between neighbouring holes and between the holes and the walls' },
      ],
    },
    {
      id: 'dims',
      title: 'Walls',
      params: [
        { id: 'h', label: 'Wall height', type: 'number', default: 100, unit: 'mm', min: 10, max: 1000, step: 1, help: 'Inner height; width and depth follow from the bottles' },
        { id: 'plate_offset', label: 'Plate offset', type: 'number', default: 3, unit: 'mm', min: 1, max: 500, step: 0.5, help: 'From the rim down to the hole plate' },
        {
          id: 'bottom_edge',
          label: 'Bottom edge',
          type: 'select',
          default: 'h',
          options: [
            { value: 'h', label: 'Finger holes (walls stand below the floor)' },
            { value: 'F', label: 'Finger joints' },
            { value: 's', label: 'Stackable feet with finger holes' },
          ],
        },
      ],
    },
    {
      id: 'handle',
      title: 'Carry handle',
      params: [
        { id: 'handle', label: 'Carry handle', type: 'boolean', default: true, help: 'A board between the middle rows rising above the walls, with a hand hole (needs an even number of rows)' },
        { id: 'handle_height', label: 'Height above walls', type: 'number', default: 80, unit: 'mm', min: 10, max: 500, step: 1, showIf: handleOn },
        { id: 'handle_width', label: 'Hole width', type: 'number', default: 100, unit: 'mm', min: 10, max: 1000, step: 1, showIf: handleOn },
        { id: 'handle_hole_height', label: 'Hole height', type: 'number', default: 30, unit: 'mm', min: 5, max: 200, step: 0.5, showIf: handleOn },
        { id: 'handle_radius', label: 'Hole radius', type: 'number', default: 15, unit: 'mm', min: 0, max: 100, step: 0.5, help: 'Corner radius (half the height for round ends)', showIf: handleOn },
        { id: 'handle_offset', label: 'Hole offset', type: 'number', default: 15, unit: 'mm', min: 0, max: 500, step: 0.5, help: 'From the top of the handle down to the hole', showIf: handleOn },
      ],
    },
    materialWithFloorGroup,
    fingerJointGroup,
  ],
  build,
};
