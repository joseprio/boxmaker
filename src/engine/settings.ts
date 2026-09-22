/**
 * Settings objects mirror boxes.py: "relative" values are given in multiples
 * of the material thickness and resolved to millimetres here.
 */

export type FingerStyle = 'rectangular';

export interface FingerJointParams {
  style: FingerStyle;
  /** space at the start and end in multiples of normal spaces */
  surroundingspaces: number;
  /** space between fingers (multiples of thickness) */
  space: number;
  /** width of the fingers (multiples of thickness) */
  finger: number;
  /** width of finger holes (multiples of thickness) */
  width: number;
  /** space below holes of FingerHoleEdge (multiples of thickness) */
  edge_width: number;
  /** extra space to allow fingers move in and out (multiples of thickness) */
  play: number;
  /** extra material to grind away burn marks (multiples of thickness) */
  extra_length: number;
}

export const defaultFingerJointParams: FingerJointParams = {
  style: 'rectangular',
  surroundingspaces: 2.0,
  space: 2.0,
  finger: 2.0,
  width: 1.0,
  edge_width: 1.0,
  play: 0.0,
  extra_length: 0.0,
};

export class FingerJointSettings {
  thickness: number;
  style: FingerStyle;
  surroundingspaces: number;
  space: number;
  finger: number;
  width: number;
  edge_width: number;
  play: number;
  extra_length: number;
  /** Angle of the walls meeting */
  angle = 90;

  constructor(thickness: number, params: Partial<FingerJointParams> = {}) {
    const p = { ...defaultFingerJointParams, ...params };
    this.thickness = thickness;
    this.style = p.style;
    this.surroundingspaces = p.surroundingspaces;
    this.space = p.space * thickness;
    this.finger = p.finger * thickness;
    this.width = p.width * thickness;
    this.edge_width = p.edge_width * thickness;
    this.play = p.play * thickness;
    this.extra_length = p.extra_length * thickness;
    if (Math.abs(this.space + this.finger) < 0.1) {
      throw new Error('FingerJointSettings: space + finger must not be close to zero');
    }
  }
}

export interface StackableParams {
  /** inside angle of the feet */
  angle: number;
  /** height of the feet (multiples of thickness) */
  height: number;
  /** width of the feet (multiples of thickness) */
  width: number;
  /** distance from finger holes to bottom edge (multiples of thickness) */
  holedistance: number;
}

export const defaultStackableParams: StackableParams = {
  angle: 60,
  height: 2.0,
  width: 4.0,
  holedistance: 1.0,
};

export class StackableSettings {
  thickness: number;
  angle: number;
  height: number;
  width: number;
  holedistance: number;

  constructor(thickness: number, params: Partial<StackableParams> = {}) {
    const p = { ...defaultStackableParams, ...params };
    this.thickness = thickness;
    this.angle = Math.min(Math.max(p.angle, 20), 260);
    this.height = p.height * thickness;
    this.width = p.width * thickness;
    this.holedistance = p.holedistance * thickness;
  }
}

export type LidStyle = 'none' | 'flat' | 'overthetop' | 'ontop';
export type HandleStyle = 'none' | 'long_rounded' | 'long_trapezoid' | 'long_doublerounded' | 'knob';

export interface LidParams {
  style: LidStyle;
  handle: HandleStyle;
  /** height of the brim in multiples of thickness (if any) */
  height: number;
  /** play when sliding the lid on in multiples of thickness */
  play: number;
  /** height of the handle in multiples of thickness */
  handle_height: number;
}

export const defaultLidParams: LidParams = {
  style: 'none',
  handle: 'none',
  height: 4.0,
  play: 0.1,
  handle_height: 8.0,
};

export class LidSettings {
  thickness: number;
  style: LidStyle;
  handle: HandleStyle;
  height: number;
  play: number;
  handle_height: number;

  constructor(thickness: number, params: Partial<LidParams> = {}) {
    const p = { ...defaultLidParams, ...params };
    this.thickness = thickness;
    this.style = p.style;
    this.handle = p.handle;
    this.height = p.height * thickness;
    this.play = p.play * thickness;
    this.handle_height = p.handle_height * thickness;
  }
}

export interface FlexParams {
  /** hint of how much the flex part should be shortened */
  stretch: number;
  /** width of the pattern perpendicular to the cuts (multiples of thickness) */
  distance: number;
  /** width of the gaps in the cuts (multiples of thickness) */
  connection: number;
  /** width of the pattern in direction of the cuts (multiples of thickness) */
  width: number;
}

export const defaultFlexParams: FlexParams = {
  stretch: 1.05,
  distance: 0.5,
  connection: 1.0,
  width: 5.0,
};

export class FlexSettings {
  stretch: number;
  distance: number;
  connection: number;
  width: number;

  constructor(thickness: number, params: Partial<FlexParams> = {}) {
    const p = { ...defaultFlexParams, ...params };
    this.stretch = p.stretch;
    this.distance = p.distance * thickness;
    this.connection = p.connection * thickness;
    this.width = p.width * thickness;
    if (this.distance < 0.01) throw new Error('Flex: distance must be > 0.01 mm');
    if (this.width < 0.1) throw new Error('Flex: width must be > 0.1 mm');
  }
}

export interface DoveTailParams {
  /** how much the dove tails widen, in degrees */
  angle: number;
  /** from one middle of a dove tail to another (multiples of thickness) */
  size: number;
  /** how far the dove tails stick out (multiples of thickness) */
  depth: number;
  /** corner radius (multiples of thickness) */
  radius: number;
}

export const defaultDoveTailParams: DoveTailParams = {
  angle: 50,
  size: 3,
  depth: 1.5,
  radius: 0.2,
};

export class DoveTailSettings {
  angle: number;
  size: number;
  depth: number;
  radius: number;

  constructor(thickness: number, params: Partial<DoveTailParams> = {}) {
    const p = { ...defaultDoveTailParams, ...params };
    this.angle = Math.max(-80, Math.min(80, p.angle));
    this.size = p.size * thickness;
    this.depth = p.depth * thickness;
    this.radius = p.radius * thickness;
  }
}
