import { Boxes, type EdgeSpec } from '../engine/boxes';
import { BaseEdge, SlottedEdge } from '../engine/edges';
import type { Placement } from '../engine/part';
import { fingerJointGroup, fingerJointParams, materialGroup, outsideParam } from './common';
import { bool, finishModel, num, sections, type BoxModel, type GeneratorDef, type ParamValues } from './types';

/**
 * Front profile of the side walls ('b') and inner dividers ('B'): per row a
 * forward lean, then a 45 degree finger joint for the retainer. Drawn from the
 * top row down; 'B' has slots for the shelves between the rows.
 */
class BinFrontEdge extends BaseEdge {
  readonly description = 'Bin tray front';

  constructor(
    boxes: Boxes,
    readonly char: 'b' | 'B',
    private geo: { sh: number[]; front: number; y: number },
  ) {
    super(boxes);
  }

  draw(): void {
    const b = this.boxes;
    const { sh, front: f, y } = this.geo;
    const t = b.thickness;
    const a1 = (Math.atan(f / (1 - f)) * 180) / Math.PI;
    const a2 = 45 + a1;
    b.corner(-a1);
    sh.forEach((l, i) => {
      b.edge(l * Math.sqrt(f * f + (1 - f) * (1 - f)));
      b.corner(a2);
      b.getEdge('f').draw(l * f * Math.SQRT2);
      if (i < sh.length - 1) {
        if (this.char === 'B') b.polyline(0, 45, 0.5 * y, -90, t, -90, 0.5 * y, 90 - a1);
        else b.polyline(0, -45, t, -a1);
      } else {
        b.corner(-45);
      }
    });
  }

  margin(): number {
    return Math.max(...this.geo.sh) * this.geo.front;
  }
}

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const fj = { ...fingerJointParams(v), surroundingspaces: num(v, 'fj_surroundingspaces') };
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fj });
  let sx = sections(v, 'sx');
  // rows are listed from the top down
  let sh = sections(v, 'sh');
  let y = num(v, 'y');
  const front = Math.min(num(v, 'front'), 0.999);

  if (bool(v, 'outside')) {
    sx = b.adjustSizes(sx);
    sh = b.adjustSizes(sh);
    y = b.adjustSize(y, true, false);
  }
  const x = sx.reduce((a, c) => a + c, 0) + t * (sx.length - 1);
  const h = sh.reduce((a, c) => a + c, 0) + t * (sh.length - 1);

  const geo = { sh, front, y };
  b.addEdge(new BinFrontEdge(b, 'B', geo), 'B');
  b.addEdge(new BinFrontEdge(b, 'b', geo), 'b');
  b.addAngledFingerJoints(45);

  // callbacks ---------------------------------------------------------
  const xHoles = () => {
    let posx = -0.5 * t;
    for (const s of sx.slice(0, -1)) {
      posx += s + t;
      b.fingerHolesAt(posx, 0, y);
    }
  };
  const hHoles = () => {
    let posh = -0.5 * t;
    for (const s of [...sh.slice(1)].reverse()) {
      posh += s + t;
      b.fingerHolesAt(posh, 0, y);
    }
  };
  const xSlots = () => {
    let posx = -0.5 * t;
    for (const s of sx.slice(0, -1)) {
      posx += s + t;
      let posh = 0;
      for (const hh of sh) {
        b.fingerHolesAt(posx, posh, hh);
        posh += hh + t;
      }
    }
  };
  const hSlots = () => {
    let posh = -0.5 * t;
    for (const s of sh.slice(0, -1)) {
      posh += s + t;
      let posx = 0;
      for (const xx of [...sx].reverse()) {
        b.fingerHolesAt(posh, posx, xx);
        posx += xx + t;
      }
    }
  };
  const dShaft = num(v, 'hole_shaft');
  const dHead = num(v, 'hole_head');
  const addMount = () => {
    const off = dHead ? Math.max(1.25 * t, t + dHead / 2) : Math.max(1.25 * t, t + dShaft);
    b.mountingHole(x * 0.125, off, dShaft, dHead, -90);
    b.mountingHole(x * 0.875, off, dShaft, dHead, -90);
  };

  // box space: X = width, Y = 0 at the front opening .. y at the back plate, Z up.
  // Row i (from the top) has its shelf top surface at zb(i).
  const zb = (i: number) => sh.slice(i + 1).reduce((a, c) => a + c + t, 0);
  const shelf = (z: number): Placement => ({ origin: { x: 0, y, z }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: -1, z: 0 } });
  const side = (x0: number): Placement => ({ origin: { x: x0, y, z: 0 }, u: { x: 0, y: 0, z: 1 }, v: { x: 0, y: -1, z: 0 } });

  // outer walls -------------------------------------------------------
  b.rectangularWall(x, y, ['F', 'f', new SlottedEdge(b, [...sx].reverse(), 'G'), 'f'], { label: 'bottom', callback: [xHoles], placement: shelf(0) });
  b.rectangularWall(h, y, 'FFbF', { label: 'left', callback: [hHoles], placement: side(-t) });
  b.rectangularWall(h, y, 'FFbF', { label: 'right', callback: [hHoles], placement: side(x) });
  b.rectangularWall(x, y, 'Ffef', { label: 'top', callback: [xHoles], placement: shelf(h + t) });
  // the back plate hangs on the wall; its local y runs from the top row down
  b.rectangularWall(x, h, 'ffff', {
    label: 'back',
    callback: [xSlots, hSlots, addMount],
    placement: { origin: { x: 0, y, z: h }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: -1 } },
  });

  // inner walls -------------------------------------------------------
  let posx = -0.5 * t;
  sx.slice(0, -1).forEach((s, i) => {
    posx += s + t;
    // bottom rows first along local x, matching the 'B' front edge drawn from the top row
    const e: EdgeSpec[] = [new SlottedEdge(b, [...sh].reverse(), 'f'), 'f', 'B', 'f'];
    b.rectangularWall(h, y, e, { label: `inner vertical ${i + 1}`, group: 'divider', placement: side(posx - 0.5 * t) });
  });
  sh.slice(0, -1).forEach((_, i) => {
    const e: EdgeSpec[] = [new SlottedEdge(b, sx, 'f', 0.5 * y), 'f', new SlottedEdge(b, [...sx].reverse(), 'G'), 'f'];
    b.rectangularWall(x, y, e, { label: `inner horizontal ${i + 1}`, group: 'divider', placement: shelf(zb(i)) });
  });

  // retainers: lean forward at 45 degrees from the shelf below each row
  const lean = { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 };
  sh.forEach((s, i) => {
    const rh = s * front * Math.SQRT2;
    const holes = () => {
      let px = -0.5 * t;
      for (const xx of sx.slice(0, -1)) {
        px += xx + t;
        b.fingerHolesAt(px, 0, rh);
      }
    };
    b.rectangularWall(x, rh, [new SlottedEdge(b, sx, 'g'), 'F', 'e', 'F'], {
      label: `retainer ${i + 1}`,
      callback: [holes],
      placement: { origin: { x: 0, y: 0, z: zb(i) }, u: { x: 1, y: 0, z: 0 }, v: lean },
    });
  });
  return finishModel(b);
}

