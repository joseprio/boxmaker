import { deg2rad, nearlyEqual, type Vec2 } from './geometry';

interface TurtleState {
  x: number;
  y: number;
  /** heading in radians */
  a: number;
}

/**
 * Turtle-graphics drawing context mirroring the subset of cairo semantics that
 * boxes.py relies on: a movable/rotatable coordinate frame, `edge` (line_to)
 * and `corner` (arc). Every segment is recorded as a polyline; segments that
 * begin where a previous polyline ended are joined onto it.
 */
export class Turtle {
  private state: TurtleState = { x: 0, y: 0, a: 0 };
  private stack: TurtleState[] = [];
  /** All polylines drawn since the last `reset()`. */
  paths: Vec2[][] = [];
  /** Standalone cut lines (never joined with the contours). */
  cuts: Vec2[][] = [];
  /** Arc flattening: max angle per segment in degrees. */
  arcStep = 7.5;

  reset(): void {
    this.state = { x: 0, y: 0, a: 0 };
    this.stack = [];
    this.paths = [];
    this.cuts = [];
  }

  /** Move the frame back to the part origin (keeps the drawn paths and the saved stack). */
  resetFrame(): void {
    this.state = { x: 0, y: 0, a: 0 };
  }

  /** Add a standalone cut line between two points of the local frame. */
  cutLine(x1: number, y1: number, x2: number, y2: number): void {
    this.cuts.push([this.local(x1, y1), this.local(x2, y2)]);
  }

  get position(): Vec2 {
    return { x: this.state.x, y: this.state.y };
  }

  get heading(): number {
    return this.state.a;
  }

  save(): void {
    this.stack.push({ ...this.state });
  }

  restore(): void {
    const s = this.stack.pop();
    if (s) this.state = s;
  }

  /** Run `fn` with the current frame saved and restored afterwards. */
  saved<T>(fn: () => T): T {
    this.save();
    try {
      return fn();
    } finally {
      this.restore();
    }
  }

  /** Translate the frame by (x, y) in local coordinates and rotate by `degrees`. */
  moveTo(x: number, y = 0, degrees = 0): void {
    const c = Math.cos(this.state.a);
    const s = Math.sin(this.state.a);
    this.state.x += c * x - s * y;
    this.state.y += s * x + c * y;
    this.state.a += deg2rad(degrees);
  }

  /** Convert a local point to part coordinates. */
  local(x: number, y: number): Vec2 {
    const c = Math.cos(this.state.a);
    const s = Math.sin(this.state.a);
    return { x: this.state.x + c * x - s * y, y: this.state.y + s * x + c * y };
  }

  private appendSegment(from: Vec2, pts: Vec2[]): void {
    // Find the most recent path that ends at `from` and extend it.
    for (let i = this.paths.length - 1; i >= 0; i--) {
      const p = this.paths[i];
      if (nearlyEqual(p[p.length - 1], from, 1e-5)) {
        p.push(...pts);
        return;
      }
    }
    this.paths.push([from, ...pts]);
  }

  /** Draw a straight line of `length` along the current heading. */
  edge(length: number): void {
    if (Math.abs(length) < 1e-9) return;
    const from = this.position;
    this.moveTo(length, 0, 0);
    this.appendSegment(from, [this.position]);
  }

  /**
   * Turn by `degrees` (positive = left / counter-clockwise), optionally along an
   * arc of `radius`.
   */
  corner(degrees: number, radius = 0): void {
    if (radius <= 0 || Math.abs(degrees) < 1e-9) {
      this.state.a += deg2rad(degrees);
      return;
    }
    const from = this.position;
    const steps = Math.max(1, Math.ceil(Math.abs(degrees) / this.arcStep));
    const total = deg2rad(degrees);
    const side = degrees > 0 ? 1 : -1;
    // arc center lies perpendicular to the heading
    const cx = this.state.x - Math.sin(this.state.a) * radius * side;
    const cy = this.state.y + Math.cos(this.state.a) * radius * side;
    const startAngle = Math.atan2(from.y - cy, from.x - cx);
    const pts: Vec2[] = [];
    for (let i = 1; i <= steps; i++) {
      const ang = startAngle + (total * i) / steps;
      pts.push({ x: cx + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius });
    }
    const end = pts[pts.length - 1];
    this.state.x = end.x;
    this.state.y = end.y;
    this.state.a += total;
    this.appendSegment(from, pts);
  }

  /**
   * Alternating lengths and angles, like boxes.py's polyline. An angle may be
   * given as `[degrees, radius]`.
   */
  polyline(...args: Array<number | [number, number]>): void {
    args.forEach((arg, i) => {
      if (i % 2) {
        if (Array.isArray(arg)) this.corner(arg[0], arg[1]);
        else this.corner(arg as number);
      } else {
        this.edge(arg as number);
      }
    });
  }
}
