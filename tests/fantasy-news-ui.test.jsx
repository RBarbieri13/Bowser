// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { closeFantasyNewsWindows, FantasyNews, NEWS_LAYOUT_KEY, newsRosterMatches, safeNewsUrl, validateNewsLayout } from '../src/lhq/FantasyNews.jsx';
import { LhqProvider } from '../src/lhq/shared.jsx';

const props = { season: 2026, setSeason: vi.fn(), scoring: 'half', setScoring: vi.fn(), onOpen: vi.fn() };
const source = { sourceName: 'Official Fixture', url: 'https://example.test/report', publishedAt: '2026-09-30T12:00:00Z', sourceType: 'OFFICIAL', isOriginalSource: true, access: 'public', accessLabel: 'Public source', timestampBasis: 'published_at' };
const report = (id, name, category, position, extra = {}) => ({ id, headline: `${name} fixture report`, summary: `${name} exact sourced summary`, fantasyAnalysis: `${name} source context`, category, categories: [category], players: [{ playerId: `id-${id}`, name, team: 'NYG', position }], source: source.sourceName, url: source.url, publishedAt: '2026-09-30T12:00:00Z', updatedAt: '2026-09-30T13:00:00Z', capturedAt: null, sources: [source], status: 'CONFIRMED', evidence: { kind: 'official_report', label: 'Confirmed report', confidence: 92 }, freshness: { state: 'stale' }, ...extra });
const articles = [
  report('a', 'Fixture Alpha', 'injury', 'RB', { injury: { isInjuryRelated: true, bodyPart: 'ankle', practiceStatus: 'DNP', gameStatus: null, expectedReturn: null } }),
  report('b', 'Fixture Beta', 'practice', 'QB', { publishedAt: '2026-09-30T11:00:00Z', sources: [{ ...source, sourceName: 'Second Publication', url: 'https://example.test/beta' }] }),
  report('c', 'Fixture Gamma', 'playing_time', 'WR', { publishedAt: '2026-09-30T10:00:00Z', players: [{ playerId: null, name: 'Fixture Gamma', team: 'NYG', position: 'WR' }] }),
  report('d', 'Fixture Delta', 'fantasy_news', 'TE', { publishedAt: '2026-09-30T09:00:00Z', evidence: { kind: 'rumor', label: 'Rumor', confidence: null } }),
];
const payload = (rows = articles, patch = {}) => ({ articles: rows, meta: { version: 1, scope: 'public_nfl_news', snapshotMode: 'durable_active_snapshot', state: 'stale', live: false, message: 'Public source reports are stale; verify the original reporting.', readAt: '2026-10-01T12:00:00Z', total: rows.length, freshness: { latestSourcePublishedAt: '2026-09-30T12:00:00Z' }, coverage: { complete: false, limitations: ['Bounded source coverage'] }, refresh: { schedulerVerified: false, ready: false, lastSuccessfulRunAt: null }, sources: [{ id: 'official', name: 'Official reports', ready: false, message: 'Provider read unavailable' }], ...patch } });
const reply = data => ({ ok: true, json: async () => data });
const renderPage = (overrides = {}) => render(<LhqProvider><FantasyNews {...props} {...overrides}/></LhqProvider>);
const pane = name => screen.getByRole('region', { name, exact: true });
const streamRows = () => within(pane('News stream')).getAllByRole('button', { name: /^Expand .* fixture report$/ });
const ready = () => within(pane('News stream')).findByRole('button', { name: 'Expand Fixture Alpha fixture report' });
function yahoo(accountName = 'Private Team A', playerName = 'Fixture Alpha') {
  const teamKey = `461.l.${accountName === 'Private Team A' ? '1' : '2'}.t.1`;
  return { account: { season: 2026, privateSecret: accountName }, teams: [{ key: teamKey, name: accountName, leagueKey: teamKey.split('.t.')[0] }], leagues: [{ key: teamKey.split('.t.')[0], name: `${accountName} League` }], dashboards: { [teamKey]: { teamKey, season: 2026, week: 4, checkedAt: '2026-10-01T11:00:00Z', roster: { week: 4, players: [{ key: '461.p.1', name: playerName, position: 'RB', team: 'NYG', slot: 'RB' }] } } }, coverage: { loadedTeams: 1 }, errors: {} };
}
function childWindow() {
  const child = { closed: false, focus: vi.fn(), postMessage: vi.fn(), close: vi.fn() };
  child.close.mockImplementation(() => { child.closed = true; });
  return child;
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/#/fantasy-news');
  vi.stubGlobal('fetch', vi.fn(async () => reply(payload())));
  props.onOpen.mockClear(); props.setSeason.mockClear(); props.setScoring.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('dense native stream exposes real source details and accessible independent expansion', async () => {
  renderPage(); await ready();
  expect(streamRows()).toHaveLength(4);
  expect(pane('Evidence desk')).toBeInTheDocument(); expect(pane('Injuries & practice')).toBeInTheDocument(); expect(pane('Role & performance')).toBeInTheDocument();
  const headline = within(pane('News stream')).getByRole('button', { name: 'Expand Fixture Alpha fixture report' });
  expect(headline).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(headline);
  expect(headline).toHaveAttribute('aria-expanded', 'true');
  expect(within(pane('News stream')).getByText('Fixture Alpha exact sourced summary')).toBeInTheDocument();
  expect(within(pane('News stream')).getByText('DNP')).toBeInTheDocument();
  expect(within(pane('News stream')).getAllByText('Unavailable')).toHaveLength(2);
  const link = within(pane('News stream')).getByRole('link', { name: 'Official Fixture ↗' });
  expect(link).toHaveAttribute('href', source.url); expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  fireEvent.click(headline); expect(headline).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(within(pane('Evidence desk')).getByRole('button', { name: 'Fixture Alpha', exact: true }));
  expect(props.onOpen.mock.calls[0][0]).toMatchObject({ player_id: 'id-a', season: 2026, scoring: 'half' });
});

test('news categories, source and search controls compose without altering other viewing angles', async () => {
  renderPage(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Injuries (1)', exact: true }));
  expect(streamRows()).toHaveLength(1);
  expect(within(pane('Role & performance')).getByRole('button', { name: 'Expand Fixture Gamma fixture report' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.queryByLabelText('News position')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('News team')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Player scoring')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('News source'), { target: { value: 'Second Publication' } });
  expect(streamRows()).toHaveLength(1); expect(streamRows()[0]).toHaveTextContent('Fixture Beta');
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  fireEvent.change(screen.getByLabelText('Search news'), { target: { value: 'exact sourced summary' } });
  expect(streamRows()).toHaveLength(4);
  fireEvent.change(screen.getByLabelText('Search news'), { target: { value: 'Delta' } }); expect(streamRows()).toHaveLength(1);
  expect(within(pane('Evidence desk')).getByText('Fixture Alpha exact sourced summary')).toBeInTheDocument();
});

test('evidence can be pinned while another article and player context are inspected', async () => {
  renderPage(); await ready();
  fireEvent.click(within(pane('Evidence desk')).getByRole('button', { name: 'Pin report' }));
  fireEvent.click(within(pane('News stream')).getByRole('button', { name: 'Inspect Fixture Beta fixture report' }));
  expect(within(pane('Evidence desk')).getByText('Fixture Alpha exact sourced summary')).toBeInTheDocument();
  fireEvent.click(within(pane('Evidence desk')).getByRole('button', { name: 'Unpin' }));
  expect(within(pane('Evidence desk')).getByText('Fixture Beta exact sourced summary')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Player focus \+/ }));
  expect(within(pane('Player focus')).getByRole('button', { name: 'Fixture Beta', exact: true })).toBeInTheDocument();
});

test('only validated versioned layout geometry persists across close, reorder, keyboard resize and remount', async () => {
  const view = renderPage(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Close Injuries & practice' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close Role & performance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move Evidence desk left' }));
  const resize = screen.getByRole('separator', { name: 'Resize Evidence desk' });
  fireEvent.keyDown(resize, { key: 'ArrowRight' }); expect(resize).toHaveAttribute('aria-valuenow', '540');
  fireEvent.keyDown(resize, { key: 'Home' }); expect(resize).toHaveAttribute('aria-valuenow', '280');
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Evidence desk' }));

  const saved = JSON.parse(localStorage.getItem(NEWS_LAYOUT_KEY));
  expect(saved).toEqual({ version: 1, mode: 'tiles', panes: [{ id: 'evidence', width: 280, collapsed: true }, { id: 'feed', width: 520, collapsed: false }] });
  view.unmount(); renderPage(); await ready();
  expect(screen.getByRole('button', { name: 'Expand Evidence desk' })).toBeInTheDocument(); expect(screen.queryByRole('region', { name: 'Source coverage' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }));
  expect(JSON.parse(localStorage.getItem(NEWS_LAYOUT_KEY)).panes.map(item => item.id)).toEqual(['feed', 'injuries', 'roles', 'evidence']);
});

test('malformed stored preferences cannot inject pane content, unknown keys or unbounded geometry', async () => {
  localStorage.setItem(NEWS_LAYOUT_KEY, JSON.stringify({ version: 1, mode: 'floating-secret', account: 'PRIVATE_BODY', panes: [null, { id: 'evidence', width: -200, collapsed: true, article: articles[0] }, { id: 'evidence', width: 900 }, { id: 'roster', width: 99999, private: 'PRIVATE_BODY' }, { id: 'unknown', width: 400 }] }));
  renderPage(); await ready();
  const stored = JSON.parse(localStorage.getItem(NEWS_LAYOUT_KEY));
  expect(stored).toEqual({ version: 1, mode: 'tiles', panes: [{ id: 'feed', width: 520, collapsed: false }, { id: 'evidence', width: 280, collapsed: true }, { id: 'roster', width: 1200, collapsed: false }] });
  expect(JSON.stringify(stored)).not.toContain('PRIVATE_BODY'); expect(JSON.stringify(stored)).not.toContain('headline');
  expect(validateNewsLayout({ version: 9, panes: [] }).panes.map(item => item.id)).toEqual(['feed', 'injuries', 'roles', 'evidence']);
});

test('blocked preference storage leaves the complete workspace usable', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  renderPage(); await ready();
  expect(screen.getByRole('alert')).toHaveTextContent('Layout could not be saved');
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Evidence desk' }));
  expect(screen.getByRole('button', { name: 'Expand Evidence desk' })).toBeInTheDocument();
});

