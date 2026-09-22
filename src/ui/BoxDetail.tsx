import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toDXF, toSVG } from '../engine/export';
import { findGenerator } from '../generators';
import { defaultValues, type BoxModel, type GeneratorDef, type ParamValue, type ParamValues } from '../generators/types';
import { BoxViewer } from '../viewer/BoxViewer';
import { formatSections, ParamForm, parseSections } from './ParamForm';
import { SheetPreview } from './SheetPreview';

function valuesFromSearch(def: GeneratorDef, sp: URLSearchParams): ParamValues {
  const v = defaultValues(def);
  for (const g of def.groups) {
    for (const p of g.params) {
      const raw = sp.get(p.id);
      if (raw === null) continue;
      if (p.type === 'number') {
        const n = parseFloat(raw);
        if (!isNaN(n)) v[p.id] = n;
      } else if (p.type === 'boolean') v[p.id] = raw === '1' || raw === 'true';
      else if (p.type === 'sections') {
        const s = parseSections(raw);
        if (s.length) v[p.id] = s;
      } else v[p.id] = raw;
    }
  }
  return v;
}

function searchFromValues(def: GeneratorDef, v: ParamValues): URLSearchParams {
  const sp = new URLSearchParams();
  const defaults = defaultValues(def);
  for (const g of def.groups) {
    for (const p of g.params) {
      const val = v[p.id];
      const d = defaults[p.id];
      if (JSON.stringify(val) === JSON.stringify(d)) continue;
      if (Array.isArray(val)) sp.set(p.id, formatSections(val));
      else if (typeof val === 'boolean') sp.set(p.id, val ? '1' : '0');
      else sp.set(p.id, String(val));
    }
  }
  return sp;
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BoxDetail() {
  const { id } = useParams();
  const def = findGenerator(id);
  if (!def) {
    return (
      <main className="detail">
        <p>Unknown box “{id}”.</p>
        <Link to="/">Back to the catalog</Link>
      </main>
    );
  }
  return <BoxDetailInner def={def} />;
}

function BoxDetailInner({ def }: { def: GeneratorDef }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [values, setValues] = useState<ParamValues>(() => valuesFromSearch(def, searchParams));
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [explode, setExplode] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);

  // keep the URL shareable (debounced)
  useEffect(() => {
    const h = setTimeout(() => setSearchParams(searchFromValues(def, values), { replace: true }), 300);
    return () => clearTimeout(h);
  }, [def, values, setSearchParams]);

  const onChange = useCallback((pid: string, value: ParamValue) => setValues((v) => ({ ...v, [pid]: value })), []);

  const { model, error } = useMemo<{ model: BoxModel | null; error: string | null }>(() => {
    try {
      return { model: def.build(values), error: null };
    } catch (e) {
      return { model: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [def, values]);

  const [lastGood, setLastGood] = useState<BoxModel | null>(null);
  useEffect(() => {
    if (model) setLastGood(model);
  }, [model]);
  const shown = model ?? lastGood;

  const exportSVG = () => shown && download(`${def.id}.svg`, toSVG(shown.parts, { burn: shown.burn }), 'image/svg+xml');
  const exportDXF = () => shown && download(`${def.id}.dxf`, toDXF(shown.parts, { burn: shown.burn }), 'application/dxf');

  return (
    <main className="detail">
      <header className="detail-header">
        <Link to="/" className="back" aria-label="Back to catalog">
          ←
        </Link>
        <div className="detail-title">
          <h1>{def.name}</h1>
          <span className="badge">{def.category}</span>
        </div>
        <div className="view-toggle" role="tablist">
          <button type="button" role="tab" aria-selected={view === '3d'} className={view === '3d' ? 'active' : ''} onClick={() => setView('3d')}>
            3D
          </button>
          <button type="button" role="tab" aria-selected={view === '2d'} className={view === '2d' ? 'active' : ''} onClick={() => setView('2d')}>
            Sheet
          </button>
        </div>
      </header>

      <div className="detail-body">
        <section className="preview" aria-label="Preview">
          {shown && view === '3d' && <BoxViewer model={shown} explode={explode} className="viewer" />}
          {shown && view === '2d' && <SheetPreview model={shown} />}
          {!shown && <div className="viewer-empty">Cannot build the box: {error}</div>}
          {view === '3d' && (
            <label className="explode">
              <span>Explode</span>
              <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(parseFloat(e.target.value))} />
            </label>
          )}
          {error && shown && <div className="error-banner">{error}</div>}
          {shown && (
            <div className="dims">
              Outside: {shown.size.x.toFixed(1)} × {shown.size.y.toFixed(1)} × {shown.size.z.toFixed(1)} mm
            </div>
          )}
        </section>

        <aside className={`panel ${panelOpen ? 'open' : ''}`}>
          <div className="panel-handle">
            <button type="button" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen}>
              {panelOpen ? 'Hide options' : 'Options'}
            </button>
            <div className="export">
              <button type="button" className="primary" onClick={exportSVG} disabled={!shown}>
                SVG
              </button>
              <button type="button" onClick={exportDXF} disabled={!shown}>
                DXF
              </button>
            </div>
          </div>
          <p className="desc">{def.description}</p>
          <ParamForm groups={def.groups} values={values} onChange={onChange} />
          <div className="panel-footer">
            <button type="button" className="link" onClick={() => setValues(defaultValues(def))}>
              Reset to defaults
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
