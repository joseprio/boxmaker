import { Boxes, CompoundEdge, place, type EdgeSpec } from '../engine/boxes';
import { GripHoleEdge, SlottedEdge } from '../engine/edges';
import { Lid } from '../engine/lids';
import { fingerJointGroup, fingerJointParams, materialGroup, outsideParam, stackableGroup, stackableParams } from './common';
import { bool, finishModel, num, sections, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';
import { bottomEdgeOptions, lidGroup, lidSettings, topExtension } from './universalbox';

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const b = new Boxes({
    thickness: t,
    burn: num(v, 'burn'),
    fingerJoint: { ...fingerJointParams(v), surroundingspaces: num(v, 'fj_surroundingspaces') },
    stackable: stackableParams(v),
  });
  let sx = sections(v, 'sx');
  let sy = sections(v, 'sy');
  let h = num(v, 'h');
  let hi = num(v, 'hi');
  const bot = str(v, 'bottom_edge');
  const top = str(v, 'top_edge');
  const fingerholes = str(v, 'fingerholes');
  const gw = num(v, 'gripwidth');
  const gh = num(v, 'gripheight');

  if (bool(v, 'outside')) {
    sx = b.adjustSizes(sx);
    sy = b.adjustSizes(sy);
    h = b.adjustSize(h, bot, false);
    if (hi) hi = b.adjustSize(hi, bot, false);
  }

  const x = sx.reduce((a, c) => a + c, 0) + t * (sx.length - 1);
  const y = sy.reduce((a, c) => a + c, 0) + t * (sy.length - 1);
  const sameh = !hi;
  hi = hi || h;

  const gripEdge = new GripHoleEdge(b, {
    radius: num(v, 'fh_radius'),
    absoluteDepth: 0,
    relativeDepth: num(v, 'fh_depth'),
    absoluteWidth: 0,
    relativeWidth: num(v, 'fh_width'),
    wallHeight: fingerholes === 'none' ? 0 : hi,
  });
  b.addEdge(gripEdge, 'A');

  const closedtop = top === 'F' || top === 'h' || top === 'Z';
  const ignoreWidths = [1, 6];

  // callbacks ---------------------------------------------------------
  const xSlots = () => {
    let posx = -0.5 * t;
    for (const sxi of sx.slice(0, -1)) {
      posx += sxi + t;
      let posy = 0;
      for (const syi of sy) {
        b.fingerHolesAt(posx, posy, syi);
        posy += syi + t;
      }
    }
  };
  const ySlots = () => {
    let posy = -0.5 * t;
    for (const syi of sy.slice(0, -1)) {
      posy += syi + t;
      let posx = 0;
      for (const sxi of [...sx].reverse()) {
        b.fingerHolesAt(posy, posx, sxi);
        posx += sxi + t;
      }
    }
  };
  const xHoles = () => {
    let posx = -0.5 * t;
    for (const sxi of sx.slice(0, -1)) {
      posx += sxi + t;
      b.fingerHolesAt(posx, 0, Math.min(h, hi));
    }
  };
  const yHoles = () => {
    let posy = -0.5 * t;
    for (const syi of sy.slice(0, -1)) {
      posy += syi + t;
      b.fingerHolesAt(posy, 0, Math.min(h, hi));
    }
  };
  const gripHole = () => {
    if (!gw) return;
    const r = Math.min(gw, gh) / 2;
    b.rectangularHole(x / 2, gh * 1.5, gw, gh, r);
  };

  // outer walls -------------------------------------------------------
  let tf: EdgeSpec = top;
  let tb: EdgeSpec = top;
  if (!closedtop && (fingerholes === 'front' || fingerholes === 'front-and-back')) tf = new SlottedEdge(b, [...sx].reverse(), 'A');
  if (!closedtop && (fingerholes === 'back' || fingerholes === 'front-and-back')) tb = new SlottedEdge(b, [...sx].reverse(), 'A');

  if (bot !== 'e') {
    b.rectangularWall(x, y, 'ffff', { label: 'bottom', callback: [xSlots, ySlots], placement: place.plateXY(0, 0, -t) });
  }
  b.rectangularWall(x, h, [bot, 'F', tf, 'F'], {
    label: 'front',
    callback: [xHoles, null, gripHole],
    ignoreWidths,
    placement: place.wallXZ(0, 0, 0),
  });
  b.rectangularWall(x, h, [bot, 'F', tb, 'F'], {
    label: 'back',
    callback: [xHoles],
    ignoreWidths,
    placement: place.wallXZ(0, y + t, 0),
  });
  b.rectangularWall(y, h, [bot, 'f', top, 'f'], {
    label: 'left side',
    callback: [yHoles],
    ignoreWidths,
    placement: place.wallYZ(-t, 0, 0),
  });
  b.rectangularWall(y, h, [bot, 'f', top, 'f'], {
    label: 'right side',
    callback: [yHoles],
    ignoreWidths,
    placement: place.wallYZ(x, 0, 0),
  });

  // inner walls -------------------------------------------------------
  const be = bot !== 'e' ? 'f' : 'e';
  const le: EdgeSpec = hi <= h ? 'f' : new CompoundEdge(b, ['e', 'f'], [hi - h, h]);
  const re: EdgeSpec = hi <= h ? 'f' : new CompoundEdge(b, ['f', 'e'], [h, hi - h]);

  let posy = -0.5 * t;
  sy.slice(0, -1).forEach((syi, i) => {
    posy += syi + t;
    const topEdge = closedtop && sameh ? new SlottedEdge(b, [...sx].reverse(), 'f', 0.5 * hi) : new SlottedEdge(b, [...sx].reverse(), 'A', 0.5 * hi);
    b.rectangularWall(x, hi, [new SlottedEdge(b, sx, be), re, topEdge, le], {
      label: `inner x ${i + 1}`,
      group: 'divider',
      placement: place.wallXZ(0, posy + 0.5 * t, 0),
    });
  });

  let posx = -0.5 * t;
  sx.slice(0, -1).forEach((sxi, i) => {
    posx += sxi + t;
    const topEdge: EdgeSpec = closedtop && sameh ? new SlottedEdge(b, [...sy].reverse(), 'f') : 'e';
    b.rectangularWall(y, hi, [new SlottedEdge(b, sy, be, 0.5 * hi), re, topEdge, le], {
      label: `inner y ${i + 1}`,
      group: 'divider',
      placement: place.wallYZ(posx - 0.5 * t, 0, 0),
    });
  });

  // top / lid ---------------------------------------------------------
  if (closedtop && sameh) {
    b.rectangularWall(x, y, 'ffff', { label: 'top', callback: [xSlots, ySlots], placement: place.plateXY(0, 0, h) });
  } else if (closedtop) {
    b.rectangularWall(x, y, 'ffff', { label: 'top', placement: place.plateXY(0, 0, h) });
  }
  if (top === 'e') {
    new Lid(b, lidSettings(t, v)).draw({ x, y, zTop: h + topExtension(b, top) });
  }
  return finishModel(b);
}

