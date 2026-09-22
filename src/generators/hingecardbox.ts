import { Boxes, CompoundEdge, place, type EdgeSpec, type EngraveStyle } from '../engine/boxes';
import { rotatePlacement, type Placement } from '../engine/part';
import { maxOutlineWidth, textWidth } from '../engine/text';
import { CardGripEdge } from './cardbox';
import { fingerJointGroup, fingerJointParams, materialGroup, outsideParam } from './common';
import { addCabinetHingeEyes, addCabinetHinges, cabinetHingeGroup, cabinetHingeSettings } from './hingebox';
import { lidOpenParam } from './integratedhingebox';
import { bool, finishModel, num, sections, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';

const X = { x: 1, y: 0, z: 0 };
const Z = { x: 0, y: 0, z: 1 };
const neg = (p: { x: number; y: number; z: number }) => ({ x: -p.x, y: -p.y, z: -p.z });

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  let sx = sections(v, 'sx');
  let y = num(v, 'y');
  let h = num(v, 'h');
  const hl = num(v, 'lidheight');
  const gap = num(v, 'lid_gap');
  if (bool(v, 'outside')) {
    sx = b.adjustSizes(sx);
    y = b.adjustSize(y);
    h = b.adjustSize(h);
  }
  const x = sx.reduce((a, c) => a + c, 0) + t * (sx.length - 1);

  const hs = cabinetHingeSettings(t, v);
  addCabinetHinges(b, hs);

  const fh = str(v, 'fingerhole');
  const notch = fh === 'none' ? 0 : fh === 'custom' ? num(v, 'fingerhole_depth') : fh === 'deep' ? h - t - 10 : Math.min(h / 4, 35);
  if (notch) {
    if (y < 25 || notch > h - t) throw new Error('Box too small for the finger notches');
    b.addEdge(new CardGripEdge(b, Math.max(notch, 10)));
  }
  const top = notch ? 'A' : 'e';

  // box space: compartments along X in [0, x] (compartment i starts at starts[i]),
  // Y = 0 at the front .. y at the back, floor top at z = 0
  const starts: number[] = [];
  {
    let s = 0;
    for (const w of sx) {
      starts.push(s);
      s += w + t;
    }
  }
  const centres = starts.slice(1).map((s) => s - t / 2);
  const holes = (l: number) => () => centres.forEach((c) => b.fingerHolesAt(c, 0, l, 90));

  // Between neighbours a lid reaches the middle of the divider, less the gap; the
  // outer lids' sides sit right on the box's side walls, flush with the box.
  const lids = sx.map((w, i) => {
    const a = i === 0 ? 0 : starts[i] + t / 2 + gap; // inner face of the lid's left side
    const e = i === sx.length - 1 ? x : starts[i] + w - t / 2 - gap; // inner face of its right side
    if (e - a < hs.width()) throw new Error(`Compartment ${i + 1} is too narrow for a hinge`);
    return { a, e, w: e - a };
  });

  // back wall: a hinge edge under each lid, drawn from X = x towards 0
  const types: EdgeSpec[] = [];
  const lengths: number[] = [];
  let cur = x;
  for (const lid of [...lids].reverse()) {
    types.push('e', 'u');
    lengths.push(cur - lid.e, lid.w);
    cur = lid.a;
  }
  types.push('e');
  lengths.push(cur);

  // engraved numbers ------------------------------------------------------------
  const numTop = bool(v, 'num_top');
  const numFront = str(v, 'num_front');
  const style = str(v, 'num_style') as EngraveStyle;
  const label = (i: number) => String(Math.round(num(v, 'num_start')) + i);
  /** Engrave compartment i's number centred at (cx, cy), shrunk to fit a w x hh face. */
  const number = (i: number, cx: number, cy: number, w: number, hh: number) => {
    const text = label(i);
    let size = Math.min(num(v, 'num_height'), 0.7 * hh);
    size = Math.min(size, (0.8 * w * size) / textWidth(text, size));
    if (size < 2) return;
    const lw = Math.min(num(v, 'num_line'), maxOutlineWidth(size));
    b.engraveText(text, cx, cy, size, style, lw);
  };

  // box ---------------------------------------------------------------------
  b.rectangularWall(x, y, 'ffff', { label: 'bottom', callback: [holes(y)], placement: place.plateXY(0, 0, -t) });
  const frontNumbers = () => {
    holes(h)();
    if (numFront === 'box') sx.forEach((w, i) => number(i, starts[i] + w / 2, h / 2, w, h));
  };
  b.rectangularWall(x, h, 'FFeF', { label: 'front', callback: [frontNumbers], placement: place.wallXZ(0, 0, 0) });
  b.rectangularWall(x, h, ['F', 'F', new CompoundEdge(b, types, lengths), 'F'], { label: 'back', callback: [holes(h)], placement: place.wallXZ(0, y + t, 0) });
  b.rectangularWall(y, h, ['F', 'f', top, 'f'], { label: 'left side', placement: place.wallYZ(-t, 0, 0) });
  b.rectangularWall(y, h, ['F', 'f', top, 'f'], { label: 'right side', placement: place.wallYZ(x, 0, 0) });
  centres.forEach((c, i) => b.rectangularWall(y, h, ['f', 'f', top, 'f'], { label: `divider ${i + 1}`, group: 'divider', placement: place.wallYZ(c - t / 2, 0, 0) }));

  // lids, each on its own cabinet hinge ---------------------------------------
  const open = num(v, 'lid_open');
  const which = Math.round(num(v, 'open_lid'));
  lids.forEach((lid, i) => {
    const angle = which === 0 || which === i + 1 ? open : 0;
    const turn = (p: Placement) => rotatePlacement(p, { x: 0, y: y + t, z: h }, X, -angle);
    const g = 'lid';
    const n = `lid ${i + 1}`;
    b.rectangularWall(lid.w, hl, 'UFFF', { label: `${n} back`, group: g, placement: turn({ origin: { x: lid.e, y, z: h }, u: neg(X), v: Z }) });
    b.rectangularWall(y, hl, 'efFf', { label: `${n} left`, group: g, placement: turn(place.wallYZ(lid.a - t, 0, h)) });
    b.rectangularWall(y, hl, 'efFf', { label: `${n} right`, group: g, placement: turn(place.wallYZ(lid.e, 0, h)) });
    b.rectangularWall(lid.w, hl, 'eFFF', {
      label: `${n} front`,
      group: g,
      callback: numFront === 'lid' ? [() => number(i, lid.w / 2, hl / 2, lid.w, hl)] : undefined,
      placement: turn(place.wallXZ(lid.a, 0, h)),
    });
    b.rectangularWall(lid.w, y, 'ffff', {
      label: `${n} top`,
      group: g,
      callback: numTop ? [() => number(i, lid.w / 2, y / 2, lid.w, y)] : undefined,
      placement: turn(place.plateXY(lid.a, 0, h + hl)),
    });
    addCabinetHingeEyes(b, hs, { edgeStartX: lid.e, length: lid.w, axisY: y + t, z: h, inward: 1, turn, label: `${n} hinge` });
  });
  for (const p of b.parts) if (p.openPaths.length) p.engraveFace = 'outer';
  return finishModel(b);
}

