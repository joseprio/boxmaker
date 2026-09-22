import { closedBox } from './closedbox';
import { displayShelf } from './displayshelf';
import type { GeneratorDef } from './types';
import { regularBox } from './regularbox';
import { slidingLidBox } from './slidinglidbox';
import { stackableBin } from './stackablebin';
import { typeTray } from './typetray';
import { unevenHeightBox } from './unevenheightbox';
import { openBox, universalBox } from './universalbox';

export const generators: GeneratorDef[] = [universalBox, closedBox, openBox, typeTray, slidingLidBox, regularBox, displayShelf, stackableBin, unevenHeightBox];

export function findGenerator(id: string | undefined): GeneratorDef | undefined {
  return generators.find((g) => g.id === id);
}
