import type { Vec2, Vec3 } from './geometry';

/**
 * Where a flat part sits in 3D box space (Z up).
 * Local (0,0) of the part maps to `origin`; the local x axis maps to `u` and
 * the local y axis to `v`. The material is extruded by the thickness along
 * u × v.
 */
export interface Placement {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
}

export interface Part {
  label: string;
  /** Counter-clockwise outer contour in part-local mm. */
  outline: Vec2[];
  /** Inner contours (holes). */
  holes: Vec2[][];
  /** Open polylines (etchings, labels...) - exported to SVG only. */
  openPaths: Vec2[][];
  thickness: number;
  placement?: Placement;
  /** Logical group for the viewer (e.g. "box", "lid", "divider"). */
  group: string;
}
