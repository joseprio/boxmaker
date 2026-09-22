import {
  BaseEdge,
  CompoundEdge,
  Edge,
  FingerHoleEdge,
  FingerHoles,
  FingerJointEdge,
  FingerJointEdgeCounterPart,
  OutSetEdge,
  StackableEdge,
  StackableEdgeTop,
  StackableFeet,
  StackableHoleEdgeTop,
} from './edges';
import { dedupe, nearlyEqual, signedArea, type Vec2, type Vec3 } from './geometry';
import type { Part, Placement } from './part';
import { FingerJointSettings, StackableSettings, type FingerJointParams, type StackableParams } from './settings';
import { Turtle } from './turtle';

export type EdgeSpec = string | BaseEdge;

export type EdgeCallback = Array<(() => void) | undefined | null> | ((edgeIndex: number) => void);

export interface WallOptions {
  /** Called per edge (counter-clockwise, starting at the bottom edge) with the frame at the nominal corner. */
  callback?: EdgeCallback;
  /** See boxes.py rectangularWall: extends adjacent edges over the width of the numbered edge ends. */
  ignoreWidths?: number[];
  label?: string;
  group?: string;
  placement?: Placement;
}

export interface BoxesOptions {
  thickness: number;
  /** kerf compensation in mm (applied on export only) */
  burn?: number;
  fingerJoint?: Partial<FingerJointParams>;
  stackable?: Partial<StackableParams>;
}

/**
 * Port of the boxes.py `Boxes` base class. Generators subclass it and call
 * the part helpers (`rectangularWall`, `polygonWall`...) which collect
 * finished parts with an optional 3D placement.
 */
export class Boxes {
  readonly thickness: number;
  readonly burn: number;
  /** distance between parts on the sheet */
  spacing = 3;
  readonly edges = new Map<string, BaseEdge>();
  readonly parts: Part[] = [];
  readonly fingerJointSettings: FingerJointSettings;
  readonly stackableSettings: StackableSettings;
  private fingerJointParams: Partial<FingerJointParams>;
  protected turtle = new Turtle();
  private fingerHoles: FingerHoles;
  private currentLabel = '';
  private currentGroup = 'box';

  constructor(opts: BoxesOptions) {
    this.thickness = opts.thickness;
    this.burn = opts.burn ?? 0.1;
    this.fingerJointParams = opts.fingerJoint ?? {};
    this.fingerJointSettings = new FingerJointSettings(this.thickness, opts.fingerJoint);
    this.stackableSettings = new StackableSettings(this.thickness, opts.stackable);
    this.fingerHoles = new FingerHoles(this, this.fingerJointSettings);

    this.addEdge(new Edge(this));
    this.addEdge(new OutSetEdge(this));
    this.addEdge(new FingerJointEdge(this, this.fingerJointSettings));
    this.addEdge(new FingerJointEdgeCounterPart(this, this.fingerJointSettings));
    this.addEdge(new FingerHoleEdge(this, this.fingerJointSettings));
    this.addEdge(new StackableEdge(this, this.stackableSettings));
    this.addEdge(new StackableEdgeTop(this, this.stackableSettings));
    this.addEdge(new StackableFeet(this, this.stackableSettings));
    this.addEdge(new StackableHoleEdgeTop(this, this.stackableSettings));
  }

  addEdge(edge: BaseEdge, char = edge.char): void {
    this.edges.set(char, edge);
  }

  /**
   * Register finger joint edges for walls meeting at `angle` degrees (like
   * boxes.py `setValues(angle=...)` + `edgeObjects(chars="gG")`).
   */
  addAngledFingerJoints(angle: number, chars = 'gG'): void {
    const s = new FingerJointSettings(this.thickness, this.fingerJointParams);
    s.angle = angle;
    this.addEdge(new FingerJointEdge(this, s), chars[0]);
    this.addEdge(new FingerJointEdgeCounterPart(this, s), chars[1]);
  }