test('initial loading, empty unavailable response and retry have explicit separate states', async () => {
  let resolveRead;
  fetch.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
  renderPage(); expect(within(pane('News stream')).getByText('Reading sourced NFL reports…')).toBeInTheDocument();
  await act(async () => resolveRead(reply(payload([], { state: 'unavailable', message: 'No verified public snapshot exists.' }))));
  expect(within(pane('News stream')).getByText('News feed unavailable')).toBeInTheDocument();
  fetch.mockRejectedValueOnce(new Error('Network offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh feed' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Network offline');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' })); await ready(); expect(streamRows()).toHaveLength(4);
});

test('failed refresh preserves the last successful feed in memory and does not claim success', async () => {
  renderPage(); await ready();
  fetch.mockRejectedValueOnce(new Error('Provider unreachable'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh feed' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Last successful feed retained in memory');
  expect(streamRows()).toHaveLength(4); expect(screen.getByRole('status')).toHaveTextContent('Read failed');
  expect(localStorage.getItem(NEWS_LAYOUT_KEY)).not.toContain('Fixture');
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
});

test('older time-window responses cannot overwrite a newly selected news window', async () => {
  let resolveOld;
  fetch.mockImplementation(url => String(url).includes('hours=168') ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(reply(payload([articles[1]]))));
  renderPage(); fireEvent.change(screen.getByLabelText('News window'), { target: { value: '24' } });
  await within(pane('News stream')).findByRole('button', { name: 'Expand Fixture Beta fixture report' });
  await act(async () => resolveOld(reply(payload())));
  expect(streamRows()).toHaveLength(1); expect(streamRows()[0]).toHaveTextContent('Fixture Beta');
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
});

test('archived unknown-timezone source clocks remain raw and never use feed read time as publication', async () => {
  const raw = 'September 30, 2026, 3:05 PM (timezone unspecified)';
  const archive = { ...articles[0], publishedAt: null, updatedAt: null, publishedAtRaw: raw, publishedDate: '2026-09-30', timestampStatus: 'timezone_unspecified', checkedAt: '2026-10-01T11:00:00Z', sources: [{ ...source, publishedAt: null, publishedAtRaw: raw, publishedDate: '2026-09-30' }] };
  fetch.mockResolvedValue(reply(payload([archive], { snapshotMode: 'archived_public_baseline', timeFilterBasis: 'exact_timestamps_and_overlapping_calendar_dates', lookbackHours: 168, message: 'Archived public reporting only. Unattended ingestion is unavailable.', freshness: { latestSourcePublishedAt: null } })));
  renderPage(); await ready();
  fireEvent.click(screen.getByRole('button', { name: /^Source coverage \+/ }));
  expect(within(pane('Source coverage')).getByText('Static dated public archive')).toBeInTheDocument();
  expect(screen.getByText('Unattended ingestion unavailable')).toBeInTheDocument();
  expect(within(pane('News stream')).getByText('2026-09-30 · TZ unknown')).toBeInTheDocument();
  expect(within(pane('Evidence desk')).getAllByText((_, element) => element.tagName === 'TIME' && element.textContent.includes(raw))).toHaveLength(2);
  expect(within(pane('Evidence desk')).getByText(/Source checked .* separate from publication/)).toBeInTheDocument();
  expect(pane('Evidence desk').querySelector('.fn-timestamps')).toHaveTextContent('Record updated Unavailable');
  expect(screen.getByText(/Target window: 168h · unknown-timezone dates may overlap this window/)).toBeInTheDocument();
  expect(within(pane('Source coverage')).getByText(/Unknown-timezone publication dates are included when/)).toHaveTextContent('precise age and inclusion within the last 168 hours are unverified');
});

test('Yahoo account changes and logout clear the roster angle with no private storage or guessed ownership', async () => {
  const first = yahoo(); const second = yahoo('Private Team B', 'Different Player');
  const view = renderPage({ yahoo: first }); await ready();
  fireEvent.click(screen.getByRole('button', { name: /^My roster angle \+/ }));
  expect(within(pane('My roster angle')).getAllByText(/Private Team A/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'My roster', exact: true })); expect(streamRows()).toHaveLength(1);
  view.rerender(<LhqProvider><FantasyNews {...props} yahoo={second}/></LhqProvider>);
  expect(within(pane('My roster angle')).queryByText(/Private Team A/)).not.toBeInTheDocument();
  expect(within(pane('My roster angle')).getByText('No exact roster reports returned')).toBeInTheDocument();
  expect(within(pane('News stream')).queryByRole('button', { name: /^Expand/ })).not.toBeInTheDocument();
  view.rerender(<LhqProvider><FantasyNews {...props} yahoo={{ account: null, teams: [], leagues: [], dashboards: {}, errors: {} }}/></LhqProvider>);
  expect(within(pane('My roster angle')).getByText('Yahoo roster context unavailable')).toBeInTheDocument();
  expect(streamRows()).toHaveLength(4);
  expect(screen.getByRole('button', { name: 'My roster · unavailable' })).toBeDisabled();
  const stored = Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index))).join(' ');
  expect(stored).not.toContain('Private Team'); expect(stored).not.toContain('Fixture'); expect(stored).not.toContain('summary');
});