export const binTray: GeneratorDef = {
  id: 'bintray',
  name: 'Bin Tray',
  category: 'Shelf',
  description: 'Wall-mounted type tray standing upright: a grid of bins, each with a sloped retainer in front. Hangs on two screws.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'sx', label: 'Columns (sx)', type: 'sections', default: [50, 50, 50], help: 'Column widths, e.g. 50:50:30 or 3*40' },
        { id: 'sh', label: 'Rows (sh)', type: 'sections', default: [50, 50, 50], help: 'Row heights, from the top down' },
        { id: 'y', label: 'Depth (y)', type: 'number', default: 100, unit: 'mm', min: 10, max: 1000, step: 1 },
        { id: 'front', label: 'Front slope', type: 'number', default: 0.4, min: 0.05, max: 0.95, step: 0.05, help: 'Fraction of each row covered by the sloped retainer' },
        outsideParam,
      ],
    },
    {
      id: 'mount',
      title: 'Mounting holes',
      params: [
        { id: 'hole_shaft', label: 'Screw shaft', type: 'number', default: 3.5, unit: 'mm', min: 0, max: 20, step: 0.1, help: 'Shaft diameter (0 for no mounting holes)' },
        { id: 'hole_head', label: 'Screw head', type: 'number', default: 6.5, unit: 'mm', min: 0, max: 30, step: 0.1, help: 'Head diameter for a keyhole (0 for a plain round hole)' },
      ],
    },
    materialGroup,
    { ...fingerJointGroup, params: fingerJointGroup.params.map((p) => (p.id === 'fj_surroundingspaces' ? { ...p, default: 0.5 } : p)) },
  ],
  build,
};
