import { Boxes, place } from '../engine/boxes';
import { fingerJointGroup, fingerJointParams, materialGroup } from './common';
import { bool, defaultValues, finishModel, num, str, type BoxModel, type GeneratorDef, type ParamGroup, type ParamValues } from './types';
import { typeTray } from './typetray';

/*
 * Laser-cut take on Gridfinity (gridfinity.xyz), after boxes.py's GridfinityBase:
 * the baseplate is a plate with a rounded square opening per 42 mm grid cell, and
 * each bin stands on a stack of pads per cell that drop into those openings. Bins
 * are 0.5 mm smaller than their cells, so neighbours never touch.
 */

const BIN_GAP = 0.5; // a bin is units x pitch - 0.5 mm wide
const HEIGHT_UNIT = 7; // Gridfinity height unit, mm
const MAGNET_SPACING = 26; // magnet centres, 8 mm in from each side of a 42 mm cell

const gridGroup: ParamGroup = {
  id: 'grid',
  title: 'Grid',
  collapsed: true,
  params: [
    { id: 'pitch', label: 'Pitch', type: 'number', default: 42, unit: 'mm', min: 10, max: 200, step: 0.5, help: 'Grid cell size (42 mm is standard Gridfinity)' },
    { id: 'opening', label: 'Opening', type: 'number', default: 38, unit: 'mm', min: 5, max: 200, step: 0.1, help: 'Square opening per cell in the baseplate' },
    { id: 'opening_radius', label: 'Opening radius', type: 'number', default: 2, unit: 'mm', min: 0, max: 20, step: 0.1, help: 'Corner radius of the openings and the bin feet' },
    { id: 'layers', label: 'Layers', type: 'number', default: 1, min: 1, max: 5, step: 1, help: 'Grid plates stacked in the baseplate, or pads stacked per bin foot; use the same number for both' },
  ],
};

const units = (v: ParamValues, id: string) => Math.max(1, Math.round(num(v, id)));

// --- baseplate --------------------------------------------------------------

function buildBase(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  const nx = units(v, 'x');
  const ny = units(v, 'y');
  const pitch = num(v, 'pitch');
  const opening = num(v, 'opening');
  const r = Math.min(num(v, 'opening_radius'), opening / 2);
  const m = num(v, 'margin');
  const layers = Math.max(1, Math.round(num(v, 'layers')));
  const h = num(v, 'h');
  if (opening >= pitch) throw new Error('The opening must be smaller than the pitch');
  const x = nx * pitch + 2 * m;
  const y = ny * pitch + 2 * m;
  const corner = h ? 0 : Math.min(4, m + (pitch - opening) / 2);

  // centre of every cell, in plate coordinates
  const cells: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) cells.push({ x: m + (i + 0.5) * pitch, y: m + (j + 0.5) * pitch });
  // callbacks run in a frame shifted by (dx, dy) from the plate's corner: roundedPlate's
  // starts `corner` along the bottom edge
  const openings = (dx: number) => () => cells.forEach((c) => b.rectangularHole(c.x - dx, c.y, opening, opening, r));
  const magnets = (dx: number, dy = 0) => () => {
    const d = (pitch / 42) * MAGNET_SPACING;
    for (const c of cells) {
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.hole(c.x - dx + (sx * d) / 2, c.y - dy + (sy * d) / 2, num(v, 'magnet_d') / 2);
    }
  };

  for (let k = 0; k < layers; k++) {
    const z = -(k + 1) * t;
    const label = layers > 1 ? `grid ${k + 1}` : 'grid';
    if (h && k === 0) {
      // the top grid plate is the floor of the surrounding tray
      b.rectangularWall(x, y, 'ffff', { label, callback: [openings(0)], placement: place.plateXY(0, 0, z) });
    } else {
      // with walls, the lower layers fit inside the walls' footprint
      b.roundedPlate(x, y, corner, 'e', { label, extendCorners: false, callback: [openings(corner)], placement: place.plateXY(0, 0, z) });
    }
  }
  if (bool(v, 'bottom')) {
    const z = -(layers + 1) * t;
    const callback = bool(v, 'magnets') ? [magnets(corner)] : undefined;
    if (h) {
      // under the walls too: the full outside footprint
      b.rectangularWall(x + 2 * t, y + 2 * t, 'eeee', {
        label: 'bottom',
        callback: bool(v, 'magnets') ? [magnets(-t, -t)] : undefined,
        placement: place.plateXY(-t, -t, z),
      });
    } else {
      b.roundedPlate(x, y, corner, 'e', { label: 'bottom', extendCorners: false, callback, placement: place.plateXY(0, 0, z) });
    }
  }
  if (h) {
    const ignoreWidths = [1, 6];
    // walls stand on the top grid plate (bottom fingers reach down through it)
    b.rectangularWall(x, h, 'FFeF', { label: 'front', ignoreWidths, placement: place.wallXZ(0, 0, 0) });
    b.rectangularWall(x, h, 'FFeF', { label: 'back', ignoreWidths, placement: place.wallXZ(0, y + t, 0) });
    b.rectangularWall(y, h, 'Ffef', { label: 'left side', ignoreWidths, placement: place.wallYZ(-t, 0, 0) });
    b.rectangularWall(y, h, 'Ffef', { label: 'right side', ignoreWidths, placement: place.wallYZ(x, 0, 0) });
  }
  return finishModel(b);
}

