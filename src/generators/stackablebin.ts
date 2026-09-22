import { Boxes, place } from '../engine/boxes';
import { BaseEdge, FingerJointEdge, FingerJointEdgeCounterPart } from '../engine/edges';
import { FingerJointSettings } from '../engine/settings';
import { fingerJointGroup, fingerJointParams, materialGroup, outsideParam, stackableGroup, stackableParams } from './common';
import { bool, finishModel, num, sections, type BoxModel, type GeneratorDef, type ParamValues } from './types';

/** Front profile of the bin: leans forward, then a 45 degree joint to the retainer plate. */
class StackableBinEdge extends BaseEdge {
  readonly char = 'b';
  readonly description = 'Stackable bin front';

  constructor(
    boxes: Boxes,
    private geo: { h: number; front: number },
  ) {
    super(boxes);
  }

  draw(): void {
    const f = this.geo.front;
    const a1 = (Math.atan(f / (1 - f)) * 180) / Math.PI;
    const a2 = 45 + a1;
    this.boxes.corner(-a1);
    this.boxes.edge(this.geo.h * Math.sqrt(f * f + (1 - f) * (1 - f)));
    this.boxes.corner(a2);
    this.boxes.getEdge('f').draw(this.geo.h * f * Math.SQRT2);
    this.boxes.corner(-45);
  }

  margin(): number {
    return this.geo.h * this.geo.front;
  }
}

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const fj = { ...fingerJointParams(v), surroundingspaces: num(v, 'fj_surroundingspaces') };
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fj, stackable: stackableParams(v) });
  let sx = sections(v, 'sx');
  let h = num(v, 'h');
  let d = num(v, 'd');
  const front = Math.min(num(v, 'front'), 0.999);

  const geo = { h, front };
  b.addEdge(new StackableBinEdge(b, geo), 'b');
  const angled = new FingerJointSettings(t, fj);
  angled.angle = 45;
  b.addEdge(new FingerJointEdge(b, angled), 'g');
  b.addEdge(new FingerJointEdgeCounterPart(b, angled), 'G');

  if (bool(v, 'outside')) {
    sx = b.adjustSizes(sx);
    h = b.adjustSize(h, 's', 'S');
    geo.h = h;
    d = b.adjustSize(d, 'h', 'b');
  }
  const x = sx.reduce((a, c) => a + c, 0) + t * (sx.length - 1);

  const wallCB = (l: number) => () => {
    let posx = -0.5 * t;
    for (const s of sx.slice(0, -1)) {
      posx += s + t;
      b.fingerHolesAt(posx, 0, l, 90);
    }
  };

  // bottom: local y runs from the back (Y = d) to the front (Y = 0)
  b.rectangularWall(x, d, 'ffGf', {
    label: 'bottom',
    callback: [wallCB(d)],
    placement: { origin: { x: 0, y: d, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: -1, z: 0 } },
  });
  b.rectangularWall(x, h, 'sfSf', { label: 'back', callback: [wallCB(h)], placement: place.wallXZ(0, d + t, 0) });
  const rh = h * front * Math.SQRT2;
  b.rectangularWall(x, rh, 'gFeF', {
    label: 'retainer',
    callback: [wallCB(rh)],
    placement: { origin: { x: 0, y: 0, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 } },
  });

  b.rectangularWall(d, h, 'shSb', { label: 'left', placement: place.wallYZ(-t, 0, 0) });
  b.rectangularWall(d, h, 'shSb', { label: 'right', placement: place.wallYZ(x, 0, 0) });
  let posx = -0.5 * t;
  sx.slice(0, -1).forEach((s, i) => {
    posx += s + t;
    b.rectangularWall(d, h, 'ffSb', { label: `divider ${i + 1}`, group: 'divider', placement: place.wallYZ(posx - 0.5 * t, 0, 0) });
  });
  return finishModel(b);
}

export const stackableBin: GeneratorDef = {
  id: 'stackablebin',
  name: 'Stackable Bin',
  category: 'Shelf',
  description: 'Open bin with a slanted front that stacks on top of its siblings. Optional dividers split it into compartments.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'sx', label: 'Sections x', type: 'sections', default: [70], help: 'Compartment widths, e.g. 70:70' },
        { id: 'h', label: 'Height (h)', type: 'number', default: 50, unit: 'mm', min: 10, max: 1000, step: 1 },
        { id: 'd', label: 'Depth (d)', type: 'number', default: 100, unit: 'mm', min: 10, max: 1000, step: 1 },
        { id: 'front', label: 'Front slope', type: 'number', default: 0.4, min: 0, max: 0.95, step: 0.05, help: 'Fraction of the bin height covered by the slope' },
        outsideParam,
      ],
    },
    materialGroup,
    { ...fingerJointGroup, params: fingerJointGroup.params.map((p) => (p.id === 'fj_surroundingspaces' ? { ...p, default: 0.5 } : p)) },
    stackableGroup,
  ],
  build,
};
