import { Boxes, CompoundEdge, place, type EdgeSpec } from '../engine/boxes';
import { BaseEdge, SlottedEdge } from '../engine/edges';
import { fingerJointGroup, fingerJointParams, materialGroup } from './common';
import { bool, finishModel, num, sections, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';

/** boxes.py's GroovedEdge ('z'): grooves cut into the edge, here a finger pull on the drawer front. */
class GroovedEdge extends BaseEdge {
  readonly char = '';
  readonly description = 'Edge with grooves';

  constructor(
    boxes: Boxes,
    private style: string,
    private width: number,
    private gap = 0.1,
    private edgeMargin = 0.3,
  ) {
    super(boxes);
  }

  draw(length: number): void {
    const b = this.boxes;
    const count = this.style === 'none' ? 0 : Math.max(0, Math.floor((1 - 2 * this.edgeMargin + this.gap) / (this.width + this.gap) + 1e-9));
    const inside = Math.max(0, count * (this.width + this.gap) - this.gap);
    const margin = ((1 - inside) / 2) * length;
    const w = this.width * length;
    b.edge(margin);
    for (let i = 0; i < count; i++) {
      if (i > 0) b.edge(this.gap * length);
      if (this.style === 'arc') {
        const a = 60;
        const r = w / Math.sin((a * Math.PI) / 180) / 2;
        b.polyline(0, a, 0, [-a, r], 0, [-a, r], 0, a, 0);
      } else if (this.style === 'softarc') {
        const a = 60;
        const r = w / Math.sin((a * Math.PI) / 180) / 4;
        b.polyline(0, [a, r], 0, [-a, r], 0, [-a, r], 0, [a, r], 0);
      } else {
        const a = 30;
        const s = w / Math.cos((a * Math.PI) / 180) / 2;
        b.polyline(0, a, s, -2 * a, s, a, 0);
      }
    }
    b.edge(margin);
  }
}

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  const p = num(v, 'play') * t;
  let sx = sections(v, 'sx');
  let sh = sections(v, 'sh');
  let y = num(v, 'y');
  const hiIn = num(v, 'hi');
  const gripStyle = str(v, 'grip');
  // a round finger hole goes in the middle of the front instead of a pull in its top edge
  const grip = new GroovedEdge(b, gripStyle === 'hole' ? 'none' : gripStyle, num(v, 'grip_width'));
  const holeD = num(v, 'grip_diameter');

  // cells: the case's compartments, one drawer in each
  if (bool(v, 'outside')) {
    sx = b.adjustSizes(sx);
    sh = b.adjustSizes(sh);
    // the front is open
    y = b.adjustSize(y, true, false);
  } else {
    // sizes are the drawers' insides
    sx = sx.map((s) => s + 2 * t + 2 * p);
    sh = sh.map((s) => s + t + 2 * p);
    y = y + 2 * t + 2 * p;
  }
  const x = sx.reduce((a, c) => a + c, 0) + t * (sx.length - 1);
  const h = sh.reduce((a, c) => a + c, 0) + t * (sh.length - 1);
  const y2 = y - 2 * t - 2 * p;
  if (y2 <= 0) throw new Error('The case is too shallow for the drawers');
  for (const s of sx) if (s - 2 * t - 2 * p <= 0) throw new Error('A column is too narrow for its drawers');
  for (const s of sh) if (s - t - 2 * p <= 0) throw new Error('A row is too low for its drawers');

  // cell positions: X of each column's left, Z of each row's bottom
  const xs: number[] = [];
  sx.reduce((pos, s) => (xs.push(pos), pos + s + t), 0);
  const zs: number[] = [];
  sh.reduce((pos, s) => (zs.push(pos), pos + s + t), 0);
  const dividers = xs.slice(1).map((c) => c - t / 2);
  const shelves = zs.slice(1).map((c) => c - t / 2);

  // case ---------------------------------------------------------------
  // box space: X across, Y from the open front (0) to the back, Z up; cells start at 0
  const plateHoles = () => {
    for (const d of dividers) b.fingerHolesAt(d, 0, y, 90);
  };
  const plate: EdgeSpec[] = ['e', 'F', 'F', 'F'];
  b.rectangularWall(x, y, plate, { label: 'case bottom', callback: [plateHoles], placement: place.plateXY(0, 0, -t) });
  b.rectangularWall(x, y, plate, { label: 'case top', callback: [plateHoles], placement: place.plateXY(0, 0, h) });
  const sideHoles = () => {
    for (const s of shelves) b.fingerHolesAt(0, s, y, 0);
  };
  b.rectangularWall(y, h, 'fffe', { label: 'case left', callback: [sideHoles], placement: place.wallYZ(-t, 0, 0) });
  b.rectangularWall(y, h, 'fffe', { label: 'case right', callback: [sideHoles], placement: place.wallYZ(x, 0, 0) });
  b.rectangularWall(x, h, 'fFfF', {
    label: 'case back',
    callback: [
      () => {
        for (const d of dividers) sh.forEach((s, j) => b.fingerHolesAt(d, zs[j], s, 90));
        for (const s of shelves) sx.forEach((w, i) => b.fingerHolesAt(xs[i], s, w, 0));
      },
    ],
    placement: place.wallXZ(0, y + t, 0),
  });
  // dividers and shelves cross with halving slots: dividers slotted from the front,
  // shelves from the back, each half the depth
  dividers.forEach((d, k) => {
    const back = new SlottedEdge(b, sh, 'f');
    const front = new SlottedEdge(b, [...sh].reverse(), 'e', shelves.length ? y / 2 : 0);
    b.rectangularWall(y, h, ['f', back, 'f', front], {
      label: dividers.length > 1 ? `divider ${k + 1}` : 'divider',
      group: 'divider',
      placement: place.wallYZ(d - t / 2, 0, 0),
    });
  });
  shelves.forEach((s, k) => {
    const back = new SlottedEdge(b, [...sx].reverse(), 'f', dividers.length ? y / 2 : 0);
    b.rectangularWall(x, y, ['e', 'f', back, 'f'], {
      label: shelves.length > 1 ? `shelf ${k + 1}` : 'shelf',
      group: 'divider',
      placement: place.plateXY(0, 0, s - t / 2),
    });
  });

  // drawers --------------------------------------------------------------
  const grid = sx.length > 1 || sh.length > 1;
  sh.forEach((cellH, j) => {
    sx.forEach((cellW, i) => {
      const x2 = cellW - 2 * t - 2 * p;
      const h2 = cellH - t - 2 * p;
      const hi = hiIn > 0 ? Math.min(hiIn, h2) : h2;
      const name = (part: string) => (grid ? `drawer ${j + 1}.${i + 1} ${part}` : `drawer ${part}`);
      // the drawer's inner front-left-bottom corner, with play all round
      const o = { x: xs[i] + p + t, y: p + t, z: zs[j] + p + t };
      const e1 = hi < h2 ? new CompoundEdge(b, ['F', 'E'], [hi, h2 - hi]) : 'F';
      const e2 = hi < h2 ? new CompoundEdge(b, ['E', 'F'], [h2 - hi, hi]) : 'F';
      const opts = (part: string, placement: ReturnType<typeof place.wallXZ>) => ({ label: name(part), group: 'extra', placement });
      // the front covers the bottom's edge, so its face runs from -t to h2; the hole is
      // centred on it, shrunk if needed to leave a thickness of material round it
      const hole = () => {
        const d = Math.min(holeD, x2, h2 - t);
        if (d > 0) b.hole(x2 / 2, (h2 - t) / 2, d / 2);
      };
      b.rectangularWall(x2, h2, ['F', e1, grip, e2], {
        ...opts('front', place.wallXZ(o.x, o.y, o.z)),
        callback: gripStyle === 'hole' ? [hole] : undefined,
      });
      b.rectangularWall(x2, hi, 'FFeF', opts('back', place.wallXZ(o.x, o.y + y2 + t, o.z)));
      b.rectangularWall(y2, hi, 'ffef', opts('left', place.wallYZ(o.x - t, o.y, o.z)));
      b.rectangularWall(y2, hi, 'ffef', opts('right', place.wallYZ(o.x + x2, o.y, o.z)));
      b.rectangularWall(x2, y2, 'fFfF', opts('bottom', place.plateXY(o.x, o.y, o.z - t)));
    });
  });
  return finishModel(b);
}

