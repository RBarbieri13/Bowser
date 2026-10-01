import { useEffect, useMemo, useRef, useState } from 'react';
import { Picker, PlayerName, Pool, Shell, Source } from './shared.jsx';
import { publicIdentityKey } from './playerIdentity.js';
import { stamp } from './model.js';
import './FantasyNews.css';

export const NEWS_LAYOUT_KEY = 'bowser:fantasy-news:layout:v1';
export const NEWS_PANES = {
  feed: { title: 'News stream', label: 'ALL NEWS', width: 520 },
  evidence: { title: 'Evidence desk', label: 'SOURCE DETAIL', width: 520 },
  injuries: { title: 'Injuries & practice', label: 'HEALTH', width: 520 },
  roles: { title: 'Role & performance', label: 'ROLE & PERFORMANCE', width: 520 },
  player: { title: 'Player focus', label: 'PLAYER CONTEXT', width: 340 },
  roster: { title: 'My roster angle', label: 'PRIVATE YAHOO', width: 340 },
  sources: { title: 'Source coverage', label: 'FEED HEALTH', width: 340 },
};
const CATEGORIES = { all: 'All news', injury: 'Injuries', practice: 'Practice', playing_time: 'Playing time', fantasy_news: 'Fantasy news' };
const WINDOWS = [24, 72, 168, 720];
const DEFAULT_PANES = ['feed', 'injuries', 'roles', 'evidence'];
const list = value => Array.isArray(value) ? value : [];
const clean = value => typeof value === 'string' ? value : '';
const paneWindows = new Map(); // Window handles only; news and account data never enter storage.
const defaultLayout = () => ({ version: 1, mode: 'tiles', panes: DEFAULT_PANES.map(id => ({ id, width: NEWS_PANES[id].width, collapsed: false })) });

