import { angledBox } from './angledbox';
import { binTray } from './bintray';
import { cardBox } from './cardbox';
import { closedBox } from './closedbox';
import { displayShelf } from './displayshelf';
import { flexBox } from './flexbox';
import { hingeBox } from './hingebox';
import { hingeCardBox } from './hingecardbox';
import { integratedHingeBox } from './integratedhingebox';
import { dividerTray } from './dividertray';
import type { GeneratorDef } from './types';
import { regularBox } from './regularbox';
import { roundedBox } from './roundedbox';
import { sideHingeBox } from './sidehingebox';
import { slidingLidBox } from './slidinglidbox';
import { stackableBin } from './stackablebin';
import { trayInsert } from './trayinsert';
import { typeTray } from './typetray';
import { unevenHeightBox } from './unevenheightbox';
import { openBox, universalBox } from './universalbox';
import { pirateChest } from './piratechest';

export const generators: GeneratorDef[] = [
  universalBox,
  closedBox,
  openBox,
  typeTray,
  dividerTray,
  trayInsert,
  cardBox,
  hingeCardBox,
  slidingLidBox,
  hingeBox,
  integratedHingeBox,
  pirateChest,
  sideHingeBox,
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