  getEdge(e: EdgeSpec): BaseEdge {
    if (typeof e !== 'string') return e;
    const edge = this.edges.get(e);
    if (!edge) throw new Error(`Unknown edge type "${e}"`);
    return edge;
  }

  // ------------------------------------------------------------------
  // Turtle graphics
  // ------------------------------------------------------------------

  edge(length: number): void {
    this.turtle.edge(length);
  }

  corner(degrees: number, radius = 0): void {
    this.turtle.corner(degrees, radius);
  }

  polyline(...args: Array<number | [number, number]>): void {
    this.turtle.polyline(...args);
  }

  moveTo(x: number, y = 0, degrees = 0): void {
    this.turtle.moveTo(x, y, degrees);
  }

  saved<T>(fn: () => T): T {
    return this.turtle.saved(fn);
  }

  /** Parallel step perpendicular to the current direction; positive moves outside the part. */
  step(out: number): void {
    if (out > 1e-5) {
      this.corner(-90);
      this.edge(out);
      this.corner(90);
    } else if (out < -1e-5) {
      this.corner(90);
      this.edge(-out);
      this.corner(-90);
    }
  }

  /** Make a corner between two edges, taking their widths into account. */
  edgeCorner(edge1: EdgeSpec, edge2: EdgeSpec, angle = 90): void {
    const e1 = this.getEdge(edge1);
    const e2 = this.getEdge(edge2);
    const tan = Math.tan((angle / 2) * (Math.PI / 180));
    this.edge(e2.startWidth() * tan);
    this.corner(angle);
    this.edge(e1.endWidth() * tan);
  }

  // ------------------------------------------------------------------
  // Holes
  // ------------------------------------------------------------------

  /** Round hole centred at (x, y). */
  hole(x: number, y: number, r = 0, d = 0): void {
    if (!r) r = d / 2;
    if (r <= 0) return;
    this.saved(() => {
      this.moveTo(x + r, y, -90);
      this.corner(-360, r);
    });
  }

  /**
   * Pear shaped mounting hole for sliding over a screw head, pointing along
   * `angle`. Without a head diameter it is a plain round hole.
   */
  mountingHole(x: number, y: number, dShaft: number, dHead = 0, angle = 0): void {
    if (dShaft <= 0) return;
    if (!dHead || dHead <= dShaft) {
      this.hole(x, y, 0, dShaft);
      return;
    }
    const rs = dShaft / 2;
    const rh = dHead / 2;
    const a = (Math.asin(rs / rh) * 180) / Math.PI;
    this.saved(() => {
      this.moveTo(x, y, angle);
      this.moveTo(0, rs);
      this.corner(-180, rs);
      this.edge(2 * rs);
      this.corner(90 - a);
      this.corner(-360 + 2 * a, rh);
      this.corner(90 - a);
      this.edge(2 * rs);
    });
  }

  /** Rectangular hole, centred by default. */
  rectangularHole(x: number, y: number, dx: number, dy: number, r = 0, centerX = true, centerY = true): void {
    r = Math.min(r, dx / 2, dy / 2);
    const xs = centerX ? x : x + dx / 2;
    const ys = centerY ? y - dy / 2 : y;
    this.saved(() => {
      this.moveTo(xs, ys, 180);
      this.edge(dx / 2 - r);
      for (const d of [dy, dx, dy, dx / 2 + r]) {
        this.corner(-90, r);
        this.edge(d - 2 * r);
      }
    });
  }

  /** Finger joint holes along a line starting at (x, y) heading `angle`. */
  fingerHolesAt(x: number, y: number, length: number, angle = 90): void {
    this.fingerHoles.draw(x, y, length, angle);
  }