test('roster matching rejects duplicate identities, mismatched seasons and wrong-week rosters', () => {
  const account = yahoo();
  expect(newsRosterMatches(articles[0], account, 2026)).toHaveLength(1);
  const key = account.teams[0].key;
  account.dashboards[key].roster.players.push({ ...account.dashboards[key].roster.players[0], key: 'duplicate' });
  expect(newsRosterMatches(articles[0], account, 2026)).toHaveLength(0);
  account.dashboards[key].roster.players.pop(); account.dashboards[key].roster.week = 3;
  expect(newsRosterMatches(articles[0], account, 2026)).toHaveLength(0);
  expect(newsRosterMatches(articles[0], yahoo(), 2025)).toHaveLength(0);
});

test('popup blockers produce a recovery notice and preserve the usable in-app evidence desk', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null);
  renderPage(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Pop out Evidence desk' }));
  expect(screen.getByRole('alert')).toHaveTextContent('browser blocked Evidence desk');
  expect(within(pane('Evidence desk')).getByText('Fixture Alpha exact sourced summary')).toBeInTheDocument();
  expect(window.open.mock.calls[0][0]).toContain('#/fantasy-news?pane=evidence&popout=1&hours=168&article=a');
});

test('browser window lifecycle supports focus, detection of close, reopen and docking without article storage', async () => {
  const first = childWindow(), second = childWindow();
  vi.spyOn(window, 'open').mockReturnValueOnce(first).mockReturnValueOnce(second);
  renderPage(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Pop out Evidence desk' }));
  expect(within(pane('Evidence desk')).getByText('Open in browser window')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Focus Evidence desk window' })); expect(first.focus).toHaveBeenCalledTimes(1);
  expect(first.postMessage).toHaveBeenCalledWith({ type: 'bowser-fantasy-news-selection', articleId: 'a', hours: 168 }, window.location.origin);
  first.closed = true;
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reopen Evidence desk window' })).toBeInTheDocument(), { timeout: 2200 });
  fireEvent.click(screen.getByRole('button', { name: 'Reopen Evidence desk window' })); expect(window.open).toHaveBeenCalledTimes(2);
  fireEvent.click(within(pane('Evidence desk')).getByRole('button', { name: 'Return to workspace' })); expect(second.close).toHaveBeenCalledTimes(1);
  expect(within(pane('Evidence desk')).getByText('Fixture Alpha exact sourced summary')).toBeInTheDocument();
  expect(localStorage.getItem(NEWS_LAYOUT_KEY)).not.toContain('articleId');
});

test('standalone popout route works and accepts only lifecycle context from its same-origin opener', async () => {
  window.history.replaceState(null, '', '/#/fantasy-news?pane=evidence&popout=1&hours=72&article=b');
  const opener = childWindow(); vi.stubGlobal('opener', opener); const close = vi.spyOn(window, 'close').mockImplementation(() => {});
  renderPage(); await screen.findByText('Fixture Beta exact sourced summary');
  expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  expect(localStorage.getItem(NEWS_LAYOUT_KEY)).toBeNull();
  expect(document.title).toBe('Evidence desk · Bowser Fantasy News');
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://malicious.test', source: opener, data: { type: 'bowser-fantasy-news-selection', articleId: 'a', hours: 24 } })));
  expect(screen.getByText('Fixture Beta exact sourced summary')).toBeInTheDocument();
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: {}, data: { type: 'bowser-fantasy-news-selection', articleId: 'a', hours: 24 } })));
  expect(screen.getByText('Fixture Beta exact sourced summary')).toBeInTheDocument();
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: opener, data: { type: 'bowser-fantasy-news-selection', articleId: 'a', hours: 72 } })));
  expect(screen.getByText('Fixture Alpha exact sourced summary')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Return to workspace' })); expect(close).toHaveBeenCalled();
  expect(opener.postMessage).toHaveBeenCalledWith({ type: 'bowser-fantasy-news-dock', pane: 'evidence' }, window.location.origin);
});

