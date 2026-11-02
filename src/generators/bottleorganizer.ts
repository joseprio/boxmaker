import { Boxes, place } from '../engine/boxes';
import { BaseEdge, FingerJointEdge } from '../engine/edges';
import { FingerJointSettings } from '../engine/settings';
import { fingerJointGroup, fingerJointParams, floorThickness, materialWithFloorGroup } from './common';
import { finishModel, num, type BoxModel, type GeneratorDef, type ParamValues } from './types';

/**
 * A straight edge with `n` circular cradles of radius `r` and `depth` dipping
 * into the material, `pitch` apart and centred along the edge.
 */
class CradleEdge extends BaseEdge {
  readonly char = '';
  readonly description = 'Bottle cradles';

  constructor(
    boxes: Boxes,
    private n: number,
    private r: number,
    private depth: number,
    private pitch: number,
  ) {
    super(boxes);
  }

  /** width of one cradle along the edge */
  get chord(): number {
    return 2 * Math.sqrt(this.r * this.r - (this.r - this.depth) ** 2);
  }

  draw(length: number): void {
    const c = this.chord;
    const a = (Math.asin(c / 2 / this.r) * 180) / Math.PI;
    const ridge = this.pitch - c;
    const end = (length - (this.n - 1) * this.pitch - c) / 2;
    this.boxes.edge(end);
    for (let i = 0; i < this.n; i++) {
      if (i) this.boxes.edge(ridge);
      // dip into the material, follow the bottle round and come back up
      this.boxes.corner(a);
      this.boxes.corner(-2 * a, this.r);
      this.boxes.corner(a);
    }
    this.boxes.edge(end);
  }
}

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  const tf = floorThickness(v);

  const n = Math.max(1, Math.round(num(v, 'n')));
  const r = (num(v, 'bottle_diam') + num(v, 'clearance')) / 2;
  const depth = num(v, 'depth');
  const pitch = 2 * r + num(v, 'gap');
  const end = num(v, 'end_margin');
  const h = num(v, 'h');
  const y = num(v, 'y');
  const ribs = Math.max(2, Math.round(num(v, 'ribs')));
  if (depth >= r) throw new Error(`The cradle depth must be less than the bottle radius (${r} mm)`);
  if (h - depth < 2) throw new Error('The cradles cut too deep: raise the height or reduce the cradle depth');

  const cradles = new CradleEdge(b, n, r, depth, pitch);
  // the rib length: all the cradles plus a flat at each end
  const x = (n - 1) * pitch + cradles.chord + 2 * end;

  // walls stand below the floor and hold it in finger holes; inner ribs sit on it
  const endBottom = b.floorEdge('h', tf);
  const fs = new FingerJointSettings(t, fingerJointParams(v));
  fs.thickness = tf;
  const innerBottom = new FingerJointEdge(b, fs);
  // inner rib centres, evenly spread between the front and back ribs
  const inner = Array.from({ length: ribs - 2 }, (_, i) => ((i + 1) * (y + t)) / (ribs - 1) - t / 2);

  // a closed tray: the outer ribs are the long walls, flat end walls close the short sides,
  // all four stand below the floor and hold it in finger holes
  const ignoreWidths = [1, 6];
  b.rectangularWall(x, h, [endBottom, 'F', cradles, 'F'], { label: 'front rib', ignoreWidths, placement: place.wallXZ(0, 0, 0) });
  b.rectangularWall(x, h, [endBottom, 'F', cradles, 'F'], { label: 'back rib', ignoreWidths, placement: place.wallXZ(0, y + t, 0) });
  const ribHoles = () => inner.forEach((yc) => b.fingerHolesAt(yc, 0, h, 90));
  b.rectangularWall(y, h, [endBottom, 'f', 'e', 'f'], { label: 'left end', ignoreWidths, callback: [ribHoles], placement: place.wallYZ(-t, 0, 0) });
  b.rectangularWall(y, h, [endBottom, 'f', 'e', 'f'], { label: 'right end', ignoreWidths, callback: [ribHoles], placement: place.wallYZ(x, 0, 0) });
  // inner ribs sit on the floor and are jointed into both end walls
  inner.forEach((yc, i) =>
    b.rectangularWall(x, h, [innerBottom, 'f', cradles, 'f'], { label: `rib ${i + 1}`, group: 'divider', placement: place.wallXZ(0, yc + t / 2, 0) }),
  );
  b.rectangularWall(x, y, 'ffff', {
    label: 'bottom',
    thickness: tf,
    callback: [() => inner.forEach((yc) => b.fingerHolesAt(0, yc, x, 0))],
    placement: place.plateXY(0, 0, -tf),
  });
  return finishModel(b);
}

export const bottleOrganizer: GeneratorDef = {
  id: 'bottleorganizer',
  name: 'Bottle Organizer',
  category: 'Tray',
  description: 'Low closed tray whose front, back and inner ribs have curved cradles, keeping bottles lying side by side from rolling.',
  groups: [
    {
      id: 'bottles',
      title: 'Bottles',
      params: [
        { id: 'bottle_diam', label: 'Bottle diameter', type: 'number', default: 75, unit: 'mm', min: 5, max: 300, step: 0.5 },
        { id: 'n', label: 'Number of bottles', type: 'number', default: 4, min: 1, max: 30, step: 1 },
        { id: 'clearance', label: 'Clearance', type: 'number', default: 2, unit: 'mm', min: 0, max: 20, step: 0.5, help: 'Added to the bottle diameter for the cradles' },
        { id: 'gap', label: 'Gap', type: 'number', default: 5, unit: 'mm', min: 0, max: 100, step: 0.5, help: 'Room between neighbouring bottles' },
        { id: 'depth', label: 'Cradle depth', type: 'number', default: 15, unit: 'mm', min: 1, max: 150, step: 0.5, help: 'How far the bottles sink into the cradles' },
      ],
    },
    {
      id: 'dims',
      title: 'Tray',
      params: [
        { id: 'h', label: 'Height', type: 'number', default: 25, unit: 'mm', min: 5, max: 300, step: 0.5, help: 'Rib height at the ridges, above the floor' },
        { id: 'y', label: 'Depth', type: 'number', default: 100, unit: 'mm', min: 10, max: 1000, step: 1, help: 'Inner distance between the front and back ribs, along the bottles' },
        { id: 'ribs', label: 'Ribs', type: 'number', default: 3, min: 2, max: 20, step: 1, help: 'Cradle ribs, including the front and back walls' },
        { id: 'end_margin', label: 'End flat', type: 'number', default: 5, unit: 'mm', min: 0, max: 200, step: 0.5, help: 'Flat at each end of the ribs beyond the outer cradles' },
      ],
    },
    materialWithFloorGroup,
    fingerJointGroup,
  ],
  build,
};
