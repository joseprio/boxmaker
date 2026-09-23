import type { Boxes } from '../engine/boxes';
import type { ParamDef, ParamGroup, ParamValues } from './types';
import {
  defaultFingerJointParams,
  defaultFlexParams,
  defaultStackableParams,
  type FingerJointParams,
  type FlexParams,
  type StackableParams,
} from '../engine/settings';

export const materialGroup: ParamGroup = {
  id: 'material',
  title: 'Material',
  params: [
    {
      id: 'thickness',
      label: 'Thickness',
      type: 'number',
      default: 3,
      unit: 'mm',
      min: 0.5,
      max: 30,
      step: 0.1,
      help: 'Material thickness',
    },
    {
      id: 'burn',
      label: 'Burn (kerf)',
      type: 'number',
      default: 0.1,
      unit: 'mm',
      min: 0,
      max: 1,
      step: 0.01,
      help: 'Laser kerf compensation; half the kerf width. Applied to the exported file only.',
    },
  ],
};

export const fingerJointGroup: ParamGroup = {
  id: 'fingerjoint',
  title: 'Finger Joints',
  collapsed: true,
  params: [
    { id: 'fj_finger', label: 'Finger width', type: 'number', default: 2, unit: 'x t', min: 0.5, max: 10, step: 0.1, help: 'Width of the fingers (multiples of thickness)' },
    { id: 'fj_space', label: 'Space', type: 'number', default: 2, unit: 'x t', min: 0.5, max: 10, step: 0.1, help: 'Space between fingers (multiples of thickness)' },
    { id: 'fj_surroundingspaces', label: 'Surrounding spaces', type: 'number', default: 2, min: 0, max: 5, step: 0.5, help: 'Space at the start and end in multiples of normal spaces' },
    { id: 'fj_play', label: 'Play', type: 'number', default: 0, unit: 'x t', min: 0, max: 1, step: 0.01, help: 'Extra space to allow fingers to move in and out' },
    { id: 'fj_width', label: 'Hole width', type: 'number', default: 1, unit: 'x t', min: 0.5, max: 3, step: 0.1, help: 'Width of finger holes' },
    { id: 'fj_edge_width', label: 'Edge width', type: 'number', default: 1, unit: 'x t', min: 0, max: 5, step: 0.1, help: 'Space below holes of finger hole edges' },
  ],
};

export const stackableGroup: ParamGroup = {
  id: 'stackable',
  title: 'Stackable Edges',
  collapsed: true,
  params: [
    { id: 'st_angle', label: 'Angle', type: 'number', default: 60, unit: 'deg', min: 20, max: 120, step: 1, help: 'Inside angle of the feet' },
    { id: 'st_height', label: 'Height', type: 'number', default: 2, unit: 'x t', min: 0.5, max: 10, step: 0.1, help: 'Height of the feet' },
    { id: 'st_width', label: 'Width', type: 'number', default: 4, unit: 'x t', min: 1, max: 20, step: 0.1, help: 'Width of the feet' },
    { id: 'st_holedistance', label: 'Hole distance', type: 'number', default: 1, unit: 'x t', min: 0, max: 5, step: 0.1, help: 'Distance from finger holes to bottom edge' },
  ],
};

export function fingerJointParams(v: ParamValues): Partial<FingerJointParams> {
  const p: Record<string, number> = {};
  for (const k of Object.keys(defaultFingerJointParams)) {
    const val = v[`fj_${k}`];
    if (val !== undefined && k !== 'style') p[k] = Number(val);
  }
  return p as Partial<FingerJointParams>;
}

export function stackableParams(v: ParamValues): Partial<StackableParams> {
  const p: Partial<StackableParams> = {};
  for (const k of Object.keys(defaultStackableParams) as (keyof StackableParams)[]) {
    const val = v[`st_${k}`];
    if (val !== undefined) p[k] = Number(val);
  }
  return p;
}

export const dimParam = (id: string, label: string, def: number, help?: string): ParamDef => ({
  id,
  label,
  type: 'number',
  default: def,
  unit: 'mm',
  min: 1,
  max: 2000,
  step: 1,
  help,
});

