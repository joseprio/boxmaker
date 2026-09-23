import { Boxes, place } from '../engine/boxes';
import { fingerJointGroup, fingerJointParams, materialGroup } from './common';
import { finishModel, num, type BoxModel, type GeneratorDef, type ParamValues } from './types';

const rad = (d: number) => (d * Math.PI) / 180;
const X = { x: 1, y: 0, z: 0 };

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  const bookWidth = num(v, 'book_width');
  const H = num(v, 'book_height');
  const D = num(v, 'book_depth');
  const ledge = num(v, 'ledge_height');
  const alpha = num(v, 'angle');
  const bs = num(v, 'bottom_support');
  const backSupport = num(v, 'back_support');
  let r = num(v, 'radius');
  if (r < 0) r = t;
  if (alpha <= 0 || alpha > 90) throw new Error('The angle must be between 0 and 90 degrees');
  const width = bookWidth - 2 * t;
  if (width <= 0) throw new Error('The width must be more than twice the thickness');

  const sa = Math.sin(rad(alpha));
  const ca = Math.cos(rad(alpha));
  // the plates' joint reaches t * (sin + cos) below where their faces meet; upstream lets
  // it poke out under the sides, so the stand would rock
  const minSupport = t * (sa + ca);
  if (bs < minSupport - 1e-9) throw new Error(`The bottom support must be at least ${minSupport.toFixed(1)} mm at this angle`);
  // right triangle under the front plate (the book's back rests on it) ...
  const a = H * sa;
  const bb = H * ca;
  // ... and under the plate the book's bottom rests on
  const c = D * ca;
  const d = D * sa;
  const heightBack = a + bs + r;
  const heightFront = c + bs + r;
  const offS = sa * r;
  const offC = ca * r;
  const total = r + offC + bb + d + offS + r;
  if (heightBack - offC - r <= 0 || heightFront - offS - r <= 0) throw new Error('The radius is too large');

  // side wall: local x runs from the front to the back, y up
  const side = () => {
    b.polyline(total, 90);
    if (backSupport > 0) b.fingerHolesAt(bs, 2 * t, backSupport, 0);
    b.polyline(heightBack - offC - r, 0);
    b.corner(90 + alpha, r);
    b.getEdge('F').draw(H);
    b.corner(-90);
    b.getEdge('F').draw(D);
    b.corner(90 + (90 - alpha), r);
    b.polyline(heightFront - offS - r, 90);
  };
  // box space: side-wall x -> Y, y -> Z; the sides are X = 0 and X = t + width
  b.freePart(side, { label: 'left side', placement: place.wallYZ(0, 0, 0) });
  b.freePart(side, { label: 'right side', placement: place.wallYZ(t + width, 0, 0) });

  // where the two plates' outer faces meet in the side, and the front end of the bottom plate
  const p2 = { y: r + offC + d, z: bs };
  const p3 = { y: r + offC, z: bs + c };
  // up the front plate, and along the bottom plate towards the front
  const ea = { y: ca, z: sa };
  const eb = { y: -sa, z: ca };

  if (backSupport > 0) {
    b.rectangularWall(width, backSupport, 'efef', { label: 'back support', placement: place.wallXZ(t, total - 1.5 * t, bs) });
  }
  if (ledge > 0) {
    // holds the book open; stands on the front end of the bottom plate
    const lh = ledge + t;
    const w = width - 2 * r;
    b.freePart(
      () => {
        b.moveTo(r, 0);
        b.edge(w);
        b.corner(90, r);
        b.edge(lh - r);
        b.corner(90);
        b.getEdge('F').draw(width);
        b.corner(90);
        b.edge(lh - r);
        b.corner(90, r);
      },
      {
        label: 'front ledge',
        placement: {
          origin: { x: t, y: p2.y + (D + t) * eb.y + ledge * ea.y, z: p2.z + (D + t) * eb.z + ledge * ea.z },
          u: X,
          v: { x: 0, y: -ea.y, z: -ea.z },
        },
      },
    );
  }
  b.rectangularWall(width, D, (ledge > 0 ? 'f' : 'e') + 'fFf', {
    label: 'book bottom',
    placement: { origin: { x: t, y: p3.y - t * ea.y, z: p3.z - t * ea.z }, u: X, v: { x: 0, y: -eb.y, z: -eb.z } },
  });
  b.rectangularWall(width, H, 'ffef', {
    label: 'book back',
    placement: { origin: { x: t, y: p2.y - t * eb.y, z: p2.z - t * eb.z }, u: X, v: { x: 0, ...ea } },
  });
  return finishModel(b);
}

export const bookHolder: GeneratorDef = {
  id: 'bookholder',
  name: 'Book Holder',
  category: 'Misc',
  description: 'Angled display stand for books, ring files, flyers, postcards or business cards, with an optional ledge to hold a book open.',
  groups: [
    {
      id: 'book',
      title: 'Book',
      params: [
        { id: 'book_width', label: 'Width', type: 'number', default: 297, unit: 'mm', min: 20, max: 1000, step: 1, help: 'Total width of the stand (A4 landscape by default)' },
        { id: 'book_height', label: 'Height', type: 'number', default: 210, unit: 'mm', min: 10, max: 1000, step: 1, help: 'Height of the plate the book leans on' },
        { id: 'book_depth', label: 'Depth', type: 'number', default: 40, unit: 'mm', min: 5, max: 300, step: 1, help: 'Larger for books with more pages' },
        { id: 'ledge_height', label: 'Ledge height', type: 'number', default: 0, unit: 'mm', min: 0, max: 200, step: 1, help: 'Ledge in front to hold the book open (0 for none)' },
        { id: 'angle', label: 'Angle', type: 'number', default: 75, unit: 'deg', min: 10, max: 90, step: 1, help: 'Angle between the table and the plate the book leans on' },
        { id: 'bottom_support', label: 'Bottom support', type: 'number', default: 20, unit: 'mm', min: 0, max: 500, step: 1, help: 'Extra material below, to raise the book; at least enough to keep the plates’ joint off the table' },
        { id: 'back_support', label: 'Back support', type: 'number', default: 50, unit: 'mm', min: 0, max: 500, step: 1, help: 'Height of a brace between the sides at the back (0 for none)' },
        { id: 'radius', label: 'Corner radius', type: 'number', default: -1, unit: 'mm', min: -1, max: 50, step: 0.5, help: 'Radius of the sharp corners (negative for the material thickness)' },
      ],
    },
    materialGroup,
    fingerJointGroup,
  ],
  build,
};
