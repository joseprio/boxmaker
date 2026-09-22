import { Boxes, place } from '../engine/boxes';
import { materialGroup } from './common';
import { finishModel, num, type BoxModel, type GeneratorDef, type ParamValues } from './types';

const PITCH = 20; // slot grid, mm
const RADIUS = 8; // board corner radius

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn') });
  const columns = Math.max(1, Math.round(num(v, 'columns')));
  const rows = Math.max(1, Math.round(num(v, 'rows')));
  const w = (columns + 1) * PITCH;
  const h = (rows + 1) * PITCH;

  // slots on a 20 mm grid, staggered: every other position, shifting each row
  const slots: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if ((r + c) % 2 === 0) continue;
      slots.push({ x: (c + 1) * PITCH, y: (r + 1) * PITCH });
    }
  }
  if (slots.length === 0) throw new Error('Needs at least two columns or two rows for any slots');

  // box space: the board stands on the wall in the XZ plane, front face towards -Y
  b.roundedPlate(w, h, RADIUS, 'e', {
    label: 'board',
    extendCorners: false,
    // the callback frame starts at the end of the first corner, RADIUS along the bottom
    callback: [() => slots.forEach((s) => b.rectangularHole(s.x - RADIUS, s.y, 5, 15, 2.5))],
    placement: place.wallXZ(0, 0, 0),
  });

  // washers: spacers between board and wall, in pairs behind the slots nearest the corners
  const n = Math.max(0, Math.round(num(v, 'washers')));
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: 0, y: h },
    { x: w, y: h },
  ];
  const mounts = corners.map((c) => slots.reduce((best, s) => (Math.hypot(s.x - c.x, s.y - c.y) < Math.hypot(best.x - c.x, best.y - c.y) ? s : best)));
  for (let i = 0; i < n; i++) {
    const m = mounts[i % mounts.length];
    const layer = Math.floor(i / mounts.length);
    b.freePart(
      () => {
        // 15 mm disc with a 5 mm hole, centred on the local origin
        b.hole(0, 0, 2.5);
        b.moveTo(7.5, 0, 90);
        b.corner(360, 7.5);
      },
      { label: `washer ${i + 1}`, group: 'extra', placement: place.wallXZ(m.x, (layer + 1) * t, m.y) },
    );
  }
  return finishModel(b);
}

export const skadisBoard: GeneratorDef = {
  id: 'skadis',
  name: 'Skådis Pegboard',
  category: 'Wall',
  description:
    'IKEA Skådis-style pegboard with staggered slots on a 20 mm grid, plus washers to space it off the wall so hooks fit behind. Best cut from 5 mm material to match the original.',
  groups: [
    {
      id: 'dims',
      title: 'Board',
      params: [
        { id: 'columns', label: 'Columns', type: 'number', default: 17, min: 1, max: 200, step: 1, help: 'Hole positions left to right, counting both even and odd rows (width = (columns + 1) x 20 mm)' },
        { id: 'rows', label: 'Rows', type: 'number', default: 27, min: 1, max: 200, step: 1, help: 'Rows of holes top to bottom (height = (rows + 1) x 20 mm)' },
        { id: 'washers', label: 'Washers', type: 'number', default: 8, min: 0, max: 64, step: 1, help: 'Spacers for mounting: 15 mm discs with a 5 mm hole' },
      ],
    },
    { ...materialGroup, params: materialGroup.params.map((p) => (p.id === 'thickness' ? { ...p, default: 5 } : p)) },
  ],
  build,
};
