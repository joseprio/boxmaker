import { Boxes, place } from '../engine/boxes';
import { BaseEdge, SlottedEdge } from '../engine/edges';
import { materialGroup, outsideParam } from './common';
import { bool, finishModel, num, sections, type BoxModel, type GeneratorDef, type ParamValues } from './types';

/** Side of a wall leaning outwards by `angle` degrees towards the top (negative for the left side). */
class SlantedEdge extends BaseEdge {
  readonly char = '';
  readonly description = 'Slanted edge';

  constructor(
    boxes: Boxes,
    private angle: number,
  ) {
    super(boxes);
  }

  draw(length: number): void {
    const angle = Math.abs(this.angle);
    if (angle === 0) {
      this.boxes.edge(length);
      return;
    }
    const a = (angle * Math.PI) / 180;
    const d = length * Math.tan(a);
    const l = length / Math.cos(a);
    const poly = [0, -90, d, 90 + angle, l, -angle, 0];
    if (this.angle >= 0) poly.reverse();
    this.boxes.polyline(...poly);
  }
}

/** Grow the outermost sections so the walls fill a box of the given inner size. */
function fitTo(s: number[], total: number, target: number, t: number): number[] {
  if (target <= total) return s;
  const delta = target - total;
  // more than two walls of extra: add new outer compartments, else widen the outer ones
  if (delta > 2 * t) return [delta / 2 - t, ...s, delta / 2 - t];
  const out = [...s];
  out[0] += delta / 2;
  out[out.length - 1] += delta / 2;
  return out;
}

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn') });
  let sx = sections(v, 'sx');
  let sy = sections(v, 'sy');
  const h = num(v, 'h');
  const draft = num(v, 'draft_angle');

  if (bool(v, 'outside')) {
    sx = b.adjustSizes(sx, false, false);
    sy = b.adjustSizes(sy, false, false);
  }
  const sum = (s: number[]) => s.reduce((a, c) => a + c, 0) + t * (s.length - 1);
  sx = fitTo(sx, sum(sx), num(v, 'x'), t);
  sy = fitTo(sy, sum(sy), num(v, 'y'), t);
  const x = sum(sx);
  const y = sum(sy);

  const l = new SlantedEdge(b, -draft);
  const r = new SlantedEdge(b, draft);

  let posx = -0.5 * t;
  sx.slice(0, -1).forEach((s, i) => {
    posx += s + t;
    b.rectangularWall(y, h, [new SlottedEdge(b, sy, 'e', 0.5 * h), r, 'e', l], {
      label: `wall y ${i + 1}`,
      group: 'divider',
      placement: place.wallYZ(posx - 0.5 * t, 0, 0),
    });
  });
  let posy = -0.5 * t;
  sy.slice(0, -1).forEach((s, i) => {
    posy += s + t;
    b.rectangularWall(x, h, ['e', r, new SlottedEdge(b, [...sx].reverse(), 'e', 0.5 * h), l], {
      label: `wall x ${i + 1}`,
      group: 'divider',
      placement: place.wallXZ(0, posy + 0.5 * t, 0),
    });
  });
  if (b.parts.length === 0) throw new Error('Need at least two sections in x or y');
  return finishModel(b);
}

export const trayInsert: GeneratorDef = {
  id: 'trayinsert',
  name: 'Tray Insert',
  category: 'Tray',
  description: 'Grid of interlocking dividers without floor or outer walls, to drop into an existing box or tray.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'sx', label: 'Sections x', type: 'sections', default: [50, 50, 50], help: 'Compartment widths, e.g. 50:50:30 or 3*40' },
        { id: 'sy', label: 'Sections y', type: 'sections', default: [50, 50, 50], help: 'Compartment depths' },
        { id: 'h', label: 'Height (h)', type: 'number', default: 100, unit: 'mm', min: 5, max: 1000, step: 1 },
        outsideParam,
        { id: 'x', label: 'Fit into width', type: 'number', default: 0, unit: 'mm', min: 0, max: 2000, step: 1, help: 'Inner width of the box this goes into; the outer compartments grow to fill it (0 = off)' },
        { id: 'y', label: 'Fit into depth', type: 'number', default: 0, unit: 'mm', min: 0, max: 2000, step: 1, help: 'Inner depth of the box this goes into (0 = off)' },
        { id: 'draft_angle', label: 'Draft angle', type: 'number', default: 0, unit: 'deg', min: 0, max: 30, step: 0.5, help: 'Walls widen outwards towards the top, for trays with sloped sides (sizes are at the bottom)' },
      ],
    },
    materialGroup,
  ],
  build,
};