test('unexpected/private responses and unsafe source links remain explicit and non-executable', async () => {
  fetch.mockResolvedValueOnce(reply({ articles, meta: { scope: 'private_yahoo' } }));
  const view = renderPage(); expect(await screen.findByRole('alert')).toHaveTextContent('unexpected response');
  expect(within(pane('News stream')).queryByRole('button', { name: /^Expand/ })).not.toBeInTheDocument();
  view.unmount(); fetch.mockResolvedValue(reply(payload([{ ...articles[0], sources: [{ ...source, url: 'javascript:alert(1)' }] }])));
  renderPage(); await ready(); expect(within(pane('Evidence desk')).queryByRole('link', { name: 'Official Fixture ↗' })).not.toBeInTheDocument();
  expect(safeNewsUrl('data:text/html,<script>bad</script>')).toBeNull(); expect(safeNewsUrl(source.url)).toBe(source.url);
});

test('tiled defaults contain four useful angles, and collapse removes a tile until restored', async () => {
  renderPage(); await ready();
  const windows = screen.getByLabelText('Fantasy news windows');
  expect(windows).toHaveClass('tiles');
  expect(within(windows).getAllByRole('region')).toHaveLength(4);
  expect(screen.queryByRole('region', { name: 'Source coverage' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Evidence desk' }));
  expect(within(windows).getAllByRole('region')).toHaveLength(3);
  expect(screen.queryByRole('region', { name: 'Evidence desk' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Expand Evidence desk' }));
  expect(within(windows).getAllByRole('region')).toHaveLength(4);
  fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize News stream' }), { key: 'ArrowRight' });
  expect(windows.style.gridTemplateColumns).toBe('minmax(280px,540fr) minmax(280px,520fr)');
  fireEvent.change(screen.getByLabelText('Workspace arrangement'), { target: { value: 'columns' } }); expect(windows).toHaveClass('columns');
});

test('source check, writer update, repository read and original publication retain their separate clocks', async () => {
  const checkedAt = new Date(Date.now() - 60000).toISOString(), updatedAt = new Date(Date.now() - 45000).toISOString(), fetchedAt = new Date(Date.now() - 15000).toISOString();
  fetch.mockResolvedValue(reply(payload(articles, { state: 'current', snapshotMode: 'repository_public_snapshot', freshness: { basis: 'source_check', sourceCheckedAt: checkedAt, latestSourcePublishedAt: source.publishedAt, staleAfterHours: 6 }, repository: { checkedAt, updatedAt, fetchedAt, revision: 'abcdef0123456789', cacheState: 'fetched', lastReadState: 'verified' } })));
  renderPage(); await ready(); fireEvent.click(screen.getByRole('button', { name: /^Source coverage \+/ }));
  const coverage = pane('Source coverage');
  expect(within(coverage).getByText('Current returned snapshot')).toBeInTheDocument();
  const facts = coverage.querySelector('.fn-facts');
  expect(facts).toHaveTextContent('Sources checked'); expect(facts).toHaveTextContent('Repository updated'); expect(facts).toHaveTextContent('Repository read'); expect(facts).toHaveTextContent('abcdef012345');
  expect(screen.getByText('Writer schedule not verified by this feed')).toBeInTheDocument();
  expect(screen.queryByText('Unattended ingestion unavailable')).not.toBeInTheDocument();
  expect(pane('Evidence desk').querySelector('.fn-timestamps')).toHaveTextContent('Published');
  fetch.mockRejectedValueOnce(new Error('Read path unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh feed' })); await screen.findByRole('alert');
  expect(within(coverage).queryByText('Current returned snapshot')).not.toBeInTheDocument();
  expect(within(coverage).getByText('Stale returned snapshot')).toBeInTheDocument();
  expect(streamRows()).toHaveLength(4);
});

test('closing the main Yahoo account closes independent private roster popout memory', async () => {
  const child = childWindow(); vi.spyOn(window, 'open').mockReturnValue(child);
  const view = renderPage({ yahoo: yahoo() }); await ready();
  fireEvent.click(screen.getByRole('button', { name: /^My roster angle \+/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Pop out My roster angle' }));
  view.rerender(<LhqProvider><FantasyNews {...props} yahoo={{ account: null, teams: [], leagues: [], dashboards: {} }}/></LhqProvider>);
  expect(child.close).toHaveBeenCalledTimes(1); expect(child.closed).toBe(true);
  expect(within(pane('My roster angle')).getByText('Yahoo roster context unavailable')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reopen My roster angle window' })).toBeInTheDocument();
  expect(child.postMessage.mock.calls.every(([message]) => Object.keys(message).every(key => ['type', 'articleId', 'hours'].includes(key)))).toBe(true);
});

test('moving a tile crosses visible neighbors while collapsed records retain their place', async () => {
  renderPage(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Injuries & practice' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move Role & performance left' }));
  const windows = screen.getByLabelText('Fantasy news windows');
  expect([...windows.querySelectorAll(':scope > section')].map(section => section.getAttribute('aria-label'))).toEqual(['Role & performance', 'News stream', 'Evidence desk']);
  expect(JSON.parse(localStorage.getItem(NEWS_LAYOUT_KEY)).panes.map(item => [item.id, item.collapsed])).toEqual([['roles', false], ['injuries', true], ['feed', false], ['evidence', false]]);
  fireEvent.click(screen.getByRole('button', { name: 'Expand Injuries & practice' }));
  expect([...windows.querySelectorAll(':scope > section')].map(section => section.getAttribute('aria-label'))).toEqual(['Role & performance', 'Injuries & practice', 'News stream', 'Evidence desk']);
});

test('app-wide closure immediately retires the pane open state and permits reopen and child docking', async () => {
  const first = childWindow(), second = childWindow();
  vi.spyOn(window, 'open').mockReturnValueOnce(first).mockReturnValueOnce(second);
  renderPage(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Pop out Evidence desk' }));
  act(() => closeFantasyNewsWindows());
  expect(first.close).toHaveBeenCalledTimes(1);
  expect(within(pane('Evidence desk')).queryByText('Open in browser window')).not.toBeInTheDocument();
  expect(within(pane('Evidence desk')).getByText('Fixture Alpha exact sourced summary')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reopen Evidence desk window' }));
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: second, data: { type: 'bowser-fantasy-news-dock', pane: 'evidence' } })));
  expect(second.close).toHaveBeenCalledTimes(1);
  expect(within(pane('Evidence desk')).queryByText('Open in browser window')).not.toBeInTheDocument();
  expect(within(pane('Evidence desk')).getByText('Fixture Alpha exact sourced summary')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pop out Evidence desk' })).toBeInTheDocument();
});

test('polling recovers orphaned open state even when registry closure notification is missed', async () => {
  const child = childWindow(); vi.spyOn(window, 'open').mockReturnValue(child);
  renderPage(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Pop out Evidence desk' }));
  const dispatch = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
  act(() => closeFantasyNewsWindows());
  dispatch.mockRestore();
  expect(within(pane('Evidence desk')).getByText('Open in browser window')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reopen Evidence desk window' })).toBeInTheDocument(), { timeout: 2200 });
  expect(within(pane('Evidence desk')).queryByText('Open in browser window')).not.toBeInTheDocument();
  expect(within(pane('Evidence desk')).getByText('Fixture Alpha exact sourced summary')).toBeInTheDocument();
});
