import { Boxes, place, type EdgeSpec } from '../engine/boxes';
import { FingerJointEdge, FingerJointEdgeCounterPart } from '../engine/edges';
import { FingerJointSettings } from '../engine/settings';
import { fingerJointGroup, fingerJointParams, materialGroup, outsideParam } from './common';
import { bool, finishModel, num, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';

const topOptions = [
  { value: 'none', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'hole', label: 'Round hole' },
  { value: 'angled hole', label: 'Polygon hole' },
  { value: 'angled lid', label: 'Loose lid (two plates)' },
];

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const fj = { ...fingerJointParams(v), surroundingspaces: num(v, 'fj_surroundingspaces') };
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fj });
  const n = Math.max(3, Math.round(num(v, 'n')));
  let r = num(v, 'radius');
  let h = num(v, 'h');
  const top = str(v, 'top');
  const bottom = str(v, 'bottom');

  if (bool(v, 'outside')) {
    r = r - t / Math.cos(Math.PI / n);
    if (top === 'none') h = b.adjustSize(h, false);
    else if (top === 'angled lid') h = b.adjustSize(h) - t;
    else h = b.adjustSize(h);
  }

  const [, apothem, side] = b.regularPolygon(n, { radius: r });

  // finger joints between the side walls meet at the polygon's exterior angle
  const phi = 180 - 2 * (Math.asin(Math.cos(Math.PI / n)) * 180) / Math.PI;
  const angled = new FingerJointSettings(t, fj);
  angled.angle = phi;
  const g = new FingerJointEdge(b, angled);
  const G = new FingerJointEdgeCounterPart(b, angled);
  b.addEdge(g, 'g');
  b.addEdge(G, 'G');

  const fingersTop = ['closed', 'hole', 'angled hole'].includes(top);
  const fingersBottom = ['closed', 'hole', 'angled hole'].includes(bottom);

  // polygon corners in box space: first side along +X starting at the origin
  const corners: { x: number; y: number }[] = [];
  {
    let px = 0;
    let py = 0;
    let ang = 0;
    for (let i = 0; i < n; i++) {
      corners.push({ x: px, y: py });
      px += Math.cos(ang) * side;
      py += Math.sin(ang) * side;
      ang += (2 * Math.PI) / n;
    }
  }
  const drawPlate = (style: string, edge: string, z: number, zInner: number, label: string) => {
    // plates are drawn with their first side on the first polygon side
    const placement = place.plateXY(0, 0, z);
    const group = style === 'angled lid' ? 'lid' : 'box';
    if (style === 'closed') {
      b.regularPolygonWall(n, { radius: r }, edge, { label, group, placement });
    } else if (style === 'angled lid') {
      b.regularPolygonWall(n, { radius: r }, 'e', { label: `${label} inner`, group, placement: place.plateXY(0, 0, zInner) });
      b.regularPolygonWall(n, { radius: r }, 'E', { label: `${label} outer`, group, placement });
    } else if (style === 'angled hole') {
      b.regularPolygonWall(n, { radius: r }, edge, {
        label,
        group,
        placement,
        callback: [() => b.regularPolygonAt(0, 0, n, 0, { h: apothem - t })],
      });
    } else if (style === 'hole') {
      b.regularPolygonWall(n, { radius: r }, edge, { label, group, placement, hole: (apothem - t) * 2 });
    }
  };

  // bottom plate sits below the walls (z in [-t, 0]); the walls' fingers go into its 'F' band
  drawPlate(bottom, 'F', -t, 0, 'bottom');
  // top plate at z in [h, h+t]
  drawPlate(top, 'F', h, h - t, 'top');

  const tOut = G.startWidth();
  const bottomEdge: EdgeSpec = fingersBottom ? 'f' : 'e';
  const topEdge: EdgeSpec = fingersTop ? 'f' : 'e';
  const borders = [side, 90, h, 90, side, 0, tOut, 90, h, 90, tOut];
  const edges: EdgeSpec[] = [bottomEdge, g, topEdge, 'e', G, 'e'];

  for (let i = 0; i < n; i++) {
    const c0 = corners[i];
    const c1 = corners[(i + 1) % n];
    const ux = (c1.x - c0.x) / side;
    const uy = (c1.y - c0.y) / side;
    b.polygonWall(borders, edges, {
      label: `side ${i + 1}`,
      placement: { origin: { x: c0.x, y: c0.y, z: 0 }, u: { x: ux, y: uy, z: 0 }, v: { x: 0, y: 0, z: 1 } },
    });
  }
  return finishModel(b);
}

export const regularBox: GeneratorDef = {
  id: 'regularbox',
  name: 'Regular Box',
  category: 'Box',
  description:
    'Box with a regular polygon as base - triangle, pentagon, hexagon, octagon... Finger joints are angled to match the corners. Loose lids need to be glued.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'n', label: 'Number of sides', type: 'number', default: 6, min: 3, max: 16, step: 1 },
        { id: 'radius', label: 'Radius', type: 'number', default: 50, unit: 'mm', min: 5, max: 1000, step: 1, help: 'Inner radius at the corners' },
        { id: 'h', label: 'Height (h)', type: 'number', default: 80, unit: 'mm', min: 5, max: 1000, step: 1, help: 'Inner height' },
        outsideParam,
      ],
    },
    {
      id: 'ends',
      title: 'Top & bottom',
      params: [
        { id: 'top', label: 'Top', type: 'select', default: 'none', options: topOptions },
        { id: 'bottom', label: 'Bottom', type: 'select', default: 'closed', options: topOptions },
      ],
    },
    materialGroup,
    { ...fingerJointGroup, params: fingerJointGroup.params.map((p) => (p.id === 'fj_surroundingspaces' ? { ...p, default: 1 } : p)) },
  ],
  build,
};