  /** Call the numbered callback with the frame moved to (x, y, a). */
  cc(callback: EdgeCallback | undefined, number: number, x = 0, y = 0, a = 0): void {
    if (!callback) return;
    let fn: (() => void) | undefined;
    if (Array.isArray(callback)) {
      const c = callback[number];
      if (c) fn = c;
    } else {
      fn = () => callback(number);
    }
    if (!fn) return;
    this.saved(() => {
      this.moveTo(x, y, a);
      fn();
    });
  }

  // ------------------------------------------------------------------
  // Sizing helpers
  // ------------------------------------------------------------------

  /** Shrink outer dimensions to the inner ones, like boxes.py adjustSize. */
  adjustSize(l: number, e1: EdgeSpec | boolean = true, e2: EdgeSpec | boolean = true): number {
    let walls = 0;
    for (const e of [e1, e2]) {
      if (typeof e === 'boolean') {
        if (e) walls += this.thickness;
      } else {
        const edge = this.getEdge(e);
        walls += edge.startWidth() + edge.margin();
      }
    }
    return l - walls;
  }

  /** Shrink a list of section sizes so the total (incl. walls) fits the outer size. */
  adjustSizes(sections: number[], e1: EdgeSpec | boolean = true, e2: EdgeSpec | boolean = true): number[] {
    const total = sections.reduce((a, b) => a + b, 0);
    let walls = (sections.length - 1) * this.thickness;
    for (const e of [e1, e2]) {
      if (typeof e === 'boolean') {
        if (e) walls += this.thickness;
      } else {
        const edge = this.getEdge(e);
        walls += edge.startWidth() + edge.margin();
      }
    }
    const factor = total > 0 ? (total - walls) / total : 1;
    return sections.map((s) => s * factor);
  }

  // ------------------------------------------------------------------
  // Parts
  // ------------------------------------------------------------------

  beginPart(label = '', group = 'box'): void {
    this.turtle.reset();
    this.currentLabel = label;
    this.currentGroup = group;
  }

  endPart(placement?: Placement): Part {
    const closed: Vec2[][] = [];
    const open: Vec2[][] = [];
    for (const raw of this.turtle.paths) {
      const path = dedupe(raw);
      if (path.length >= 3 && nearlyEqual(raw[0], raw[raw.length - 1], 1e-4)) closed.push(path);
      else if (path.length >= 2) open.push(path);
    }
    if (closed.length === 0) {
      throw new Error(`Part "${this.currentLabel}" has no closed outline`);
    }
    let best = 0;
    let bestArea = -1;
    closed.forEach((p, i) => {
      const a = Math.abs(signedArea(p));
      if (a > bestArea) {
        bestArea = a;
        best = i;
      }
    });
    let outline = closed[best];
    if (signedArea(outline) < 0) outline = [...outline].reverse();
    const holes = closed.filter((_, i) => i !== best);
    const part: Part = {
      label: this.currentLabel,
      outline,
      holes,
      openPaths: open,
      thickness: this.thickness,
      placement,
      group: this.currentGroup,
    };
    this.parts.push(part);
    this.turtle.reset();
    return part;
  }

  /** Draw an arbitrary part with the turtle; local (0,0) is where `draw` starts. */
  freePart(draw: () => void, opts: WallOptions = {}): Part {
    this.beginPart(opts.label, opts.group);
    draw();
    return this.endPart(opts.placement);
  }

