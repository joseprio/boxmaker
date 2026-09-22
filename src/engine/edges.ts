import type { Boxes } from './boxes';
import type { Vec2 } from './geometry';
import { CabinetHingeSettings, ChestHingeSettings, DoveTailSettings, FingerJointSettings, FlexSettings, StackableSettings } from './settings';

/**
 * An edge draws one side of a part. Ported from boxes.py: `startWidth` is how
 * far the drawn baseline lies outside the nominal wall rectangle, `margin` how
 * much further material (e.g. fingers) sticks out beyond the baseline.
 */
export abstract class BaseEdge {
  abstract readonly char: string;
  abstract readonly description: string;

  constructor(protected boxes: Boxes) {}

  abstract draw(length: number): void;

  startWidth(): number {
    return 0;
  }

  endWidth(): number {
    return this.startWidth();
  }

  margin(): number {
    return 0;
  }

  spacing(): number {
    return this.startWidth() + this.margin();
  }
}

export class Edge extends BaseEdge {
  readonly char = 'e';
  readonly description = 'Straight Edge';

  draw(length: number): void {
    this.boxes.edge(length);
  }
}

export class OutSetEdge extends BaseEdge {
  readonly char = 'E';
  readonly description = 'Straight Edge (outset by thickness)';

  draw(length: number): void {
    this.boxes.edge(length);
  }

  startWidth(): number {
    return this.boxes.thickness;
  }
}

// ---------------------------------------------------------------------------
// Finger joints
// ---------------------------------------------------------------------------

function calcFingers(settings: FingerJointSettings, length: number): [number, number] {
  const { space, finger } = settings;
  let fingers = Math.floor((length - (settings.surroundingspaces - 1) * space) / (space + finger));
  // shrink surrounding space up to half a thickness each side
  if (fingers === 0 && length > finger + 1.0 * settings.thickness) fingers = 1;
  if (!finger) fingers = 0;
  let leftover = length - fingers * (space + finger) + space;
  if (fingers <= 0) {
    fingers = 0;
    leftover = length;
  }
  return [fingers, leftover];
}

/** Returns [finger length, space recess] for walls meeting at `angle`. */
function fingerLength(settings: FingerJointSettings, angle: number): [number, number] {
  const t = settings.thickness;
  if (angle >= 90 || angle <= -90) return [t + settings.extra_length, 0];
  if (angle < 0) return [Math.sin((-angle * Math.PI) / 180) * t + settings.extra_length, 0];
  const a = 90 - (180 - angle) / 2;
  const fl = t * Math.tan((a * Math.PI) / 180);
  const b = 90 - 2 * a;
  const spacerecess = -Math.sin((b * Math.PI) / 180) * fl;
  return [fl + settings.extra_length, spacerecess];
}

export class FingerJointEdge extends BaseEdge {
  readonly char: string = 'f';
  readonly description: string = 'Finger Joint';
  positive = true;

  constructor(boxes: Boxes, public settings: FingerJointSettings) {
    super(boxes);
  }

  private drawFinger(f: number, h: number, positive: boolean): void {
    if (positive) this.boxes.polyline(0, -90, h, 90, f, 90, h, -90);
    else this.boxes.polyline(0, 90, h, -90, f, -90, h, 90);
  }

  draw(length: number): void {
    const positive = this.positive;
    const t = this.settings.thickness;
    let s = this.settings.space;
    let f = this.settings.finger;
    const play = this.settings.play;

    let [fingers, leftover] = calcFingers(this.settings, length);

    // not enough space for normal fingers - use small rectangular one
    if (fingers === 0 && f && leftover > 0.75 * t && leftover > 4 * play) {
      fingers = 1;
      f = leftover = leftover / 2;
    }

    if (!positive) {
      f += play;
      s -= play;
      leftover -= play;
    }

    this.boxes.edge(leftover / 2);
    const [l1, l2] = fingerLength(this.settings, this.settings.angle);
    const h = l1 - l2;
    for (let i = 0; i < fingers; i++) {
      if (i !== 0) this.boxes.edge(s);
      this.drawFinger(f, h, positive);
    }
    this.boxes.edge(leftover / 2);
  }

  margin(): number {
    const w = fingerLength(this.settings, this.settings.angle);
    return this.positive ? w[0] - w[1] : 0;
  }

  startWidth(): number {
    const w = fingerLength(this.settings, this.settings.angle);
    return this.positive ? w[1] : w[0];
  }
}

export class FingerJointEdgeCounterPart extends FingerJointEdge {
  override readonly char = 'F';
  override readonly description = 'Finger Joint (opposing side)';
  override positive = false;
}

