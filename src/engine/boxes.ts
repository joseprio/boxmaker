import {
  BaseEdge,
  CompoundEdge,
  DoveTailJoint,
  DoveTailJointCounterPart,
  Edge,
  FingerHoleEdge,
  FingerHoles,
  FingerJointEdge,
  FingerJointEdgeCounterPart,
  FlexEdge,
  OutSetEdge,
  StackableEdge,
  StackableEdgeTop,
  StackableFeet,
  StackableHoleEdgeTop,
} from './edges';
import { dedupe, nearlyEqual, signedArea, type Vec2, type Vec3 } from './geometry';
import { pathFrame, type Part, type PathSegment, type Placement } from './part';
import {
  defaultFingerJointParams,
  DoveTailSettings,
  FingerJointSettings,
  FlexSettings,
  StackableSettings,
  type DoveTailParams,
  type FingerJointParams,
  type FlexParams,
  type StackableParams,
} from './settings';
import { maxOutlineWidth, outlineStrokes, textStrokes } from './text';
import { Turtle } from './turtle';

export type EngraveStyle = 'stroke' | 'outline';

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
  /** material thickness of this part, if not the box's (e.g. a thicker floor) */
  thickness?: number;
}

export interface BoxesOptions {
  thickness: number;
  /** kerf compensation in mm (applied on export only) */
  burn?: number;
  fingerJoint?: Partial<FingerJointParams>;
  stackable?: Partial<StackableParams>;
  flex?: Partial<FlexParams>;
  dovetail?: Partial<DoveTailParams>;
}

export interface RoundedPlateOptions extends WallOptions {
  /** Outset the corners with the edges; draws slots for the wall's flex part (for 'h' edges). */
  extendCorners?: boolean;
  /** Number of pieces of the matching surroundingWall (splits the edges at the same places). */
  wallpieces?: number;
}

export interface SurroundingWallOptions {
  bottom?: EdgeSpec;
  top?: EdgeSpec;
  left?: EdgeSpec;
  right?: EdgeSpec;
  /** 1 to 4 separate pieces, joined with dove tails */
  pieces?: number;
  extendCorners?: boolean;
  /** Called at the start of each straight bottom segment (frame on the nominal bottom line) with its length. */
  callback?: (length: number) => void;
  label?: string;
  group?: string;
  /**
   * Where the wall starts: the middle of the plate's first side, on the inner
   * face, heading along that side (v up). Each piece gets its own bent path.
   */
  placement?: Placement;
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
  private stackableParams: Partial<StackableParams>;
  protected turtle = new Turtle();
  private fingerHoles: FingerHoles;
  private currentLabel = '';
  private currentGroup = 'box';
  private currentThickness: number | undefined;