  /**
   * Rectangular wall. `edges` are bottom, right, top, left (counter-clockwise).
   * Part-local (0,0) is the bottom-left corner of the nominal x*y rectangle.
   */
  rectangularWall(x: number, y: number, edgeSpec: string | EdgeSpec[], opts: WallOptions = {}): Part {
    const specs = typeof edgeSpec === 'string' ? edgeSpec.split('') : edgeSpec;
    if (specs.length !== 4) throw new Error('four edges required');
    let edges = specs.map((e) => this.getEdge(e));
    edges = [...edges, ...edges];
    const ignore = opts.ignoreWidths ?? [];

    this.beginPart(opts.label, opts.group);
    // start on the baseline of the bottom edge, at the nominal left corner
    this.moveTo(0, -edges[0].startWidth());
    const lengths = [x, y, x, y];
    for (let i = 0; i < 4; i++) {
      let l = lengths[i];
      this.cc(opts.callback, i, 0, edges[i].startWidth());
      let e1: BaseEdge = edges[i];
      let e2: BaseEdge = edges[i + 1];
      if (ignore.includes(2 * i - 1) || ignore.includes(2 * i - 1 + 8)) {
        l += edges[(i + 7) % 8].endWidth();
      }
      if (ignore.includes(2 * i)) {
        l += edges[i + 1].startWidth();
        e2 = this.getEdge('e');
      }
      if (ignore.includes(2 * i + 1)) {
        e1 = this.getEdge('e');
      }
      edges[i].draw(l);
      this.edgeCorner(e1, e2, 90);
    }
    return this.endPart(opts.placement);
  }

  /**
   * Polygon wall: `borders` alternates lengths and corner angles. The polygon
   * is closed automatically. Part-local (0,0) is the start of the first edge.
   */
  polygonWall(borders: number[], edge: string | EdgeSpec[] = 'f', opts: WallOptions = {}): Part {
    const edges = (typeof edge === 'string' ? edge.split('') : edge).map((e) => this.getEdge(e));
    const t = this.thickness;
    const b = this.closePolygon(borders);

    this.beginPart(opts.label, opts.group);
    let lengthCorrection = 0;
    for (let i = 0; i < b.length; i += 2) {
      this.cc(opts.callback, i / 2);
      this.edge(lengthCorrection);
      let l = b[i] - lengthCorrection;
      const nextAngle = b[i + 1];
      if (nextAngle < 0) lengthCorrection = t * Math.tan(((-nextAngle / 2) * Math.PI) / 180);
      else lengthCorrection = 0;
      l -= lengthCorrection;
      edges[(i / 2) % edges.length].draw(l);
      this.edge(lengthCorrection);
      this.corner(nextAngle);
    }
    return this.endPart(opts.placement);
  }

  /**
   * Trapezoidal wall: bottom edge of width `w`, left side `h0`, right side `h1`.
   * `edges` are bottom, right, top (the slanted side), left.
   * Part-local (0,0) is the bottom-left corner.
   */
  trapezoidWall(w: number, h0: number, h1: number, edgeSpec: string | EdgeSpec[], opts: WallOptions = {}): Part {
    const specs = typeof edgeSpec === 'string' ? edgeSpec.split('') : edgeSpec;
    if (specs.length !== 4) throw new Error('four edges required');
    const edges = specs.map((e) => this.getEdge(e));
    const a = (Math.atan((h1 - h0) / w) * 180) / Math.PI;
    const l = Math.hypot(h0 - h1, w);

    this.beginPart(opts.label, opts.group);
    this.moveTo(0, -edges[0].startWidth());
    this.cc(opts.callback, 0, 0, edges[0].startWidth());
    edges[0].draw(w);
    this.edgeCorner(edges[0], edges[1], 90);
    this.cc(opts.callback, 1, 0, edges[1].startWidth());
    edges[1].draw(h1);
    this.edgeCorner(edges[1], this.getEdge('e'), 90);
    this.corner(a);
    this.cc(opts.callback, 2);
    edges[2].draw(l);
    this.corner(-a);
    this.edgeCorner(this.getEdge('e'), edges[3], 90);
    this.cc(opts.callback, 3, 0, edges[3].startWidth());
    edges[3].draw(h0);
    this.edgeCorner(edges[3], edges[0], 90);
    return this.endPart(opts.placement);
  }