/** Project a saved preference onto code-owned pane IDs and bounded geometry. */
export function validateNewsLayout(value) {
  if (value?.version !== 1 || !Array.isArray(value.panes)) return defaultLayout();
  const seen = new Set();
  const panes = value.panes.filter(pane => pane && Object.hasOwn(NEWS_PANES, pane.id) && !seen.has(pane.id) && seen.add(pane.id)).slice(0, 7).map(pane => ({
    id: pane.id,
    width: typeof pane.width === 'number' && Number.isFinite(pane.width) ? Math.min(1200, Math.max(280, Math.round(pane.width))) : NEWS_PANES[pane.id].width,
    collapsed: pane.collapsed === true,
  }));
  if (!panes.some(pane => pane.id === 'feed')) panes.unshift({ id: 'feed', width: NEWS_PANES.feed.width, collapsed: false });
  return { version: 1, mode: ['tiles', 'stacked', 'columns'].includes(value.mode) ? value.mode : 'tiles', panes };
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
function articleTime(article) { return Date.parse(article?.publishedAt) || Date.parse(article?.publishedDate) || Date.parse(article?.updatedAt) || 0; }
function publicationClock(item, compact = false) { return item?.publishedAt ? stamp(item.publishedAt) : compact && item?.publishedDate ? `${item.publishedDate} · TZ unknown` : item?.publishedAtRaw || 'Unavailable'; }
function categoryLabel(article) { return articleCategories(article).map(category => CATEGORIES[category]).join(' · ') || 'Fantasy news'; }
function sourceName(source) { return clean(source?.sourceName || source?.name) || 'Source unavailable'; }
function articleSources(article) { return list(article?.sources).filter(source => source && typeof source === 'object'); }
function playerRow(player, season, scoring) { return { ...player, player_id: player.playerId || player.player_id || null, player_display_name: player.name, season, scoring }; }
function samePlayer(left, right) {
  const a = left?.playerId || left?.player_id, b = right?.playerId || right?.player_id;
  return a && b ? a === b : Boolean(publicIdentityKey(left) && publicIdentityKey(left) === publicIdentityKey(right));
}

/** Affirmative roster matches only. Ambiguous identities stay unknown. */
export function newsRosterMatches(article, yahoo, season) {
  if (!yahoo?.account || yahoo.account.season && Number(yahoo.account.season) !== Number(season)) return [];
  const matches = [];
  for (const team of list(yahoo.teams)) {
    const dashboard = yahoo.dashboards?.[team.key];
    if (dashboard?.teamKey !== team.key || Number(dashboard.season) !== Number(season) || dashboard.roster?.week !== dashboard.week) continue;
    const roster = list(dashboard.roster?.players);
    for (const player of articlePlayers(article)) {
      const found = roster.filter(candidate => samePlayer(player, candidate));
      if (found.length === 1) matches.push({ player: found[0], teamName: team.name, teamKey: team.key, leagueName: list(yahoo.leagues).find(league => league.key === team.leagueKey)?.name || 'League', week: dashboard.week, checkedAt: dashboard.checkedAt });
    }
  }
  return matches;
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
    <div className="fn-detail-context"><EvidenceBadge article={article}/><span>{categoryLabel(article)}</span>{article.freshness?.state === 'stale' && <span className="fn-caution">Older report</span>}</div>
    <h2>{article.headline}</h2>
    <div className="fn-detail-players">{players.map((player, index) => <span key={`${player.playerId || player.name}-${index}`}>{player.playerId || player.player_id ? <PlayerName row={playerRow(player, season, scoring)} onOpen={onOpen}/> : <strong>{player.name}</strong>}<small>{player.team || '—'} · {player.position || '—'}</small></span>)}</div>
    <div className="fn-timestamps"><span>{article.timestampBasis === 'observed_at' ? 'Observed' : 'Published'} <time dateTime={article.publishedAt || article.publishedDate || undefined}>{publicationClock(article)}</time></span><span>Record updated <time dateTime={article.updatedAt || undefined}>{stamp(article.updatedAt)}</time></span>{article.checkedAt && <span>Source checked {stamp(article.checkedAt)} · separate from publication</span>}{article.capturedAt && <span>Captured {stamp(article.capturedAt)}</span>}</div>
    <section><h3>Report</h3><p>{article.summary || 'No publisher summary was returned. Open the linked source for the report.'}</p></section>
    {article.fantasyAnalysis && <section><h3>Fantasy context</h3><p>{article.fantasyAnalysis}</p></section>}
    {article.injury?.isInjuryRelated && <dl className="fn-facts">{[['Body part', article.injury.bodyPart], ['Practice', article.injury.practiceStatus], ['Game status', article.injury.gameStatus], ['Expected return', article.injury.expectedReturn]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Unavailable'}</dd></div>)}</dl>}
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
    <details className="fn-methodology"><summary>Freshness & methodology</summary><p>Refresh feed reads the latest stored reports. It does not run provider ingestion.</p><p>Publication, observation, update and read times describe different events. An older report remains labeled older even after a successful feed read.</p>{clean(meta?.timeFilterBasis).includes('overlapping_calendar_dates') && <p>Unknown-timezone publication dates are included when their possible calendar-day interval overlaps the target news window. Their precise age and inclusion within the last {meta.lookbackHours || 'selected'} hours are unverified.</p>}<p>Player identities require an exact stable ID or an unambiguous name, team and position match. Missing values remain unavailable.</p>{list(meta?.coverage?.limitations).map((limitation, index) => <p key={index}>{limitation}</p>)}{meta?.refresh && <p>Last successful ingestion: {stamp(meta.refresh.lastSuccessfulRunAt)}. Scheduler {meta.refresh.schedulerVerified ? 'verified' : 'not verified'}. {meta.refresh.ready ? 'Operator ingestion configured.' : 'Operator ingestion unavailable.'}</p>}</details>
  </div>;
}

function PlayerFocus({ article, articles, season, scoring, onOpen, select }) {
  const players = articlePlayers(article);
  return <div className="fn-player-focus">{!players.length ? <div className="fn-empty"><strong>No selected player</strong><p>Select a player report to compare its coverage across sources.</p></div> : players.map((player, index) => {
    const related = articles.filter(item => articlePlayers(item).some(candidate => samePlayer(player, candidate)));
    return <section key={`${player.name}-${index}`}><div className="fn-focus-player">{player.playerId || player.player_id ? <PlayerName row={playerRow(player, season, scoring)} onOpen={onOpen}/> : <strong>{player.name}</strong>}<span>{player.team || '—'} · {player.position || '—'}</span></div><div className="fn-focus-summary"><span>{related.length} returned reports</span><span>{new Set(related.flatMap(item => articleSources(item).map(sourceName))).size} linked publications</span></div>{!player.playerId && !player.player_id && <p className="fn-note">Warehouse player identity unavailable. No statistics are inferred.</p>}{related.map(item => <button className="fn-related" key={item.id} onClick={() => select(item.id)} aria-pressed={article.id === item.id}><strong>{item.headline}</strong><span>{item.source} · {publicationClock(item, true)}</span><EvidenceBadge article={item}/></button>)}</section>; })}<p className="fn-note">These are returned reports in the selected timestamp window. Source mentions do not prove role, opportunity or roster ownership.</p></div>;
}

function RosterAngle({ yahoo, articles, season, select, selectedId }) {
  const connected = Boolean(yahoo?.account && (!yahoo.account.season || Number(yahoo.account.season) === Number(season)));
  if (!connected) return <div className="fn-empty"><strong>Yahoo roster context unavailable</strong><p>Connect your account to identify reports about players in your loaded, authorized rosters.</p><a className="lhq-mini lhq-outline" href="#/yahoo">Open Yahoo Connection</a><p className="fn-note">NFL news remains public. Private league and roster responses stay in memory.</p></div>;
  const loaded = list(yahoo.teams).filter(team => { const dashboard = yahoo.dashboards?.[team.key]; return dashboard?.teamKey === team.key && Number(dashboard.season) === Number(season) && Array.isArray(dashboard.roster?.players) && dashboard.roster.week === dashboard.week; });
  const matches = articles.map(article => ({ article, owned: newsRosterMatches(article, yahoo, season) })).filter(item => item.owned.length);
  return <div className="fn-roster"><div className="fn-coverage-summary"><strong>{loaded.length} of {list(yahoo.teams).length} owned rosters loaded</strong><p>{season} Yahoo · {matches.length} matched reports · partial coverage until every roster is loaded. A missing match does not prove a player is unowned.</p></div>{loaded.map(team => { const dashboard = yahoo.dashboards[team.key]; return <div className="fn-roster-context" key={team.key}><strong>{team.name}</strong><span>Week {dashboard.week} · read {stamp(dashboard.checkedAt)}</span></div>; })}{matches.map(({ article, owned }) => <button className="fn-related" key={article.id} onClick={() => select(article.id)} aria-pressed={selectedId === article.id}><strong>{article.headline}</strong><span>{article.source} · {publicationClock(article, true)}</span>{owned.map((match, index) => <small key={`${match.teamKey}-${index}`}>{match.player.name} · {match.player.slot || 'Slot unavailable'} · {match.teamName} / {match.leagueName} · W{match.week}</small>)}</button>)}{!matches.length && <div className="fn-empty"><strong>No exact roster reports returned</strong><p>No ownership or news absence is inferred from this partial window.</p></div>}{Object.keys(yahoo.errors || {}).length > 0 && <p className="fn-caution" role="alert">Some Yahoo reads are unavailable. Check Yahoo Connection for the current account state.</p>}<p className="fn-note">Yahoo lineup week and news publication window are independent. Only affirmative matches in the loaded owned roster are shown.</p></div>;
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
  const [windowStates, setWindowStates] = useState({}), [windowNotice, setWindowNotice] = useState('');
  const [clock, setClock] = useState(Date.now);
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
  const connected = Boolean(yahoo?.account && (!yahoo.account.season || Number(yahoo.account.season) === Number(season)));
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
  const patchPane = (id, patch) => setLayout(old => {
    const visible = old.panes.filter(pane => !pane.collapsed), index = visible.findIndex(pane => pane.id === id);
    const columnId = old.mode === 'tiles' && patch.width !== undefined ? visible[index % 2]?.id : null;
    return { ...old, panes: old.panes.map(pane => pane.id === id || pane.id === columnId ? { ...pane, ...patch } : pane) };
  });
  const openPane = id => setLayout(old => ({ ...old, panes: old.panes.some(pane => pane.id === id) ? old.panes.map(pane => pane.id === id ? { ...pane, collapsed: false } : pane) : [...old.panes, { id, width: NEWS_PANES[id].width, collapsed: false }] }));
  const closePane = id => { try { paneWindows.get(id)?.close(); } catch { /* Browser window may already be gone. */ } paneWindows.delete(id); setWindowStates(old => ({ ...old, [id]: 'closed' })); setLayout(old => ({ ...old, panes: old.panes.filter(pane => pane.id !== id) })); };
  const select = (id, inspect = false) => { setSelectedId(id); if (inspect && !route.popout) openPane('evidence'); };
  const toggle = id => setExpanded(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const movePane = (id, direction) => setLayout(old => {
    const panes = [...old.panes], visible = old.mode === 'tiles' ? panes.filter(pane => !pane.collapsed) : panes;
    const target = visible[visible.findIndex(pane => pane.id === id) + direction];
    if (target) { const from = panes.findIndex(pane => pane.id === id), to = panes.findIndex(pane => pane.id === target.id); [panes[from], panes[to]] = [panes[to], panes[from]]; }
    return { ...old, panes };
  });
  const resizePane = (event, pane) => {
    event.preventDefault();
    const start = event.clientX, width = pane.width;
    const move = event => patchPane(pane.id, { width: Math.max(280, Math.min(1200, width + event.clientX - start)) });
    const end = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end); };
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
  const content = id => {
    if (id === 'feed') return <ArticleStream {...streamProps} articles={filtered} label="News stream" emptyText={meta?.state === 'unavailable' ? 'News feed unavailable' : undefined}/>;
    if (id === 'injuries') return <><p className="fn-pane-scope">All loaded injuries and practice reports · {hours}h · independent of stream filters</p><ArticleStream {...streamProps} articles={articles.filter(article => articleCategories(article).some(category => ['injury', 'practice'].includes(category)))} label="Injuries and practice"/></>;
    if (id === 'roles') return <><p className="fn-pane-scope">Role / performance reports · {hours}h · future usage remains unconfirmed</p><ArticleStream {...streamProps} articles={articles.filter(article => articleCategories(article).includes('playing_time') || ['COACH_COMMENT', 'PERFORMANCE'].includes(article.eventType))} label="Playing time reports"/></>;
    if (id === 'evidence') return <><div className="fn-evidence-controls"><label>Report<select aria-label="Evidence report" value={selected?.id || ''} onChange={event => { setPinned(''); setSelectedId(event.target.value); }}><option value="">Select a report</option>{articles.map(article => <option value={article.id} key={article.id}>{article.headline}</option>)}</select></label><button aria-pressed={Boolean(pinned)} disabled={!selected} onClick={() => setPinned(pinned ? '' : selected.id)}>{pinned ? 'Unpin' : 'Pin report'}</button></div><ArticleDetail article={selected} season={season} scoring={scoring} onOpen={onOpen}/></>;
    if (id === 'player') return <PlayerFocus article={selected} articles={articles} season={season} scoring={scoring} onOpen={onOpen} select={select}/>;
    if (id === 'roster') return <RosterAngle yahoo={yahoo} articles={articles} season={season} select={select} selectedId={selected?.id}/>;
    return <SourceCoverage meta={meta} articles={articles} chooseSource={setSource} selectedSource={source}/>;
  };
  const allPanes = route.popout ? [{ id: route.pane, width: NEWS_PANES[route.pane].width, collapsed: false }] : layout.panes;
  const panes = layout.mode === 'tiles' && !route.popout ? allPanes.filter(pane => !pane.collapsed) : allPanes;
  const tileWeights = panes.slice(0, 2).map(pane => pane.width);
  const tileColumns = !route.popout && layout.mode === 'tiles' && panes.length > 1 ? `minmax(280px,${tileWeights[0]}fr) minmax(280px,${tileWeights[1]}fr)` : undefined;
  const statusText = feed.loading ? feed.data ? 'Reading latest stored feed…' : 'Reading sourced reports…' : feed.error ? feed.data ? 'Read failed · last successful feed retained' : 'News read unavailable' : `${filtered.length} visible / ${articles.length} returned · ${meta?.state || 'unavailable'}`;
  const body = <div className={`fantasy-news ${route.popout ? 'fn-popout' : ''}`}>
    {route.popout && <div className="fn-popout-bar"><a href="#/fantasy-news" target="_blank" rel="noopener noreferrer">← Full workspace</a><strong>Bowser · {NEWS_PANES[route.pane].title}</strong><button className="lhq-mini lhq-outline" onClick={() => { if (window.opener && !window.opener.closed) { window.opener.postMessage({ type: 'bowser-fantasy-news-dock', pane: route.pane }, window.location.origin); window.close(); } else { window.location.hash = '/fantasy-news'; window.location.reload(); } }}>Return to workspace</button></div>}
    <div className="fn-filter-row"><label className="fn-search"><span className="fn-sr-only">Search news</span><input aria-label="Search news" type="search" placeholder="Search player, headline or report" value={search} onChange={event => setSearch(event.target.value)}/></label><label>Source<select aria-label="News source" value={options.sources.includes(source) ? source : 'all'} onChange={event => setSource(event.target.value)}><option value="all">All sources</option>{options.sources.map(value => <option key={value}>{value}</option>)}</select></label><button className="fn-roster-filter" aria-pressed={rosterOnly} disabled={!connected} title={!connected ? 'Connect Yahoo and load authorized rosters' : 'Only affirmative matches in loaded rosters'} onClick={() => setRosterOnly(value => !value)}>My roster{!connected && ' · unavailable'}</button><button className="fn-reset-filter" onClick={clearFilters}>Clear filters</button></div>
    <div className="fn-pool-row"><Pool tabs={Object.entries(CATEGORIES).map(([key, label]) => ({ key, label, count: key === 'all' ? articles.length : articles.filter(article => articleCategories(article).includes(key)).length }))} value={category} onChange={setCategory}/><span className="fn-read-status" role="status">{statusText}</span></div>
    {feed.error && <div className="fn-notice error" role="alert">{feed.error} {feed.data ? 'Last successful feed retained in memory.' : 'No values substituted.'}<button onClick={() => setRefresh(value => value + 1)}>Try again</button></div>}
    {!feed.loading && ['stale', 'partial', 'unavailable'].includes(meta?.state) && <div className="fn-notice caution">{meta.message || `Feed ${meta.state}.`}<span>Latest source {stamp(meta.freshness?.latestSourcePublishedAt)} · feed read {stamp(feed.readAt)}</span></div>}
    {storageError && <div className="fn-notice caution" role="alert">Layout could not be saved in this browser. Pane controls still work for this visit.</div>}
    {windowNotice && <div className={`fn-notice ${windowNotice.includes('blocked') ? 'caution' : ''}`} role={windowNotice.includes('blocked') ? 'alert' : 'status'}>{windowNotice}<button aria-label="Dismiss window notice" onClick={() => setWindowNotice('')}>×</button></div>}
    {!route.popout && <div className="fn-window-strip"><div><strong>WORKSPACE WINDOWS</strong><span>{layout.panes.length} open · {storageError ? 'layout save unavailable' : 'layout saved locally'}</span></div><div className="fn-window-buttons">{Object.entries(NEWS_PANES).filter(([id]) => id !== 'feed').map(([id, pane]) => <button key={id} aria-pressed={layout.panes.some(item => item.id === id && !item.collapsed)} onClick={() => openPane(id)}>{pane.title}<span>{layout.panes.some(item => item.id === id) ? windowStates[id] === 'open' ? ' ↗' : ' ✓' : ' +'}</span></button>)}</div><div className="fn-layout-controls"><label className="fn-layout-label">Arrange<select aria-label="Workspace arrangement" value={layout.mode} onChange={event => setLayout(old => ({ ...old, mode: event.target.value }))}><option value="tiles">Tiles</option><option value="columns">Columns</option><option value="stacked">Stack</option></select></label><button onClick={() => { for (const id of [...paneWindows.keys()]) dock(id); setLayout(defaultLayout()); setWindowNotice('Default window layout restored.'); }}>Reset layout</button></div></div>}
    <div className="fn-restore-windows">{!route.popout && layout.mode === 'tiles' && allPanes.filter(pane => pane.collapsed).map(pane => <button key={pane.id} aria-label={`Expand ${NEWS_PANES[pane.id].title}`} onClick={() => patchPane(pane.id, {collapsed:false})}>▸ {NEWS_PANES[pane.id].title}</button>)}</div>
    <div className={`fn-workspace ${!route.popout ? layout.mode : ''}`} style={{gridTemplateColumns:tileColumns}} aria-label="Fantasy news windows">
      {panes.map((pane, index) => {
        const definition = NEWS_PANES[pane.id], popped = !route.popout && windowStates[pane.id] === 'open';
        return <section key={pane.id} className={`fn-pane ${pane.id === 'feed' ? 'feed' : 'research'} ${pane.collapsed ? 'collapsed' : ''} ${popped ? 'popped' : ''}`} style={{ '--fn-pane-width': `${pane.width}px`, flexGrow: pane.width }} aria-label={definition.title}>
          <header className="fn-window-title"><div><small>{definition.label}</small><h2>{definition.title}</h2></div>{!route.popout && <div className="fn-pane-actions"><button aria-label={`${pane.collapsed ? 'Expand' : 'Collapse'} ${definition.title}`} aria-expanded={!pane.collapsed} onClick={() => patchPane(pane.id, { collapsed: !pane.collapsed })}>{pane.collapsed ? '▸' : '▾'}</button>{!pane.collapsed && <><button aria-label={`Move ${definition.title} left`} disabled={index === 0} onClick={() => movePane(pane.id, -1)}>←</button><button aria-label={`Move ${definition.title} right`} disabled={index === panes.length - 1} onClick={() => movePane(pane.id, 1)}>→</button><button aria-label={`${windowStates[pane.id] === 'closed' ? 'Reopen' : popped ? 'Focus' : 'Pop out'} ${definition.title}${windowStates[pane.id] === 'closed' || popped ? ' window' : ''}`} onClick={() => popOut(pane.id)}>↗</button>{pane.id !== 'feed' && <button aria-label={`Close ${definition.title}`} onClick={() => closePane(pane.id)}>×</button>}</>}</div>}</header>
          {!pane.collapsed && (popped ? <div className="fn-detached"><strong>Open in browser window</strong><p>{definition.title} reads the same public feed independently.</p><button className="lhq-mini" onClick={() => popOut(pane.id)}>Focus window</button><button className="lhq-mini lhq-outline" onClick={() => dock(pane.id)}>Return to workspace</button><button className="fn-text-button" onClick={() => dock(pane.id)}>Close browser window</button></div> : <div className="fn-pane-content" tabIndex={0}>{content(pane.id)}</div>)}
          {!route.popout && !pane.collapsed && !popped && <div className="fn-pane-resize" role="separator" aria-label={`Resize ${definition.title}`} aria-orientation="vertical" aria-valuemin={280} aria-valuemax={1200} aria-valuenow={pane.width} tabIndex={0} onPointerDown={event => resizePane(event, pane)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); patchPane(pane.id, { width: event.key === 'Home' ? 280 : event.key === 'End' ? 1200 : pane.width + (event.key === 'ArrowRight' ? 20 : -20) }); } }}/>}
        </section>;
      })}
    </div>
    <div className="fn-footer"><span>{clean(meta?.timeFilterBasis).includes('overlapping_calendar_dates') ? `Target window: ${hours}h · unknown-timezone dates may overlap this window` : `News window: last ${hours} hours`} · original source dates preserved · {meta?.coverage?.complete ? 'reported complete coverage' : 'partial or unverified coverage'}</span><span>Article and Yahoo response bodies stay in memory</span></div>
  </div>;
  const readControls = <><button className="lhq-mini" disabled={feed.loading} onClick={() => setRefresh(value => value + 1)}>{feed.loading ? 'Reading…' : 'Refresh feed'}</button><label className="fn-auto-read"><input type="checkbox" checked={autoRead} onChange={event => setAutoRead(event.target.checked)}/>Auto read stored feed · 60s</label></>;
  if (route.popout) return <div className="lhq fn-popout-shell"><div className="fn-popout-controls"><Picker label="News window" value={hours} onChange={value => setHours(Number(value))} options={WINDOWS.map(value => [value, value === 720 ? '30 days · historical' : `${value} hours`])}/>{readControls}</div>{body}</div>;
  return <Shell page="fantasy-news" stacks={<><div className="lhq-stack"><span>Workspace</span><strong>Fantasy News</strong></div><Picker label="News window" value={hours} onChange={value => setHours(Number(value))} options={WINDOWS.map(value => [value, value === 720 ? '30 days · historical' : `${value} hours`])}/><div className="lhq-stack"><span>Latest feed read</span><strong>{stamp(feed.readAt)}</strong></div></>} actions={readControls} sources={<><Source label="NEWS SOURCE" title={meta?.snapshotMode === 'archived_public_baseline' ? 'Archived official reports' : 'Public NFL reports'} detail={`${articles.length} returned · ${meta?.freshness?.basis === 'source_check' ? `checked ${stamp(meta.freshness.sourceCheckedAt)}` : meta?.snapshotMode === 'archived_public_baseline' ? 'static dated archive' : meta?.state || 'reading'}`} help="Read-only source-linked news. Provider ingestion and browser feed reads are separate operations."/><Source label="ROSTER CONTEXT" title={connected ? 'Authorized Yahoo rosters' : 'Yahoo unavailable'} detail={connected ? `${yahoo.coverage?.loadedTeams ?? 0} loaded teams · ${season}` : 'connect to identify your players'} help="Only affirmative exact matches in your loaded Yahoo roster are used. Private account data stays in memory."/><span className="lhq-source-note">{meta?.freshness?.basis === 'source_check' ? `Sources checked ${stamp(meta.freshness.sourceCheckedAt)}` : `Published ${stamp(meta?.freshness?.latestSourcePublishedAt)}`} · read-only</span></>}>{body}</Shell>;
}
