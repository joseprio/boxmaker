import { angledBox } from './angledbox';
import { binTray } from './bintray';
import { bottleHolder } from './bottleholder';
import { bottleOrganizer } from './bottleorganizer';
import { bookHolder } from './bookholder';
import { cardBox } from './cardbox';
import { closedBox } from './closedbox';
import { displayShelf } from './displayshelf';
import { flexBox } from './flexbox';
import { gridfinityBase, gridfinityBin } from './gridfinity';
import { hingeBox } from './hingebox';
import { hingeCardBox } from './hingecardbox';
import { integratedHingeBox } from './integratedhingebox';
import { kerfTest } from './kerftest';
import { magazineFile } from './magazinefile';
import { penHolderBox } from './penholderbox';
import { dividerTray } from './dividertray';
import { display } from './display';
import { laptopStand } from './laptopstand';
import type { GeneratorDef } from './types';
import { regularBox } from './regularbox';
import { roundedBox } from './roundedbox';
import { shelves } from './shelves';
import { sideHingeBox } from './sidehingebox';
import { skadisBoard } from './skadis';
import { skadisStand } from './skadisstand';
import { slidingDrawer } from './slidingdrawer';
import { slidingLidBox } from './slidinglidbox';
import { stackableBin } from './stackablebin';
import { trayInsert } from './trayinsert';
import { typeTray } from './typetray';
import { unevenHeightBox } from './unevenheightbox';
import { openBox, universalBox } from './universalbox';
import { pirateChest } from './piratechest';
import { deviceHolder } from './deviceholder';

export const generators: GeneratorDef[] = [
  universalBox,
  closedBox,
  openBox,
  typeTray,
  dividerTray,
  trayInsert,
  gridfinityBase,
  gridfinityBin,
  penHolderBox,
  bottleHolder,
  bottleOrganizer,
  cardBox,
  hingeCardBox,
  slidingLidBox,
  slidingDrawer,
  hingeBox,
  integratedHingeBox,
  pirateChest,
  sideHingeBox,
  regularBox,
  angledBox,
  roundedBox,
  flexBox,
  displayShelf,
  shelves,
  stackableBin,
  binTray,
  magazineFile,
  unevenHeightBox,
  skadisBoard,
  skadisStand,
  laptopStand,
  display,
  bookHolder,
  deviceHolder,
  kerfTest,
];

/** Former ids, so links shared before a rename still open the generator. */
const renamedIds: Record<string, string> = { phoneholder: 'deviceholder' };

export function findGenerator(id: string | undefined): GeneratorDef | undefined {
  const current = id !== undefined ? (renamedIds[id] ?? id) : id;
  return generators.find((g) => g.id === current);
}