export const hingeCardBox: GeneratorDef = {
  id: 'hingecardbox',
  name: 'Hinge Card Box',
  category: 'Box',
  description:
    'Card box with one compartment per deck, each with its own lid on a cabinet hinge (laser-cut eyes on a metal pin), so every deck opens on its own.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'sx', label: 'Stacks (sx)', type: 'sections', default: [65, 65, 65, 65], help: 'Width of each card compartment, e.g. 4*65' },
        { id: 'y', label: 'Depth (y)', type: 'number', default: 68, unit: 'mm', min: 25, max: 1000, step: 1, help: 'Depth of the stacks' },
        { id: 'h', label: 'Height (h)', type: 'number', default: 92, unit: 'mm', min: 20, max: 1000, step: 1, help: 'Inner height of the box' },
        { id: 'lidheight', label: 'Lid height', type: 'number', default: 15, unit: 'mm', min: 5, max: 500, step: 1 },
        outsideParam,
      ],
    },
    {
      id: 'lids',
      title: 'Lids & grip',
      params: [
        { id: 'lid_gap', label: 'Gap between lids', type: 'number', default: 0.5, unit: 'mm', min: 0, max: 5, step: 0.1, help: 'Clearance on each side of a lid so neighbours open freely' },
        {
          id: 'fingerhole',
          label: 'Finger notch',
          type: 'select',
          default: 'regular',
          options: [
            { value: 'none', label: 'None' },
            { value: 'regular', label: 'Regular (quarter height, max 35 mm)' },
            { value: 'deep', label: 'Deep (almost to the floor)' },
            { value: 'custom', label: 'Custom depth' },
          ],
          help: 'Notches in the dividers and sides to grab the cards',
        },
        { id: 'fingerhole_depth', label: 'Notch depth', type: 'number', default: 20, unit: 'mm', min: 10, max: 500, step: 1, showIf: (v) => v.fingerhole === 'custom' },
        lidOpenParam,
        { id: 'open_lid', label: 'Preview: which lid', type: 'number', default: 0, min: 0, max: 20, step: 1, help: '0 opens them all' },
      ],
    },
    {
      id: 'numbers',
      title: 'Engraved numbers',
      params: [
        { id: 'num_top', label: 'On the lid tops', type: 'boolean', default: false },
        {
          id: 'num_front',
          label: 'On the front',
          type: 'select',
          default: 'none',
          options: [
            { value: 'none', label: 'None' },
            { value: 'box', label: 'Box front, under each lid' },
            { value: 'lid', label: 'Front of each lid' },
          ],
        },
        {
          id: 'num_style',
          label: 'Style',
          type: 'select',
          default: 'stroke',
          options: [
            { value: 'stroke', label: 'Single line (vector engrave or score)' },
            { value: 'outline', label: 'Outlined (fill engrave)' },
          ],
          showIf: (v) => Boolean(v.num_top) || v.num_front !== 'none',
        },
        { id: 'num_height', label: 'Height', type: 'number', default: 15, unit: 'mm', min: 3, max: 200, step: 1, help: 'Shrunk to fit smaller faces', showIf: (v) => Boolean(v.num_top) || v.num_front !== 'none' },
        { id: 'num_line', label: 'Line width', type: 'number', default: 1.5, unit: 'mm', min: 0.2, max: 20, step: 0.1, help: 'Stroke width of outlined digits (capped to keep them legible)', showIf: (v) => (Boolean(v.num_top) || v.num_front !== 'none') && v.num_style === 'outline' },
        { id: 'num_start', label: 'First number', type: 'number', default: 1, min: 0, max: 9999, step: 1, help: 'For numbering several boxes in a row', showIf: (v) => Boolean(v.num_top) || v.num_front !== 'none' },
      ],
    },
    { ...cabinetHingeGroup, params: cabinetHingeGroup.params.map((p) => (p.id === 'hinge_count' ? { ...p, default: 1 } : p)) },
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
