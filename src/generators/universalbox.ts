import { Boxes, place } from '../engine/boxes';
import type { Placement } from '../engine/part';
import { Lid } from '../engine/lids';
import { LidSettings, type HandleStyle, type LidStyle } from '../engine/settings';
import {
  dimParam,
  fingerJointGroup,
  fingerJointParams,
  materialGroup,
  outsideParam,
  rowEngraving,
  rowEngravingGroup,
  stackableGroup,
  stackableParams,
  type RowEngraving,
} from './common';
import { bool, finishModel, num, str, type BoxModel, type GeneratorDef, type ParamGroup, type ParamValues } from './types';

export const topEdgeOptions = [
  { value: 'e', label: 'Open (straight edge)' },
  { value: 'F', label: 'Closed - fixed top with finger joints' },
  { value: 'h', label: 'Closed - top held by finger holes' },
  { value: 'S', label: 'Stackable (recessed corners)' },
  { value: 'Z', label: 'Stackable with finger-holed top' },
];

export const bottomEdgeOptions = [
  { value: 'F', label: 'Finger joints' },
  { value: 'h', label: 'Finger holes (walls stand below the floor)' },
  { value: 's', label: 'Stackable feet with finger holes' },
  { value: 'e', label: 'Open (no floor)' },
];

export const lidGroup: ParamGroup = {
  id: 'lid',
  title: 'Lid',
  params: [
    {
      id: 'lid_style',
      label: 'Lid style',
      type: 'select',
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'flat', label: 'Flat - loose lid with inset plate' },
        { value: 'overthetop', label: 'Over the top - slides over the walls' },
        { value: 'ontop', label: 'On top - same footprint, inner brim' },
      ],
      showIf: (v) => v.top_edge === 'e' || v.top_edge === undefined,
    },
    {
      id: 'lid_height',
      label: 'Lid height',
      type: 'number',
      default: 4,
      unit: 'x t',
      min: 1,
      max: 30,
      step: 0.5,
      help: 'Height of the lid brim in multiples of thickness',
      showIf: (v) => (v.top_edge === 'e' || v.top_edge === undefined) && (v.lid_style === 'overthetop' || v.lid_style === 'ontop'),
    },
    {
      id: 'lid_play',
      label: 'Lid play',
      type: 'number',
      default: 0.1,
      unit: 'x t',
      min: 0,
      max: 1,
      step: 0.05,
      help: 'Play when sliding the lid on',
      showIf: (v) => (v.top_edge === 'e' || v.top_edge === undefined) && v.lid_style === 'overthetop',
    },
    {
      id: 'lid_handle',
      label: 'Handle',
      type: 'select',
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'long_rounded', label: 'Long, rounded' },
        { value: 'long_trapezoid', label: 'Long, trapezoid' },
        { value: 'long_doublerounded', label: 'Long, double rounded' },
        { value: 'knob', label: 'Knob' },
      ],
      showIf: (v) => (v.top_edge === 'e' || v.top_edge === undefined) && v.lid_style !== 'none' && v.lid_style !== undefined,
    },
    {
      id: 'lid_handle_height',
      label: 'Handle height',
      type: 'number',
      default: 8,
      unit: 'x t',
      min: 2,
      max: 30,
      step: 0.5,
      showIf: (v) =>
        (v.top_edge === 'e' || v.top_edge === undefined) && v.lid_style !== 'none' && v.lid_style !== undefined && v.lid_handle !== 'none',
    },
  ],
};

export function lidSettings(t: number, v: ParamValues): LidSettings {
  return new LidSettings(t, {
    style: (str(v, 'lid_style') || 'none') as LidStyle,
    handle: (str(v, 'lid_handle') || 'none') as HandleStyle,
    height: num(v, 'lid_height') || 4,
    play: v.lid_play === undefined ? 0.1 : num(v, 'lid_play'),
    handle_height: num(v, 'lid_handle_height') || 8,
  });
}

/** Height the walls extend above the cavity for a given top edge. */
export function topExtension(b: Boxes, topEdge: string): number {
  return b.getEdge(topEdge).startWidth();
}

export interface UniversalBoxParams {
  x: number;
  y: number;
  h: number;
  topEdge: string;
  bottomEdge: string;
  verticalEdges: 'finger joints' | 'finger holes';
  outside: boolean;
  /** rows engraved on the inside of two opposite walls */
  rows?: RowEngraving;
}