  constructor(opts: BoxesOptions) {
    this.thickness = opts.thickness;
    this.burn = opts.burn ?? 0.1;
    this.fingerJointParams = opts.fingerJoint ?? {};
    this.stackableParams = opts.stackable ?? {};
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
    this.addEdge(new FlexEdge(this, new FlexSettings(this.thickness, opts.flex)));
    const dt = new DoveTailSettings(this.thickness, opts.dovetail);
    this.addEdge(new DoveTailJoint(this, dt));
    this.addEdge(new DoveTailJointCounterPart(this, dt));
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

  /**
   * Edges for the walls' bottom where they meet a floor `floorThickness` thick
   * (F: finger joints, h: finger holes, s: stackable with finger holes). The
   * fingers keep the walls' spacing so they still mate with the floor's 'f'
   * edges; only their depth and the holes follow the floor. Other characters
   * are returned as the normal edge.
   */
  floorEdge(spec: EdgeSpec, floorThickness: number): EdgeSpec {
    if (typeof spec !== 'string' || Math.abs(floorThickness - this.thickness) < 1e-9 || !'Fhs'.includes(spec)) return spec;
    const fs = new FingerJointSettings(this.thickness, this.fingerJointParams);
    fs.thickness = floorThickness;
    fs.width = (this.fingerJointParams.width ?? defaultFingerJointParams.width) * floorThickness;
    if (spec === 'F') return new FingerJointEdgeCounterPart(this, fs);
    if (spec === 'h') return new FingerHoleEdge(this, fs);
    const ss = new StackableSettings(floorThickness, this.stackableParams);
    // stackable sizes stay relative to the walls
    ss.height = this.stackableSettings.height;
    ss.width = this.stackableSettings.width;
    ss.holedistance = this.stackableSettings.holedistance;
    return new StackableEdge(this, ss, fs);
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

  /**
   * Engrave `text` centred at (x, y) of the current frame, `height` mm tall:
   * as single-line strokes, or as filled outlines `width` mm thick.
   */
  engraveText(text: string, x: number, y: number, height: number, style: EngraveStyle = 'stroke', width = 0): void {
    // outline at the origin (the merge is most robust with small coordinates), then move into place
    const strokes = textStrokes(text, height);
    const paths = style === 'outline' ? outlineStrokes(strokes, width || maxOutlineWidth(height) * 0.8) : strokes;
    for (const path of paths) this.turtle.etch(path.map((q) => ({ x: q.x + x, y: q.y + y })));
  }

  /** Engrave a path given in the current frame (closed when it ends where it starts). */
  engravePath(pts: Vec2[]): void {
    this.turtle.etch(pts);
  }

  /** Current-frame point in part-local coordinates. */
  localPoint(x: number, y: number): Vec2 {
    return this.turtle.local(x, y);
  }

  /** Closed polygon through part-local points (ignores the current frame). */
  closedPath(pts: Vec2[]): void {
    this.saved(() => {
      this.turtle.resetFrame();
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length];
        this.saved(() => {
          this.moveTo(a.x, a.y, (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
          this.edge(Math.hypot(b.x - a.x, b.y - a.y));
        });
      });
    });
  }

  /** Standalone cut line in the current frame (for flex patterns). */
  cutLine(x1: number, y1: number, x2: number, y2: number): void {
    this.turtle.cutLine(x1, y1, x2, y2);
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

  beginPart(label = '', group = 'box', thickness?: number): void {
    this.turtle.reset();
    this.currentLabel = label;
    this.currentGroup = group;
    this.currentThickness = thickness;
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
      openPaths: [...open, ...this.turtle.etches],
      cuts: this.turtle.cuts,
      thickness: this.currentThickness ?? this.thickness,
      placement,
      group: this.currentGroup,
    };
    this.parts.push(part);
    this.turtle.reset();
    return part;
  }

  /** Draw an arbitrary part with the turtle; local (0,0) is where `draw` starts. */
  freePart(draw: () => void, opts: WallOptions = {}): Part {
    this.beginPart(opts.label, opts.group, opts.thickness);
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

    this.beginPart(opts.label, opts.group, opts.thickness);
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

    this.beginPart(opts.label, opts.group, opts.thickness);
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

    this.beginPart(opts.label, opts.group, opts.thickness);
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

    this.beginPart(opts.label, opts.group, opts.thickness);
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

  // ------------------------------------------------------------------
  // Latches (flex box doors)
  // ------------------------------------------------------------------

  /** Corrugated edge useful as a gripping area. */
  grip(length: number, depth: number): void {
    const grooves = Math.max(Math.floor(length / (depth * 2)) + 1, 1);
    const d = length / grooves / 4;
    for (let i = 0; i < grooves; i++) {
      this.corner(90, d);
      this.corner(-180, d);
      this.corner(90, d);
    }
  }

  private latchHole(length: number): void {
    const t = this.thickness;
    this.edge(1.1 * t);
    this.corner(-90);
    this.edge(length / 2 + 0.2 * t);
    this.corner(-90);
    this.edge(1.1 * t);
  }

  private latchGrip(length: number): void {
    const t = this.thickness;
    this.corner(90, t / 4);
    this.grip(length / 2 - t / 2 - 0.2 * t, t / 2);
    this.corner(90, t / 4);
  }

  /**
   * Latch holding a flex box door shut. `positive` draws the tab on the box
   * side; otherwise the door side with a slot and a grip. `reverse` when
   * running away from the latch.
   */
  latch(length: number, positive = true, reverse = false): void {
    const t = this.thickness;
    if (positive) {
      const poly = [0, -90, t, 90, length / 2, 90, t, -90, length / 2];
      this.polyline(...(reverse ? poly.reverse() : poly));
    } else if (reverse) {
      this.latchGrip(length);
      this.latchHole(length);
      this.corner(90);
    } else {
      this.corner(90);
      this.latchHole(length);
      this.latchGrip(length);
    }
  }

  // ------------------------------------------------------------------
  // Rounded plates and flex walls
  // ------------------------------------------------------------------

  /** Which sides a surroundingWall of `pieces` pieces is split at (boxes.py _splitWall). */
  private splitWall(pieces: number, side: number): boolean {
    return [
      [false, false, false, false, true],
      [true, false, false, false, true],
      [true, false, true, false, true],
      [true, true, true, false, true],
      [true, true, true, true, true],
    ][Math.max(0, Math.min(4, pieces))][side];
  }

  /**
   * Plate with rounded corners matching `surroundingWall`. Part-local (0,0) is
   * the corner of the nominal x*y rectangle. Callbacks are called per edge
   * segment (split like the wall pieces) with the frame on the nominal line.
   */
  roundedPlate(x: number, y: number, r: number, edgeSpec: EdgeSpec = 'f', opts: RoundedPlateOptions = {}): Part {
    const t = this.thickness;
    const e = this.getEdge(edgeSpec);
    const ext = opts.extendCorners ?? true;
    const pieces = Math.min(opts.wallpieces ?? 1, 4);
    this.beginPart(opts.label, opts.group, opts.thickness);
    this.moveTo(r, -e.startWidth());
    let wallcount = 0;
    [x - 2 * r, y - 2 * r, x - 2 * r, y - 2 * r].forEach((l, nr) => {
      const n = this.splitWall(pieces, nr) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        this.cc(opts.callback, wallcount++, 0, e.startWidth());
        e.draw(l / n);
      }
      if (ext) {
        // slot for the flex part of the wall to sit in
        this.saved(() => {
          this.moveTo(0, e.startWidth());
          this.polyline(0, [90, r], 0, -90, t, -90, 0, [-90, r + t], 0, -90, t, -90, 0);
        });
        this.corner(90, r + e.startWidth());
      } else {
        this.step(-e.endWidth());
        this.corner(90, r);
        this.step(e.startWidth());
      }
    });
    return this.endPart(opts.placement);
  }

  /**
   * Flex wall(s) around a `roundedPlate`, starting in the middle of the
   * plate's first side and running counter-clockwise. Part-local (0,0) of each
   * piece is the start of its nominal bottom line; `h` is the inner height.
   */
  surroundingWall(x: number, y: number, r: number, h: number, opts: SurroundingWallOptions = {}): Part[] {
    const t = this.thickness;
    const flex = this.getEdge('X') as FlexEdge;
    const top = this.getEdge(opts.top ?? 'e');
    const bottom = this.getEdge(opts.bottom ?? 'e');
    const left = this.getEdge(opts.left ?? 'D');
    const right = this.getEdge(opts.right ?? 'd');
    const ext = opts.extendCorners ?? true;
    const topwidth = ext ? t : top.startWidth();
    const bottomwidth = ext ? t : bottom.startWidth();

    let c4 = (r * Math.PI * 0.5) / flex.settings.stretch;
    let turn = 90;
    let pieces = opts.pieces ?? 1;
    let sides: number[];
    if (pieces <= 2 && y - 2 * r < 1e-3) {
      // no straight y sides: the flex goes round a half circle in one go
      c4 *= 2;
      turn = 180;
      sides = [x / 2 - r, x - 2 * r, x - 2 * r];
      if (pieces > 0) pieces += 1;
    } else {
      sides = [x / 2 - r, y - 2 * r, x - 2 * r, y - 2 * r, x - 2 * r];
    }

    const parts: Part[] = [];
    const allSegs: PathSegment[] = [];
    let tops: number[] = [];
    let segs: PathSegment[] = [];
    let startX = 0; // where the current piece starts along the whole wall
    let walked = 0;
    const baseLabel = opts.label ?? 'wall';
    const multi = (opts.pieces ?? 1) > 1;

    const start = () => {
      this.beginPart(multi ? `${baseLabel} ${parts.length + 1}` : baseLabel, opts.group);
      this.moveTo(0, -bottom.startWidth());
      tops = [];
      segs = [];
      startX = walked;
    };
    const straight = (l: number) => {
      const cb = opts.callback;
      if (cb) this.cc(() => cb(l), 0, 0, bottom.startWidth());
      bottom.draw(l);
      tops.push(l);
      segs.push({ length: l });
      allSegs.push({ length: l });
      walked += l;
    };
    const finish = () => {
      this.saved(() => {
        this.edgeCorner(bottom, right, 90);
        right.draw(h);
        this.edgeCorner(right, top, 90);
        [...tops].reverse().forEach((d, n) => {
          if (n % 2) {
            this.step(topwidth - top.endWidth());
            this.edge(d);
            this.step(top.startWidth() - topwidth);
          } else {
            top.draw(d);
          }
        });
        this.edgeCorner(top, left, 90);
        left.draw(h);
        this.edgeCorner(left, bottom, 90);
      });
      let placement: Placement | undefined;
      if (opts.placement) {
        const f = pathFrame({ ...opts.placement, path: allSegs }, startX);
        placement = { origin: f.pos, u: f.dir, v: opts.placement.v, path: segs };
      }
      parts.push(this.endPart(placement));
    };

    start();
    sides.forEach((l, nr) => {
      const last = nr === sides.length - 1;
      if (nr > 0 && this.splitWall(pieces, nr)) {
        straight(l / 2);
        finish();
        if (last) return;
        start();
        straight(l / 2);
      } else {
        straight(l);
      }
      if (last) return;
      this.step(bottomwidth - bottom.endWidth());
      flex.draw(c4, h + topwidth + bottomwidth);
      this.step(bottom.startWidth() - bottomwidth);
      tops.push(c4);
      const bend: PathSegment = { length: c4, angle: turn, radius: r };
      segs.push(bend);
      allSegs.push(bend);
      walked += c4;
    });
    return parts;
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
