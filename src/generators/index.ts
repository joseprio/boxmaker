import { angledBox } from './angledbox';
import { binTray } from './bintray';
import { cardBox } from './cardbox';
import { closedBox } from './closedbox';
import { displayShelf } from './displayshelf';
import { flexBox } from './flexbox';
import { dividerTray } from './dividertray';
import type { GeneratorDef } from './types';
import { regularBox } from './regularbox';
import { roundedBox } from './roundedbox';
import { slidingLidBox } from './slidinglidbox';
import { stackableBin } from './stackablebin';
import { trayInsert } from './trayinsert';
import { typeTray } from './typetray';
import { unevenHeightBox } from './unevenheightbox';
import { openBox, universalBox } from './universalbox';

export const generators: GeneratorDef[] = [
  universalBox,
  closedBox,
  openBox,
  typeTray,
  dividerTray,
  trayInsert,
  cardBox,
  slidingLidBox,
  regularBox,
  angledBox,
  roundedBox,
  flexBox,
  displayShelf,
  stackableBin,
  binTray,
  unevenHeightBox,
];

export function findGenerator(id: string | undefined): GeneratorDef | undefined {
  return generators.find((g) => g.id === id);
}