export const typeTray: GeneratorDef = {
  id: 'typetray',
  name: 'Type Tray',
  category: 'Tray',
  description: 'Tray with a grid of compartments. The dividers interlock with each other and slot into the walls and floor.',
  groups: [
    {
      id: 'dims',
      title: 'Dimensions',
      params: [
        { id: 'sx', label: 'Sections x', type: 'sections', default: [50, 50, 50], help: 'Compartment widths, e.g. 50:50:30 or 3*40' },
        { id: 'sy', label: 'Sections y', type: 'sections', default: [50, 50], help: 'Compartment depths' },
        { id: 'h', label: 'Height (h)', type: 'number', default: 50, unit: 'mm', min: 5, max: 1000, step: 1, help: 'Outer wall height' },
        { id: 'hi', label: 'Inner height (hi)', type: 'number', default: 0, unit: 'mm', min: 0, max: 1000, step: 1, help: 'Height of the dividers (0 = same as walls)' },
        outsideParam,
      ],
    },
    {
      id: 'edges',
      title: 'Edges',
      params: [
        {
          id: 'top_edge',
          label: 'Top edge',
          type: 'select',
          default: 'e',
          options: [
            { value: 'e', label: 'Open (straight edge)' },
            { value: 'F', label: 'Closed - fixed top with finger joints' },
            { value: 'h', label: 'Closed - top held by finger holes' },
          ],
        },
        { id: 'bottom_edge', label: 'Bottom edge', type: 'select', default: 'F', options: bottomEdgeOptions },
      ],
    },
    {
      id: 'grip',
      title: 'Grips & finger holes',
      params: [
        {
          id: 'fingerholes',
          label: 'Finger cut-outs',
          type: 'select',
          default: 'none',
          options: [
            { value: 'none', label: 'None' },
            { value: 'inside-only', label: 'Inner dividers only' },
            { value: 'front', label: 'Inner dividers and front' },
            { value: 'back', label: 'Inner dividers and back' },
            { value: 'front-and-back', label: 'Inner dividers, front and back' },
          ],
          help: 'Cut-outs on the top edges to get your fingers at the contents',
        },
        { id: 'fh_width', label: 'Cut-out width', type: 'number', default: 0.3, min: 0, max: 1, step: 0.05, help: 'As a fraction of the compartment width', showIf: (v) => v.fingerholes !== 'none' },
        { id: 'fh_depth', label: 'Cut-out depth', type: 'number', default: 0.9, min: 0, max: 1, step: 0.05, help: 'As a fraction of the wall height', showIf: (v) => v.fingerholes !== 'none' },
        { id: 'fh_radius', label: 'Cut-out radius', type: 'number', default: 10, unit: 'mm', min: 0, max: 100, step: 1, showIf: (v) => v.fingerholes !== 'none' },
        { id: 'gripwidth', label: 'Grip hole width', type: 'number', default: 0, unit: 'mm', min: 0, max: 500, step: 1, help: 'Width of the grip hole in the front wall (0 for none)' },
        { id: 'gripheight', label: 'Grip hole height', type: 'number', default: 30, unit: 'mm', min: 1, max: 200, step: 1, showIf: (v) => Number(v.gripwidth) > 0 },
      ],
    },
    lidGroup,
    materialGroup,
    { ...fingerJointGroup, params: fingerJointGroup.params.map((p) => (p.id === 'fj_surroundingspaces' ? { ...p, default: 0.5 } : p)) },
    stackableGroup,
  ],
  build,
};
