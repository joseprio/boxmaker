import { Boxes, place } from '../engine/boxes';
import { FingerHoles, FingerJointEdge, FingerJointEdgeCounterPart } from '../engine/edges';
import { FingerJointSettings } from '../engine/settings';
import { textWidth } from '../engine/text';
import { fingerJointGroup, fingerJointParams, materialGroup } from './common';
import { finishModel, num, str, type BoxModel, type GeneratorDef, type ParamValues } from './types';

/*
 * Kerf / fit test: a row of pairs, each cut with a different burn (or finger
 * play) and engraved with its value. Every pair is a tab with fingers and a
 * piece with the matching finger joint edge and a row of finger holes, so both
 * the corner joint and the finger-into-hole fit can be tried. Pick the
 * tightest pair that still goes together by hand and enter its value.
 */

const GAP = 6; // between pairs in the preview

const decimals = (x: number) => {
  const s = String(Math.round(x * 1000) / 1000);
  return s.includes('.') ? s.split('.')[1].length : 0;
};

const vary = (v: ParamValues) => (str(v, 'vary') === 'play' ? 'play' : 'burn');

function build(v: ParamValues): BoxModel {
  const t = num(v, 'thickness');
  const mode = vary(v);
  const b = new Boxes({ thickness: t, burn: num(v, 'burn'), fingerJoint: fingerJointParams(v) });
  const n = Math.max(1, Math.round(num(v, 'count')));
  const start = num(v, `${mode}_start`);
  const step = num(v, `${mode}_step`);
  const l = num(v, 'length');
  const h = num(v, 'height');
  const values = Array.from({ length: n }, (_, i) => Math.round((start + i * step) * 1e6) / 1e6);
  if (values[n - 1] < 0) throw new Error('The values must not go below 0');
  const places = Math.max(2, decimals(start), decimals(step));
  const label = (x: number) => x.toFixed(places);

  // the slot piece's holes sit 2t below its top, leaving 1.5t of material above them
  const holeY = h - 2 * t;
  const textRoom = holeY - 1.5 * t - 1;
  const widest = label(Math.max(...values.map(Math.abs)));
  const size = Math.min(num(v, 'text_height'), textRoom, h - 2, (0.85 * l) / textWidth(widest, 1));
  if (size < 2) throw new Error('The pieces are too small for the labels: make them taller or longer');

  values.forEach((value, i) => {
    const s = new FingerJointSettings(t, { ...fingerJointParams(v), ...(mode === 'play' ? { play: value } : {}) });
    const x0 = i * (l + GAP);
    const text = label(value);
    // tab: fingers along its top
    const tab = b.rectangularWall(l, h, ['e', 'e', new FingerJointEdge(b, s), 'e'], {
      label: `tab ${text}`,
      callback: [() => b.engraveText(text, l / 2, h / 2, size)],
      placement: place.plateXY(x0, 0, 0),
    });
    // slot piece: the opposing finger joint edge, plugged onto the tab, and a row of holes for the same fingers
    const slot = b.rectangularWall(l, h, [new FingerJointEdgeCounterPart(b, s), 'e', 'e', 'e'], {
      label: `slots ${text}`,
      callback: [
        () => {
          new FingerHoles(b, s).draw(0, holeY, l, 0);
          b.engraveText(text, l / 2, (holeY - 1.5 * t) / 2, size);
        },
      ],
      placement: place.plateXY(x0, h + t, 0),
    });
    if (mode === 'burn') tab.burn = slot.burn = value;
  });
  return finishModel(b);
}

export const kerfTest: GeneratorDef = {
  id: 'kerftest',
  name: 'Kerf Test',
  category: 'Misc',
  description:
    'Test strip for finding your burn (kerf) or finger play: pairs of finger-jointed tabs and slots, each cut with a different value engraved on it. Use the tightest pair that still fits.',
  groups: [
    {
      id: 'test',
      title: 'Test',
      params: [
        {
          id: 'vary',
          label: 'Vary',
          type: 'select',
          default: 'burn',
          options: [
            { value: 'burn', label: 'Burn (kerf)' },
            { value: 'play', label: 'Finger play' },
          ],
          help: 'Burn changes the whole cut; play only widens the finger slots, at a fixed burn',
        },
        { id: 'count', label: 'Pairs', type: 'number', default: 7, min: 1, max: 20, step: 1 },
        { id: 'burn_start', label: 'First burn', type: 'number', default: 0.05, unit: 'mm', min: 0, max: 1, step: 0.005, showIf: (v) => vary(v) === 'burn' },
        { id: 'burn_step', label: 'Burn step', type: 'number', default: 0.025, unit: 'mm', min: -0.5, max: 0.5, step: 0.005, help: 'Added for every further pair', showIf: (v) => vary(v) === 'burn' },
        { id: 'play_start', label: 'First play', type: 'number', default: 0, unit: 'x t', min: 0, max: 1, step: 0.005, showIf: (v) => vary(v) === 'play' },
        { id: 'play_step', label: 'Play step', type: 'number', default: 0.01, unit: 'x t', min: -0.5, max: 0.5, step: 0.005, help: 'Added for every further pair', showIf: (v) => vary(v) === 'play' },
        { id: 'length', label: 'Piece length', type: 'number', default: 50, unit: 'mm', min: 10, max: 300, step: 1, help: 'Along the joint; longer pieces get more fingers' },
        { id: 'height', label: 'Piece height', type: 'number', default: 20, unit: 'mm', min: 8, max: 200, step: 1 },
        { id: 'text_height', label: 'Text height', type: 'number', default: 5, unit: 'mm', min: 2, max: 50, step: 0.5, help: 'Shrunk to fit the pieces if needed' },
      ],
    },
    { ...materialGroup, params: materialGroup.params.map((p) => (p.id === 'burn' ? { ...p, help: 'Burn for all pairs when varying the finger play', showIf: (v: ParamValues) => vary(v) === 'play' } : p)) },
    { ...fingerJointGroup, params: fingerJointGroup.params.map((p) => (p.id === 'fj_play' ? { ...p, showIf: (v: ParamValues) => vary(v) === 'burn' } : p)) },
  ],
  build,
};
