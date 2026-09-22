import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { generators } from '../generators';
import { defaultValues, type GeneratorDef } from '../generators/types';
import { renderThumbnails, THUMB_ANGLES } from '../viewer/thumbnails';

const cache = new Map<string, string[]>();

function useThumbnails(defs: GeneratorDef[]): Map<string, string[]> {
  const [, bump] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const queue = defs.filter((d) => !cache.has(d.id));
    const step = () => {
      if (cancelled) return;
      const def = queue.shift();
      if (!def) return;
      try {
        const model = def.build(defaultValues(def));
        cache.set(def.id, renderThumbnails(model, 320));
      } catch (e) {
        console.error(`thumbnail for ${def.id} failed`, e);
        cache.set(def.id, []);
      }
      bump((n) => n + 1);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return () => {
      cancelled = true;
    };
  }, [defs]);
  return cache;
}

function Card({ def, thumbs }: { def: GeneratorDef; thumbs: string[] | undefined }) {
  const [active, setActive] = useState(0);
  return (
    <Link to={`/box/${def.id}`} className="card">
      <div className="card-main">
        {thumbs && thumbs[active] ? (
          <img src={thumbs[active]} alt={`${def.name} seen from the ${THUMB_ANGLES[active].name}`} />
        ) : (
          <div className="thumb-placeholder" aria-hidden />
        )}
      </div>
      <div className="card-angles" onClick={(e) => e.preventDefault()}>
        {THUMB_ANGLES.map((a, i) => (
          <button
            type="button"
            key={a.name}
            className={i === active ? 'active' : ''}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActive(i);
            }}
            aria-label={`View from ${a.name}`}
          >
            {thumbs && thumbs[i] ? <img src={thumbs[i]} alt="" /> : <span className="thumb-placeholder" />}
          </button>
        ))}
      </div>
      <div className="card-body">
        <div className="card-title">
          {def.name} <span className="badge">{def.category}</span>
        </div>
        <p className="card-desc">{def.description}</p>
      </div>
    </Link>
  );
}

export function Catalog() {
  const [query, setQuery] = useState('');
  const defs = useMemo(() => generators, []);
  const thumbs = useThumbnails(defs);
  const q = query.trim().toLowerCase();
  const filtered = defs.filter(
    (d) => !q || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q) || d.category.toLowerCase().includes(q),
  );
  return (
    <main className="catalog">
      <header className="catalog-header">
        <div>
          <h1>BoxMaker</h1>
          <p className="tagline">Laser-cut box generator. Everything runs in your browser - nothing is uploaded.</p>
        </div>
        <input
          type="search"
          placeholder="Search boxes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search boxes"
        />
      </header>
      <div className="card-grid">
        {filtered.map((d) => (
          <Card key={d.id} def={d} thumbs={thumbs.get(d.id)} />
        ))}
        {filtered.length === 0 && <p className="empty">No generator matches “{query}”.</p>}
      </div>
      <footer className="footer">
        Geometry engine ported from{' '}
        <a href="https://github.com/florianfesti/boxes" target="_blank" rel="noreferrer">
          boxes.py
        </a>{' '}
        by Florian Festi (GPL-3.0).
      </footer>
    </main>
  );
}
