import type { Boxes } from './boxes';
import { FingerJointSettings, StackableSettings } from './settings';

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
