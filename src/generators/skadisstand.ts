import { Boxes } from '../engine/boxes';
import { fingerJointGroup, fingerJointParams, materialGroup } from './common';
import { finishModel, num, sections, type BoxModel, type GeneratorDef, type ParamValues } from './types';

const rad = (d: number) => (d * Math.PI) / 180;

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  const a = num(v, 'angle');
  const f = num(v, 'foot');
  const ff = num(v, 'foot_front');
  const hB = num(v, 'extra_height_bottom');
  const hT = num(v, 'extra_height_top');
  const feet = Math.max(1, Math.round(num(v, 'feet')));
  if (a <= 0 || a > 90) throw new Error('The angle must be between 0 and 90 degrees');

  // connectors hook into the board's slots; a leg only meets slots of one row parity
  const cons = sections(v, 'connectors').map((c) => Math.max(1, Math.round(c))).sort((p, q) => p - q);
  for (let i = 0; i < cons.length; i++) if (cons[i] % 2 !== cons[0] % 2) cons[i] += 1;
  const r = 0.2 * f;
  const w = Math.max(f / 10, t);
  const h = hB + hT + Math.max(...cons) * 20 + 20;
  const dr = r * Math.tan(rad(90 - a / 2));
  const along = f - t / 2 - dr - w * Math.tan(rad(90 - a)) - w / Math.sin(rad(a));
  // upstream has w * cos(a) here, which leaves the outline open by up to a mm
  // below 90 degrees; w / tan(a) is the leg's width projected on its length
  const up = h - dr - w / Math.sin(rad(a)) - w / Math.tan(rad(a)) - t / 2;
  if (along <= 0 || up <= 0) throw new Error('The foot is too short for this angle and height');

  // the leg's front edge from the floor up: the tabs that go into the board's slots
  const connectorPoly = (): Array<number | [number, number]> => {
    const poly: Array<number | [number, number]> = [hB + 5, 0];
    let pos = 0;
    for (const c of cons) {
      poly.push((c - pos) * 20 - 10, -90, 4.5, 90, 10, 90, 4.5, -90);
      pos = c;
    }
    return poly;
  };
  // outline (lengths and corners, as upstream's polygonWall without corner correction):
  // along the floor to the back, up the foot's end, forward along its top, round into
  // the leg, up the leg, across its top and down its front edge with the connectors
  const border: Array<number | [number, number]> = [
    f - t / 2,
    [90, t / 2],
    w - t,
    [90, t / 2],
    along,
    [-180 + a, r],
    up,
    [90, t / 2],
    w - t,
    [90, t / 2],
    hT + 15 - t / 2,
    ...connectorPoly().reverse(),
    180 - a,
  ];
  const drawLeg = () => {
    border.forEach((el, i) => {
      if (i % 2) {
        if (Array.isArray(el)) b.corner(el[0], el[1]);
        else b.corner(el);
      } else if (i === 0 && ff) {
        // fingers into the front foot plate
        b.getEdge('f').draw(el as number);
      } else {
        b.edge(el as number);
      }
    });
  };

  // box space: the legs stand in YZ planes, the foot running back along +Y from the
  // board's bottom edge at Y = 0; the board leans back at `angle`
  const spacing = num(v, 'preview_spacing');
  const z0 = ff ? t : 0;
  for (let i = 0; i < feet; i++) {
    const x0 = i * spacing;
    b.freePart(drawLeg, { label: feet > 1 ? `leg ${i + 1}` : 'leg', placement: { origin: { x: x0, y: 0, z: z0 }, u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 1 } } });
    if (ff) {
      // front foot: a plate on the floor under the leg, reaching ff in front of the board
      b.roundedPlate(f + ff, 2 * w, w, 'e', {
        label: feet > 1 ? `front foot ${i + 1}` : 'front foot',
        extendCorners: false,
        callback: [() => b.fingerHolesAt(ff - w, w, f - 0.5 * t, 0)],
        placement: { origin: { x: x0 + t / 2 - w, y: -ff, z: t }, u: { x: 0, y: 1, z: 0 }, v: { x: 1, y: 0, z: 0 } },
      });
    }
  }
  return finishModel(b);
}

export const skadisStand: GeneratorDef = {
  id: 'skadisstand',
  name: 'Skådis Stand',
  category: 'Wall',
  description:
    'Feet that let a Skådis pegboard stand on its own, leaning back at an angle. Tabs on each leg hook into the board’s slots.',
  groups: [
    {
      id: 'stand',
      title: 'Stand',
      params: [
        { id: 'angle', label: 'Angle', type: 'number', default: 70, unit: 'deg', min: 30, max: 90, step: 1, help: 'Angle of the board (90 for vertical)' },
        { id: 'foot', label: 'Foot', type: 'number', default: 100, unit: 'mm', min: 20, max: 1000, step: 1, help: 'Length of the foot behind the board' },
        { id: 'foot_front', label: 'Front foot', type: 'number', default: 0, unit: 'mm', min: 0, max: 1000, step: 1, help: 'Extend a foot plate in front of the board (0 for none)' },
        { id: 'connectors', label: 'Connectors', type: 'sections', default: [1, 3], help: 'Slot rows the tabs go into, counted from the bottom, e.g. 1:3 (all odd or all even)' },
        { id: 'extra_height_top', label: 'Extra height top', type: 'number', default: 20, unit: 'mm', min: 0, max: 1000, step: 1, help: 'Height above the last connector' },
        { id: 'extra_height_bottom', label: 'Extra height bottom', type: 'number', default: 0, unit: 'mm', min: 0, max: 1000, step: 1, help: 'Space below the board' },
        { id: 'feet', label: 'Legs', type: 'number', default: 2, min: 1, max: 10, step: 1, help: 'How many legs to cut' },
        { id: 'preview_spacing', label: 'Preview: leg spacing', type: 'number', default: 160, unit: 'mm', min: 10, max: 2000, step: 10, help: 'Only changes the 3D preview' },
      ],
    },
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
