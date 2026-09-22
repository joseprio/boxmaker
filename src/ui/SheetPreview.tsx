import { useMemo } from 'react';
import { cutContours, layoutParts } from '../engine/layout';
import type { BoxModel } from '../generators/types';

/** Inline SVG rendering of the packed cutting sheet. */
export function SheetPreview({ model }: { model: BoxModel }) {
  const sheet = useMemo(() => layoutParts(model.parts), [model]);
  const paths = useMemo(
    () =>
      sheet.parts.map((pp) => {
        const { outline, holes } = cutContours(pp.part, model.burn);
        const toD = (pts: { x: number; y: number }[]) =>
          pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x + pp.dx).toFixed(2)} ${(sheet.height - (p.y + pp.dy)).toFixed(2)}`).join(' ') + 'Z';
        return {
          label: pp.part.label,
          outline: toD(outline),
          holes: holes.map(toD),
          cuts: pp.part.cuts.map((c) => c.map((p, i) => `${i ? 'L' : 'M'}${(p.x + pp.dx).toFixed(2)} ${(sheet.height - (p.y + pp.dy)).toFixed(2)}`).join(' ')),
          cx: (pp.bounds.minX + pp.bounds.maxX) / 2 + pp.dx,
          cy: sheet.height - ((pp.bounds.minY + pp.bounds.maxY) / 2 + pp.dy),
        };
      }),
    [sheet, model.burn],
  );
  const fs = Math.max(sheet.width, sheet.height) / 45;
  return (
    <div className="sheet-preview">
      <svg viewBox={`0 0 ${sheet.width} ${sheet.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Cutting layout">
        <rect x={0} y={0} width={sheet.width} height={sheet.height} fill="#fffdf8" stroke="#d8d0c0" strokeWidth={0.5} />
        {paths.map((p, i) => (
          <g key={i}>
            <path d={p.outline} fill="#e9d6b5" stroke="#3b2a12" strokeWidth={0.4} strokeLinejoin="round" />
            {p.holes.map((h, j) => (
              <path key={j} d={h} fill="#fffdf8" stroke="#1d4ed8" strokeWidth={0.4} />
            ))}
            {p.cuts.length > 0 && <path d={p.cuts.join(' ')} fill="none" stroke="#1d4ed8" strokeWidth={0.25} />}
            <text x={p.cx} y={p.cy} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill="#7a6a50">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="sheet-size">
        Sheet: {sheet.width.toFixed(0)} x {sheet.height.toFixed(0)} mm · {model.parts.length} parts
      </div>
    </div>
  );
}