/** Draws the holes matching a finger joint edge along a line. */
export class FingerHoles {
  constructor(
    private boxes: Boxes,
    public settings: FingerJointSettings,
  ) {}

  draw(x: number, y: number, length: number, angle = 90): void {
    this.boxes.saved(() => {
      this.boxes.moveTo(x, y, angle);
      const s = this.settings.space;
      let f = this.settings.finger;
      const p = this.settings.play;
      let [fingers, leftover] = calcFingers(this.settings, length);
      if (fingers === 0 && f && leftover > 0.75 * this.settings.thickness && leftover > 4 * p) {
        fingers = 1;
        f = leftover = leftover / 2;
      }
      for (let i = 0; i < fingers; i++) {
        const pos = leftover / 2 + i * (s + f);
        this.boxes.rectangularHole(pos + 0.5 * f, 0, f + p, this.settings.width + p);
      }
    });
  }
}

export class FingerHoleEdge extends BaseEdge {
  readonly char = 'h';
  readonly description = 'Edge (parallel Finger Joint Holes)';

  constructor(
    boxes: Boxes,
    public settings: FingerJointSettings,
  ) {
    super(boxes);
  }

  draw(length: number): void {
    const dist = this.settings.edge_width;
    this.boxes.saved(() => {
      this.boxes.fingerHolesAt(0, dist + this.settings.thickness / 2, length, 0);
    });
    this.boxes.edge(length);
  }

  startWidth(): number {
    return this.settings.edge_width + this.settings.thickness;
  }
}

// ---------------------------------------------------------------------------
// Stackable edges  (chars: s = bottom w/ holes, S = top, z = feet, Z = top w/ holes)
// ---------------------------------------------------------------------------

export class StackableBaseEdge extends BaseEdge {
  readonly char: string = 's';
  readonly description: string = 'Abstract Stackable class';
  bottom = true;

  constructor(
    boxes: Boxes,
    public settings: StackableSettings,
  ) {
    super(boxes);
  }

  draw(length: number): void {
    const s = this.settings;
    const r = s.height / 2 / (1 - Math.cos((s.angle * Math.PI) / 180));
    const l = r * Math.sin((s.angle * Math.PI) / 180);
    const p = this.bottom ? 1 : -1;
    this.boxes.edge(s.width);
    this.boxes.corner(p * s.angle, r);
    this.boxes.corner(-p * s.angle, r);
    this.boxes.edge(length - 2 * s.width - 4 * l);
    this.boxes.corner(-p * s.angle, r);
    this.boxes.corner(p * s.angle, r);
    this.boxes.edge(s.width);
  }

  protected height(): number {
    return this.settings.height + this.settings.holedistance + this.settings.thickness;
  }

  startWidth(): number {
    return this.bottom ? this.height() : 0;
  }

  margin(): number {
    return this.bottom ? 0 : this.settings.height;
  }
}

export class StackableEdge extends StackableBaseEdge {
  override readonly char = 's';
  override readonly description = 'Stackable (bottom, finger joint holes)';

  override draw(length: number): void {
    const s = this.settings;
    this.boxes.fingerHolesAt(0, s.height + s.holedistance + 0.5 * this.boxes.thickness, length, 0);
    super.draw(length);
  }
}

export class StackableEdgeTop extends StackableBaseEdge {
  override readonly char = 'S';
  override readonly description = 'Stackable (top)';
  override bottom = false;
}

export class StackableFeet extends StackableBaseEdge {
  override readonly char = 'z';
  override readonly description = 'Stackable feet (bottom)';

  protected override height(): number {
    return this.settings.height;
  }
}

export class StackableHoleEdgeTop extends StackableBaseEdge {
  override readonly char = 'Z';
  override readonly description = 'Stackable edge with finger holes (top)';
  override bottom = false;

  override startWidth(): number {
    return this.settings.thickness + this.settings.holedistance;
  }

  override draw(length: number): void {
    const s = this.settings;
    this.boxes.fingerHolesAt(0, s.holedistance + 0.5 * this.boxes.thickness, length, 0);
    super.draw(length);
  }
}

// ---------------------------------------------------------------------------
// Composite edges
// ---------------------------------------------------------------------------

/** Edge with a slot to slide another piece through. */
export class Slot extends BaseEdge {
  readonly char = '';
  readonly description = 'Slot';

  constructor(
    boxes: Boxes,
    private depth: number,
  ) {
    super(boxes);
  }

  draw(length: number): void {
    if (this.depth) {
      this.boxes.corner(90);
      this.boxes.edge(this.depth);
      this.boxes.corner(-90);
      this.boxes.edge(length);
      this.boxes.corner(-90);
      this.boxes.edge(this.depth);
      this.boxes.corner(90);
    } else {
      this.boxes.edge(length);
    }
  }
}

