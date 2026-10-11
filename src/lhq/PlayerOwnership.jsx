import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LEFA, LEAGUE_LABELS, OWNERSHIP_STATES, OWNERSHIP_SYMBOLS, OWNERSHIP_LABELS, ownershipFiltersActive, ownershipSummary, OWNERSHIP_MAX_AGE } from './ownershipModel.js';
import './PlayerOwnership.css';

export function OwnershipCells({ row, ownership }) {
  const { states, all } = ownership.statesFor(row);
  const values = { ...states, A: ownershipSummary(all) };
  return <span className="lefa-cells">{LEFA.map(letter => <span key={letter} className={`lefa-symbol lefa-${values[letter]}`} title={`${LEAGUE_LABELS[letter]}: ${OWNERSHIP_LABELS[values[letter]]}${letter === 'A' ? ` (${ownership.leagues.length} discovered leagues)` : ''}`} aria-label={`${LEAGUE_LABELS[letter]}: ${OWNERSHIP_LABELS[values[letter]]}`}>{OWNERSHIP_SYMBOLS[values[letter]]}</span>)}</span>;
}

export function OwnershipHeader({ filters, setFilters, clear, ownership, onSort, sortScope, sort }) {
  const [open, setOpen] = useState(null), [point, setPoint] = useState({ left: 0, top: 0 });
  const menu = useRef(null), trigger = useRef(null);
  const close = () => { setOpen(null); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('button,select,input')?.focus();
    const outside = event => { if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(null); };
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const items = [...(menu.current?.querySelectorAll('button:not(:disabled),select,input') || [])];
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    };
    const moved = event => { if (!menu.current?.contains(event.target)) setOpen(null); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key);
    window.addEventListener('resize', moved); window.addEventListener('scroll', moved, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); window.removeEventListener('resize', moved); window.removeEventListener('scroll', moved, true); };
  }, [open]);
  const show = (letter, button) => {
    if (open === letter) { close(); return; }
    trigger.current = button;
    const rect = button.getBoundingClientRect();
    setPoint({ left: Math.max(4, Math.min(rect.right - 156, window.innerWidth - 160)), top: Math.max(4, Math.min(rect.bottom + 3, window.innerHeight - 260)) });
    setOpen(letter);
  };
  return <div className="lefa-header" onMouseDown={e => e.stopPropagation()}>
    <button type="button" className="lefa-clear" disabled={!ownershipFiltersActive(filters) && filters.mode === 'every'} onClick={() => { clear(); setOpen(null); }}>Clear All</button>
    <div className="lefa-letters">{LEFA.map(letter => <button type="button" key={letter} className={filters[letter].length < 3 ? 'lefa-active' : ''} aria-label={`Filter ${LEAGUE_LABELS[letter]} ownership`} aria-haspopup="dialog" aria-expanded={open === letter} title={LEAGUE_LABELS[letter]} onClick={e => show(letter, e.currentTarget)}><b>{letter}</b><span aria-hidden="true">▾</span></button>)}</div>
    {open && createPortal(<section ref={menu} role="dialog" aria-label={`${LEAGUE_LABELS[open]} ownership filter`} className="lefa-menu" style={point}>
      <header><strong>{LEAGUE_LABELS[open]}</strong><button type="button" aria-label="Close ownership filter" onClick={close}>×</button></header>
      {open === 'A' ? <div className="lefa-mode" aria-label="League matching">{['every', 'any'].map(mode => <button type="button" key={mode} aria-pressed={filters.mode === mode} onClick={() => setFilters(f => ({ ...f, mode }))}>{mode === 'every' ? 'Every league' : 'Any league'}</button>)}</div> : <select aria-label={`Yahoo league for ${open}`} value={ownership.mapping[open] || ''} onChange={e => ownership.assign(open, e.target.value)}><option value="">Choose league…</option>{ownership.leagues.map(league => <option key={league.key} value={league.key}>{league.name}</option>)}</select>}
      <div className="lefa-choices">{OWNERSHIP_STATES.map(state => <label key={state}><input type="checkbox" checked={filters[open].includes(state)} onChange={e => setFilters(f => ({ ...f, [open]: e.target.checked ? [...f[open], state] : f[open].filter(s => s !== state) }))}/><span className={`lefa-symbol lefa-${state}`}>{OWNERSHIP_SYMBOLS[state]}</span><span>{OWNERSHIP_LABELS[state]}</span></label>)}</div>
      <div className="lefa-menu-actions"><button type="button" onClick={() => setFilters(f => ({ ...f, [open]: [...OWNERSHIP_STATES] }))}>All</button><button type="button" onClick={() => setFilters(f => ({ ...f, [open]: [] }))}>None</button></div>
      <div className="lefa-sort">{[true, false].map(desc => <button type="button" key={String(desc)} aria-pressed={sort.key === 'league_ownership' && sortScope === open && sort.desc === desc} onClick={() => onSort(open, desc)}>{desc ? '★ first ↓' : '○ first ↑'}</button>)}</div>
    </section>, document.body)}
  </div>;
}

export function OwnershipStatus({ ownership, known, total }) {
  const stale = ownership.oldest && Date.now() - ownership.oldest > OWNERSHIP_MAX_AGE;
  return <span className="lefa-status" role="status">
    {!ownership.connected ? <a href="#/yahoo">Connect Yahoo · ownership ?</a> : <>
      <span title="Current Yahoo ownership, independent of the selected statistics weeks. ★ mine · ● owned by others · ○ unowned · ? unknown · ≋ mixed. Active ownership filters exclude unknown observations unless all three statuses are selected.">Yahoo {ownership.loading ? 'loading' : stale ? 'stale' : 'ownership'} · {known}/{total} fully checked{!ownership.loading && !ownership.complete ? ' · partial' : ''}{ownership.oldest ? ` · ${new Date(ownership.oldest).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
      <button type="button" disabled={ownership.loading} onClick={ownership.refresh}>Refresh ownership</button>
      {['L', 'E', 'F'].some(k => !ownership.mapping[k]) && <span>Choose missing leagues in L/E/F</span>}
      {ownership.error && <span className="lefa-error">{ownership.error}</span>}
    </>}
  </span>;
}