  /** Measures of a regular polygon: [radius, apothem, side]. */
  regularPolygon(corners: number, opts: { radius?: number; h?: number; side?: number }): [number, number, number] {
    let { radius, h, side } = opts;
    if (radius) {
      side = 2 * Math.sin(Math.PI / corners) * radius;
      h = radius * Math.cos(Math.PI / corners);
    } else if (h) {
      side = 2 * Math.tan(Math.PI / corners) * h;
      radius = Math.hypot(side / 2, h);
    } else if (side) {
      h = 0.5 * side * Math.tan(Math.PI / 2 - Math.PI / corners);
      radius = Math.hypot(side / 2, h);
    } else {
      throw new Error('regularPolygon needs radius, h or side');
    }
    return [radius, h as number, side as number];
  }

  /**
   * Regular polygon plate. Part-local (0,0) is the first corner and the first
   * side runs along +x; the polygon lies above it (counter-clockwise).
   * Callback 0 is called at the centre, 1..n at the start of each side.
   */
  regularPolygonWall(
    corners: number,
    size: { radius?: number; h?: number; side?: number },
    edgeSpec: string | EdgeSpec[] = 'e',
    opts: WallOptions & { hole?: number } = {},
  ): Part {
    const [, h, side] = this.regularPolygon(corners, size);
    let specs = typeof edgeSpec === 'string' ? edgeSpec.split('') : edgeSpec;
    if (specs.length === 1) specs = Array(corners).fill(specs[0]);
    let edges = specs.map((e) => this.getEdge(e));
    edges = [...edges, ...edges];

    this.beginPart(opts.label, opts.group);
    this.moveTo(0, -edges[0].startWidth());
    if (opts.hole) this.hole(side / 2, h + edges[0].startWidth(), opts.hole / 2);
    this.cc(opts.callback, 0, side / 2, h + edges[0].startWidth());
    for (let i = 0; i < corners; i++) {
      this.cc(opts.callback, i + 1, 0, edges[i].startWidth());
      edges[i].draw(side);
      this.edgeCorner(edges[i], edges[i + 1], 360 / corners);
    }
    return this.endPart(opts.placement);
  }

  /** Draw a regular polygon (as a hole) centred at (x, y). */
  regularPolygonAt(x: number, y: number, corners: number, angle: number, size: { radius?: number; h?: number; side?: number }): void {
    const [, h, side] = this.regularPolygon(corners, size);
    this.saved(() => {
      this.moveTo(x, y, angle);
      this.moveTo(-side / 2, -h);
      for (let i = 0; i < corners; i++) {
        this.edge(side);
        this.corner(360 / corners);
      }
    });
  }

  private closePolygon(borders: number[]): number[] {
    // borders: l0, a0, l1, a1, ... ; if it ends with a length, close with the missing turn
    const b = [...borders];
    if (b.length % 2 === 1) {
      let sum = 0;
      for (let i = 1; i < b.length; i += 2) sum += b[i];
      b.push(360 - sum);
    }
    return b;
  }
}

// ---------------------------------------------------------------------------
// Placement helpers (box space: X = width, Y = depth, Z = up)
// ---------------------------------------------------------------------------

const X: Vec3 = { x: 1, y: 0, z: 0 };
const Y: Vec3 = { x: 0, y: 1, z: 0 };
const Z: Vec3 = { x: 0, y: 0, z: 1 };

export const place = {
  /** Horizontal plate; local x -> X, local y -> Y; material from z0 up to z0 + t. */
  plateXY: (x0: number, y0: number, z0: number): Placement => ({ origin: { x: x0, y: y0, z: z0 }, u: X, v: Y }),
  /** Vertical wall in the XZ plane; local x -> X, local y -> Z; material from y0 - t to y0. */
  wallXZ: (x0: number, y0: number, z0: number): Placement => ({ origin: { x: x0, y: y0, z: z0 }, u: X, v: Z }),
  /** Vertical wall in the YZ plane; local x -> Y, local y -> Z; material from x0 to x0 + t. */
  wallYZ: (x0: number, y0: number, z0: number): Placement => ({ origin: { x: x0, y: y0, z: z0 }, u: Y, v: Z }),
};

export { CompoundEdge };