/** Straight edge with slots (for crossing dividers). */
export class SlottedEdge extends BaseEdge {
  readonly char = '';
  readonly description = 'Straight Edge with slots';
  private edge: BaseEdge;

  constructor(
    boxes: Boxes,
    private sections: number[],
    edge: BaseEdge | string = 'e',
    private slots = 0,
  ) {
    super(boxes);
    this.edge = boxes.getEdge(edge);
  }

  startWidth(): number {
    return this.edge.startWidth();
  }

  endWidth(): number {
    return this.edge.endWidth();
  }

  margin(): number {
    return this.edge.margin();
  }

  draw(): void {
    const t = this.boxes.thickness;
    for (const l of this.sections.slice(0, -1)) {
      this.edge.draw(l);
      if (this.slots) new Slot(this.boxes, this.slots).draw(t);
      else this.boxes.edge(t);
    }
    this.edge.draw(this.sections[this.sections.length - 1]);
  }
}

/** Edge composed of multiple different edges. */
export class CompoundEdge extends BaseEdge {
  readonly char = '';
  readonly description = 'Compound Edge';
  private types: BaseEdge[];
  private length: number;

  constructor(
    boxes: Boxes,
    types: Array<BaseEdge | string>,
    private lengths: number[],
  ) {
    super(boxes);
    this.types = types.map((e) => boxes.getEdge(e));
    this.length = lengths.reduce((a, b) => a + b, 0);
  }

  startWidth(): number {
    return this.types[0].startWidth();
  }

  endWidth(): number {
    return this.types[this.types.length - 1].endWidth();
  }

  margin(): number {
    return Math.max(...this.types.map((e) => e.margin() + e.startWidth())) - this.types[0].startWidth();
  }

  draw(length: number): void {
    if (length && Math.abs(length - this.length) > 1e-5) {
      throw new Error('Wrong length for CompoundEdge');
    }
    let lastwidth = this.types[0].startWidth();
    this.types.forEach((e, i) => {
      this.boxes.step(e.startWidth() - lastwidth);
      e.draw(this.lengths[i]);
      lastwidth = e.endWidth();
    });
  }
}

/** An edge with room to get your fingers around cards (TypeTray "A" edge). */
export interface GripHoleParams {
  radius: number;
  absoluteDepth: number;
  relativeDepth: number;
  absoluteWidth: number;
  relativeWidth: number;
  wallHeight: number;
}

export class GripHoleEdge extends BaseEdge {
  readonly char = 'A';
  readonly description = 'Edge with finger grip cut-out';

  constructor(
    boxes: Boxes,
    private p: GripHoleParams,
  ) {
    super(boxes);
  }

  draw(length: number): void {
    const width = Math.min(this.p.absoluteWidth + length * this.p.relativeWidth, length);
    const depth = Math.min(this.p.absoluteDepth + this.p.wallHeight * this.p.relativeDepth, this.p.wallHeight);
    const r = Math.min(width / 2, depth, this.p.radius);
    if (depth < 1e-9 || width < 1e-9) {
      this.boxes.edge(length);
      return;
    }
    this.boxes.polyline(
      (length - width) / 2,
      90,
      depth - r,
      [-90, r],
      width - 2 * r,
      [-90, r],
      depth - r,
      90,
      (length - width) / 2,
    );
  }
}

// ---------------------------------------------------------------------------
// Flex (living hinge) and dove tails
// ---------------------------------------------------------------------------

/**
 * Straight edge with a field of staggered flex cuts next to it, spanning `h`
 * into the part ('X'). The opposite side of the part should be a plain edge.
 */
export class FlexEdge extends BaseEdge {
  readonly char = 'X';
  readonly description = 'Flex cut';

  constructor(
    boxes: Boxes,
    public settings: FlexSettings,
  ) {
    super(boxes);
  }

