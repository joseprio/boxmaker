import { useState } from 'react';
import type { ParamDef, ParamGroup, ParamValue, ParamValues } from '../generators/types';

interface Props {
  groups: ParamGroup[];
  values: ParamValues;
  onChange: (id: string, value: ParamValue) => void;
}

/** Parse "50:40:30" or "3*50" style section lists. Zero entries are dropped unless `allowZero`. */
export function parseSections(text: string, allowZero = false): number[] {
  const out: number[] = [];
  for (const raw of text.split(/[:,;\s]+/)) {
    const tok = raw.trim();
    if (!tok) continue;
    const m = tok.match(/^(\d+)\*(\d*\.?\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      const v = parseFloat(m[2]);
      for (let i = 0; i < n; i++) out.push(v);
    } else {
      const v = parseFloat(tok);
      if (!isNaN(v) && (v > 0 || (allowZero && v === 0))) out.push(v);
    }
  }
  return out;
}

export function formatSections(s: number[]): string {
  return s.map((v) => (Math.round(v * 100) / 100).toString()).join(':');
}

function SectionsInput({ def, value, onChange }: { def: ParamDef; value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState(formatSections(value));
  const [bad, setBad] = useState(false);
  return (
    <input
      type="text"
      inputMode="decimal"
      className={bad ? 'invalid' : ''}
      value={text}
      placeholder="50:50:30 or 3*40"
      onChange={(e) => {
        setText(e.target.value);
        const s = parseSections(e.target.value, def.allowZero);
        if (s.some((n) => n > 0)) {
          setBad(false);
          onChange(s);
        } else {
          setBad(true);
        }
      }}
      aria-label={def.label}
    />
  );
}

function ParamField({ def, value, onChange }: { def: ParamDef; value: ParamValue; onChange: (v: ParamValue) => void }) {
  if (def.type === 'boolean') {
    return (
      <label className="param param-check">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span className="param-label">{def.label}</span>
        {def.help && <span className="param-help">{def.help}</span>}
      </label>
    );
  }
  return (
    <div className="param">
      <label className="param-label" htmlFor={`p-${def.id}`}>
        {def.label}
        {def.unit && <span className="unit">{def.unit}</span>}
      </label>
      {def.type === 'select' && (
        <select id={`p-${def.id}`} value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {def.type === 'number' && (
        <input
          id={`p-${def.id}`}
          type="number"
          inputMode="decimal"
          value={Number(value)}
          min={def.min}
          max={def.max}
          step={def.step ?? 1}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onChange(n);
          }}
        />
      )}
      {def.type === 'sections' && (
        <SectionsInput def={def} value={Array.isArray(value) ? value : [Number(value)]} onChange={onChange} />
      )}
      {def.help && <span className="param-help">{def.help}</span>}
    </div>
  );
}

function Group({ group, values, onChange }: { group: ParamGroup } & Props) {
  const [open, setOpen] = useState(!group.collapsed);
  const visible = group.params.filter((p) => !p.showIf || p.showIf(values));
  if (visible.length === 0) return null;
  return (
    <section className={`param-group ${open ? 'open' : ''}`}>
      <button type="button" className="group-title" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{group.title}</span>
        <span className="chevron" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="group-body">
          {visible.map((p) => (
            <ParamField key={p.id} def={p} value={values[p.id]} onChange={(v) => onChange(p.id, v)} />
          ))}
        </div>
      )}
    </section>
  );
}

export function ParamForm({ groups, values, onChange }: Props) {
  return (
    <div className="param-form">
      {groups.map((g) => (
        <Group key={g.id} group={g} groups={groups} values={values} onChange={onChange} />
      ))}
    </div>
  );
}
