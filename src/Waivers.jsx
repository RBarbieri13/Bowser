import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowClockwise, CaretDown, CaretRight, MagnifyingGlass, Star, X } from '@phosphor-icons/react';
import { DEFAULT_PREFS, GROUPS, TREND_OPTIONS, WAIVER_PREFS_KEY, columnValue, faabValue, favoriteKey, filterWaiverRows, finite, formatFAAB, playerKey, readJSON, saveJSON, sortWaiverRows, validateFavorites, validatePreferences, waiverColumns } from './waiverTable.js';
import './Waivers.css';
import { TrendChart, TrendMetricSelect } from './TrendChart.jsx';
import { PageControls } from './PageControls.jsx';

const fmt = value => finite(value) === null ? '' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date not supplied';
const basis = value => value === 'annual' ? 'annual budget' : value === 'remaining' ? 'remaining budget' : 'budget basis unspecified';
const safeURL = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
const blankRange = kind => ({ kind, source: '', min: '', max: '', unit: 'percent' });

function sourceTitle(source, entry, kind) {
  return [source.label, stamp(entry?.publishedAt || source.publishedAt), kind === 'faab' ? `${formatFAAB(faabValue(entry)) || 'Bid not reported'} · ${basis(entry?.budgetBasis)}${finite(entry?.referenceBudget) !== null ? ` · source reference $${entry.referenceBudget}` : ''}` : `Positional waiver rank · ${entry?.method || source.rankMethod || 'Publisher order'}`, ...(Array.isArray(entry?.alternatives) ? entry.alternatives.map(alternative => `${alternative.label || alternative.tier || 'Alternative'}: ${formatFAAB(faabValue(alternative))} · ${basis(alternative.budgetBasis || entry.budgetBasis)}`) : []), entry?.overallRank ? `Original overall priority: ${entry.overallRank}` : '', source.coverageNote || '', entry?.scoring || source.scoring ? `Scoring: ${entry?.scoring || source.scoring}` : 'Scoring not specified', kind === 'faab' ? entry?.url || source.faabUrl : entry?.url || source.rankUrl].filter(Boolean).join('\n');
}


function FavoriteCard({ item, onChange, onRemove, onOpen }) {
  const [bid, setBid] = useState(item.bid === null ? '' : String(item.bid));
  const invalid = bid !== '' && (!Number.isFinite(Number(bid)) || Number(bid) < 0 || Number(bid) > 100000);
  useEffect(() => setBid(item.bid === null ? '' : String(item.bid)), [item.id, item.bid]);
  function changeBid(value) {
    setBid(value);
    if (value === '' || Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100000) onChange({ bid: value === '' ? null : Number(value) });
  }
  return <article className="wv-favorite-card">
    <div><button className="wv-favorite-name" onClick={onOpen}>{item.name}</button><button aria-label={`Remove ${item.name} from Favorites`} onClick={onRemove}><X /></button></div>
    <small>{item.position} · {item.team}</small>
    <label>My bid · $<input aria-label={`Personal bid for ${item.name}`} inputMode="decimal" value={bid} onChange={event => changeBid(event.target.value)} aria-invalid={invalid} placeholder="No bid" /></label>
    {invalid && <p className="wv-field-error" role="alert">Enter a number from $0 to $100,000. Invalid bids are not saved.</p>}
    <textarea aria-label={`Notes for ${item.name}`} maxLength={1000} value={item.notes} placeholder="Your notes…" onChange={event => onChange({ notes: event.target.value })} />
  </article>;
}

