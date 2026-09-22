import { Boxes, place, type EdgeSpec } from '../engine/boxes';
import { BaseEdge } from '../engine/edges';
import { Lid } from '../engine/lids';
import { fingerJointGroup, fingerJointParams, materialGroup, outsideParam } from './common';
import { bool, finishModel, num, sections, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';
import { lidGroup, lidSettings } from './universalbox';

const rad = (d: number) => (d * Math.PI) / 180;

// ---------------------------------------------------------------------------
// Slot descriptions (port of boxes.py dividertray)
// ---------------------------------------------------------------------------

class StraightDesc {
  roundEdgeCompensation: number;
  outsideRatio = 1;
  angleCompensation = 0;

  constructor(
    public askedLength: number,
    roundEdgeCompensation = 0,
  ) {
    this.roundEdgeCompensation = roundEdgeCompensation;
  }

  tracingLength(): number {
    return this.askedLength * this.outsideRatio - this.roundEdgeCompensation + this.angleCompensation;
  }
}

class SlotDesc {
  constructor(
    public width: number,
    public depth: number,
    public angle: number,
    public startRadius: number,
    public endRadius: number,
  ) {}

  private divByCos(): number {
    return 1 / Math.cos(rad(this.angle));
  }

  private tan(): number {
    return Math.tan(rad(this.angle));
  }

  /** Width measured along the edge; wider than the slot when it is angled. */
  angleCorrectedWidth(): number {
    return this.width * this.divByCos();
  }

  roundEdgeStartCorrection(): number {
    return this.startRadius * (this.divByCos() - this.tan());
  }

  roundEdgeEndCorrection(): number {
    return this.endRadius * (this.divByCos() + this.tan());
  }

  correctedStartDepth(): number {
    return this.depth + Math.max(0, this.width * this.tan()) - this.roundEdgeStartCorrection();
  }

  correctedEndDepth(): number {
    return this.depth + Math.max(0, -this.width * this.tan()) - this.roundEdgeEndCorrection();
  }

  tracingLength(): number {
    return this.roundEdgeStartCorrection() + this.angleCorrectedWidth() + this.roundEdgeEndCorrection();
  }
}

type Desc = StraightDesc | SlotDesc;

function slotDescriptions(sy: number[], t: number, slack: number, depth: number, height: number, angle: number, radius: number): Desc[] {
  const width = t + slack;
  const out: Desc[] = [];
  let firstCorrection = 0;
  let cur = 0;
  // a leading 0 puts a slot right at the start, without an entry radius
  if (sy[0] === 0) {
    const slot = new SlotDesc(width, depth, angle, 0, radius);
    out.push(slot);
    firstCorrection = slot.roundEdgeEndCorrection();
    cur++;
  }
  out.push(new StraightDesc(sy[cur], firstCorrection));
  cur++;
  for (const l of sy.slice(cur)) {
    const slot = new SlotDesc(width, depth, angle, radius, radius);
    (out[out.length - 1] as StraightDesc).roundEdgeCompensation += slot.roundEdgeStartCorrection();
    out.push(slot);
    out.push(new StraightDesc(l, slot.roundEdgeEndCorrection()));
  }
  // extra room so the content can slide down to the bottom despite the angle
  (out[out.length - 1] as StraightDesc).angleCompensation += height * Math.tan(rad(angle));
  return out;
}

const totalLength = (d: Desc[]) => d.reduce((a, c) => a + c.tracingLength(), 0);

function adjustToTargetLength(d: Desc[], target: number): void {
  const straights = d.filter((e): e is StraightDesc => e instanceof StraightDesc);
  const ratio = (totalLength(d) - target) / straights.reduce((a, c) => a + c.askedLength, 0);
  for (const e of straights) e.outsideRatio = 1 - ratio;
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

interface NotchSettings {
  upper: number;
  lower: number;
  depth: number;
}

/** Edge with a rounded finger notch in the middle of each section. */
class DividerNotchesEdge extends BaseEdge {
  readonly char = '';
  readonly description = 'Edge with notches for easier access to the dividers';

  constructor(
    boxes: Boxes,
    private sx: number[],
    private n: NotchSettings,
  ) {
    super(boxes);
  }

  draw(): void {
    this.sx.forEach((w, i) => {
      if (i) this.boxes.edge(this.boxes.thickness);
      this.notch(w);
    });
  }

  notch(width: number): void {
    const { upper, lower, depth } = this.n;
    const third = (width - 2 * upper - 2 * lower) / 3;
    if (third > 0) {
      const straight = depth - upper - lower;
      this.boxes.polyline(third, [90, upper], straight, [-90, lower], third, [-90, lower], straight, [90, upper], third);
    } else {
      this.boxes.edge(width);
    }
  }
}

/** Top edge of the side pieces: angled, rounded slots holding the dividers. */
class DividerSlotsEdge extends BaseEdge {
  readonly char = '';
  readonly description = 'Edge with angled rounded slots for dividers';

  constructor(
    boxes: Boxes,
    private descs: Desc[],
  ) {
    super(boxes);
  }

  draw(length: number): void {
    const b = this.boxes;
    b.saved(() => {
      for (const d of this.descs) {
        if (d instanceof SlotDesc) {
          b.saved(() =>
            b.polyline(0, [90 - d.angle, d.startRadius], d.correctedStartDepth(), -90, d.width, -90, d.correctedEndDepth(), [90 + d.angle, d.endRadius]),
          );
          b.moveTo(d.tracingLength());
        } else {
          b.edge(d.tracingLength());
        }
      }
    });
    // restart from the exact end to avoid accumulating rounding errors
    b.moveTo(length);
  }
}

// ---------------------------------------------------------------------------

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  let sx = sections(v, 'sx');
  const sy = sections(v, 'sy');
  let h = num(v, 'h');
  const leftWall = bool(v, 'left_wall');
  const rightWall = bool(v, 'right_wall');
  const bottom = bool(v, 'bottom');
  const outside = bool(v, 'outside');
  const angle = num(v, 'slot_angle');
  const slotDepth = num(v, 'slot_depth');
  const play = num(v, 'divider_play') * t;
  const notches: NotchSettings = { upper: num(v, 'notch_upper_radius'), lower: num(v, 'notch_lower_radius'), depth: num(v, 'notch_depth') };

  if (sy.filter((s) => s > 0).length === 0) throw new Error('Need at least one row');
  const sideWallsNumber = sx.length - 1 + Number(leftWall) + Number(rightWall);
  if (sideWallsNumber === 0) throw new Error('You need at least one side wall to generate this tray');

  // adjust the height before generating the slots
  if (outside) {
    if (bottom) h -= t;
  } else {
    // h is the height of the content itself; the tray is lower when it leans
    h = h * Math.cos(rad(angle));
  }

  const descs = slotDescriptions(sy, t, num(v, 'slot_extra_slack'), slotDepth, h, angle, num(v, 'slot_radius'));
  if (outside) {
    sx = b.adjustSizes(sx, leftWall, rightWall);
    adjustToTargetLength(descs, sy.reduce((a, c) => a + c, 0) - 2 * t);
  }

  const F = sx.reduce((a, c) => a + c, 0) + t * (sx.length - 1);
  const L = totalLength(descs);

  // box space: columns along X in [0, F], rows along Y in [0, L] (front at 0), floor top at z = 0
  const holes = (l: number) => () => {
    let posx = -0.5 * t;
    for (const s of sx.slice(0, -1)) {
      posx += s + t;
      b.fingerHolesAt(posx, 0, l);
    }
  };

  // facing walls (front / back) with finger holes for the inner side pieces
  const side = (w: boolean) => (w ? 'F' : 'e');
  const upper: EdgeSpec = bool(v, 'notches_in_wall') ? new DividerNotchesEdge(b, [...sx].reverse(), notches) : 'e';
  for (const [label, y0] of [
    ['back', L + t],
    ['front', 0],
  ] as const) {
    b.rectangularWall(F, h, [bottom ? 'F' : 'e', side(rightWall), upper, side(leftWall)], {
      label,
      callback: [holes(h)],
      placement: place.wallXZ(0, y0, 0),
    });
  }

  // side pieces (outer and inner) with the divider slots on top
  const sideX: number[] = [];
  if (leftWall) sideX.push(-t);
  if (rightWall) sideX.push(F);
  {
    let posx = -0.5 * t;
    for (const s of sx.slice(0, -1)) {
      posx += s + t;
      sideX.push(posx - 0.5 * t);
    }
  }
  const outer = sideWallsNumber - (sx.length - 1);
  sideX.forEach((x0, i) => {
    const be = bottom ? (i < outer ? 'F' : 'f') : 'e';
    b.rectangularWall(L, h, [be, 'f', new DividerSlotsEdge(b, descs), 'f'], {
      label: `side piece ${i + 1}`,
      placement: place.wallYZ(x0, 0, 0),
    });
  });

  if (bottom) {
    b.rectangularWall(F, L, ['f', rightWall ? 'f' : 'e', 'f', leftWall ? 'f' : 'e'], {
      label: 'bottom',
      callback: [holes(L)],
      placement: place.plateXY(0, 0, -t),
    });
  }

  new Lid(b, lidSettings(t, v)).draw({ x: F, y: L, zTop: h });

  // dividers ---------------------------------------------------------------
  const dividerHeight = h / Math.cos(rad(angle)) - t * Math.tan(rad(angle)) - num(v, 'divider_bottom_margin');

  /**
   * Draws a divider upside down: local y = 0 is its top edge (with finger
   * notches), local y = height its bottom. Local x = ft - play is the start of
   * the first compartment.
   */
  const divider = (widths: number[], ft: number, st: number, asym: number | null) => {
    let lth = slotDepth;
    let rth = slotDepth;
    if (asym) {
      lth = lth * asym - play;
      rth = rth * (1 - asym);
    }
    if (asym) b.moveTo(ft - play);
    else b.edge(ft - play);
    widths.forEach((w, i) => {
      if (i) b.edge(t);
      new DividerNotchesEdge(b, [w], notches).notch(w);
    });
    b.polyline(st - play, 90, lth, 90, st, -90, dividerHeight - lth, 90);
    for (const w of [...widths.slice(1)].reverse()) {
      b.polyline(w - 2 * play, 90, dividerHeight - slotDepth, -90, t + 2 * play, -90, dividerHeight - slotDepth, 90);
    }
    b.polyline(widths[0] - 2 * play, 90, dividerHeight - slotDepth, -90, ft, 90, rth, 90);
    if (asym) b.polyline(ft - play, -90, slotDepth - rth, 90);
  };

  // where each slot holds its divider: walk the slot edge from the back (Y = L) to the front
  const a = rad(angle);
  const down = { y: -Math.sin(a), z: -Math.cos(a) }; // along the divider, top to bottom
  const normal = { y: Math.cos(a), z: -Math.sin(a) }; // divider thickness direction (towards the back)
  const slotTops: Array<{ y: number; z: number }> = [];
  {
    let s = 0;
    for (const d of descs) {
      if (d instanceof SlotDesc) {
        // bottom of the slot, back corner, in side piece coordinates (Y, Z)
        const cy = L - s - d.startRadius * Math.cos(a);
        const cz = h - d.startRadius + d.startRadius * Math.sin(a);
        const by = cy + down.y * d.correctedStartDepth();
        const bz = cz + down.z * d.correctedStartDepth();
        // middle of the slot bottom, then up along the divider to its top edge
        const my = by - (Math.cos(a) * d.width) / 2;
        const mz = bz + (Math.sin(a) * d.width) / 2;
        slotTops.push({ y: my - down.y * slotDepth, z: mz - down.z * slotDepth });
      }
      s += d.tracingLength();
    }
  }

  const style = str(v, 'divider_style');
  const colStarts: number[] = [];
  {
    let p = 0;
    for (const s of sx) {
      colStarts.push(p);
      p += s + t;
    }
  }
  slotTops.forEach((top, k) => {
    const pieces: Array<{ widths: number[]; x: number; ft: number; st: number; asym: number | null }> = [];
    if (style === 'single') {
      pieces.push({ widths: sx, x: 0, ft: leftWall ? t : 0, st: rightWall ? t : 0, asym: null });
    } else {
      const tabs = style === 'half' ? t / 2 : t;
      const asym = style === 'asymmetric' ? 0.5 : null;
      sx.forEach((w, i) => {
        pieces.push({
          widths: [w],
          x: colStarts[i],
          ft: leftWall || i > 0 ? tabs : 0,
          st: rightWall || i < sx.length - 1 ? tabs : 0,
          asym,
        });
      });
    }
    pieces.forEach((p, i) => {
      b.freePart(() => divider(p.widths, p.ft, p.st, p.asym), {
        label: pieces.length > 1 ? `divider ${k + 1}.${i + 1}` : `divider ${k + 1}`,
        group: 'divider',
        placement: {
          origin: { x: p.x - (p.ft - play), y: top.y - (normal.y * t) / 2, z: top.z - (normal.z * t) / 2 },
          u: { x: 1, y: 0, z: 0 },
          v: { x: 0, y: down.y, z: down.z },
        },
      });
    });
  });
  return finishModel(b);
}

export const dividerTray: GeneratorDef = {
  id: 'dividertray',
  name: 'Divider Tray',
  category: 'Tray',
  description:
    'Tray with rows of slotted side pieces holding removable dividers - for cards, tiles or files. Slots can lean so the content tilts back.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'sx', label: 'Columns (sx)', type: 'sections', default: [50, 50, 50], help: 'Column widths, e.g. 50:50:30 or 3*40' },
        {
          id: 'sy',
          label: 'Rows (sy)',
          type: 'sections',
          default: [50, 50, 50],
          allowZero: true,
          help: 'Distances between the slots, from the back. A leading 0 adds a slot at the very back, a trailing 0 one at the very front.',
        },
        { id: 'h', label: 'Height (h)', type: 'number', default: 100, unit: 'mm', min: 10, max: 1000, step: 1, help: 'Height of the content (the tray gets lower when the slots lean)' },
        outsideParam,
      ],
    },
    {
      id: 'walls',
      title: 'Walls',
      params: [
        { id: 'left_wall', label: 'Left wall', type: 'boolean', default: true },
        { id: 'right_wall', label: 'Right wall', type: 'boolean', default: true },
        { id: 'bottom', label: 'Bottom', type: 'boolean', default: false },
        { id: 'notches_in_wall', label: 'Notches in front & back', type: 'boolean', default: true, help: 'Cut the same finger notches into the front and back walls as into the dividers' },
      ],
    },
    {
      id: 'dividers',
      title: 'Dividers',
      params: [
        {
          id: 'divider_style',
          label: 'Divider style',
          type: 'select',
          default: 'single',
          options: [
            { value: 'single', label: 'One divider spanning all columns' },
            { value: 'full', label: 'Per column, full thickness tabs' },
            { value: 'half', label: 'Per column, half thickness tabs (side by side)' },
            { value: 'asymmetric', label: 'Per column, stacked asymmetric tabs' },
          ],
          help: 'One divider is generated per slot; cut as many as you need',
        },
        { id: 'divider_play', label: 'Play', type: 'number', default: 0.05, unit: 'x t', min: 0, max: 1, step: 0.01, help: 'Keeps the dividers from clamping onto the walls' },
        { id: 'divider_bottom_margin', label: 'Bottom margin', type: 'number', default: 0, unit: 'mm', min: 0, max: 100, step: 0.5, help: 'Gap between the tray floor and the dividers' },
      ],
    },
    {
      id: 'slots',
      title: 'Slots',
      collapsed: true,
      params: [
        { id: 'slot_depth', label: 'Depth', type: 'number', default: 20, unit: 'mm', min: 1, max: 200, step: 1 },
        { id: 'slot_angle', label: 'Angle', type: 'number', default: 0, unit: 'deg', min: -45, max: 45, step: 1, help: '0 is vertical; positive values lean the dividers back' },
        { id: 'slot_radius', label: 'Entry radius', type: 'number', default: 2, unit: 'mm', min: 0, max: 20, step: 0.5 },
        { id: 'slot_extra_slack', label: 'Extra slack', type: 'number', default: 0.2, unit: 'mm', min: 0, max: 3, step: 0.05, help: 'Added to the material thickness to help insert the dividers' },
      ],
    },
    {
      id: 'notches',
      title: 'Finger notches',
      collapsed: true,
      params: [
        { id: 'notch_depth', label: 'Depth', type: 'number', default: 15, unit: 'mm', min: 0, max: 200, step: 1 },
        { id: 'notch_upper_radius', label: 'Upper radius', type: 'number', default: 1, unit: 'mm', min: 0, max: 50, step: 0.5 },
        { id: 'notch_lower_radius', label: 'Lower radius', type: 'number', default: 8, unit: 'mm', min: 0, max: 50, step: 0.5 },
      ],
    },
    lidGroup,
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
