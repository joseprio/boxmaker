import { boundsOf, offsetPolygon, signedArea, type Bounds, type Vec2 } from './geometry';
import type { Part } from './part';

export interface PlacedPart {
  part: Part;
  /** translation applied to part-local coordinates */
  dx: number;
  dy: number;
  bounds: Bounds;
}

export interface Sheet {
  width: number;
  height: number;
  parts: PlacedPart[];
}

/**
 * Simple shelf packing: parts sorted by height, placed left to right in rows
 * whose width is limited to roughly the square root of the total area.
 */
export function layoutParts(parts: Part[], spacing = 3, margin = 5): Sheet {
  const items = parts.map((part) => {
    const bounds = boundsOf([part.outline]);
    return { part, bounds, w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY };
  });
  items.sort((a, b) => b.h - a.h || b.w - a.w);
  const totalArea = items.reduce((s, i) => s + (i.w + spacing) * (i.h + spacing), 0);
  const maxW = Math.max(Math.sqrt(totalArea) * 1.3, ...items.map((i) => i.w)) + spacing;

  const placed: PlacedPart[] = [];
  let x = margin;
  let y = margin;
  let rowH = 0;
  let sheetW = 0;
  for (const it of items) {
    if (x + it.w > margin + maxW && x > margin) {
      x = margin;
      y += rowH + spacing;
      rowH = 0;
    }
    placed.push({ part: it.part, dx: x - it.bounds.minX, dy: y - it.bounds.minY, bounds: it.bounds });
    x += it.w + spacing;
    rowH = Math.max(rowH, it.h);
    sheetW = Math.max(sheetW, x - spacing);
  }
  return { width: sheetW + margin, height: y + rowH + margin, parts: placed };
}

/** Kerf-compensated contours for a part: outline grown, holes shrunk. */
export function cutContours(part: Part, burn: number): { outline: Vec2[]; holes: Vec2[][] } {
  const outline = offsetPolygon(part.outline, burn);
  const holes = part.holes.map((h) => {
    const cw = signedArea(h) < 0 ? h : [...h].reverse();
    return offsetPolygon(cw, burn);
  });
  return { outline, holes };
}

/** Parts cut from the same material thickness. */
export interface MaterialGroup {
  thickness: number;
  parts: Part[];
}

/**
 * Split parts by material thickness, one group per sheet to cut. The group
 * with the most parts (normally the walls) comes first.
 */
export function partsByThickness(parts: Part[]): MaterialGroup[] {
  const groups: MaterialGroup[] = [];
  for (const p of parts) {
    const g = groups.find((q) => Math.abs(q.thickness - p.thickness) < 1e-6);
    if (g) g.parts.push(p);
    else groups.push({ thickness: p.thickness, parts: [p] });
  }
  return groups.sort((a, b) => b.parts.length - a.parts.length || a.thickness - b.thickness);
}

/** "3", "2.5", "1.25" (mm, without trailing zeros). */
export const formatThickness = (t: number): string => String(Math.round(t * 100) / 100);
