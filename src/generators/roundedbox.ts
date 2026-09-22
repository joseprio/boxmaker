import { Boxes, place } from '../engine/boxes';
import { fingerJointGroup, fingerJointParams, flexGroup, flexParams, materialGroup, outsideParam } from './common';
import { bool, finishModel, num, sections, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v), flex: flexParams(v) });
  let x = num(v, 'x');
  let y = num(v, 'y');
  let sh = sections(v, 'sh');
  const es = str(v, 'edge_style');
  const top = str(v, 'top');
  const pieces = Math.max(1, Math.min(4, Math.round(num(v, 'wallpieces'))));

  if (bool(v, 'outside')) {
    x = b.adjustSize(x, es, es);
    y = b.adjustSize(y, es, es);
    sh = b.adjustSizes(sh);
  }
  const r = Math.min(num(v, 'radius'), y / 2, x / 2);
  const h = sh.reduce((a, c) => a + c, 0) + t * (sh.length - 1);

  // the walls take the opposite edge to the plates; 'h' plates carry the finger holes
  const pe = es === 'f' ? 'F' : 'f';
  const ec = es === 'h';

  // box space: plates are the nominal x*y rectangle with rounded corners, floor top at z = 0
  b.roundedPlate(x, y, r, es, { label: 'bottom', wallpieces: pieces, extendCorners: ec, placement: place.plateXY(0, 0, -t) });
  let z = 0;
  sh.slice(0, -1).forEach((s, i) => {
    z += s;
    b.roundedPlate(x, y, r, 'f', { label: `shelf ${i + 1}`, group: 'divider', wallpieces: pieces, extendCorners: false, placement: place.plateXY(0, 0, z) });
    z += t;
  });

  const topHole = () => {
    // opening inset from the walls, with matching rounded corners
    const dr = es === 'h' ? t : 2 * t;
    let rr = r;
    if (rr > dr) rr -= dr;
    else {
      b.moveTo(dr - rr, 0);
      rr = 0;
    }
    const lx = x - 2 * rr - 2 * dr;
    const ly = y - 2 * rr - 2 * dr;
    b.moveTo(0, dr);
    for (const l of [lx, ly, lx, ly]) {
      b.edge(l);
      b.corner(90, rr);
    }
  };
  b.roundedPlate(x, y, r, es, {
    label: 'top',
    wallpieces: pieces,
    extendCorners: ec,
    callback: top !== 'closed' ? [topHole] : undefined,
    placement: place.plateXY(0, 0, h),
  });
  if (top === 'lid') {
    const extra = b.getEdge(es).spacing();
    b.roundedPlate(x + 2 * extra, y + 2 * extra, r + extra, 'e', {
      label: 'lid',
      group: 'lid',
      wallpieces: pieces,
      extendCorners: false,
      placement: place.plateXY(-extra, -extra, h + t),
    });
  }

  // finger holes for the shelves, measured from the floor
  const shelfHoles = (l: number) => {
    let hh = 0;
    for (const s of sh.slice(0, -1)) {
      hh += s;
      b.fingerHolesAt(0, hh + 0.5 * t, l, 0);
      hh += t;
    }
  };
  b.surroundingWall(x, y, r, h, {
    bottom: pe,
    top: pe,
    pieces,
    callback: sh.length > 1 ? shelfHoles : undefined,
    placement: { origin: { x: x / 2, y: 0, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 } },
  });
  return finishModel(b);
}

export const roundedBox: GeneratorDef = {
  id: 'roundedbox',
  name: 'Rounded Box',
  category: 'Flex',
  description: 'Box with rounded vertical edges: one flex wall wraps around the rounded floor and top. Optional shelves and a loose lid.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'x', label: 'Width (x)', type: 'number', default: 100, unit: 'mm', min: 10, max: 2000, step: 1, help: 'Inner width' },
        { id: 'y', label: 'Depth (y)', type: 'number', default: 100, unit: 'mm', min: 10, max: 2000, step: 1, help: 'Inner depth' },
        { id: 'sh', label: 'Height (sh)', type: 'sections', default: [100], help: 'Height, or the heights of stacked sections separated by shelves, e.g. 50:50' },
        { id: 'radius', label: 'Corner radius', type: 'number', default: 15, unit: 'mm', min: 1, max: 500, step: 1, help: 'Capped at half the depth' },
        outsideParam,
      ],
    },
    {
      id: 'style',
      title: 'Style',
      params: [
        {
          id: 'top',
          label: 'Top',
          type: 'select',
          default: 'hole',
          options: [
            { value: 'hole', label: 'Rim with an opening' },
            { value: 'lid', label: 'Rim with a loose lid' },
            { value: 'closed', label: 'Closed' },
          ],
        },
        {
          id: 'edge_style',
          label: 'Plate edges',
          type: 'select',
          default: 'f',
          options: [
            { value: 'f', label: 'Finger joints, plates inside the wall' },
            { value: 'F', label: 'Finger joints, plates cover the wall' },
            { value: 'h', label: 'Finger holes, wall stands on the plates' },
          ],
          help: 'How the top and bottom meet the wall',
        },
        { id: 'wallpieces', label: 'Wall pieces', type: 'number', default: 1, min: 1, max: 4, step: 1, help: 'Split the wall into pieces joined with dove tails, to fit smaller sheets' },
      ],
    },
    flexGroup,
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