/** Builds the four walls, floor and fixed top of a box; returns the inner dimensions used. */
export function buildUniversalBox(b: Boxes, p: UniversalBoxParams): { x: number; y: number; h: number; zTop: number } {
  const t = b.thickness;
  let { x, y, h } = p;
  const side = p.verticalEdges === 'finger joints' ? 'F' : 'h';
  const bot = p.bottomEdge;
  const top = p.topEdge;
  if (p.outside) {
    x = b.adjustSize(x, side, side);
    y = b.adjustSize(y);
    h = b.adjustSize(h, bot, top);
  }
  const ignoreWidths = [1, 6];
  const fb = p.rows?.sides === 'frontback' ? p.rows.rows(x, h) : undefined;
  const lr = p.rows?.sides === 'sides' ? p.rows.rows(y, h) : undefined;
  const wall = (l: number, edges: string[], label: string, placement: Placement, rows?: () => void) => {
    const part = b.rectangularWall(l, h, edges, { label, ignoreWidths, callback: rows ? [rows] : undefined, placement });
    if (rows) part.engraveFace = 'inner';
  };

  wall(x, [bot, side, top, side], 'front', place.wallXZ(0, 0, 0), fb);
  wall(x, [bot, side, top, side], 'back', place.wallXZ(0, y + t, 0), fb);
  wall(y, [bot, 'f', top, 'f'], 'left', place.wallYZ(-t, 0, 0), lr);
  wall(y, [bot, 'f', top, 'f'], 'right', place.wallYZ(x, 0, 0), lr);

  if (bot !== 'e') {
    b.rectangularWall(x, y, 'ffff', { label: 'bottom', placement: place.plateXY(0, 0, -t) });
  }
  if (top === 'F' || top === 'h' || top === 'Z') {
    b.rectangularWall(x, y, 'ffff', { label: 'top', placement: place.plateXY(0, 0, h) });
  }
  return { x, y, h, zTop: h + topExtension(b, top) };
}

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v), stackable: stackableParams(v) });
  const topEdge = str(v, 'top_edge');
  const dims = buildUniversalBox(b, {
    x: num(v, 'x'),
    y: num(v, 'y'),
    h: num(v, 'h'),
    topEdge,
    bottomEdge: str(v, 'bottom_edge'),
    verticalEdges: str(v, 'vertical_edges') as 'finger joints' | 'finger holes',
    outside: bool(v, 'outside'),
    rows: rowEngraving(b, v),
  });
  if (topEdge === 'e') {
    new Lid(b, lidSettings(t, v)).draw({ x: dims.x, y: dims.y, zTop: dims.zTop });
  }
  return finishModel(b);
}

export const universalBox: GeneratorDef = {
  id: 'universalbox',
  name: 'Universal Box',
  category: 'Box',
  description: 'Box with various options for different styles and lids: open, closed, stackable, with loose lids and handles.',
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
    {
      id: 'edges',
      title: 'Edges',
      params: [
        { id: 'top_edge', label: 'Top edge', type: 'select', default: 'e', options: topEdgeOptions },
        { id: 'bottom_edge', label: 'Bottom edge', type: 'select', default: 'F', options: bottomEdgeOptions },
        {
          id: 'vertical_edges',
          label: 'Vertical edges',
          type: 'select',
          default: 'finger joints',
          options: [
            { value: 'finger joints', label: 'Finger joints' },
            { value: 'finger holes', label: 'Finger holes' },
          ],
          help: 'Connections used for the vertical edges',
        },
      ],
    },
    lidGroup,
    rowEngravingGroup,
    materialGroup,
    fingerJointGroup,
    stackableGroup,
  ],
  build,
};

function buildOpen(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  buildUniversalBox(b, {
    x: num(v, 'x'),
    y: num(v, 'y'),
    h: num(v, 'h'),
    topEdge: 'e',
    bottomEdge: 'F',
    verticalEdges: 'finger joints',
    outside: bool(v, 'outside'),
    rows: rowEngraving(b, v),
  });
  return finishModel(b);
}

export const openBox: GeneratorDef = {
  id: 'openbox',
  name: 'Open Box',
  category: 'Box',
  description: 'Box with open top - the simplest tray-like box with finger joints.',
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
    rowEngravingGroup,
    materialGroup,
    fingerJointGroup,
  ],
  build: buildOpen,
};
