import { useEffect, useMemo, useRef, useState } from 'react';
import { Picker, PlayerName, Pool, Shell, Source } from './shared.jsx';
import { publicIdentityKey } from './playerIdentity.js';
import { newsArticleLeagueContext, newsPlayerLeagueContext, newsRosterMatches } from './fantasyNewsContext.js';
export { newsRosterMatches } from './fantasyNewsContext.js';
import { stamp } from './model.js';
import './FantasyNews.css';

export const NEWS_LAYOUT_KEY = 'bowser:fantasy-news:layout:v1';
export const NEWS_PANES = {
  feed: { title: 'News workspace', label: 'NEWS / INJURIES / MY ROSTER', width: 560 },
  evidence: { title: 'Evidence desk', label: 'SOURCE DETAIL', width: 520 },
  roles: { title: 'Role & performance', label: 'ROLE & PERFORMANCE', width: 520 },
  player: { title: 'Player focus', label: 'PLAYER CONTEXT', width: 340 },
  sources: { title: 'Source coverage', label: 'FEED HEALTH', width: 340 },
  acquisition: { title: 'Acquisition Opportunities', label: 'PRIVATE YAHOO / PUBLIC REPORTS', width: 340 },
};
const CATEGORIES = { all: 'All news', injury: 'Injuries', practice: 'Practice', playing_time: 'Playing time', fantasy_news: 'Fantasy news' };
const WINDOWS = [24, 72, 168, 720];
const DEFAULT_PANES = ['evidence', 'player'];
const list = value => Array.isArray(value) ? value : [];
const clean = value => typeof value === 'string' ? value : '';
const paneWindows = new Map(); // Window handles only; news and account data never enter storage.
const defaultLayout = () => ({ version: 1, mode: 'tiles', left: { enabled: true, width: Math.min(800, Math.max(360, Math.round((window.innerWidth - 40) / 3))), collapsed: false, activeTab: 'news' }, acquisition: { enabled: true, width: 340, collapsed: false }, panes: DEFAULT_PANES.map(id => ({ id, width: NEWS_PANES[id].width, collapsed: false })) });

/** Project a saved preference onto code-owned pane IDs and bounded geometry. */
export function validateNewsLayout(value) {
  if (value?.version !== 1 || !Array.isArray(value.panes)) return defaultLayout();
  const seen = new Set();
  const panes = value.panes.filter(pane => pane && Object.hasOwn(NEWS_PANES, pane.id) && !['feed', 'acquisition'].includes(pane.id) && !seen.has(pane.id) && seen.add(pane.id)).slice(0, 4).map(pane => ({
    id: pane.id,
    width: typeof pane.width === 'number' && Number.isFinite(pane.width) ? Math.min(1200, Math.max(280, Math.round(pane.width))) : NEWS_PANES[pane.id].width,
    collapsed: pane.collapsed === true,
  }));
  const defaults = defaultLayout();
  const dock = (saved, fallback) => ({ enabled: saved?.enabled !== false, width: Number.isFinite(saved?.width) ? Math.min(1000, Math.max(280, Math.round(saved.width))) : fallback.width, collapsed: saved?.collapsed === true });
  return { version: 1, mode: ['tiles', 'stacked', 'columns'].includes(value.mode) ? value.mode : 'tiles', left: { ...dock(value.left, defaults.left), activeTab: ['news', 'injuries', 'roster'].includes(value.left?.activeTab) ? value.left.activeTab : 'news' }, acquisition: dock(value.acquisition, defaults.acquisition), panes };
}

export function closeFantasyNewsWindows() {
  const ids = [...paneWindows.keys()];
  for (const child of paneWindows.values()) { try { child.close(); } catch { /* The browser may already have closed the window. */ } }
  paneWindows.clear();
  if (ids.length) window.dispatchEvent(new CustomEvent('bowser-fantasy-news-windows-closed', { detail: ids }));
}

function useNewsLayout(popout) {
  const [layout, setLayout] = useState(() => {
    if (popout) return defaultLayout();
    try { return validateNewsLayout(JSON.parse(localStorage.getItem(NEWS_LAYOUT_KEY))); } catch { return defaultLayout(); }
  });
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    if (popout) return;
    try { localStorage.setItem(NEWS_LAYOUT_KEY, JSON.stringify(validateNewsLayout(layout))); setStorageError(false); }
    catch { setStorageError(true); }
  }, [layout, popout]);
  return [layout, next => setLayout(old => validateNewsLayout(typeof next === 'function' ? next(old) : next)), storageError];
}

export function safeNewsUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

function articlePlayers(article) { return list(article?.players).filter(player => player && clean(player.name)); }
function articleCategories(article) { return [...new Set([article?.category, ...list(article?.categories)].filter(category => Object.hasOwn(CATEGORIES, category) && category !== 'all'))]; }
function articleTime(article) { return Date.parse(article?.publishedAt) || Date.parse(article?.publishedDate) || 0; }
function publicationClock(item, compact = false) { return item?.publishedAt ? stamp(item.publishedAt) : compact && item?.publishedDate ? `${item.publishedDate} · TZ unknown` : item?.publishedAtRaw || (item?.timestampStatus === 'unknown' ? 'Unknown' : 'Unavailable'); }
function categoryLabel(article) { return articleCategories(article).map(category => CATEGORIES[category]).join(' · ') || 'Fantasy news'; }
function sourceName(source) { return clean(source?.sourceName || source?.name) || 'Source unavailable'; }
function articleSources(article) { return list(article?.sources).filter(source => source && typeof source === 'object'); }
function playerRow(player, season, scoring) { return { ...player, player_id: player.playerId || player.player_id || null, player_display_name: player.name, season, scoring }; }
function samePlayer(left, right) {
  const a = left?.playerId || left?.player_id, b = right?.playerId || right?.player_id;
  return a && b ? a === b : Boolean(publicIdentityKey(left) && publicIdentityKey(left) === publicIdentityKey(right));
}

function usePublicNews(hours, refresh, autoRead) {
  const url = `/api/v1/fantasy-news?hours=${hours}&limit=100`;
  const [result, setResult] = useState({ url: '', data: null, loading: true, error: '', readAt: null });
  const [poll, setPoll] = useState(0);
  const revision = useRef(0);
  useEffect(() => {
    if (!autoRead) return;
    const timer = window.setInterval(() => setPoll(value => value + 1), 60000);
    return () => window.clearInterval(timer);
  }, [autoRead]);
  useEffect(() => {
    const id = ++revision.current;
    const controller = new AbortController();
    setResult(previous => ({ url, data: previous.url === url ? previous.data : null, loading: true, error: '', readAt: previous.url === url ? previous.readAt : null }));
    fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(clean(data?.error?.message) || 'The news feed could not be read.');
      if (!data || !Array.isArray(data.articles) || !data.meta || data.meta.scope !== 'public_nfl_news') throw new Error('The news feed returned an unexpected response.');
      const ids = new Set();
      const articles = data.articles.filter(article => article && clean(article.id) && clean(article.headline) && !ids.has(article.id) && ids.add(article.id));
      if (!controller.signal.aborted && id === revision.current) setResult({ url, data: { meta: data.meta, articles }, loading: false, error: '', readAt: new Date().toISOString() });
    }).catch(error => {
      if (!controller.signal.aborted && id === revision.current) setResult(previous => ({ ...previous, data: previous.data ? { ...previous.data, meta: { ...previous.data.meta, state: 'stale', message: 'Feed read failed. Last successful snapshot retained; current freshness is unverified.' }, articles: previous.data.articles.map(article => ({ ...article, freshness: { ...article.freshness, state: 'stale' } })) } : null, loading: false, error: error.message || 'The news feed could not be read.' }));
    });
    return () => controller.abort();
  }, [url, refresh, poll]);
  return result.url === url ? result : { url, data: null, loading: true, error: '', readAt: null };
}

