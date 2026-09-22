import { Boxes, place } from '../engine/boxes';
import { MountingEdge } from '../engine/edges';
import { fingerJointGroup, fingerJointParams, floorThickness, materialWithFloorGroup, outsideParam } from './common';
import { bool, finishModel, num, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  let x = num(v, 'x');
  let y = num(v, 'y');
  let h = num(v, 'h');
  const tf = floorThickness(v);
  const bottom = b.getEdge(b.floorEdge('F', tf));
  if (bool(v, 'outside')) {
    x = b.adjustSize(x);
    y = b.adjustSize(y);
    h = b.adjustSize(h, bottom, false);
  }
  const hi = num(v, 'hi') || h / 2;
  if (hi >= h) throw new Error('The front must be lower than the back');

  const mount = str(v, 'top_edge') === 'G';
  if (mount) b.addEdge(new MountingEdge(b, { num: num(v, 'mount_num'), margin: 0, d_shaft: num(v, 'mount_shaft'), d_head: num(v, 'mount_head') }));

  // box space: X = width, Y = 0 at the low front .. y at the tall back, floor top at z = 0.
  // The sides' top runs from the front (hi) up to the back (h) in an S of two quarter circles.
  const F = b.getEdge('F');
  const e = F.startWidth();
  const rise = h - hi;
  const [r, lx, ly] = rise > y ? [y / 2, 0, rise - y] : [rise / 2, (y - rise) / 2, 0];
  const side = () => {
    // part-local (0, 0) is the nominal corner at the back, bottom
    b.moveTo(-e, -bottom.startWidth());
    b.edge(e);
    bottom.draw(y);
    b.edge(e);
    b.corner(90);
    b.edge(bottom.startWidth());
    F.draw(hi);
    b.corner(90);
    b.edge(e);
    b.edge(lx);
    b.corner(-90, r);
    b.edge(ly);
    b.corner(90, r);
    b.edge(lx);
    b.edge(e);
    b.corner(90);
    F.draw(h);
    b.edge(bottom.startWidth());
    b.corner(90);
  };
  b.freePart(side, { label: 'left side', placement: { origin: { x: 0, y, z: 0 }, u: { x: 0, y: -1, z: 0 }, v: { x: 0, y: 0, z: 1 } } });
  b.freePart(side, { label: 'right side', placement: { origin: { x: x + t, y, z: 0 }, u: { x: 0, y: -1, z: 0 }, v: { x: 0, y: 0, z: 1 } } });

  b.rectangularWall(x, h, [bottom, 'f', mount ? 'G' : 'e', 'f'], { label: 'back', placement: place.wallXZ(0, y + t, 0) });
  b.rectangularWall(x, hi, [bottom, 'f', 'e', 'f'], { label: 'front', placement: place.wallXZ(0, 0, 0) });
  b.rectangularWall(x, y, 'ffff', { label: 'bottom', thickness: tf, placement: place.plateXY(0, 0, -tf) });
  return finishModel(b);
}

export const magazineFile: GeneratorDef = {
  id: 'magazinefile',
  name: 'Magazine File',
  category: 'Shelf',
  description: 'Open magazine file: tall at the back, low at the front, with the sides curving between them. Optional holes to hang it on a wall.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'x', label: 'Width (x)', type: 'number', default: 100, unit: 'mm', min: 10, max: 2000, step: 1, help: 'Inner width' },
        { id: 'y', label: 'Depth (y)', type: 'number', default: 200, unit: 'mm', min: 10, max: 2000, step: 1, help: 'Inner depth' },
        { id: 'h', label: 'Height (h)', type: 'number', default: 300, unit: 'mm', min: 10, max: 2000, step: 1, help: 'Inner height at the back' },
        { id: 'hi', label: 'Front height (hi)', type: 'number', default: 0, unit: 'mm', min: 0, max: 2000, step: 1, help: 'Height at the front (0 = half the height)' },
        outsideParam,
      ],
    },
    {
      id: 'mount',
      title: 'Wall mounting',
      params: [
        {
          id: 'top_edge',
          label: 'Back top edge',
          type: 'select',
          default: 'e',
          options: [
            { value: 'e', label: 'Plain' },
            { value: 'G', label: 'With mounting holes' },
          ],
        },
        { id: 'mount_num', label: 'Holes', type: 'number', default: 1, min: 1, max: 10, step: 1, showIf: (v) => v.top_edge === 'G' },
        { id: 'mount_shaft', label: 'Screw shaft', type: 'number', default: 3, unit: 'mm', min: 0.5, max: 20, step: 0.1, showIf: (v) => v.top_edge === 'G' },
        { id: 'mount_head', label: 'Screw head', type: 'number', default: 6.5, unit: 'mm', min: 0, max: 30, step: 0.1, help: '0 for plain round holes', showIf: (v) => v.top_edge === 'G' },
      ],
    },
    materialWithFloorGroup,
    fingerJointGroup,
  ],
  build,
};