  draw(x: number, h = 0): void {
    const { distance: dist, connection, width } = this.settings;
    const b = this.boxes;
    const lines = Math.floor(x / dist);
    const leftover = x - lines * dist;
    const sections = Math.max(Math.floor((h - connection) / width), 1);
    const sheight = (h - connection) / sections - connection;
    const cut = (pos: number, y1: number, y2: number) => b.cutLine(pos, y1, pos, y2);

    for (let i = 1; i < lines; i++) {
      const pos = i * dist + leftover / 2;
      if (i % 2) {
        cut(pos, 0, connection + sheight);
        for (let j = 0; j < Math.floor((sections - 1) / 2); j++) {
          cut(pos, (2 * j + 1) * sheight + (2 * j + 2) * connection, (2 * j + 3) * (sheight + connection));
        }
        if (!(sections % 2)) cut(pos, h - sheight - connection, h);
      } else if (sections % 2) {
        cut(pos, h, h - connection - sheight);
        for (let j = 0; j < Math.floor((sections - 1) / 2); j++) {
          cut(pos, h - ((2 * j + 1) * sheight + (2 * j + 2) * connection), h - (2 * j + 3) * (sheight + connection));
        }
      } else {
        for (let j = 0; j < sections / 2; j++) {
          cut(pos, h - connection - 2 * j * (sheight + connection), h - 2 * (j + 1) * (sheight + connection));
        }
      }
    }
    b.edge(x);
  }
}

export class DoveTailJoint extends BaseEdge {
  readonly char: string = 'd';
  readonly description: string = 'Dove Tail Joint';
  positive = true;

  constructor(
    boxes: Boxes,
    public settings: DoveTailSettings,
  ) {
    super(boxes);
  }

  draw(length: number): void {
    const s = this.settings;
    const b = this.boxes;
    const radius = s.radius;
    const a = s.angle + 90;
    const alpha = 0.5 * Math.PI - (Math.PI * s.angle) / 180;
    const l1 = radius / Math.tan(alpha / 2);
    const diffx = (0.5 * s.depth) / Math.tan(alpha);
    const l2 = (0.5 * s.depth) / Math.sin(alpha);
    const sections = Math.floor(length / (s.size * 2));
    const leftover = length - sections * s.size * 2;
    if (sections === 0) {
      b.edge(length);
      return;
    }
    const p = this.positive ? 1 : -1;
    b.edge((s.size + leftover) / 2 + diffx - l1);
    for (let i = 0; i < sections; i++) {
      b.corner(-p * a, radius);
      b.edge(2 * (l2 - l1));
      b.corner(p * a, radius);
      b.edge(2 * (diffx - l1) + s.size);
      b.corner(p * a, radius);
      b.edge(2 * (l2 - l1));
      b.corner(-p * a, radius);
      if (i < sections - 1) b.edge(2 * (diffx - l1) + s.size);
    }
    b.edge((s.size + leftover) / 2 + diffx - l1);
  }

  margin(): number {
    return this.positive ? this.settings.depth : 0;
  }
}

export class DoveTailJointCounterPart extends DoveTailJoint {
  override readonly char = 'D';
  override readonly description = 'Dove Tail Joint (opposing side)';
  override positive = false;
}

// ---------------------------------------------------------------------------
// Chest hinge (integrated hinge: the lid turns on pins in the side walls)
// ---------------------------------------------------------------------------

/** Side wall top with the hinge eye: 'o' has it at the start, 'O' (reversed) at the end. */
export class ChestHinge extends BaseEdge {
  readonly char: string;
  readonly description = 'Edge with chest hinge';

  constructor(
    boxes: Boxes,
    public settings: ChestHingeSettings,
    protected reversed = false,
  ) {
    super(boxes);
    this.char = reversed ? 'O' : 'o';
  }

  /**
   * Bearing discs of the hinges drawn so far, in part-local coordinates: the
   * disc cut out of the round hole turns in it, holding the lid's pin in its
   * rectangular slot. Generators make them into separate parts.
   */
  discs: Array<{ centre: Vec2; radius: number; slot: Vec2[] }> = [];

  draw(l: number): void {
    const { thickness: t, pin_height: p, hinge_strength: s } = this.settings;
    const pinh = this.settings.pinheight();
    const b = this.boxes;
    // disc centre and slot (t x pinh, from the centre towards the lid's pin)
    const [cx, cy] = this.reversed ? [l + t, 0] : [-t, -s - p];
    const [sx0, sx1] = this.reversed ? [l, l + t] : [-t, 0];
    b.hole(cx, cy, p);
    this.discs.push({
      centre: b.localPoint(cx, cy),
      radius: p,
      slot: [
        [sx0, cy - pinh],
        [sx1, cy - pinh],
        [sx1, cy],
        [sx0, cy],
      ].map(([x, y]) => b.localPoint(x, y)),
    });
    const poly: Array<number | [number, number]> = [0, -180, t, [270, p + s], 0, -90, l + t - p - s];
    this.boxes.polyline(...(this.reversed ? [...poly].reverse() : poly));
  }

  margin(): number {
    return this.reversed ? 0 : this.settings.pin_height + this.settings.hinge_strength;
  }

  startWidth(): number {
    return this.reversed ? this.settings.pin_height + this.settings.hinge_strength : 0;
  }