export const outsideParam: ParamDef = {
  id: 'outside',
  label: 'Outside measurements',
  type: 'boolean',
  default: false,
  help: 'Treat sizes as outside measurements instead of inner ones',
};

export const flexGroup: ParamGroup = {
  id: 'flex',
  title: 'Flex Hinge',
  collapsed: true,
  params: [
    { id: 'flex_distance', label: 'Line distance', type: 'number', default: 0.5, unit: 'x t', min: 0.1, max: 5, step: 0.05, help: 'Distance between the rows of cuts (multiples of thickness)' },
    { id: 'flex_connection', label: 'Connection', type: 'number', default: 1, unit: 'x t', min: 0.1, max: 5, step: 0.1, help: 'Length of the uncut bridges (multiples of thickness)' },
    { id: 'flex_width', label: 'Cut length', type: 'number', default: 5, unit: 'x t', min: 0.5, max: 50, step: 0.5, help: 'Length of each cut (multiples of thickness)' },
    { id: 'flex_stretch', label: 'Stretch', type: 'number', default: 1.05, min: 1, max: 1.3, step: 0.01, help: 'How much the flex stretches when bent; the cut pattern is shortened by this factor' },
  ],
};

export function flexParams(v: ParamValues): Partial<FlexParams> {
  const p: Partial<FlexParams> = {};
  for (const k of Object.keys(defaultFlexParams) as (keyof FlexParams)[]) {
    const val = v[`flex_${k}`];
    if (val !== undefined) p[k] = Number(val);
  }
  return p;
}

const rowsOn = (v: ParamValues) => v.rows_sides !== undefined && v.rows_sides !== 'none';

export const rowEngravingGroup: ParamGroup = {
  id: 'rows',
  title: 'Engraved rows',
  collapsed: true,
  params: [
    {
      id: 'rows_sides',
      label: 'Walls',
      type: 'select',
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'sides', label: 'Left and right' },
        { value: 'frontback', label: 'Front and back' },
      ],
      help: 'Rows engraved on the inside of two opposite walls, e.g. guides for CDs or cards',
    },
    {
      id: 'rows_dir',
      label: 'Direction',
      type: 'select',
      default: 'vertical',
      options: [
        { value: 'vertical', label: 'Vertical (items standing side by side)' },
        { value: 'horizontal', label: 'Horizontal (like shelves)' },
      ],
      showIf: rowsOn,
    },
    { id: 'rows_width', label: 'Row width', type: 'number', default: 1.5, unit: 'mm', min: 0, max: 100, step: 0.1, help: 'Width of each engraved band (0 for a single line)', showIf: rowsOn },
    { id: 'rows_spacing', label: 'Spacing', type: 'number', default: 10.4, unit: 'mm', min: 0.5, max: 500, step: 0.1, help: 'Gap between neighbouring rows (10.4 mm fits CD jewel cases)', showIf: rowsOn },
    { id: 'rows_margin', label: 'End margin', type: 'number', default: 5, unit: 'mm', min: 0, max: 500, step: 0.5, help: 'Kept free at each end; the rows are centred in what is left', showIf: rowsOn },
    { id: 'rows_inset', label: 'Inset', type: 'number', default: 0, unit: 'mm', min: 0, max: 500, step: 0.5, help: 'How far each row stops short of the wall edges it runs towards', showIf: rowsOn },
  ],
};

export interface RowEngraving {
  /** which pair of opposite walls gets the rows */
  sides: 'none' | 'sides' | 'frontback';
  /** wall callback (frame at the wall's nominal bottom-left corner) for a wall `l` long and `h` high */
  rows: (l: number, h: number) => () => void;
}

/**
 * Rows engraved on a wall: bands `width` wide, `spacing` apart, as many as fit
 * between the end margins and centred, so the pattern is the same from either
 * face and the wall can be flipped. Bands are closed outlines for fill
 * engraving; a width of 0 gives single lines.
 */
