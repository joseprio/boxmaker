import { Boxes, place } from '../engine/boxes';
import { fingerJointGroup, fingerJointParams, materialGroup } from './common';
import { bool, finishModel, num, type BoxModel, type GeneratorDef, type ParamValues } from './types';

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  const x = num(v, 'x');
  const y = num(v, 'y');
  const n = Math.max(1, Math.round(num(v, 'n')));
  const gap = num(v, 'spacing');
  const bottom = num(v, 'bottom');
  const top = num(v, 'top');
  const back = bool(v, 'back');
  if (bottom < t) throw new Error(`The bottom gap must be at least the material thickness (${t} mm)`);
  if (top < t) throw new Error(`The sides must rise at least the material thickness (${t} mm) above the top shelf`);

  // underside of each shelf, from the floor
  const shelfZ = Array.from({ length: n }, (_, i) => bottom + i * (gap + t));
  const topShelf = shelfZ[n - 1];
  const hs = topShelf + t + top; // side height
  const ys = y + (back ? t : 0); // side depth: the back sits behind the shelves
  const r = Math.min(num(v, 'radius'), top, ys);

  // the back: between the sides, from a little below the top shelf up to their top
  const backZ = Math.max(0, topShelf - 2 * t);
  const backH = hs - backZ;

  const sideDetails = () => {
    for (const z of shelfZ) b.fingerHolesAt(0, z + t / 2, y, 0);
    if (back) b.fingerHolesAt(y + t / 2, backZ, backH, 90);
    if (bool(v, 'windows')) {
      const m = num(v, 'window_margin');
      const wr = num(v, 'window_radius');
      const w = y - 2 * m;
      for (let i = 0; i + 1 < n; i++) {
        const z0 = shelfZ[i] + t + m;
        const wh = shelfZ[i + 1] - m - z0;
        if (w > 0 && wh > 0) b.rectangularHole(m, z0, w, wh, wr, false, false);
      }
    }
  };
  // local x runs from the front to the back, y up; the top front corner is rounded
  const side = (label: string, placement: ReturnType<typeof place.wallYZ>) =>
    b.freePart(
      () => {
        sideDetails();
        b.polyline(ys, 90, hs, 90, ys - r, [90, r], hs - r, 90);
      },
      { label, placement },
    );
  side('left', place.wallYZ(-t, 0, 0));
  side('right', place.wallYZ(x, 0, 0));

  shelfZ.forEach((z, i) => {
    const last = i === n - 1;
    b.rectangularWall(x, y, ['e', 'f', back && last ? 'f' : 'e', 'f'], { label: `shelf ${i + 1}`, placement: place.plateXY(0, 0, z) });
  });
  if (back) {
    b.rectangularWall(x, backH, 'efef', {
      label: 'back',
      callback: [() => b.fingerHolesAt(0, topShelf + t / 2 - backZ, x, 0)],
      placement: place.wallXZ(0, y + t, backZ),
    });
  }
  return finishModel(b);
}

const windowsOn = (v: ParamValues) => Boolean(v.windows);

export const shelves: GeneratorDef = {
  id: 'shelves',
  name: 'Shelves',
  category: 'Shelf',
  description: 'Standing shelf unit: side panels with a rounded top and optional windows, finger-jointed shelves and a back rising above the top shelf.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'x', label: 'Width', type: 'number', default: 250, unit: 'mm', min: 20, max: 2000, step: 1, help: 'Inner width between the sides' },
        { id: 'y', label: 'Depth', type: 'number', default: 150, unit: 'mm', min: 20, max: 1000, step: 1, help: 'Depth of the shelves' },
        { id: 'n', label: 'Shelves', type: 'number', default: 3, min: 1, max: 20, step: 1 },
        { id: 'spacing', label: 'Shelf spacing', type: 'number', default: 120, unit: 'mm', min: 10, max: 1000, step: 1, help: 'Clear height between neighbouring shelves' },
        { id: 'bottom', label: 'Bottom gap', type: 'number', default: 15, unit: 'mm', min: 1, max: 500, step: 1, help: 'From the floor to the underside of the lowest shelf' },
        { id: 'top', label: 'Top rise', type: 'number', default: 50, unit: 'mm', min: 1, max: 500, step: 1, help: 'How far the sides (and the back) rise above the top shelf' },
        { id: 'radius', label: 'Corner radius', type: 'number', default: 50, unit: 'mm', min: 0, max: 500, step: 1, help: 'Rounding of the sides\' top front corner (at most the top rise)' },
        { id: 'back', label: 'Back', type: 'boolean', default: true, help: 'A back panel behind the top shelf, rising to the top of the sides' },
      ],
    },
    {
      id: 'windows',
      title: 'Side windows',
      params: [
        { id: 'windows', label: 'Windows', type: 'boolean', default: true, help: 'Rounded openings in the sides between the shelves' },
        { id: 'window_margin', label: 'Margin', type: 'number', default: 15, unit: 'mm', min: 3, max: 200, step: 0.5, help: 'Material left round each window', showIf: windowsOn },
        { id: 'window_radius', label: 'Radius', type: 'number', default: 15, unit: 'mm', min: 0, max: 200, step: 0.5, help: 'Corner radius of the windows', showIf: windowsOn },
      ],
    },
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