  endWidth(): number {
    return this.reversed ? 0 : this.settings.pin_height + this.settings.hinge_strength;
  }
}

/** Lid side wall edge above a chest hinge ('p' / reversed 'P'). */
export class ChestHingeTop extends ChestHinge {
  override readonly char: string;

  constructor(boxes: Boxes, settings: ChestHingeSettings, reversed = false) {
    super(boxes, settings, reversed);
    this.char = reversed ? 'P' : 'p';
  }

  private get width(): number {
    return this.settings.play + this.settings.pin_height + this.settings.hinge_strength;
  }

  override draw(l: number): void {
    const { thickness: t } = this.settings;
    const w = this.width;
    const poly: Array<number | [number, number]> = [0, -180, t, -180, 0, [-90, w], 0, 90, l + t - w];
    this.boxes.polyline(...(this.reversed ? [...poly].reverse() : poly));
  }

  override margin(): number {
    return this.reversed ? 0 : this.width;
  }

  override startWidth(): number {
    return this.reversed ? this.width : 0;
  }

  override endWidth(): number {
    return this.reversed ? 0 : this.width;
  }
}

/** Lid back edge with the pins sticking out at both ends ('q'). */
export class ChestHingePin extends BaseEdge {
  readonly char = 'q';
  readonly description = 'Edge with pins for a chest hinge';

  constructor(
    boxes: Boxes,
    public settings: ChestHingeSettings,
  ) {
    super(boxes);
  }

  draw(l: number): void {
    const { thickness: t, pin_height: p, hinge_strength: s, play } = this.settings;
    const pinh = this.settings.pinheight();
    const poly = [0, -90, play + s + p - pinh, -90, t, 90, pinh, 90];
    this.boxes.polyline(...poly);
    this.boxes.polyline(l + 2 * t, ...[...poly].reverse());
  }

  margin(): number {
    return this.settings.play + this.settings.pin_height + this.settings.hinge_strength;
  }
}

/** Plain edge opposite a chest hinge ('Q'). */
export class ChestHingeFront extends BaseEdge {
  readonly char = 'Q';
  readonly description = 'Edge opposing a chest hinge';

  constructor(
    boxes: Boxes,
    public settings: ChestHingeSettings,
  ) {
    super(boxes);
  }

  draw(length: number): void {
    this.boxes.edge(length);
  }

  startWidth(): number {
    return this.settings.pin_height + this.settings.hinge_strength;
  }
}

// ---------------------------------------------------------------------------
// Cabinet hinge (separate eyes on a metal pin), inside style
// ---------------------------------------------------------------------------

/**
 * Edge cut for cabinet hinges: 'u' on the box, 'U' (top) on the lid. Each
 * hinge is a notch with slots and square holes holding alternate eyes.
 */
export class CabinetHingeEdge extends BaseEdge {
  readonly char: string;
  readonly description = 'Edge with cabinet hinges';

  constructor(
    boxes: Boxes,
    public settings: CabinetHingeSettings,
    private top = false,
  ) {
    super(boxes);
    this.char = top ? 'U' : 'u';
  }

  private poly(): number[] {
    const { eyes_per_hinge: n, play: p, eye: e, thickness: t, spacing } = this.settings;
    const top = this.top ? 1 : 0;
    const poly: number[] = top ? [spacing, 90, e + p] : [spacing + p, 90, e + p, 0];
    for (let i = 0; i < n; i++) {
      if ((i % 2) ^ top) poly.push(...(i === 0 ? [-90, t + 2 * p, 90] : [90, t + 2 * p, 90]));
      else poly.push(t - p, -90, t, -90, t - p);
    }
    if ((n % 2) ^ top) poly.push(0, e + p, 90, p + spacing);
    else poly.splice(poly.length - 1, 1, -90, e + p, 90, spacing);
    return poly;
  }

  draw(l: number): void {
    const { eyes_per_hinge: n, eye: e, thickness: t } = this.settings;
    const top = this.top ? 1 : 0;
    const w = this.settings.width();
    const starts = this.settings.layout(l);
    const poly = this.poly();
    if (starts.length === 1) this.boxes.edge(starts[0]);
    starts.forEach((_, j) => {
      for (let i = 0; i < n; i++) {
        if (!((i % 2) ^ top)) this.boxes.rectangularHole(this.settings.eyeCentre(i), e + 2.5 * t, t, t);
      }
      this.boxes.polyline(...poly);
      if (j < starts.length - 1) this.boxes.edge((l - starts.length * w) / (starts.length - 1));
    });
    if (starts.length === 1) this.boxes.edge(starts[0]);
  }
}