export function Waivers({ season = 2026, onOpenPlayer }) {
  const [prefs, setPrefs] = useState(() => validatePreferences(readJSON(WAIVER_PREFS_KEY)));
  const [week, setWeek] = useState(2);
  const [startWeek, setStartWeek] = useState(1), [endWeek, setEndWeek] = useState(1);
  const [scoring, setScoring] = useState('ppr');
  const [data, setData] = useState(null), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0), [storageError, setStorageError] = useState(false);
  const [search, setSearch] = useState(''), [position, setPosition] = useState('All'), [team, setTeam] = useState('All');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [ranges, setRanges] = useState([blankRange('rank'), blankRange('faab')]);
  const [display, setDisplay] = useState('native'), [budgets, setBudgets] = useState({ annual: 100, remaining: null });
  const favoritesKey = favoriteKey(season, week);
  const [saved, setSaved] = useState(() => ({ key: favoritesKey, items: validateFavorites(readJSON(favoritesKey)) }));
  const favorites = saved.key === favoritesKey ? saved.items : [];
  const favoriteIds = useMemo(() => favorites.map(item => item.id), [favorites]);
  const tableRef = useRef(null);
  const resizeCleanup = useRef(null);
  const weeks = Array.from({ length: endWeek - startWeek + 1 }, (_, index) => startWeek + index).join(',');
  useEffect(() => { setStorageError(!saveJSON(WAIVER_PREFS_KEY, prefs)); }, [prefs]);
  useEffect(() => { setSaved({ key: favoritesKey, items: validateFavorites(readJSON(favoritesKey)) }); }, [favoritesKey]);
  useEffect(() => () => resizeCleanup.current?.(), []);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setBusy(true); setError(''); setData(null);
    fetch(`/api/v1/waivers?season=${season}&week=${week}&weeks=${weeks}&scoring=${scoring}&trendWeeks=${prefs.trendWeeks || 10}`, { signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok || body.error) throw new Error(body.error?.message || (typeof body.error === 'string' ? body.error : `Request failed (${response.status})`)); if (!Array.isArray(body.rows) || !body.meta) throw new Error('Invalid waiver response'); return body; })
      .then(body => { if (active) setData(body); })
      .catch(cause => { if (active && cause.name !== 'AbortError') setError(cause.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; controller.abort(); };
  }, [season, week, weeks, scoring, refresh, prefs.trendWeeks]);
  const sources = data?.meta?.sources || [];
  const columns = useMemo(() => waiverColumns(sources, prefs.trendMetrics), [sources, prefs.trendMetrics]);
  const allRows = data?.rows || [];
  const groups = GROUPS.map(([key, label]) => ({ key, label, columns: columns.filter(column => column.group === key && (column.required || !prefs.hidden.includes(column.key))) })).filter(group => group.columns.length);
  const visible = groups.flatMap(group => prefs.collapsed.includes(group.key) && group.key !== 'identity' ? [{ key: `collapsed:${group.key}`, group: group.key, width: 38, kind: 'collapsed', label: group.label }] : group.columns);
  const rows = useMemo(() => sortWaiverRows(filterWaiverRows(allRows, { search, position, team, favoriteOnly, favorites: favoriteIds, ranges }), prefs.sorts, columns, favoriteIds), [allRows, search, position, team, favoriteOnly, favoriteIds, ranges, prefs.sorts, columns]);
  const teams = [...new Set(allRows.map(row => row.team).filter(Boolean))].sort();
  const publishedWeeks = [...new Set([week, ...(data?.meta?.availableWeeks || [])])].sort((a, b) => a - b);
  const availableStatsWeeks = [...new Set([startWeek, endWeek, ...(data?.meta?.statsWeeks || Array.from({ length: 22 }, (_, index) => index + 1))])].sort((a, b) => a - b);
  const rankCount = sources.filter(source => source.rankCount > 0).length, faabCount = sources.filter(source => source.faabCount > 0 && source.type !== 'community').length, communityCount = sources.filter(source => source.faabCount > 0 && source.type === 'community').length;
  function updateFavorites(next) { setSaved({ key: favoritesKey, items: next }); setStorageError(!saveJSON(favoritesKey, next)); }
  function toggleFavorite(row) {
    const id = playerKey(row);
    updateFavorites(favoriteIds.includes(id) ? favorites.filter(item => item.id !== id) : [...favorites, { id, profileId: row.playerId || null, name: row.name, position: row.position, team: row.team, bid: null, notes: '' }]);
  }
  function setPref(key, value) { setPrefs(old => ({ ...old, [key]: value })); }
  function toggleGroup(key) { setPrefs(old => ({ ...old, collapsed: old.collapsed.includes(key) ? old.collapsed.filter(item => item !== key) : [...old.collapsed, key] })); }
  function sortBy(column, additive) {
    setPrefs(old => {
      const current = old.sorts.find(sort => sort.key === column.key);
      const next = { key: column.key, desc: current ? !current.desc : !['rank', 'identity'].includes(column.kind) };
      return { ...old, sorts: additive ? [...old.sorts.filter(sort => sort.key !== column.key), next].slice(-5) : [next] };
    });
  }
  function textValue(row, column) {
    if (column.kind === 'faab') return formatFAAB(faabValue(row.faab?.[column.source.id], display, budgets));
    const value = columnValue(row, column, favoriteIds);
    if (value === null) return '';
    if (column.kind === 'identity') return String(value);
    return `${column.percent ? Math.round(value) : fmt(value)}${column.percent ? '%' : ''}`;
  }
  function widthFor(column) {
    if (column.kind === 'collapsed') return 38;
    if (prefs.autoFit && !['trend', 'favorite'].includes(column.kind)) {
      const longest = Math.max(column.label.length, ...rows.map(row => textValue(row, column).length));
      return Math.max(column.width, Math.min(420, Math.ceil(longest * (column.kind === 'identity' ? 7 : 7.2) + 30)));
    }
    return prefs.widths[column.key] || column.width;
  }
  const widths = Object.fromEntries(visible.map(column => [column.key, widthFor(column)]));
  const offsets = {}; let left = 0;
  visible.filter(column => column.group === 'identity').forEach(column => { offsets[column.key] = left; left += widths[column.key]; });
  function resize(event, column) {
    event.preventDefault(); event.stopPropagation(); resizeCleanup.current?.();
    const x = event.clientX, initial = widths[column.key];
    const move = moveEvent => setPrefs(old => ({ ...old, autoFit: false, widths: { ...old.widths, [column.key]: Math.max(column.group === 'identity' && column.key === 'name' ? 130 : 44, Math.min(420, initial + moveEvent.clientX - x)) } }));
    const done = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', done); resizeCleanup.current = null; };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', done); resizeCleanup.current = done;
  }
  function cell(row, column) {
    if (column.kind === 'collapsed') return null;
    if (column.kind === 'favorite') return <button className="wv-star" aria-label={`${favoriteIds.includes(playerKey(row)) ? 'Unfavorite' : 'Favorite'} ${row.name}`} aria-pressed={favoriteIds.includes(playerKey(row))} onClick={() => toggleFavorite(row)}><Star weight={favoriteIds.includes(playerKey(row)) ? 'fill' : 'regular'} /></button>;
    if (column.key === 'name') return <button className="wv-player" onClick={event => onOpenPlayer?.({ ...row, player_id: row.playerId, player_display_name: row.name, season }, event.currentTarget, scoring)} title={`Open ${row.name} player details`}>{row.name}</button>;
    if (column.kind === 'trend') return <TrendChart history={row.stats?.trends || []} metric={column.metric} domain={data?.meta?.trendDomains?.[column.metric]} playerName={row.name} height={20} />;
    if (column.kind === 'rank' || column.kind === 'faab') {
      const entry = row[column.kind === 'rank' ? 'rankings' : 'faab']?.[column.source.id];
      const url = safeURL(entry?.url || (column.kind === 'rank' ? column.source.rankUrl : column.source.faabUrl));
      const title = sourceTitle(column.source, entry, column.kind);
      const text = textValue(row, column);
      const value = column.kind === 'faab' ? faabValue(entry, display, budgets) : null;
      const content = <>{text}{column.kind === 'faab' && text && <small>{value?.converted ? 'converted · ' : ''}{entry.budgetBasis === 'annual' ? 'annual' : entry.budgetBasis === 'remaining' ? 'remaining' : 'basis unknown'}</small>}</>;
      return text ? url ? <a className="wv-source-value" title={title} href={url} target="_blank" rel="noreferrer">{content}</a> : <span className="wv-source-value" title={title}>{content}</span> : <span className="wv-blank" title={`${title}\nNot reported or not confidently matched`} />;
    }
    if (column.key === 'position_finish') return <span title={`${row.stats?.position_finish_season || season} Week ${row.stats?.position_finish_week ?? 'unavailable'} · ${scoring.toUpperCase()} fantasy finish among all NFL ${row.position} peers; ties share rank`}>{row.stats?.position_finish == null ? '—' : `${row.position}${row.stats.position_finish}`}</span>;
    const activity = row.activity;
    const title = column.kind === 'activity' ? `${['adds', 'drops'].includes(column.key) ? activity?.addsSource || activity?.source || 'Transaction source not supplied' : activity?.ownershipSource || activity?.source || 'Ownership source not supplied'} · ${stamp((['adds', 'drops'].includes(column.key) ? activity?.addsCapturedAt : activity?.ownershipCapturedAt) || activity?.capturedAt)}${activity?.windowHours && ['adds', 'drops'].includes(column.key) ? ` · rolling ${activity.windowHours} hours` : ''}` : `${column.label} · ${data?.meta?.statsSeason || season} weeks ${startWeek}–${endWeek}${column.key === 'fantasy_points' ? ` · cumulative ${scoring.toUpperCase()}` : ''}`;
    return <span title={title}>{textValue(row, column)}</span>;
  }

  return <main className={`page-content waivers wv-${prefs.density}`}>
    <PageControls title="Waivers" summary={<><span>{season} · waiver W{week} · stats W{startWeek}{endWeek !== startWeek ? `–${endWeek}` : ''} · {scoring.toUpperCase()}</span><span role="status">{busy ? 'Loading…' : `${rows.length} / ${allRows.length} players`}</span>{(search || position !== 'All' || team !== 'All' || favoriteOnly || ranges.some(range => range.source && (range.min !== '' || range.max !== ''))) && <span className="wv-active-filters">{[search && `“${search}”`, position !== 'All' && position, team !== 'All' && team, favoriteOnly && 'Saved only', ranges.some(range => range.source && (range.min !== '' || range.max !== '')) && 'Source ranges'].filter(Boolean).join(' · ')}</span>}</>} actions={<><button aria-label="Refresh waiver data" onClick={() => setRefresh(value => value + 1)} disabled={busy}><ArrowClockwise />{busy ? 'Loading…' : 'Refresh'}</button><button aria-expanded={prefs.drawer} aria-controls="wv-favorites" onClick={() => setPref('drawer', !prefs.drawer)}><Star /> Favorites <b>{favorites.length}</b></button></>} notices={<>
    {error && <div className="wv-alert" role="alert">Waiver data unavailable: {error}. Use Refresh to retry.</div>}
    {storageError && <div className="wv-alert" role="alert">Browser storage unavailable. Your latest preferences and Favorites may not survive closing this page.</div>}
    </>}>
    <section className="wv-controls" aria-label="Waiver and statistics selection">
      <label>Waiver week<select aria-label="Waiver week" value={week} onChange={event => setWeek(Number(event.target.value))}>{publishedWeeks.map(value => <option key={value} value={value}>Week {value}</option>)}</select></label>
      <span className="wv-control-divider" />
      <span className="wv-range-label">{data?.meta?.statsSeason || season} stats</span>
      <label>From<select aria-label="Statistics start week" value={startWeek} onChange={event => { const value = Number(event.target.value); setStartWeek(value); if (value > endWeek) setEndWeek(value); }}>{availableStatsWeeks.map(value => <option key={value} value={value}>W{value}</option>)}</select></label>
      <label>Through<select aria-label="Statistics end week" value={endWeek} onChange={event => { const value = Number(event.target.value); setEndWeek(value); if (value < startWeek) setStartWeek(value); }}>{availableStatsWeeks.map(value => <option key={value} value={value}>W{value}</option>)}</select></label>
      <label>Scoring<select aria-label="Waiver scoring" value={scoring} onChange={event => setScoring(event.target.value)}><option value="ppr">PPR</option><option value="half">Half PPR</option><option value="standard">Standard</option></select></label>
      <a className="wv-research-link" href="/research/waiver-desk-2026-week1/week1-waiver-desk.html" target="_blank" rel="noreferrer">Research desk ↗</a><span className="wv-capture">Captured {stamp(data?.meta?.capturedAt)}</span>
    </section>

        <div className="wv-toolbar">
          <label className="wv-search"><MagnifyingGlass /><input aria-label="Search waiver players" placeholder="Search players, teams…" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label>Pos<select aria-label="Waiver position" value={position} onChange={event => setPosition(event.target.value)}>{['All', 'QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'DST'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Team<select aria-label="Waiver team" value={team} onChange={event => setTeam(event.target.value)}><option>All</option>{teams.map(value => <option key={value}>{value}</option>)}</select></label>
          <button aria-pressed={favoriteOnly} onClick={() => setFavoriteOnly(value => !value)}><Star />Saved only</button>
        </div>
        <section className="wv-filter-panel" aria-label="Source range filters">
          {ranges.map((range, index) => <div key={range.kind}><strong>{range.kind === 'rank' ? 'Positional rank' : 'FAAB · lower bound'}</strong><select aria-label={`${range.kind} filter source`} value={range.source} onChange={event => setRanges(old => old.map((item, i) => i === index ? { ...item, source: event.target.value } : item))}><option value="">Any source</option>{sources.filter(source => source[range.kind === 'rank' ? 'rankCount' : 'faabCount'] > 0).map(source => <option value={source.id} key={source.id}>{source.label}</option>)}</select>{range.kind === 'faab' && <select aria-label="FAAB filter unit" value={range.unit} onChange={event => setRanges(old => old.map((item, i) => i === index ? { ...item, unit: event.target.value } : item))}><option value="percent">Native %</option><option value="dollars">Native $</option></select>}{['min', 'max'].map(bound => <input key={bound} type="number" min="0" aria-label={`${range.kind} ${bound}`} placeholder={bound === 'min' ? 'Min' : 'Max'} value={range[bound]} onChange={event => setRanges(old => old.map((item, i) => i === index ? { ...item, [bound]: event.target.value } : item))} />)}</div>)}
          <button onClick={() => { setRanges([blankRange('rank'), blankRange('faab')]); setSearch(''); setPosition('All'); setTeam('All'); setFavoriteOnly(false); }}>Clear filters</button><small>Each filter uses that publisher's reported value. Missing values are excluded when a range is active.</small>
        </section>
        <details className="wv-settings"><summary>Table columns &amp; density</summary><section aria-label="Waiver table settings">
          <div className="wv-settings-toolbar"><label>Density<select aria-label="Waiver row density" value={prefs.density} onChange={event => setPref('density', event.target.value)}><option value="compact">Compact · 35 px</option><option value="comfortable">Comfortable · 44 px</option></select></label><button aria-pressed={prefs.autoFit} onClick={() => setPref('autoFit', !prefs.autoFit)}>Auto Fit</button><button onClick={() => setPrefs({ ...DEFAULT_PREFS })}>Reset table</button><small>Click headers to sort. Shift-click adds a sort; up to five. Drag column edges to resize.</small></div>
          <div className="wv-column-settings">{GROUPS.filter(([key]) => key !== 'identity').map(([key, label]) => <fieldset key={key}><legend>{label}</legend>{columns.filter(column => column.group === key).map(column => <label key={column.key}><input type="checkbox" checked={!prefs.hidden.includes(column.key)} onChange={event => setPref('hidden', event.target.checked ? prefs.hidden.filter(item => item !== column.key) : [...prefs.hidden, column.key])} />{column.label}</label>)}</fieldset>)}</div>
        </section></details>
        <div className="wv-trend-settings">{Object.keys(TREND_OPTIONS).map(group=><label key={group}>{group[0].toUpperCase()+group.slice(1)} trend<TrendMetricSelect label={`${group[0].toUpperCase()+group.slice(1)} trend metric`} metric={prefs.trendMetrics[group]} onChange={value=>setPref('trendMetrics',{...prefs.trendMetrics,[group]:value})}/></label>)}<label>History<select aria-label="Waiver trend history" value={prefs.trendWeeks||10} onChange={event=>setPref('trendWeeks',Number(event.target.value))}>{[5,8,10,18].map(n=><option key={n} value={n}>{n} calendar weeks</option>)}</select></label></div>
        <div className="wv-table-meta"><div><label>FAAB display<select aria-label="FAAB display" value={display} onChange={event => setDisplay(event.target.value)}><option value="native">Publisher units</option><option value="percent">Percent</option><option value="dollars">Dollars</option></select></label>{display === 'dollars' && <><label>Annual $<input aria-label="Annual FAAB budget" type="number" min="1" max="100000" value={budgets.annual ?? ''} onChange={event => setBudgets(old => ({ ...old, annual: event.target.value === '' ? null : Number(event.target.value) }))} /></label><label>Remaining $<input aria-label="Remaining FAAB budget" type="number" min="1" max="100000" value={budgets.remaining ?? ''} onChange={event => setBudgets(old => ({ ...old, remaining: event.target.value === '' ? null : Number(event.target.value) }))} /></label></>}</div><span>{prefs.sorts.map((sort, index) => `${index + 1}. ${columns.find(column => column.key === sort.key)?.label || sort.key} ${sort.desc ? '↓' : '↑'}`).join(' · ')}</span></div>
    <div className="wv-provenance"><span>{rankCount} rank sources · {faabCount} expert FAAB sources{communityCount > 0 ? ` · ${communityCount} community source` : ''}{data?.meta?.supplementRecordedAt ? ` · additional research ${stamp(data.meta.supplementRecordedAt)}` : ''}</span><span>Blank = not reported / unmatched · FPTS = selected-week total · Trend bars = aligned regular-season weeks · Expert ranks within position{data?.meta?.positionFinish?.week ? ` · POS FIN = ${data.meta.positionFinish.season} W${data.meta.positionFinish.week} ${scoring.toUpperCase()} NFL finish` : ""}</span></div>
    <details className="wv-source-notes"><summary>Sources, budget conversions &amp; coverage</summary><p>Rank columns retain each publisher's within-position order; a source may cover only part of the waiver pool. These are waiver priorities, not season rankings. FAAB ranges retain the publisher's units and annual or remaining budget basis. Percent-to-dollar conversion uses the matching budget entered above; dollar-to-percent requires a source reference budget. Unspecified budget bases stay in publisher units. Converted values are labeled. Personal bids are independent of source recommendations.</p><div>{sources.map(source => <p key={source.id}><strong>{source.label}</strong> · {stamp(source.publishedAt)} · {source.rankCount || 0} ranks / {source.faabCount || 0} bids{source.coverageNote ? ` · ${source.coverageNote}` : ''} {safeURL(source.rankUrl) && <a href={safeURL(source.rankUrl)} target="_blank" rel="noreferrer">Rank source ↗</a>} {safeURL(source.faabUrl) && <a href={safeURL(source.faabUrl)} target="_blank" rel="noreferrer">FAAB source ↗</a>}</p>)}</div></details>
    </PageControls>
    <div className={`wv-layout${prefs.drawer ? ' with-favorites' : ''}`}>
      <section className="wv-workspace">
        <div className="wv-table-scroll" ref={tableRef} role="region" aria-label="Waiver research table" tabIndex={0}>
          <table style={{ width: visible.reduce((sum, column) => sum + widths[column.key], 0) }}><caption className="sr-only">Waiver research. Independent positional ranks and FAAB bids, real market activity, and cumulative selected-week statistics. Empty cells are unknown.</caption><colgroup>{visible.map(column => <col key={column.key} style={{ width: widths[column.key] }} />)}</colgroup>
            <thead><tr className="wv-groups">{groups.map(group => <th key={group.key} scope="colgroup" colSpan={prefs.collapsed.includes(group.key) && group.key !== 'identity' ? 1 : group.columns.length} className={`wv-group-${group.key}${group.key === 'identity' ? ' wv-sticky' : ''}`} style={group.key === 'identity' ? { left: 0 } : undefined}>{group.key === 'identity' ? group.label : <button title={`${prefs.collapsed.includes(group.key) ? 'Expand' : 'Collapse'} ${group.label}`} aria-label={`${prefs.collapsed.includes(group.key) ? 'Expand' : 'Collapse'} ${group.label}`} onClick={() => toggleGroup(group.key)}>{prefs.collapsed.includes(group.key) ? <CaretRight /> : <CaretDown />}{!prefs.collapsed.includes(group.key) && group.label}</button>}</th>)}</tr>
              <tr>{visible.map(column => { const active = prefs.sorts.find(sort => sort.key === column.key); return <th key={column.key} scope="col" className={`${column.group === 'identity' ? 'wv-sticky ' : ''}wv-group-${column.group}`} style={column.group === 'identity' ? { left: offsets[column.key] } : undefined} aria-sort={active ? active.desc ? 'descending' : 'ascending' : 'none'}>{column.kind === 'collapsed' ? <button className="wv-expand-rail" title={`Expand ${column.label}`} aria-label={`Expand ${column.label} columns`} onClick={() => toggleGroup(column.group)}>···</button> : <><button aria-label={`Sort ${column.group === 'identity' ? '' : `${GROUPS.find(([key]) => key === column.group)?.[1]} `}${column.key === 'favorite' ? 'Favorites' : column.label}`} title={column.source ? sourceTitle(column.source, null, column.kind) : `Sort ${column.label}. Shift-click to add another sort.`} onClick={event => sortBy(column, event.shiftKey)}>{column.label}{active && <sup>{active.desc ? '↓' : '↑'}{prefs.sorts.length > 1 ? prefs.sorts.indexOf(active) + 1 : ''}</sup>}</button><span className="wv-resizer" role="separator" aria-label={`Resize ${column.label} column`} aria-orientation="vertical" tabIndex={0} onPointerDown={event => resize(event, column)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setPrefs(old => ({ ...old, autoFit: false, widths: { ...old.widths, [column.key]: Math.max(column.key === 'name' ? 130 : 44, Math.min(420, widths[column.key] + (event.key === 'ArrowRight' ? 10 : -10))) } })); } }} /></>}</th>; })}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.id || row.playerId}>{visible.map(column => <td key={column.key} className={`${column.group === 'identity' ? 'wv-sticky ' : ''}wv-cell-${column.kind} wv-group-${column.group}${column.key === 'fantasy_points' ? ' wv-fpts' : ''}`} style={column.group === 'identity' ? { left: offsets[column.key] } : undefined}>{cell(row, column)}</td>)}</tr>)}</tbody>
          </table>
          {!rows.length && <div className="wv-empty"><h2>{busy ? 'Loading waiver research…' : error ? 'Unable to load sources' : allRows.length ? 'No players match these filters' : 'No published waiver data for this selection'}</h2><p>{allRows.length ? 'Clear or widen your search and source ranges.' : 'Only imported, attributable source values appear here.'}</p></div>}
        </div>
        <footer className="wv-table-footer">{rows.length} / {allRows.length} players · {season} waiver W{week} · {data?.meta?.statsSeason || season} stats W{startWeek}{endWeek !== startWeek ? `–${endWeek}` : ''} · {scoring.toUpperCase()}<span>Sources remain separate. Hover values for provenance.</span></footer>
      </section>
      {prefs.drawer && <aside className="wv-favorites" id="wv-favorites" aria-label="Favorites drawer"><header><div><h2>Favorites <span>{favorites.length}</span></h2><p>{season} · waiver week {week}</p></div><button aria-label="Collapse Favorites" onClick={() => setPref('drawer', false)}><X /></button></header><p className="wv-local-note">Private to this browser. Personal dollar bids and notes; no claims submitted.</p><div className="wv-favorite-list">{favorites.map(item => <FavoriteCard key={`${favoritesKey}:${item.id}`} item={item} onChange={patch => updateFavorites(favorites.map(value => value.id === item.id ? { ...value, ...patch } : value))} onRemove={() => updateFavorites(favorites.filter(value => value.id !== item.id))} onOpen={event => onOpenPlayer?.({ ...item, player_id: item.profileId, player_display_name: item.name, season }, event.currentTarget, scoring)} />)}{!favorites.length && <div className="wv-favorite-empty"><Star /><p>Star a player to build this week's shortlist.</p><small>Your Favorites stay with this season and waiver week.</small></div>}</div></aside>}
    </div>

  </main>;
}
export default Waivers;