export const gridfinityBase: GeneratorDef = {
  id: 'gridfinitybase',
  name: 'Gridfinity Baseplate',
  category: 'Tray',
  description:
    'Gridfinity-compatible baseplate: a plate with an opening per 42 mm cell for the feet of Gridfinity Bins, an optional solid bottom with magnet holes, and optional walls to make it a drawer tray.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'x', label: 'Cells x', type: 'number', default: 4, min: 1, max: 50, step: 1, help: 'Grid cells left to right' },
        { id: 'y', label: 'Cells y', type: 'number', default: 3, min: 1, max: 50, step: 1, help: 'Grid cells front to back' },
        { id: 'margin', label: 'Margin', type: 'number', default: 0, unit: 'mm', min: 0, max: 100, step: 0.5, help: 'Extra border round the grid, e.g. to fill a drawer' },
        { id: 'h', label: 'Wall height', type: 'number', default: 0, unit: 'mm', min: 0, max: 500, step: 1, help: 'Walls round the plate (0 for a flat plate)' },
        { id: 'bottom', label: 'Solid bottom', type: 'boolean', default: true, help: 'A plain plate under the grid, closing the openings into pockets' },
        { id: 'magnets', label: 'Magnet holes', type: 'boolean', default: false, help: 'Four holes per cell in the bottom, at the standard Gridfinity magnet positions', showIf: (v) => Boolean(v.bottom) },
        { id: 'magnet_d', label: 'Magnet hole diameter', type: 'number', default: 6.5, unit: 'mm', min: 1, max: 20, step: 0.1, showIf: (v) => Boolean(v.bottom) && Boolean(v.magnets) },
      ],
    },
    gridGroup,
    materialGroup,
    fingerJointGroup,
  ],
  build: buildBase,
};

// --- bin --------------------------------------------------------------------

function buildBin(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const nx = units(v, 'x');
  const ny = units(v, 'y');
  const pitch = num(v, 'pitch');
  const opening = num(v, 'opening');
  const foot = opening - num(v, 'clearance');
  const r = Math.min(num(v, 'opening_radius'), foot / 2);
  const layers = Math.max(1, Math.round(num(v, 'layers')));
  if (opening >= pitch) throw new Error('The opening must be smaller than the pitch');
  if (foot <= 0) throw new Error('The clearance leaves no room for the feet');
  const lx = nx * pitch - BIN_GAP;
  const ly = ny * pitch - BIN_GAP;
  const cx = Math.max(1, Math.round(num(v, 'cx')));
  const cy = Math.max(1, Math.round(num(v, 'cy')));

  // the body is a Type Tray measured from the outside
  const model = typeTray.build({
    ...defaultValues(typeTray),
    ...Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith('fj_'))),
    thickness: t,
    burn: num(v, 'burn'),
    sx: Array(cx).fill(lx / cx),
    sy: Array(cy).fill(ly / cy),
    h: units(v, 'hu') * HEIGHT_UNIT,
    outside: true,
    top_edge: 'e',
    bottom_edge: 'F',
    lid_style: 'none',
    fingerholes: str(v, 'fingerholes'),
  });
  const b = model.boxes;

  // feet: the body's outside starts at -t; its floor's underside is at z = -t
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const fx = -t - BIN_GAP / 2 + (i + 0.5) * pitch - foot / 2;
      const fy = -t - BIN_GAP / 2 + (j + 0.5) * pitch - foot / 2;
      for (let k = 0; k < layers; k++) {
        b.roundedPlate(foot, foot, r, 'e', {
          label: `foot ${i * ny + j + 1}${layers > 1 ? `.${k + 1}` : ''}`,
          group: 'extra',
          extendCorners: false,
          placement: place.plateXY(fx, fy, -t - (k + 1) * t),
        });
      }
    }
  }
  return finishModel(b);
}

export const gridfinityBin: GeneratorDef = {
  id: 'gridfinitybin',
  name: 'Gridfinity Bin',
  category: 'Tray',
  description:
    'Open bin sized to the Gridfinity grid (42 mm cells, 7 mm height units), with compartments and a stack of pads under each cell that drop into a Gridfinity Baseplate.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'x', label: 'Cells x', type: 'number', default: 2, min: 1, max: 20, step: 1, help: 'Width in grid cells' },
        { id: 'y', label: 'Cells y', type: 'number', default: 1, min: 1, max: 20, step: 1, help: 'Depth in grid cells' },
        { id: 'hu', label: 'Height units', type: 'number', default: 6, min: 2, max: 50, step: 1, help: 'Body height above the baseplate, in 7 mm units' },
        { id: 'cx', label: 'Compartments x', type: 'number', default: 2, min: 1, max: 20, step: 1 },
        { id: 'cy', label: 'Compartments y', type: 'number', default: 1, min: 1, max: 20, step: 1 },
        {
          id: 'fingerholes',
          label: 'Finger cut-outs',
          type: 'select',
          default: 'none',
          options: [
            { value: 'none', label: 'None' },
            { value: 'inside-only', label: 'Inner dividers only' },
            { value: 'front', label: 'Inner dividers and front' },
          ],
        },
        { id: 'clearance', label: 'Foot clearance', type: 'number', default: 0.5, unit: 'mm', min: 0, max: 5, step: 0.1, help: 'How much smaller the feet are than the baseplate openings' },
      ],
    },
    gridGroup,
    materialGroup,
    { ...fingerJointGroup, params: fingerJointGroup.params.map((p) => (p.id === 'fj_surroundingspaces' ? { ...p, default: 0.5 } : p)) },
  ],
  build: buildBin,
};