export const slidingDrawer: GeneratorDef = {
  id: 'slidingdrawer',
  name: 'Sliding Drawer',
  category: 'Box',
  description: 'A case with drawers sliding in it: one drawer, or a grid of them with shelves and dividers between the rows and columns.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'sx', label: 'Columns', type: 'sections', default: [60], help: 'Widths of the drawer columns, e.g. 60:60:60' },
        { id: 'sh', label: 'Rows', type: 'sections', default: [30], help: 'Heights of the drawer rows from the bottom, e.g. 30:30:50' },
        { id: 'y', label: 'Depth (y)', type: 'number', default: 100, unit: 'mm', min: 10, max: 2000, step: 1 },
        {
          id: 'outside',
          label: 'Outside measurements',
          type: 'boolean',
          default: true,
          help: 'Sizes are the case’s outside, instead of the insides of the drawers',
        },
        { id: 'hi', label: 'Drawer wall height', type: 'number', default: 0, unit: 'mm', min: 0, max: 2000, step: 1, help: 'Height of the drawers’ sides and back, inside (0 for as high as the front)' },
        { id: 'play', label: 'Play', type: 'number', default: 0.15, unit: 'x t', min: 0, max: 2, step: 0.05, help: 'Gap round each drawer, as a multiple of the thickness' },
      ],
    },
    {
      id: 'grip',
      title: 'Grip',
      params: [
        {
          id: 'grip',
          label: 'Style',
          type: 'select',
          default: 'arc',
          options: [
            { value: 'arc', label: 'Arc' },
            { value: 'softarc', label: 'Soft arc' },
            { value: 'triangle', label: 'Triangle' },
            { value: 'hole', label: 'Round hole' },
            { value: 'none', label: 'None' },
          ],
          help: 'Finger pull cut into the top of each drawer front, or a round hole in its middle',
        },
        { id: 'grip_width', label: 'Width', type: 'number', default: 0.4, unit: 'x w', min: 0.05, max: 0.4, step: 0.05, help: 'Width of the pull as a fraction of the front’s width', showIf: (v) => v.grip !== 'none' && v.grip !== 'hole' },
        { id: 'grip_diameter', label: 'Diameter', type: 'number', default: 15, unit: 'mm', min: 3, max: 200, step: 1, help: 'Diameter of the finger hole; smaller on drawers it doesn’t fit', showIf: (v) => v.grip === 'hole' },
      ],
    },
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