export function rowEngraving(b: Boxes, v: ParamValues): RowEngraving {
  const sides = (v.rows_sides ?? 'none') as RowEngraving['sides'];
  const w = Number(v.rows_width ?? 0);
  const s = Number(v.rows_spacing ?? 10);
  const m = Number(v.rows_margin ?? 0);
  const inset = Number(v.rows_inset ?? 0);
  const vertical = (v.rows_dir ?? 'vertical') !== 'horizontal';
  const rows = (l: number, h: number) => () => {
    // along: the direction the rows repeat in; across: the direction each row runs
    const [along, across] = vertical ? [l, h] : [h, l];
    const n = Math.floor((along - 2 * m + s) / (w + s));
    if (n < 1 || across - 2 * inset <= 0) return;
    const start = (along - (n * w + (n - 1) * s)) / 2;
    const pt = (a: number, c: number) => (vertical ? { x: a, y: c } : { x: c, y: a });
    for (let i = 0; i < n; i++) {
      const a0 = start + i * (w + s);
      const c0 = inset;
      const c1 = across - inset;
      if (w > 0) b.engravePath([pt(a0, c0), pt(a0 + w, c0), pt(a0 + w, c1), pt(a0, c1), pt(a0, c0)]);
      else b.engravePath([pt(a0, c0), pt(a0, c1)]);
    }
  };
  return { sides, rows };
}

/** Separate floor thickness (0 = same as the walls), for generators that support it. */
export const floorThicknessParam: ParamDef = {
  id: 'floor_thickness',
  label: 'Floor thickness',
  type: 'number',
  default: 0,
  unit: 'mm',
  min: 0,
  max: 30,
  step: 0.1,
  help: 'Cut the floor from a different material thickness (0 = same as the walls)',
};

/** The material group with the floor thickness option added. */
export const materialWithFloorGroup: ParamGroup = { ...materialGroup, params: [...materialGroup.params, floorThicknessParam] };

/** Floor thickness in mm (the wall thickness when not set). */
export const floorThickness = (v: ParamValues): number => Number(v.floor_thickness) || Number(v.thickness);

export type HandleSide = 'front' | 'back' | 'left' | 'right';
export const HANDLE_SIDES: HandleSide[] = ['front', 'back', 'left', 'right'];

/**
 * One collapsible group per wall for a handle hole like boxes.py's Crate:
 * a rounded rectangle centred along the wall, `offset` below its top edge.
 */
export const handleGroups: ParamGroup[] = HANDLE_SIDES.map((side) => {
  const on = (v: ParamValues) => Boolean(v[`handle_${side}`]);
  const title = side[0].toUpperCase() + side.slice(1);
  return {
    id: `handle_${side}`,
    title: `Handle: ${side}`,
    collapsed: true,
    params: [
      { id: `handle_${side}`, label: `${title} handle`, type: 'boolean', default: false, help: 'Cut a handle hole into this wall' },
      { id: `handle_${side}_offset`, label: 'Offset', type: 'number', default: 10, unit: 'mm', min: 0, max: 1000, step: 0.5, help: 'From the top edge down to the hole', showIf: on },
      { id: `handle_${side}_width`, label: 'Width', type: 'number', default: 60, unit: 'mm', min: 1, max: 2000, step: 1, showIf: on },
      { id: `handle_${side}_height`, label: 'Height', type: 'number', default: 25, unit: 'mm', min: 1, max: 1000, step: 0.5, showIf: on },
      { id: `handle_${side}_radius`, label: 'Radius', type: 'number', default: 12.5, unit: 'mm', min: 0, max: 500, step: 0.5, help: 'Corner radius (half the height for round ends)', showIf: on },
    ],
  };
});

/**
 * Callback for a wall's top edge (rectangularWall callback index 2, frame on
 * the nominal top line with y pointing down into the wall) cutting the handle
 * hole for `side`, or undefined when that side has none.
 */
export function handleHole(b: Boxes, v: ParamValues, side: HandleSide, length: number, height: number): (() => void) | undefined {
  if (!v[`handle_${side}`]) return undefined;
  const offset = Number(v[`handle_${side}_offset`]);
  const w = Number(v[`handle_${side}_width`]);
  const hh = Number(v[`handle_${side}_height`]);
  const r = Number(v[`handle_${side}_radius`]);
  if (w >= length) throw new Error(`The ${side} handle is wider than its wall (${Math.round(length)} mm)`);
  if (offset + hh >= height) throw new Error(`The ${side} handle reaches below the floor: reduce its offset or height`);
  return () => b.rectangularHole(length / 2, offset + hh / 2, w, hh, r);
}
