import { useMemo } from 'react';
import { cutContours, formatThickness, layoutParts, partsByThickness } from '../engine/layout';
import type { Part } from '../engine/part';
import type { BoxModel } from '../generators/types';

/** One packed cutting sheet. */
function Sheet({ parts, burn, caption }: { parts: Part[]; burn: number; caption: string }) {
  const sheet = useMemo(() => layoutParts(parts), [parts]);
  const paths = useMemo(
    () =>
      sheet.parts.map((pp) => {
        const { outline, holes } = cutContours(pp.part, burn);
        const line = (pts: { x: number; y: number }[]) =>
          pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x + pp.dx).toFixed(2)} ${(sheet.height - (p.y + pp.dy)).toFixed(2)}`).join(' ');
        return {
          label: pp.part.label,
          outline: line(outline) + 'Z',
          holes: holes.map((h) => line(h) + 'Z'),
          cuts: pp.part.cuts.map(line),
          engrave: pp.part.openPaths.map(line),
          cx: (pp.bounds.minX + pp.bounds.maxX) / 2 + pp.dx,
          cy: sheet.height - ((pp.bounds.minY + pp.bounds.maxY) / 2 + pp.dy),
        };
      }),
    [sheet, burn],
  );
  const fs = Math.max(sheet.width, sheet.height) / 45;
  return (
    // share of the row in proportion to the sheet's width, so side by side sheets are drawn to the same scale
    <figure className="sheet" style={{ flexGrow: sheet.width }}>
      <svg viewBox={`0 0 ${sheet.width} ${sheet.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Cutting layout, ${caption}`}>
        <rect x={0} y={0} width={sheet.width} height={sheet.height} fill="#fffdf8" stroke="#d8d0c0" strokeWidth={0.5} />
        {paths.map((p, i) => (
          <g key={i}>
            <path d={p.outline} fill="#e9d6b5" stroke="#3b2a12" strokeWidth={0.4} strokeLinejoin="round" />
            {p.holes.map((h, j) => (
              <path key={j} d={h} fill="#fffdf8" stroke="#1d4ed8" strokeWidth={0.4} />
            ))}
            {p.cuts.length > 0 && <path d={p.cuts.join(' ')} fill="none" stroke="#1d4ed8" strokeWidth={0.25} />}
            {p.engrave.length > 0 && <path d={p.engrave.join(' ')} fill="none" stroke="#c2410c" strokeWidth={0.3} />}
            <text x={p.cx} y={p.cy} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill="#7a6a50">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="sheet-size">
        {caption}: {sheet.width.toFixed(0)} x {sheet.height.toFixed(0)} mm · {parts.length} parts
      </figcaption>
    </figure>
  );
}

/** Inline SVG rendering of the packed cutting sheets, one per material thickness. */
export function SheetPreview({ model }: { model: BoxModel }) {
  const groups = useMemo(() => partsByThickness(model.parts), [model]);
  return (
    <div className="sheet-preview">
      {groups.map((g) => (
        <Sheet key={g.thickness} parts={g.parts} burn={model.burn} caption={groups.length > 1 ? `${formatThickness(g.thickness)} mm sheet` : 'Sheet'} />
      ))}
    </div>
  );
}
