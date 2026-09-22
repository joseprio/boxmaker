import type { Boxes } from '../engine/boxes';
import { modelBounds } from '../engine/bounds3d';
import type { Part } from '../engine/part';

export type ParamType = 'number' | 'boolean' | 'select' | 'sections';

export interface ParamOption {
  value: string;
  label: string;
}

export interface ParamDef {
  id: string;
  label: string;
  type: ParamType;
  default: number | boolean | string | number[];
  /** in mm unless `unit` says otherwise */
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  options?: ParamOption[];
  /** Only show when another param has a given value. */
  showIf?: (values: ParamValues) => boolean;
}

export interface ParamGroup {
  id: string;
  title: string;
  params: ParamDef[];
  collapsed?: boolean;
}

export type ParamValue = number | boolean | string | number[];
export type ParamValues = Record<string, ParamValue>;

export interface BoxModel {
  parts: Part[];
  /** overall outside dimensions in box space, for camera framing */
  size: { x: number; y: number; z: number };
  thickness: number;
  burn: number;
  boxes: Boxes;
}

export interface GeneratorDef {
  id: string;
  name: string;
  category: string;
  description: string;
  groups: ParamGroup[];
  build: (values: ParamValues) => BoxModel;
}

export function defaultValues(def: GeneratorDef): ParamValues {
  const v: ParamValues = {};
  for (const g of def.groups) for (const p of g.params) v[p.id] = Array.isArray(p.default) ? [...p.default] : p.default;
  return v;
}

export const num = (v: ParamValues, id: string): number => Number(v[id]);
export const bool = (v: ParamValues, id: string): boolean => Boolean(v[id]);
export const str = (v: ParamValues, id: string): string => String(v[id]);
export const sections = (v: ParamValues, id: string): number[] => {
  const s = v[id];
  return Array.isArray(s) ? s.map(Number) : [Number(s)];
};

/** Wrap a finished Boxes instance into a model, computing the overall size from the placed parts. */
export function finishModel(b: Boxes): BoxModel {
  const bb = modelBounds(b.parts);
  return {
    parts: b.parts,
    size: { x: bb.max.x - bb.min.x, y: bb.max.y - bb.min.y, z: bb.max.z - bb.min.z },
    thickness: b.thickness,
    burn: b.burn,
    boxes: b,
  };
}
