import type { Vec2 } from './geometry';
import { cutContours, layoutParts, type Sheet } from './layout';
import type { Part } from './part';

const fmt = (n: number): string => (Math.round(n * 1000) / 1000).toString();

function svgPath(pts: Vec2[], dx: number, dy: number, sheetH: number): string {
  // SVG y axis points down: flip
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${fmt(p.x + dx)} ${fmt(sheetH - (p.y + dy))}`).join(' ');
  return d + ' Z';
}

export interface ExportOptions {
  burn: number;
  /** include part labels as text (not for cutting) */
  labels?: boolean;
}

export function toSVG(parts: Part[], opts: ExportOptions): string {
  const sheet = layoutParts(parts);
  const W = fmt(sheet.width);
  const H = fmt(sheet.height);
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
  );
  lines.push(`  <g id="cut" fill="none" stroke="#000000" stroke-width="0.1" stroke-linejoin="round">`);
  for (const pp of sheet.parts) {
    const { outline, holes } = cutContours(pp.part, opts.burn);
    lines.push(`    <g id="${escapeXml(pp.part.label || 'part')}">`);
    lines.push(`      <path d="${svgPath(outline, pp.dx, pp.dy, sheet.height)}"/>`);
    for (const h of holes) {
      lines.push(`      <path stroke="#0000ff" d="${svgPath(h, pp.dx, pp.dy, sheet.height)}"/>`);
    }
    for (const op of pp.part.openPaths) {
      const d = op.map((p, i) => `${i ? 'L' : 'M'}${fmt(p.x + pp.dx)} ${fmt(sheet.height - (p.y + pp.dy))}`).join(' ');
      lines.push(`      <path stroke="#ff0000" d="${d}"/>`);
    }
    lines.push(`    </g>`);
  }
  lines.push(`  </g>`);
  if (opts.labels) {
    lines.push(`  <g id="labels" fill="#888" font-family="sans-serif" font-size="4">`);
    for (const pp of sheet.parts) {
      if (!pp.part.label) continue;
      const cx = (pp.bounds.minX + pp.bounds.maxX) / 2 + pp.dx;
      const cy = sheet.height - ((pp.bounds.minY + pp.bounds.maxY) / 2 + pp.dy);
      lines.push(`    <text x="${fmt(cx)}" y="${fmt(cy)}" text-anchor="middle">${escapeXml(pp.part.label)}</text>`);
    }
    lines.push(`  </g>`);
  }
  lines.push(`</svg>`);
  return lines.join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] as string);
}

/** Minimal DXF (R12-compatible polylines, mm units). */
export function toDXF(parts: Part[], opts: ExportOptions): string {
  const sheet = layoutParts(parts);
  const out: string[] = [];
  const push = (code: number | string, value: string | number) => out.push(String(code), String(value));
  push(0, 'SECTION');
  push(2, 'HEADER');
  push(9, '$INSUNITS');
  push(70, 4); // millimetres
  push(0, 'ENDSEC');
  push(0, 'SECTION');
  push(2, 'ENTITIES');
  const poly = (pts: Vec2[], dx: number, dy: number, layer: string) => {
    push(0, 'POLYLINE');
    push(8, layer);
    push(66, 1);
    push(70, 1); // closed
    for (const p of pts) {
      push(0, 'VERTEX');
      push(8, layer);
      push(10, fmt(p.x + dx));
      push(20, fmt(p.y + dy));
      push(30, 0);
    }
    push(0, 'SEQEND');
  };
  for (const pp of sheet.parts) {
    const { outline, holes } = cutContours(pp.part, opts.burn);
    poly(outline, pp.dx, pp.dy, 'CUT');
    for (const h of holes) poly(h, pp.dx, pp.dy, 'CUT_INNER');
  }
  push(0, 'ENDSEC');
  push(0, 'EOF');
  return out.join('\n');
}

export function sheetSummary(parts: Part[]): Sheet {
  return layoutParts(parts);
}
