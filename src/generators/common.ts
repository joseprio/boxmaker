import type { ParamDef, ParamGroup, ParamValues } from './types';
import {
  defaultFingerJointParams,
  defaultStackableParams,
  type FingerJointParams,
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