function NewsSourceLink({ source }) {
  const url = safeNewsUrl(source.url);
  return <div className="fn-source-entry">
    <div>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{sourceName(source)} ↗</a> : <strong>{sourceName(source)}</strong>}<span>{source.isOriginalSource ? 'Original report' : source.sourceType || 'Linked source'}</span></div>
    <time dateTime={source.publishedAt || source.publishedDate || undefined}>{source.timestampBasis === 'observed_at' ? 'Observed' : 'Published'} {publicationClock(source)}</time>
    {(source.author || source.xHandle) && <small>{[source.author, source.xHandle].filter(Boolean).join(' · ')}</small>}
    <small className={source.access === 'paywall_possible' ? 'fn-caution' : ''}>{source.accessLabel || (source.isX ? 'X link · sign-in may be required' : source.access === 'paywall_possible' ? 'Provider access may be required' : 'Open the source to verify the full report')}</small>
  </div>;
}

function EvidenceBadge({ article }) {
  return <span className={`fn-evidence ${article.evidence?.kind === 'market_signal' ? 'market' : article.evidence?.kind === 'rumor' || article.evidence?.kind === 'speculation' ? 'uncertain' : ''}`}>{article.evidence?.label || article.status || 'Evidence unavailable'}</span>;
}

function ArticleDetail({ article, season, scoring, onOpen, compact = false }) {
  if (!article) return <div className="fn-empty"><strong>Select a headline</strong><p>Inspect its report, publication time, evidence and linked sources here.</p></div>;
  const players = articlePlayers(article);
  return <div className={`fn-article-detail ${compact ? 'compact' : ''}`}>
    <div className="fn-detail-context"><EvidenceBadge article={article}/><span>{categoryLabel(article)}</span>{!article.publishedAt ? <span className="fn-caution">Publication age unknown</span> : article.freshness?.state === 'stale' && <span className="fn-caution">Older report</span>}</div>
    <h2>{article.headline}</h2>
    <div className="fn-detail-players">{players.map((player, index) => <span key={`${player.playerId || player.name}-${index}`}>{player.playerId || player.player_id ? <PlayerName row={playerRow(player, season, scoring)} onOpen={onOpen}/> : <strong>{player.name}</strong>}<small>{player.team || '—'} · {player.position || '—'}</small></span>)}</div>
    <div className="fn-timestamps"><span>{article.timestampBasis === 'observed_at' ? 'Observed' : 'Published'} <time dateTime={article.publishedAt || article.publishedDate || undefined}>{publicationClock(article)}</time></span><span>Record updated <time dateTime={article.updatedAt || undefined}>{stamp(article.updatedAt)}</time></span>{article.checkedAt && <span>Source checked {stamp(article.checkedAt)} · separate from publication</span>}{article.capturedAt && <span>Captured {stamp(article.capturedAt)}</span>}</div>
    <section><h3>Report</h3><p>{article.summary || 'No publisher summary was returned. Open the linked source for the report.'}</p></section>
    {article.fantasyAnalysis && <section><h3>Fantasy context</h3><p>{article.fantasyAnalysis}</p></section>}
    {article.injury?.isInjuryRelated && <dl className="fn-facts">{[['Body part', article.injury.bodyPart], ['Practice', article.injury.practiceStatus], ['Game status', article.injury.gameStatus], ['Expected return', article.injury.expectedReturn]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Unavailable'}</dd></div>)}</dl>}
    {validUrgency(article) && <section><h3>AI estimated urgency · {article.urgency.score}/5</h3><p>{article.urgency.basis}</p><p className="fn-note">{article.urgency.method} · estimated {stamp(article.urgency.estimatedAt)} · public-news importance, not league fit.</p></section>}
    {article.evidence?.confidence != null && <p className="fn-note">Evidence confidence {article.evidence.confidence}% · source authority and corroboration; not a football outcome probability.</p>}
    <section className="fn-linked-sources"><h3>Linked evidence · {articleSources(article).length}</h3>{articleSources(article).length ? articleSources(article).map((source, index) => <NewsSourceLink source={source} key={`${source.url}-${index}`}/>) : <p>No source link returned. This report cannot be verified from this view.</p>}</section>
  </div>;
}

function ArticleStream({ articles, selectedId, select, expanded, toggle, season, scoring, onOpen, yahoo, label, loading, emptyText }) {
  return <div className="fn-stream" aria-label={label}>
    <div className="fn-stream-columns"><span>Player / headline</span><span>Report / time</span></div>
    {articles.map(article => {
      const open = expanded.has(article.id), players = articlePlayers(article), owned = newsRosterMatches(article, yahoo, season);
      return <article className={`fn-news-row ${selectedId === article.id ? 'selected' : ''}`} key={article.id}>
        <div className="fn-headline-row">
          <button className="fn-headline" aria-label={`Expand ${article.headline}`} aria-expanded={open} aria-controls={`fn-detail-${label.replace(/\W/g, '')}-${article.id.replace(/\W/g, '')}`} onClick={() => { select(article.id); toggle(article.id); }}>
            <span className="fn-row-identities">{players.map(player => `${player.name} · ${player.team || '—'} ${player.position || '—'}`).join(' / ') || 'NFL news'}{owned.length > 0 && <b className="fn-owned">MY ROSTER</b>}</span>
            <span className="fn-headline-text"><i aria-hidden="true">{open ? '▾' : '▸'}</i>{article.headline}</span>
          </button>
          <div className="fn-row-source"><span>{article.source || sourceName(articleSources(article)[0])}</span><time dateTime={article.publishedAt || article.publishedDate || undefined}>{publicationClock(article, true)}</time><EvidenceBadge article={article}/></div>
          <button className="fn-inspect" aria-label={`Inspect ${article.headline}`} title="Inspect in evidence desk" onClick={() => select(article.id, true)}>◧</button>
        </div>
        {open && <div id={`fn-detail-${label.replace(/\W/g, '')}-${article.id.replace(/\W/g, '')}`} className="fn-inline-detail"><ArticleDetail article={article} season={season} scoring={scoring} onOpen={onOpen} compact/></div>}
      </article>;
    })}
    {!articles.length && !loading && <div className="fn-empty"><strong>{emptyText || 'No reports match this view'}</strong><p>No report returned is different from no news existing. Try another window or clear the filters.</p></div>}
    {loading && !articles.length && <div className="fn-loading" role="status"><span/>Reading sourced NFL reports…</div>}
  </div>;
}

function SourceCoverage({ meta, articles, chooseSource, selectedSource }) {
  const sources = new Map();
  for (const article of articles) for (const source of articleSources(article)) {
    const name = sourceName(source), existing = sources.get(name) || { name, count: 0, latest: null, clock: 'Unavailable', access: source.accessLabel };
    existing.count++;
    if (Date.parse(source.publishedAt || source.publishedDate) > (Date.parse(existing.latest) || 0)) { existing.latest = source.publishedAt || source.publishedDate; existing.clock = publicationClock(source, true); }
    sources.set(name, existing);
  }
  return <div className="fn-coverage">
    <div className="fn-coverage-summary"><strong>{meta?.snapshotMode === 'archived_public_baseline' ? 'Static dated public archive' : meta?.state === 'current' ? 'Current returned snapshot' : meta?.state === 'stale' ? 'Stale returned snapshot' : meta?.state === 'partial' ? 'Partial returned coverage' : 'Coverage unavailable'}</strong><p>{meta?.message || 'Read the feed to inspect provider coverage.'}</p>{meta?.refresh?.schedulerVerified === false && <p className="fn-caution">{meta?.repository?.lastReadState === 'verified' ? 'Writer schedule not verified by this feed' : 'Unattended ingestion unavailable'}</p>}</div>
    <dl className="fn-facts">{meta?.repository && <><div><dt>Sources checked</dt><dd>{stamp(meta.repository.checkedAt)}</dd></div><div><dt>Repository updated</dt><dd>{stamp(meta.repository.updatedAt)}</dd></div><div><dt>Repository read</dt><dd>{stamp(meta.repository.fetchedAt)}</dd></div><div><dt>Revision</dt><dd>{clean(meta.repository.revision).slice(0, 12) || 'Unavailable'}</dd></div><div><dt>Repository state</dt><dd>{meta.repository.cacheState || 'Unavailable'}</dd></div></>}<div><dt>Latest source report</dt><dd>{stamp(meta?.freshness?.latestSourcePublishedAt)}</dd></div><div><dt>Feed read</dt><dd>{stamp(meta?.readAt)}</dd></div><div><dt>Coverage</dt><dd>{meta?.coverage?.complete ? 'Complete as reported' : 'Partial / unverified'}</dd></div><div><dt>Returned</dt><dd>{articles.length}{Number.isFinite(meta?.total) ? ` of ${meta.total}` : ''} reports</dd></div></dl>
    {meta?.repository?.lastReadState === 'unavailable' && <p className="fn-caution" role="alert">Repository read unavailable. {meta.repository.cacheState === 'retained_last_good' ? 'Last verified repository snapshot retained.' : 'Dated archive coverage only.'}</p>}
    <h3>Report types in this window</h3><div className="fn-coverage-counts">{Object.entries(CATEGORIES).filter(([id]) => id !== 'all').map(([id, name]) => <div key={id}><strong>{name}</strong><span>{articles.filter(article => articleCategories(article).includes(id)).length}</span></div>)}</div>
    <h3>Linked publications</h3>{[...sources.values()].map(source => <button className={`fn-publication ${selectedSource === source.name ? 'active' : ''}`} key={source.name} onClick={() => chooseSource(selectedSource === source.name ? 'all' : source.name)} aria-pressed={selectedSource === source.name}><strong>{source.name}<span>{source.count}</span></strong><small>Latest report {source.clock}</small>{source.access && <small>{source.access}</small>}</button>)}{!sources.size && <p className="fn-note">No linked publications returned for this window.</p>}
    <h3>Provider readiness</h3>{list(meta?.sources).map(source => <div className="fn-provider" key={source.id || source.name}><div><strong>{source.name || source.id}</strong><span className={source.ready ? 'fn-positive' : 'fn-caution'}>{source.ready ? 'Configured' : 'Unavailable'}</span></div><p>{source.message || source.coverage || 'Coverage not verified'}</p></div>)}
    <details className="fn-methodology"><summary>Freshness & methodology</summary><p>Refresh feed reads the latest stored reports. It does not run provider ingestion.</p><p>Publication, observation, update and read times describe different events. An older report remains labeled older even after a successful feed read.</p>{clean(meta?.timeFilterBasis).includes('overlapping_calendar_dates') && <p>Unknown-timezone publication dates are included when their possible calendar-day interval overlaps the target news window. Their precise age and inclusion within the last {meta.lookbackHours || 'selected'} hours are unverified.</p>}{clean(meta?.timeFilterBasis).includes('undated_reports') && <p>Undated cited reports are included with unknown publication age. Their presence does not prove that they fall within the selected hours.</p>}<p>Player identities require an exact stable ID or an unambiguous name, team and position match. Missing values remain unavailable.</p>{list(meta?.coverage?.limitations).map((limitation, index) => <p key={index}>{limitation}</p>)}{meta?.refresh && <p>Last successful ingestion: {stamp(meta.refresh.lastSuccessfulRunAt)}. Scheduler {meta.refresh.schedulerVerified ? 'verified' : 'not verified'}. {meta.refresh.ready ? 'Operator ingestion configured.' : 'Operator ingestion unavailable.'}</p>}</details>
  </div>;
}

function PlayerFocus({ article, articles, season, scoring, onOpen, select }) {
  const players = articlePlayers(article);
  return <div className="fn-player-focus">{!players.length ? <div className="fn-empty"><strong>No selected player</strong><p>Select a player report to compare its coverage across sources.</p></div> : players.map((player, index) => {
    const related = articles.filter(item => articlePlayers(item).some(candidate => samePlayer(player, candidate)));
    return <section key={`${player.name}-${index}`}><div className="fn-focus-player">{player.playerId || player.player_id ? <PlayerName row={playerRow(player, season, scoring)} onOpen={onOpen}/> : <strong>{player.name}</strong>}<span>{player.team || '—'} · {player.position || '—'}</span></div><div className="fn-focus-summary"><span>{related.length} returned reports</span><span>{new Set(related.flatMap(item => articleSources(item).map(sourceName))).size} linked publications</span></div>{!player.playerId && !player.player_id && <p className="fn-note">Warehouse player identity unavailable. No statistics are inferred.</p>}{related.map(item => <button className="fn-related" key={item.id} onClick={() => select(item.id)} aria-pressed={article.id === item.id}><strong>{item.headline}</strong><span>{item.source} · {publicationClock(item, true)}</span><EvidenceBadge article={item}/></button>)}</section>; })}<p className="fn-note">These are returned reports in the selected timestamp window. Source mentions do not prove role, opportunity or roster ownership.</p></div>;
}

function publicAffectedPlayers(article) {
  return list(article?.affectedPlayers).filter(player => player && clean(player.name));
}
function displayedPlayers(article) {
  const result = [...articlePlayers(article)];
  for (const player of publicAffectedPlayers(article)) if (!result.some(item => samePlayer(item, player))) result.push(player);
  return result;
}
function validUrgency(article) {
  const value = article?.urgency;
  return Number.isInteger(value?.score) && value.score >= 1 && value.score <= 5 && clean(value.basis) && value.method === 'AI estimate from public reporting' ? value : null;
}
function Urgency({ article }) {
  const value = validUrgency(article);
  return value ? <details className="fn-urgency"><summary aria-label={`AI estimated urgency ${value.score} of 5 for ${article.headline}`}>{value.score}<small>/5</small></summary><p>{value.basis}</p><small>{value.method} · estimated {stamp(value.estimatedAt)}. Public-news importance; league fit is not assessed.</small></details> : <span className="fn-unknown" title="No validated AI estimate supplied">—<span className="fn-sr-only">Urgency unavailable</span></span>;
}
function LeagueObservation({ observation, owned = false, compact = false }) {
  const label = `${observation.leagueName}: ${owned ? 'Owned at read' : `${observation.status === 'W' ? 'Waivers' : observation.status === 'FA' ? 'Free agent' : 'Available'} at read`}`;
  const detail = <><small>{owned && observation.week != null ? `W${observation.week} · ` : ''}{observation.checkedAt ? `Yahoo read ${stamp(observation.checkedAt)}` : 'Yahoo capture age unverified'}{observation.stale ? ' · stale loaded observation' : ''}{observation.coverage?.partial ? ' · partial page coverage' : ''}</small>{!owned && <small>Pool {observation.coverage?.status || observation.status} · {observation.method === 'ownership-response' ? 'bounded ownership lookup' : `page start ${observation.coverage?.start ?? 'unknown'} / size ${observation.coverage?.pageSize ?? 'unknown'}`} · confirm in Yahoo</small>}</>;
  return compact ? <details className={`fn-league-observation compact ${owned ? 'owned' : 'available'}`}><summary>{label}{observation.stale ? ' · stale' : ''}</summary>{detail}</details> : <span className={`fn-league-observation ${owned ? 'owned' : 'available'}`}><strong>{label}</strong>{detail}</span>;
}

function PlayerLeagueCell({ player, yahoo, season, scoring, onOpen }) {
  const context = newsPlayerLeagueContext(player, yahoo, season);
  return <div className="fn-news-player">{player.playerId || player.player_id ? <PlayerName row={playerRow(player, season, scoring)} onOpen={onOpen}/> : <strong>{player.name}</strong>}<span>{player.team || 'Team unknown'} · {player.position || 'Position unknown'}</span>{player.relationship && <small>{player.relationship === 'potential_beneficiary' ? 'Potential beneficiary' : player.relationship === 'possible_workload_loss' ? 'Possible workload loss' : player.relationship.replaceAll('_', ' ')}</small>}{player.impact && <details className="fn-player-impact"><summary>Public impact ▾</summary><small>{player.impact}</small></details>}{context.owned.map(match => <LeagueObservation key={`owned-${match.teamKey}`} observation={match} owned compact/>)}{context.available.map(match => <LeagueObservation key={`available-${match.teamKey}`} observation={match} compact/>)}{context.connected && !context.relevant && <small className="fn-unknown">Ownership / availability unknown</small>}</div>;
}
function PrivateCoverage({ yahoo, season }) {
  const context = newsArticleLeagueContext({ players: [] }, yahoo, season);
  if (!context.connected) return <div className="fn-private-state"><strong>Yahoo league context unavailable</strong><span>Connect and load authorized rosters / availability.</span><a href="#/yahoo">Open Yahoo Connection ↗</a></div>;
  return <div className="fn-private-state"><strong>{context.coverage?.totalLeagues ?? list(yahoo?.leagues).length} authorized leagues · {context.coverage?.loadedRosterCount ?? 0} rosters loaded</strong><span>Availability in {context.coverage?.loadedAvailabilityLeagues ?? 0} leagues · bounded loaded context. Missing players stay unknown.</span><span>Ownership, lineup week and availability have separate Yahoo read clocks. Confirm availability in Yahoo before acting.</span>{Object.keys(yahoo?.errors || {}).length > 0 && <span className="fn-caution">Some Yahoo reads failed; retained observations may be outdated. Open Yahoo Connection to recheck.</span>}</div>;
}
function confirmedInjury(article) {
  return article.injury?.isInjuryRelated === true && ['official_report', 'report'].includes(article.evidence?.kind) && (article.status === 'CONFIRMED' || article.evidence?.status === 'CONFIRMED' || article.evidence?.kind === 'official_report');
}
function NewsTable({ articles, selectedId, select, expanded, toggle, season, scoring, onOpen, yahoo, loading, meta, tab }) {
  const scroll = useRef(null);
  const roster = tab === 'roster', injuries = tab === 'injuries';
  const rows = injuries ? articles.filter(confirmedInjury) : roster ? articles.filter(article => displayedPlayers(article).some(player => newsPlayerLeagueContext(player, yahoo, season).relevant)) : articles;
  return <>{roster && <PrivateCoverage yahoo={yahoo} season={season}/>}<div className="fn-table-scroll-tools"><button aria-label="Show earlier news columns" onClick={() => scroll.current?.scrollBy({left:-220,behavior:'smooth'})}>◀</button><span>All columns ↔ scroll or drag the green edge to widen</span><button aria-label="Show later news columns" onClick={() => scroll.current?.scrollBy({left:220,behavior:'smooth'})}>▶</button></div><div className="fn-news-table-scroll" ref={scroll}><table className={`fn-news-table ${injuries ? 'injury-table' : ''}`} aria-label={injuries ? 'Confirmed injury reports' : roster ? 'Owned or affirmatively available player reports' : 'Sourced news headlines'}><colgroup>{injuries ? <><col className="fn-col-player"/><col className="fn-col-status"/><col className="fn-col-time"/><col className="fn-col-source"/><col className="fn-col-arrow"/></> : <><col className="fn-col-headline"/><col className="fn-col-summary"/><col className="fn-col-player"/><col className="fn-col-urgency"/><col className="fn-col-arrow"/></>}</colgroup><thead><tr>{injuries ? <><th>Player / position</th><th>Reported status</th><th>Newsbreak / source clock</th><th>Source / report</th></> : <><th>Headline</th><th>Summary</th><th>Affected player / league observation</th><th title="AI-estimated public-news importance, 1–5. Inspect each estimate for its supplied basis. League fit is not assessed.">AI urgency</th></>}<th><span className="fn-sr-only">Detail / source</span>↗</th></tr></thead><tbody>{rows.map(article => <FragmentRow key={article.id} article={article} injuries={injuries} selectedId={selectedId} select={select} expanded={expanded} toggle={toggle} season={season} scoring={scoring} onOpen={onOpen} yahoo={yahoo}/>)}</tbody></table></div>{!rows.length && !loading && <div className="fn-empty"><strong>{meta?.state === 'unavailable' ? 'News feed unavailable' : injuries ? 'No confirmed injury records returned' : roster ? 'No affirmative owned or available matches returned' : 'No reports match this view'}</strong><p>{roster ? 'Load the authorized Yahoo rosters and availability pages. Absence from a roster or bounded availability page proves neither ownership nor availability.' : 'Returned coverage is bounded. Open sources or adjust the news window to verify reporting.'}</p></div>}{loading && !rows.length && <div className="fn-loading"><span/>Reading sourced NFL reports…</div>}<p className="fn-pane-scope">{rows.length} reports · {injuries ? 'Confirmed injury reporting only; status comes from the cited source.' : 'AI urgency estimates public-news importance, not league fit. Open the score for its supplied basis.'}{roster && ' Availability is an observation at read, not a live transaction guarantee.'}</p></>;
}
function FragmentRow({ article, injuries, selectedId, select, expanded, toggle, season, scoring, onOpen, yahoo }) {
  const open = expanded.has(article.id), id = `fn-table-detail-${article.id.replace(/\W/g, '')}`;
  const headline = <button className="fn-table-headline" aria-label={`Expand ${article.headline}`} aria-expanded={open} aria-controls={id} onClick={() => { select(article.id); toggle(article.id); }}><span aria-hidden="true">{open ? '▾' : '▸'}</span>{article.headline}</button>;
  return <><tr className={selectedId === article.id ? 'selected' : ''}>{injuries ? <><td>{articlePlayers(article).map((player, index) => <PlayerLeagueCell key={index} player={player} yahoo={yahoo} season={season} scoring={scoring} onOpen={onOpen}/>)}</td><td><strong>{article.injury?.gameStatus || article.injury?.practiceStatus || 'Status unavailable'}</strong><small>{article.injury?.bodyPart || 'Body part unavailable'}</small><EvidenceBadge article={article}/></td><td><time dateTime={article.firstReportedAt || article.publishedAt || undefined}>{article.firstReportedAt ? stamp(article.firstReportedAt) : publicationClock(article)}</time><small>{article.firstReportedAt ? 'First reported' : 'Source publication · exact newsbreak unverified'}</small></td><td><strong>{article.source || sourceName(articleSources(article)[0])}</strong>{headline}</td></> : <><td>{headline}<small>{article.source || sourceName(articleSources(article)[0])} · {publicationClock(article, true)}</small></td><td><span className="fn-summary-clamp" title={article.summary}>{article.summary || 'Publisher summary unavailable'}</span></td><td>{displayedPlayers(article).map((player, index) => <PlayerLeagueCell key={index} player={player} yahoo={yahoo} season={season} scoring={scoring} onOpen={onOpen}/>)}</td><td><Urgency article={article}/></td></>}<td><button className="fn-inspect" aria-label={`Inspect ${article.headline}`} title="Open details and cited sources" onClick={() => select(article.id, true)}>↗</button></td></tr>{open && <tr className="fn-table-expanded"><td colSpan={5}><div id={id}><ArticleDetail article={article} season={season} scoring={scoring} onOpen={onOpen} compact/></div></td></tr>}</>;
}
function AcquisitionOpportunities({ yahoo, articles, season, scoring, onOpen, select }) {
  const context = newsArticleLeagueContext({ players: [] }, yahoo, season);
  const opportunities = articles.flatMap(article => publicAffectedPlayers(article).filter(player => player.relationship === 'potential_beneficiary').map(player => ({ article, player, context: newsPlayerLeagueContext(player, yahoo, season) }))).filter(item => item.context.available.length);
  return <div className="fn-acquisition"><PrivateCoverage yahoo={yahoo} season={season}/>{context.connected && <><p className="fn-note">Potential beneficiaries are explicitly identified in public reporting. Availability is affirmative loaded Yahoo context; confirm in Yahoo before any action.</p>{opportunities.map(({article, player, context}, index) => <article className="fn-opportunity" key={`${article.id}-${index}`}><div className="fn-opportunity-title">{player.playerId ? <PlayerName row={playerRow(player, season, scoring)} onOpen={onOpen}/> : <strong>{player.name}</strong>}<span>{player.team || '—'} · {player.position || '—'}</span></div><p>{player.impact || 'Public impact explanation unavailable'}</p>{context.available.map(match => <LeagueObservation key={match.teamKey} observation={match}/>)}<button className="fn-related" onClick={() => select(article.id, true)}><strong>{article.headline} ↗</strong><small>{article.source} · {publicationClock(article, true)}</small></button></article>)}{!opportunities.length && <div className="fn-empty"><strong>No affirmative acquisition opportunities returned</strong><p>No eligible beneficiary was matched to a loaded available-player observation. Roster absence, unreturned pages and speculative role changes do not create an opportunity.</p></div>}</>}</div>;
}

function routeOptions() {
  const params = new URLSearchParams(window.location.hash.split('?')[1]);
  const id = params.get('pane');
  return { popout: params.get('popout') === '1', pane: Object.hasOwn(NEWS_PANES, id) ? id : 'feed', article: params.get('article') || '', hours: WINDOWS.includes(Number(params.get('hours'))) ? Number(params.get('hours')) : 168 };
}

export function FantasyNews({ season = 2026, scoring = 'ppr', onOpen, yahoo }) {
  const [route] = useState(routeOptions);
  const [hours, setHours] = useState(route.hours), [refresh, setRefresh] = useState(0), [autoRead, setAutoRead] = useState(true);
  const [category, setCategory] = useState('all'), [source, setSource] = useState('all'), [search, setSearch] = useState(''), [rosterOnly, setRosterOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(route.article), [expanded, setExpanded] = useState(new Set()), [pinned, setPinned] = useState('');
  const [layout, setLayout, storageError] = useNewsLayout(route.popout);
  const [narrowWorkspace, setNarrowWorkspace] = useState(() => window.innerWidth <= 1000);
  const centralWorkspace = useRef(null);
  const [centralWidth, setCentralWidth] = useState(0);
  useEffect(() => {
    const element = centralWorkspace.current;
    if (!element) return;
    const measure = () => setCentralWidth(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const resized = () => setNarrowWorkspace(window.innerWidth <= 1000);
    window.addEventListener('resize', resized);
    return () => window.removeEventListener('resize', resized);
  }, []);
  const [windowStates, setWindowStates] = useState({}), [windowNotice, setWindowNotice] = useState('');
  const [clock, setClock] = useState(Date.now);
  const stopResize = useRef(null);
  useEffect(() => () => stopResize.current?.(), []);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  const feed = usePublicNews(hours, refresh, autoRead);
  const meta = useMemo(() => {
    const value = feed.data?.meta;
    const basis = value?.freshness?.basis === 'source_check' ? value.freshness.sourceCheckedAt : value?.freshness?.latestSourcePublishedAt;
    const age = clock - Date.parse(basis), threshold = Number.isFinite(value?.freshness?.staleAfterHours) ? value.freshness.staleAfterHours : 6;
    return value?.state === 'current' && Number.isFinite(age) && age > threshold * 3600000 ? { ...value, state: 'stale', message: 'Snapshot freshness expired. Refresh the feed and verify the original sources for current status.' } : value;
  }, [feed.data, clock]);
  const articles = useMemo(() => list(feed.data?.articles).map(article => Number.isFinite(Date.parse(article.publishedAt)) && clock - Date.parse(article.publishedAt) > 6 * 3600000 ? { ...article, freshness: { ...article.freshness, state: 'stale' } } : article).sort((a, b) => articleTime(b) - articleTime(a)), [feed.data, clock]);
  const selected = articles.find(article => article.id === (pinned || selectedId)) || articles[0] || null;
  const latestSelection = useRef(''); latestSelection.current = selectedId || articles[0]?.id || '';
  const options = useMemo(() => ({ sources: [...new Set(articles.flatMap(article => articleSources(article).map(sourceName)))].sort() }), [articles]);
  const connected = newsArticleLeagueContext({players:[]}, yahoo, season, {now:clock}).connected;
  useEffect(() => { if (!connected) setRosterOnly(false); }, [connected]);
  const previousAccount = useRef(yahoo?.account);
  useEffect(() => {
    if (previousAccount.current !== yahoo?.account) {
      const ids = [...paneWindows.keys()]; closeFantasyNewsWindows();
      if (ids.length) { setWindowStates(old => ({ ...old, ...Object.fromEntries(ids.map(id => [id, 'closed'])) })); setWindowNotice('Research browser windows closed because Yahoo account context changed. Reopen them to read the current context.'); }
      previousAccount.current = yahoo?.account;
    }
  }, [yahoo?.account]);
  useEffect(() => { if (route.popout) return; window.addEventListener('pagehide', closeFantasyNewsWindows); return () => window.removeEventListener('pagehide', closeFantasyNewsWindows); }, [route.popout]);
  const effectiveSource = options.sources.includes(source) ? source : 'all';
  const filtered = articles.filter(article => (category === 'all' || articleCategories(article).includes(category)) && (effectiveSource === 'all' || articleSources(article).some(item => sourceName(item) === effectiveSource)) && (!rosterOnly || connected && newsRosterMatches(article, yahoo, season).length) && `${article.headline} ${article.summary || ''} ${articlePlayers(article).map(player => player.name).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()));
  const dockKey = id => id === 'feed' ? 'left' : id === 'acquisition' ? 'acquisition' : null;
  const enabled = id => dockKey(id) ? layout[dockKey(id)].enabled : layout.panes.some(pane => pane.id === id);
  const patchPane = (id, patch) => setLayout(old => {
    const key = dockKey(id);
    if (key) return { ...old, [key]: { ...old[key], ...patch } };
    const visible = old.panes.filter(pane => !pane.collapsed), index = visible.findIndex(pane => pane.id === id);
    const columnId = old.mode === 'tiles' && patch.width !== undefined ? visible[index % 2]?.id : null;
    return { ...old, panes: old.panes.map(pane => pane.id === id || pane.id === columnId ? { ...pane, ...patch } : pane) };
  });
  const openPane = id => {
    const key = dockKey(id);
    if (key) { patchPane(id, { enabled: true, collapsed: false }); return; }
    setLayout(old => ({ ...old, panes: old.panes.some(pane => pane.id === id) ? old.panes.map(pane => pane.id === id ? { ...pane, collapsed: false } : pane) : [...old.panes, { id, width: NEWS_PANES[id].width, collapsed: false }] }));
  };
  const closePane = id => {
    try { paneWindows.get(id)?.close(); } catch { /* Browser window may already be gone. */ }
    paneWindows.delete(id); setWindowStates(old => ({ ...old, [id]: 'closed' }));
    const key = dockKey(id);
    if (key) patchPane(id, { enabled: false, collapsed: false });
    else setLayout(old => ({ ...old, panes: old.panes.filter(pane => pane.id !== id) }));
  };
  const select = (id, inspect = false) => { setSelectedId(id); if (inspect && !route.popout) openPane('evidence'); };
  const toggle = id => setExpanded(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const movePane = (id, direction) => setLayout(old => {
    const panes = [...old.panes], visible = panes.filter(pane => !pane.collapsed);
    const target = visible[visible.findIndex(pane => pane.id === id) + direction];
    if (target) { const from = panes.findIndex(pane => pane.id === id), to = panes.findIndex(pane => pane.id === target.id); [panes[from], panes[to]] = [panes[to], panes[from]]; }
    return { ...old, panes };
  });
  const resizePane = (event, pane) => {
    event.preventDefault();
    stopResize.current?.();
    const start = event.clientX, width = pane.width;
    const move = event => patchPane(pane.id, { width: Math.max(280, Math.min(dockKey(pane.id) ? 1000 : 1200, width + (event.clientX - start) * (pane.id === 'acquisition' ? -1 : 1))) });
    const end = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end); window.removeEventListener('blur', end); stopResize.current = null; };
    stopResize.current = end; window.addEventListener('blur', end);
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  };
  const sendSelection = child => { try { child.postMessage({ type: 'bowser-fantasy-news-selection', articleId: latestSelection.current, hours }, window.location.origin); } catch { /* Independently opened window still reads its own feed. */ } };
  const popOut = id => {
    const existing = paneWindows.get(id);
    try { if (existing && !existing.closed) { existing.focus(); sendSelection(existing); setWindowStates(old => ({ ...old, [id]: 'open' })); return; } } catch { paneWindows.delete(id); }
    const url = new URL(window.location.href); url.hash = `/fantasy-news?${new URLSearchParams({ pane: id, popout: '1', hours, ...(latestSelection.current ? { article: latestSelection.current } : {}) })}`;
    let child;
    try { child = window.open(url.href, `bowser-fantasy-news-${id}`, 'popup,width=900,height=800,resizable=yes,scrollbars=yes'); } catch { child = null; }
    if (!child) { setWindowNotice(`The browser blocked ${NEWS_PANES[id].title}. Allow popups for Bowser or keep using this window in the workspace.`); return; }
    paneWindows.set(id, child); setWindowStates(old => ({ ...old, [id]: 'open' })); setWindowNotice(`${NEWS_PANES[id].title} opened in a browser window.`); openPane(id);
  };
  const dock = id => { try { paneWindows.get(id)?.close(); } catch { /* Browser window may already be gone. */ } paneWindows.delete(id); setWindowStates(old => ({ ...old, [id]: 'docked' })); openPane(id); setWindowNotice(`${NEWS_PANES[id].title} returned to the workspace.`); };

  useEffect(() => {
    const closed = event => {
      const ids = list(event.detail).filter(id => Object.hasOwn(NEWS_PANES, id));
      if (ids.length) setWindowStates(previous => ({ ...previous, ...Object.fromEntries(ids.map(id => [id, 'closed'])) }));
    };
    const check = () => {
      const states = {};
      for (const [id, child] of paneWindows) {
        try { states[id] = child.closed ? 'closed' : 'open'; if (child.closed) paneWindows.delete(id); } catch { states[id] = 'closed'; paneWindows.delete(id); }
      }
      setWindowStates(previous => {
        const next = { ...previous, ...states };
        // App-wide authorization changes or module replacement can clear the registry
        // before this component sees the close. Never retain an orphan open state.
        for (const id of Object.keys(next)) if (next[id] === 'open' && !paneWindows.has(id)) next[id] = 'closed';
        return Object.keys(next).every(id => next[id] === previous[id]) ? previous : next;
      });
    };
    window.addEventListener('bowser-fantasy-news-windows-closed', closed);
    check();
    const timer = window.setInterval(check, 1000);
    return () => { window.clearInterval(timer); window.removeEventListener('bowser-fantasy-news-windows-closed', closed); };
  }, []);
  useEffect(() => {
    if (route.popout) return;
    for (const child of paneWindows.values()) sendSelection(child);
  }, [selectedId, articles, hours]);
  useEffect(() => {
    const receive = event => {
      if (event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') return;
      if (route.popout) {
        if (event.source !== window.opener || event.data.type !== 'bowser-fantasy-news-selection') return;
        if (typeof event.data.articleId === 'string' && event.data.articleId.length <= 200) setSelectedId(event.data.articleId);
        if (WINDOWS.includes(event.data.hours)) setHours(event.data.hours);
      } else {
        const id = [...paneWindows].find(([, child]) => child === event.source)?.[0];
        if (!id || event.data.pane !== id) return;
        if (event.data.type === 'bowser-fantasy-news-ready') sendSelection(event.source);
        if (event.data.type === 'bowser-fantasy-news-dock') dock(id);
        if (event.data.type === 'bowser-fantasy-news-closed') { paneWindows.delete(id); setWindowStates(old => ({ ...old, [id]: 'closed' })); }
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [route, hours]);
  useEffect(() => {
    if (!route.popout) return;
    const previousTitle = document.title;
    document.title = `${NEWS_PANES[route.pane].title} · Bowser Fantasy News`;
    const notify = type => { try { window.opener?.postMessage({ type, pane: route.pane }, window.location.origin); } catch { /* Direct links have no opener. */ } };
    notify('bowser-fantasy-news-ready');
    const closed = () => notify('bowser-fantasy-news-closed');
    window.addEventListener('pagehide', closed);
    return () => { document.title = previousTitle; window.removeEventListener('pagehide', closed); };
  }, [route]);

  const clearFilters = () => { setCategory('all'); setSource('all'); setSearch(''); setRosterOnly(false); };
  const streamProps = { selectedId: selectedId || articles[0]?.id, select, expanded, toggle, season, scoring, onOpen, yahoo, loading: feed.loading };
  const tabContent = <NewsTable {...streamProps} articles={filtered} meta={meta} tab={layout.left.activeTab}/>;
  const content = id => {
    if (id === 'feed') return <><div className="fn-sidebar-tabs" role="tablist" aria-label="News workspace views">{[['news','News'], ['injuries','Injuries'], ['roster','My Roster']].map(([id,label], index) => <button key={id} id={`fn-tab-${id}`} role="tab" aria-selected={layout.left.activeTab === id} aria-controls="fn-news-tab-panel" tabIndex={layout.left.activeTab === id ? 0 : -1} onClick={() => patchPane('feed', { activeTab: id })} onKeyDown={event => { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3; patchPane('feed', {activeTab:['news','injuries','roster'][next]}); event.currentTarget.parentNode.querySelectorAll('[role="tab"]')[next]?.focus(); }}>{label}</button>)}</div><div role="tabpanel" id="fn-news-tab-panel" aria-labelledby={`fn-tab-${layout.left.activeTab}`} className="fn-news-tab-panel">{tabContent}</div></>;
    if (id === 'acquisition') return <AcquisitionOpportunities yahoo={yahoo} articles={articles} season={season} scoring={scoring} onOpen={onOpen} select={select}/>;
    if (id === 'roles') return <><p className="fn-pane-scope">Role / performance reports · {hours}h · future usage remains unconfirmed</p><ArticleStream {...streamProps} articles={articles.filter(article => articleCategories(article).includes('playing_time') || ['COACH_COMMENT', 'PERFORMANCE'].includes(article.eventType))} label="Playing time reports"/></>;
    if (id === 'evidence') return <><div className="fn-evidence-controls"><label>Report<select aria-label="Evidence report" value={selected?.id || ''} onChange={event => { setPinned(''); setSelectedId(event.target.value); }}><option value="">Select a report</option>{articles.map(article => <option value={article.id} key={article.id}>{article.headline}</option>)}</select></label><button aria-pressed={Boolean(pinned)} disabled={!selected} onClick={() => setPinned(pinned ? '' : selected.id)}>{pinned ? 'Unpin' : 'Pin report'}</button></div><ArticleDetail article={selected} season={season} scoring={scoring} onOpen={onOpen}/></>;
    if (id === 'player') return <PlayerFocus article={selected} articles={articles} season={season} scoring={scoring} onOpen={onOpen} select={select}/>;
    return <SourceCoverage meta={meta} articles={articles} chooseSource={setSource} selectedSource={source}/>;
  };
  const panes = route.popout ? [{ id: route.pane, width: NEWS_PANES[route.pane].width, collapsed: false }] : layout.panes.filter(pane => !pane.collapsed);
  const tileColumns = !route.popout && layout.mode === 'tiles' && panes.length > 1 ? `minmax(0,${panes[0].width}fr) minmax(0,${panes[1].width}fr)` : undefined;
  const statusText = feed.loading ? feed.data ? 'Reading latest stored feed…' : 'Reading sourced reports…' : feed.error ? feed.data ? 'Read failed · last successful feed retained' : 'News read unavailable' : `${filtered.length} visible / ${articles.length} returned · ${meta?.state || 'unavailable'}`;
  const renderPane = (pane, index = 0, dock = false) => {
    const definition = NEWS_PANES[pane.id], popped = !route.popout && windowStates[pane.id] === 'open';
    const maximum = dockKey(pane.id) ? 1000 : 1200;
    const resizable = dock ? !narrowWorkspace : layout.mode === 'columns' || (layout.mode === 'tiles' && !narrowWorkspace && centralWidth > 700 && panes.length > 1);
    return <section key={pane.id} className={`fn-pane ${dock ? `fn-dock fn-${pane.id}-dock` : 'research'} ${popped ? 'popped' : ''} ${resizable ? '' : 'fn-full-width'}`} style={{ '--fn-pane-width': `${pane.width}px`, flexGrow: dock ? 0 : pane.width }} aria-label={definition.title}>
      <header className="fn-window-title"><div><small>{definition.label}</small><h2>{definition.title}</h2></div>{!route.popout && <div className="fn-pane-actions"><button aria-label={`Collapse ${definition.title}`} aria-expanded="true" title="Collapse and reclaim space" onClick={() => patchPane(pane.id, { collapsed: true })}>▾</button>{!dock && <><button aria-label={`Move ${definition.title} left`} disabled={index === 0} onClick={() => movePane(pane.id, -1)}>←</button><button aria-label={`Move ${definition.title} right`} disabled={index === panes.length - 1} onClick={() => movePane(pane.id, 1)}>→</button></>}<button aria-label={`${windowStates[pane.id] === 'closed' ? 'Reopen' : popped ? 'Focus' : 'Pop out'} ${definition.title}${windowStates[pane.id] === 'closed' || popped ? ' window' : ''}`} title="Open in a browser window" onClick={() => popOut(pane.id)}>↗</button><button aria-label={`Close ${definition.title}`} title="Disable this pane" onClick={() => closePane(pane.id)}>×</button></div>}</header>
      {popped ? <div className="fn-detached"><strong>Open in browser window</strong><p>{definition.title} reads the public feed and its own authorized Yahoo context.</p><button className="lhq-mini" onClick={() => popOut(pane.id)}>Focus window</button><button className="lhq-mini lhq-outline" onClick={() => dockPane(pane.id)}>Return to workspace</button><button className="fn-text-button" onClick={() => dockPane(pane.id)}>Close browser window</button></div> : <div className="fn-pane-content" tabIndex={0}>{content(pane.id)}</div>}
      {!route.popout && !popped && resizable && <div className={`fn-pane-resize ${pane.id === 'acquisition' ? 'fn-resize-left' : ''}`} role="separator" aria-label={`Resize ${definition.title}`} title="Drag to resize · arrow keys adjust 20px" aria-orientation="vertical" aria-valuemin={280} aria-valuemax={maximum} aria-valuenow={pane.width} tabIndex={0} onPointerDown={event => resizePane(event, pane)} onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const direction = pane.id === 'acquisition' ? -1 : 1; patchPane(pane.id, {width:event.key === 'Home' ? 280 : event.key === 'End' ? maximum : pane.width + (event.key === 'ArrowRight' ? 20 : -20) * direction}); } }}><span aria-hidden="true">⋮</span></div>}
    </section>;
  };
  const dockPane = dock;
  const renderDock = (id, preference) => !preference.enabled ? null : preference.collapsed ? <button className={`fn-dock-restore ${id}`} aria-label={`Expand ${NEWS_PANES[id].title}`} onClick={() => patchPane(id,{collapsed:false})}>▸ <span>{NEWS_PANES[id].title}</span></button> : renderPane({id,...preference},0,true);
  const body = <div className={`fantasy-news ${route.popout ? 'fn-popout' : ''}`}>
    {!route.popout && narrowWorkspace && <p className="fn-layout-note">Full-width tablet panels · collapse or pop out to reclaim space. Center windows resize in Columns.</p>}
    {route.popout && <div className="fn-popout-bar"><a href="#/fantasy-news" target="_blank" rel="noopener noreferrer">← Full workspace</a><strong>Bowser · {NEWS_PANES[route.pane].title}</strong><button className="lhq-mini lhq-outline" onClick={() => { if (window.opener && !window.opener.closed) { window.opener.postMessage({ type:'bowser-fantasy-news-dock',pane:route.pane },window.location.origin); window.close(); } else { window.location.hash='/fantasy-news'; window.location.reload(); } }}>Return to workspace</button></div>}
    <div className="fn-filter-row"><label className="fn-search"><span className="fn-sr-only">Search news</span><input aria-label="Search news" type="search" placeholder="Search player, headline or report" value={search} onChange={event => setSearch(event.target.value)}/></label><label>Source<select aria-label="News source" value={effectiveSource} onChange={event => setSource(event.target.value)}><option value="all">All sources</option>{options.sources.map(value => <option key={value}>{value}</option>)}</select></label><button className="fn-reset-filter" onClick={clearFilters}>Clear filters</button><span className="fn-read-status" role="status">{statusText}</span></div>
    <div className="fn-pool-row"><Pool tabs={Object.entries(CATEGORIES).map(([key,label]) => ({key,label,count:key === 'all' ? articles.length : articles.filter(article => articleCategories(article).includes(key)).length}))} value={category} onChange={setCategory}/></div>
    {feed.error && <div className="fn-notice error" role="alert">{feed.error} {feed.data ? 'Last successful feed retained in memory.' : 'No values substituted.'}<button onClick={() => setRefresh(value => value + 1)}>Try again</button></div>}
    {!feed.loading && ['stale','partial','unavailable'].includes(meta?.state) && <div className="fn-notice caution">{meta.message || `Feed ${meta.state}.`}<span>Latest source {stamp(meta.freshness?.latestSourcePublishedAt)} · feed read {stamp(feed.readAt)}</span></div>}
    {storageError && <div className="fn-notice caution" role="alert">Layout could not be saved in this browser. Pane controls still work for this visit.</div>}
    {windowNotice && <div className={`fn-notice ${windowNotice.includes('blocked') ? 'caution' : ''}`} role={windowNotice.includes('blocked') ? 'alert' : 'status'}>{windowNotice}<button aria-label="Dismiss window notice" onClick={() => setWindowNotice('')}>×</button></div>}
    {!route.popout && <div className="fn-window-strip"><div><strong>WORKSPACE WINDOWS</strong><span>Docks stay independent of Arrange</span></div><div className="fn-window-buttons">{Object.entries(NEWS_PANES).map(([id,pane]) => <button key={id} aria-label={`Toggle ${pane.title}`} aria-pressed={enabled(id)} onClick={() => enabled(id) ? closePane(id) : openPane(id)}>{pane.title}<span>{enabled(id) ? windowStates[id] === 'open' ? ' ↗' : ' ✓' : ' +'}</span></button>)}</div><div className="fn-layout-controls"><label className="fn-layout-label">Arrange<select aria-label="Workspace arrangement" value={layout.mode} onChange={event => setLayout(old => ({...old,mode:event.target.value}))}><option value="tiles">Tiles</option><option value="columns">Columns</option><option value="stacked">Stack</option></select></label><button onClick={() => { closeFantasyNewsWindows(); setLayout(defaultLayout()); setWindowNotice('Default window layout restored.'); }}>Reset layout</button></div></div>}
    {!route.popout && <div className="fn-restore-windows">{layout.panes.filter(pane => pane.collapsed).map(pane => <button key={pane.id} aria-label={`Expand ${NEWS_PANES[pane.id].title}`} onClick={() => patchPane(pane.id,{collapsed:false})}>▸ {NEWS_PANES[pane.id].title}</button>)}</div>}
    {route.popout ? <div className="fn-workspace">{panes.map((pane,index) => renderPane(pane,index))}</div> : <div className="fn-frame" aria-label="Fantasy news workspace">
      {renderDock('feed',layout.left)}
      <div ref={centralWorkspace} className="fn-central-workspace" role="region" aria-label="Central research panels"><div className={`fn-workspace ${layout.mode}`} style={{gridTemplateColumns:tileColumns}}>{panes.map((pane,index) => renderPane(pane,index))}</div>{!panes.length && <div className="fn-central-empty"><strong>Research panels hidden</strong><p>Enable Evidence desk, Player focus, Role & performance or Source coverage above.</p></div>}</div>
      {renderDock('acquisition',layout.acquisition)}
    </div>}
    <div className="fn-footer"><span>{clean(meta?.timeFilterBasis).includes('undated_reports') ? `Target window: ${hours}h · undated reports have unverified age` : clean(meta?.timeFilterBasis).includes('overlapping_calendar_dates') ? `Target window: ${hours}h · unknown-timezone dates may overlap this window` : `News window: last ${hours} hours`} · original source clocks preserved · {meta?.coverage?.complete ? 'reported complete coverage' : 'partial or unverified coverage'}</span><span>Article and Yahoo response bodies stay in memory</span></div>
  </div>;
  const readControls = <><button className="lhq-mini" disabled={feed.loading} onClick={() => setRefresh(value => value + 1)}>{feed.loading ? 'Reading…' : 'Refresh feed'}</button><label className="fn-auto-read"><input type="checkbox" checked={autoRead} onChange={event => setAutoRead(event.target.checked)}/>Auto read stored feed · 60s</label></>;
  if (route.popout) return <div className="lhq fn-popout-shell"><div className="fn-popout-controls"><Picker label="News window" value={hours} onChange={value => setHours(Number(value))} options={WINDOWS.map(value => [value, value === 720 ? '30 days · historical' : `${value} hours`])}/>{readControls}</div>{body}</div>;
  return <Shell page="fantasy-news" stacks={<><div className="lhq-stack"><span>Workspace</span><strong>Fantasy News</strong></div><Picker label="News window" value={hours} onChange={value => setHours(Number(value))} options={WINDOWS.map(value => [value, value === 720 ? '30 days · historical' : `${value} hours`])}/><div className="lhq-stack"><span>Latest feed read</span><strong>{stamp(feed.readAt)}</strong></div></>} actions={readControls} sources={<><Source label="NEWS SOURCE" title={meta?.snapshotMode === 'archived_public_baseline' ? 'Archived official reports' : 'Public NFL reports'} detail={`${articles.length} returned · ${meta?.freshness?.basis === 'source_check' ? `checked ${stamp(meta.freshness.sourceCheckedAt)}` : meta?.snapshotMode === 'archived_public_baseline' ? 'static dated archive' : meta?.state || 'reading'}`} help="Read-only source-linked news. Provider ingestion and browser feed reads are separate operations."/><Source label="ROSTER CONTEXT" title={connected ? 'Authorized Yahoo rosters' : 'Yahoo unavailable'} detail={connected ? `${yahoo.coverage?.loadedTeams ?? 0} loaded teams · ${season}` : 'connect to identify your players'} help="Only affirmative exact matches in your loaded Yahoo roster are used. Private account data stays in memory."/><span className="lhq-source-note">{meta?.freshness?.basis === 'source_check' ? `Sources checked ${stamp(meta.freshness.sourceCheckedAt)}` : `Published ${stamp(meta?.freshness?.latestSourcePublishedAt)}`} · read-only</span></>}>{body}</Shell>;
}
