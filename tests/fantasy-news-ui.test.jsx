// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { closeFantasyNewsWindows, FantasyNews, NEWS_LAYOUT_KEY, safeNewsUrl, validateNewsLayout } from '../src/lhq/FantasyNews.jsx';
import { LhqProvider } from '../src/lhq/shared.jsx';

const props = { season: 2026, scoring: 'half', onOpen: vi.fn() };
const source = { sourceName: 'Official Fixture', url: 'https://example.test/report', publishedAt: '2026-09-30T12:00:00Z', sourceType: 'OFFICIAL', isOriginalSource: true, access: 'public', accessLabel: 'Public source', timestampBasis: 'published_at' };
const report = (id, name, category, position, extra = {}) => ({ id, headline: `${name} fixture report`, summary: `${name} exact sourced summary`, fantasyAnalysis: `${name} source context`, category, categories: [category], players: [{ playerId: `id-${id}`, name, team: 'NYG', position }], source: source.sourceName, url: source.url, publishedAt: '2026-09-30T12:00:00Z', updatedAt: '2026-09-30T13:00:00Z', sources: [source], status: 'CONFIRMED', evidence: { kind: 'official_report', label: 'Confirmed report', confidence: 92 }, freshness: { state: 'stale' }, urgency: {score:4,basis:'A confirmed injury may affect the next lineup decision.',method:'AI estimate from public reporting',estimatedAt:'2026-10-01T12:00:00Z'}, ...extra });
const articles = [
  report('a', 'Fixture Alpha', 'injury', 'RB', { injury: { isInjuryRelated: true, bodyPart: 'ankle', practiceStatus: 'DNP', gameStatus: null, expectedReturn: null }, affectedPlayers:[{name:'Fixture Gamma',team:'NYG',position:'WR',relationship:'potential_beneficiary',impact:'Additional work is possible; the role remains unconfirmed.'}] }),
  report('b', 'Fixture Beta', 'practice', 'QB', { publishedAt: '2026-09-30T11:00:00Z', sources: [{ ...source, sourceName: 'Second Publication', url: 'https://example.test/beta' }],urgency:null }),
  report('c', 'Fixture Gamma', 'playing_time', 'WR', { publishedAt: '2026-09-30T10:00:00Z', players: [{ name: 'Fixture Gamma', team: 'NYG', position: 'WR' }] }),
  report('d', 'Fixture Delta', 'fantasy_news', 'TE', { publishedAt: '2026-09-30T09:00:00Z', evidence: { kind: 'rumor', label: 'Rumor', confidence: null },urgency:{score:99,basis:'bad',method:'AI estimate from public reporting'} }),
];
const payload = (rows = articles, patch = {}) => ({ articles: rows, meta: {version:1,scope:'public_nfl_news',snapshotMode:'durable_active_snapshot',state:'stale',live:false,message:'Public source reports are stale; verify the original reporting.',readAt:'2026-10-01T12:00:00Z',total:rows.length,freshness:{latestSourcePublishedAt:source.publishedAt},coverage:{complete:false,limitations:['Bounded source coverage']},refresh:{schedulerVerified:false,ready:false},sources:[],...patch} });
const reply = data => ({ok:true,json:async()=>data});
const renderPage = (overrides={}) => render(<LhqProvider><FantasyNews {...props} {...overrides}/></LhqProvider>);
const pane = name => screen.getByRole('region',{name,exact:true});
const left = () => pane('News workspace');
const rows = () => within(left()).queryAllByRole('button',{name:/^Expand .* fixture report$/});
const ready = () => within(left()).findByRole('button',{name:'Expand Fixture Alpha fixture report'});
const togglePane = name => screen.getByRole('button',{name:`Toggle ${name}`});
const nowClock = (offset=0) => new Date(Date.now()-offset).toISOString();
function yahoo(label='Private Account A') {
  const teams = [1,2,3].map(n=>({key:`461.l.${n}.t.1`,leagueKey:`461.l.${n}`,name:`${label} Team ${n}`}));
  const leagues = [1,2,3].map(n=>({key:`461.l.${n}`,season:2026,name:`${label} League ${n}`}));
  const check = nowClock(60000), dashboards={},research={};
  for (const [index,team] of teams.entries()) {
    dashboards[team.key]={teamKey:team.key,season:2026,week:4,checkedAt:check,roster:{week:4,players:index===0?[{key:'461.p.1',name:'Fixture Alpha',team:'NYG',position:'RB',slot:'RB'}]:[]}};
    research[team.key]={teamKey:team.key,leagueKey:team.leagueKey,season:2026,checkedAt:nowClock(),availability:{status:index===2?'W':'FA',start:0,pageSize:25,nextStart:25,complete:false,checkedAt:check,players:index===0?[]:[{key:'461.p.3',name:'Fixture Gamma',team:'NYG',position:'WR',checkedAt:check},...(index===2?[{key:'461.p.4',name:'Fixture Delta',team:'NYG',position:'TE',checkedAt:check}]:[])]}};
  }
  return {status:{connected:true,expiresAt:new Date(Date.now()+3600000).toISOString()},account:{season:2026,teams,leagues,privateSecret:label},teams,leagues,dashboards,research,coverage:{loadedTeams:3},errors:{}};
}
function childWindow(){const child={closed:false,focus:vi.fn(),postMessage:vi.fn(),close:vi.fn()};child.close.mockImplementation(()=>{child.closed=true;});return child;}
beforeEach(()=>{localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/#/fantasy-news');vi.stubGlobal('fetch',vi.fn(async()=>reply(payload())));vi.stubGlobal('PointerEvent',MouseEvent);props.onOpen.mockClear();});
afterEach(()=>{cleanup();closeFantasyNewsWindows();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});

test('left news table, central research and right acquisition are distinct Bowser workspaces',async()=>{
  renderPage();await ready();expect(rows()).toHaveLength(4);
  expect(within(left()).getByRole('table',{name:'Sourced news headlines'})).toBeInTheDocument();
  for(const name of ['Headline','Summary','Affected player / league observation','AI urgency'])expect(within(left()).getByRole('columnheader',{name})).toBeInTheDocument();
  expect(within(left()).getByText('Fixture Beta exact sourced summary')).toBeInTheDocument();
  expect(pane('Evidence desk')).toBeInTheDocument();expect(pane('Player focus')).toBeInTheDocument();expect(pane('Acquisition Opportunities')).toBeInTheDocument();
  expect(screen.queryByRole('region',{name:'News stream'})).not.toBeInTheDocument();expect(screen.queryByRole('region',{name:'Injuries & practice'})).not.toBeInTheDocument();
  const headline=within(left()).getByRole('button',{name:'Expand Fixture Alpha fixture report'});fireEvent.click(headline);expect(headline).toHaveAttribute('aria-expanded','true');
  const link=within(left()).getByRole('link',{name:'Official Fixture ↗'});expect(link).toHaveAttribute('href',source.url);expect(link).toHaveAttribute('rel','noopener noreferrer');
  fireEvent.click(headline);expect(headline).toHaveAttribute('aria-expanded','false');
  fireEvent.click(within(pane('Evidence desk')).getByRole('button',{name:'Fixture Alpha',exact:true}));expect(props.onOpen.mock.calls[0][0]).toMatchObject({player_id:'id-a',season:2026,scoring:'half'});
});

test('tabs support keyboard selection and injuries include only confirmed injury records',async()=>{
  const rumor=report('rumor','Fixture Rumor','injury','RB',{injury:{isInjuryRelated:true,practiceStatus:'DNP'},evidence:{kind:'rumor',label:'Rumor'}});
  fetch.mockResolvedValue(reply(payload([...articles,rumor])));renderPage();await ready();
  const news=within(left()).getByRole('tab',{name:'News'});news.focus();fireEvent.keyDown(news,{key:'ArrowRight'});
  expect(within(left()).getByRole('tab',{name:'Injuries'})).toHaveFocus();expect(within(left()).getByRole('tab',{name:'Injuries'})).toHaveAttribute('aria-selected','true');
  expect(rows()).toHaveLength(1);expect(within(left()).getByRole('table',{name:'Confirmed injury reports'})).toBeInTheDocument();expect(within(left()).getByText('DNP')).toBeInTheDocument();
  expect(within(left()).getByText('Source publication · exact newsbreak unverified')).toBeInTheDocument();
  fireEvent.keyDown(within(left()).getByRole('tab',{name:'Injuries'}),{key:'End'});expect(within(left()).getByRole('tab',{name:'My Roster'})).toHaveFocus();
  expect(within(left()).getByText('Yahoo league context unavailable')).toBeInTheDocument();
});

test('search, source and category compose without inherited player filters',async()=>{
  renderPage();await ready();fireEvent.change(screen.getByLabelText('News source'),{target:{value:'Second Publication'}});expect(rows()).toHaveLength(1);expect(rows()[0]).toHaveTextContent('Fixture Beta');
  fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));fireEvent.change(screen.getByLabelText('Search news'),{target:{value:'Delta'}});expect(rows()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));fireEvent.click(screen.getByRole('button',{name:'Injuries (1)',exact:true}));expect(rows()).toHaveLength(1);
  expect(screen.queryByLabelText('News position')).not.toBeInTheDocument();expect(screen.queryByLabelText('News team')).not.toBeInTheDocument();expect(screen.queryByLabelText('Player scoring')).not.toBeInTheDocument();
});

test('urgency uses supplied public AI estimates and exposes its basis; invalid and missing stay unavailable',async()=>{
  renderPage();await ready();const summary=within(left()).getByLabelText('AI estimated urgency 4 of 5 for Fixture Alpha fixture report');
  expect(summary.closest('details')).toHaveTextContent('A confirmed injury may affect the next lineup decision.');expect(summary.closest('details')).toHaveTextContent('league fit is not assessed');
  const beta=within(left()).getByRole('button',{name:'Expand Fixture Beta fixture report'}).closest('tr');expect(beta).toHaveTextContent('Urgency unavailable');
  const delta=within(left()).getByRole('button',{name:'Expand Fixture Delta fixture report'}).closest('tr');expect(delta).toHaveTextContent('Urgency unavailable');expect(delta).not.toHaveTextContent('99');
});

test('dock resize and collapse are independent of all central arrangements and preserve preferences',async()=>{
  const view=renderPage();await ready();const resize=screen.getByRole('separator',{name:'Resize News workspace'}), start=Number(resize.getAttribute('aria-valuenow'));
  expect(resize).toHaveAttribute('aria-orientation','vertical');fireEvent.pointerDown(resize,{clientX:100});fireEvent.pointerMove(document,{clientX:180});fireEvent.pointerUp(document);expect(resize).toHaveAttribute('aria-valuenow',String(start+80));
  fireEvent.keyDown(resize,{key:'ArrowRight'});expect(resize).toHaveAttribute('aria-valuenow',String(start+100));
  const acquisition=screen.getByRole('separator',{name:'Resize Acquisition Opportunities'});fireEvent.pointerDown(acquisition,{clientX:600});fireEvent.pointerMove(document,{clientX:560});fireEvent.pointerUp(document);expect(acquisition).toHaveAttribute('aria-valuenow','380');
  for(const mode of ['columns','stacked','tiles']){fireEvent.change(screen.getByLabelText('Workspace arrangement'),{target:{value:mode}});expect(screen.getByRole('separator',{name:'Resize News workspace'})).toHaveAttribute('aria-valuenow',String(start+100));expect(pane('Acquisition Opportunities')).toBeInTheDocument();}
  fireEvent.click(screen.getByRole('button',{name:'Collapse News workspace'}));expect(screen.queryByRole('region',{name:'News workspace'})).not.toBeInTheDocument();expect(togglePane('News workspace')).toHaveAttribute('aria-pressed','true');
  fireEvent.click(screen.getByRole('button',{name:'Collapse Acquisition Opportunities'}));expect(screen.queryByRole('region',{name:'Acquisition Opportunities'})).not.toBeInTheDocument();
  view.unmount();renderPage();await within(pane('Evidence desk')).findByText('Fixture Alpha exact sourced summary');
  fireEvent.click(screen.getByRole('button',{name:'Expand News workspace'}));await ready();expect(screen.getByRole('separator',{name:'Resize News workspace'})).toHaveAttribute('aria-valuenow',String(start+100));
  fireEvent.click(screen.getByRole('button',{name:'Expand Acquisition Opportunities'}));expect(screen.getByRole('separator',{name:'Resize Acquisition Opportunities'})).toHaveAttribute('aria-valuenow','380');
});

test('workspace selector toggles panes off and on; close turns off while collapse remains enabled',async()=>{
  renderPage();await ready();for(const name of ['News workspace','Acquisition Opportunities','Evidence desk','Player focus']){
    expect(togglePane(name)).toHaveAttribute('aria-pressed','true');fireEvent.click(togglePane(name));expect(togglePane(name)).toHaveAttribute('aria-pressed','false');expect(screen.queryByRole('region',{name,exact:true})).not.toBeInTheDocument();
    fireEvent.click(togglePane(name));expect(togglePane(name)).toHaveAttribute('aria-pressed','true');expect(pane(name)).toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole('button',{name:'Collapse Evidence desk'}));expect(togglePane('Evidence desk')).toHaveAttribute('aria-pressed','true');expect(screen.queryByRole('region',{name:'Evidence desk'})).not.toBeInTheDocument();
  fireEvent.click(togglePane('Evidence desk'));expect(togglePane('Evidence desk')).toHaveAttribute('aria-pressed','false');fireEvent.click(togglePane('Evidence desk'));expect(pane('Evidence desk')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Close Acquisition Opportunities'}));expect(togglePane('Acquisition Opportunities')).toHaveAttribute('aria-pressed','false');
});

test('saved preferences strip private fields, migrate old duplicate panes and bound geometry',async()=>{
  localStorage.setItem(NEWS_LAYOUT_KEY,JSON.stringify({version:1,mode:'private-mode',left:{width:99999,activeTab:'bad',account:'PRIVATE'},acquisition:{width:-3,private:'PRIVATE'},panes:[{id:'feed',article:articles[0]},{id:'injuries'},{id:'evidence',width:-2,private:'PRIVATE'},{id:'evidence',width:500},{id:'unknown'}]}));
  renderPage();await ready();const saved=JSON.parse(localStorage.getItem(NEWS_LAYOUT_KEY));expect(saved.left.width).toBe(1000);expect(saved.left.activeTab).toBe('news');expect(saved.acquisition.width).toBe(280);expect(saved.panes).toEqual([{id:'evidence',width:280,collapsed:false}]);
  expect(JSON.stringify(saved)).not.toContain('PRIVATE');expect(JSON.stringify(saved)).not.toContain('headline');expect(validateNewsLayout({version:9,panes:[]}).panes.map(p=>p.id)).toEqual(['evidence','player']);
  fireEvent.click(screen.getByRole('button',{name:'Reset layout'}));expect(JSON.parse(localStorage.getItem(NEWS_LAYOUT_KEY)).panes.map(p=>p.id)).toEqual(['evidence','player']);
});

test('My Roster uses owned OR affirmative available observations across authorized leagues without absence inference',async()=>{
  renderPage({yahoo:yahoo()});await ready();fireEvent.click(within(left()).getByRole('tab',{name:'My Roster'}));expect(rows()).toHaveLength(3);expect(rows().some(row=>row.textContent.includes('Fixture Beta'))).toBe(false);
  expect(within(left()).getByText(/Private Account A League 1: Owned at read/)).toBeInTheDocument();expect(within(left()).getAllByText(/Private Account A League 2: Free agent at read/).length).toBeGreaterThan(0);
  expect(within(left()).getAllByText(/Private Account A League 3: Waivers at read/).length).toBeGreaterThan(0);expect(within(left()).getByText(/3 authorized leagues/)).toBeInTheDocument();
  expect(localStorage.getItem(NEWS_LAYOUT_KEY)).not.toContain('Private Account');expect(Object.values(sessionStorage).join(' ')).not.toContain('Private Account');
});

test('acquisition requires a public beneficiary and affirmative availability with source and private read clocks',async()=>{
  renderPage({yahoo:yahoo()});await ready();const acquisition=pane('Acquisition Opportunities');expect(within(acquisition).getByText('Fixture Gamma')).toBeInTheDocument();expect(within(acquisition).getByText('Additional work is possible; the role remains unconfirmed.')).toBeInTheDocument();
  expect(within(acquisition).getByText(/League 2: Free agent at read/)).toBeInTheDocument();expect(within(acquisition).getByText(/League 3: Waivers at read/)).toBeInTheDocument();expect(acquisition).toHaveTextContent('Yahoo read');expect(acquisition).toHaveTextContent('partial page coverage');expect(acquisition).toHaveTextContent('page start 0 / size 25');
  expect(within(acquisition).queryByText('Fixture Delta')).not.toBeInTheDocument();expect(within(acquisition).queryByText('Fixture Alpha')).not.toBeInTheDocument();
  fireEvent.click(within(acquisition).getByRole('button',{name:/Fixture Alpha fixture report/}));expect(within(pane('Evidence desk')).getByText('Fixture Alpha exact sourced summary')).toBeInTheDocument();
});

test('unresolved beneficiaries and absent availability never become acquisition suggestions',async()=>{
  const account=yahoo();for(const item of Object.values(account.research))item.availability.players=[];
  fetch.mockResolvedValue(reply(payload([{...articles[0],affectedPlayers:[{name:'Fixture Gamma',relationship:'potential_beneficiary',impact:'Unresolved public identity'}]}])));renderPage({yahoo:account});await ready();
  expect(within(pane('Acquisition Opportunities')).getByText('No affirmative acquisition opportunities returned')).toBeInTheDocument();
  expect(within(pane('Acquisition Opportunities')).queryByText('Fixture Gamma')).not.toBeInTheDocument();
});

test('unknown capture age and stale loaded context are explicit; account changes remove private observations',async()=>{
  const account=yahoo();for(const item of Object.values(account.research)){delete item.availability.checkedAt;item.availability.stale=true;for(const player of item.availability.players)delete player.checkedAt;}
  const view=renderPage({yahoo:account});await ready();expect(pane('Acquisition Opportunities')).toHaveTextContent('Yahoo capture age unverified');expect(pane('Acquisition Opportunities')).toHaveTextContent('stale loaded observation');
  const next=yahoo('Private Account B');view.rerender(<LhqProvider><FantasyNews {...props} yahoo={next}/></LhqProvider>);expect(screen.queryByText(/Private Account A League 1: Owned/)).not.toBeInTheDocument();expect(pane('Acquisition Opportunities')).toHaveTextContent('Private Account B League 2');
  view.rerender(<LhqProvider><FantasyNews {...props} yahoo={{account:null,status:{connected:false}}}/></LhqProvider>);expect(pane('Acquisition Opportunities')).toHaveTextContent('Yahoo league context unavailable');expect(screen.queryByText(/Private Account B League/)).not.toBeInTheDocument();expect(rows()).toHaveLength(4);
  expect(localStorage.getItem(NEWS_LAYOUT_KEY)).not.toContain('Private');
});

test('loading, unavailable feed, failed read and retry preserve honest states',async()=>{
  let resolveRead;fetch.mockImplementationOnce(()=>new Promise(resolve=>{resolveRead=resolve;}));renderPage();expect(left()).toHaveTextContent('Reading sourced NFL reports…');expect(screen.getByRole('button',{name:'Reading…'})).toBeDisabled();
  await act(async()=>resolveRead(reply(payload([],{state:'unavailable',message:'No verified public snapshot exists.'}))));expect(left()).toHaveTextContent('News feed unavailable');
  fetch.mockRejectedValueOnce(new Error('Network offline'));fireEvent.click(screen.getByRole('button',{name:'Refresh feed'}));expect(await screen.findByRole('alert')).toHaveTextContent('Network offline');fireEvent.click(screen.getByRole('button',{name:'Try again'}));await ready();expect(rows()).toHaveLength(4);
});

test('last good feed survives a failed refresh in memory and loses its current claim',async()=>{
  fetch.mockResolvedValue(reply(payload(articles,{state:'current',freshness:{basis:'source_check',sourceCheckedAt:nowClock(),staleAfterHours:6}})));renderPage();await ready();fireEvent.click(togglePane('Source coverage'));expect(pane('Source coverage')).toHaveTextContent('Current returned snapshot');
  fetch.mockRejectedValueOnce(new Error('Provider unreachable'));fireEvent.click(screen.getByRole('button',{name:'Refresh feed'}));expect(await screen.findByRole('alert')).toHaveTextContent('Last successful feed retained in memory');expect(rows()).toHaveLength(4);expect(pane('Source coverage')).toHaveTextContent('Stale returned snapshot');expect(screen.queryByText('Current returned snapshot')).not.toBeInTheDocument();expect(localStorage.getItem(NEWS_LAYOUT_KEY)).not.toContain('Fixture');
  expect(fetch.mock.calls[0][1]).toMatchObject({credentials:'same-origin',cache:'no-store'});
});

test('old time-window responses cannot replace a newer query',async()=>{
  let resolveOld;fetch.mockImplementation(url=>String(url).includes('hours=168')?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve(reply(payload([articles[1]]))));renderPage();fireEvent.change(screen.getByLabelText('News window'),{target:{value:'24'}});await within(left()).findByRole('button',{name:'Expand Fixture Beta fixture report'});await act(async()=>resolveOld(reply(payload())));expect(rows()).toHaveLength(1);
});

test('publication, unknown clocks and source/write/read clocks stay distinct',async()=>{
  const raw='September 30, 2026 at 12:30 PM · source timezone unspecified';const row={...articles[0],publishedAt:null,publishedDate:'2026-09-30',publishedAtRaw:raw,timestampStatus:'timezone_unspecified',updatedAt:null,sources:[{...source,publishedAt:null,publishedDate:'2026-09-30',publishedAtRaw:raw}]};
  fetch.mockResolvedValue(reply(payload([row],{snapshotMode:'repository_public_snapshot',timeFilterBasis:'exact_timestamps_and_overlapping_calendar_dates_with_undated_reports',repository:{checkedAt:nowClock(60000),updatedAt:nowClock(40000),fetchedAt:nowClock(20000),revision:'abcdef0123456789',lastReadState:'verified',cacheState:'fetched'},freshness:{basis:'source_check',sourceCheckedAt:nowClock(60000)}})));renderPage();await ready();expect(pane('Evidence desk')).toHaveTextContent('Publication age unknown');expect(pane('Evidence desk').querySelector('.fn-timestamps')).toHaveTextContent(`Published ${raw}`);expect(pane('Evidence desk').querySelector('.fn-timestamps')).toHaveTextContent('Record updated Unavailable');
  fireEvent.click(togglePane('Source coverage'));const coverage=pane('Source coverage');for(const label of ['Sources checked','Repository updated','Repository read'])expect(coverage).toHaveTextContent(label);expect(coverage).toHaveTextContent('abcdef012345');expect(coverage).toHaveTextContent('Undated cited reports are included with unknown publication age');expect(screen.getByText(/Target window: 168h · undated reports/)).toBeInTheDocument();
  fetch.mockResolvedValue(reply(payload([{...row,publishedDate:null,publishedAtRaw:null,timestampStatus:'unknown'}])));fireEvent.click(screen.getByRole('button',{name:'Refresh feed'}));await waitFor(()=>expect(pane('Evidence desk').querySelector('.fn-timestamps')).toHaveTextContent('Published Unknown'));
});

test('pinning and opening public player context remain independent of selected news',async()=>{
  renderPage();await ready();fireEvent.click(within(pane('Evidence desk')).getByRole('button',{name:'Pin report'}));fireEvent.click(within(left()).getByRole('button',{name:'Inspect Fixture Beta fixture report'}));expect(pane('Evidence desk')).toHaveTextContent('Fixture Alpha exact sourced summary');
  fireEvent.click(within(pane('Evidence desk')).getByRole('button',{name:'Unpin'}));expect(pane('Evidence desk')).toHaveTextContent('Fixture Beta exact sourced summary');expect(within(pane('Player focus')).getByRole('button',{name:'Fixture Beta',exact:true})).toBeInTheDocument();
});

test('blocked popup retains content and repeated popout, dock and close cannot duplicate or strand it',async()=>{
  const first=childWindow(),second=childWindow();const open=vi.spyOn(window,'open').mockReturnValueOnce(null).mockReturnValueOnce(first).mockReturnValueOnce(second);renderPage();await ready();
  fireEvent.click(screen.getByRole('button',{name:'Pop out Acquisition Opportunities'}));expect(await screen.findByRole('alert')).toHaveTextContent('browser blocked');expect(pane('Acquisition Opportunities')).toHaveTextContent('Yahoo league context unavailable');
  fireEvent.click(screen.getByRole('button',{name:'Pop out Acquisition Opportunities'}));expect(pane('Acquisition Opportunities')).toHaveTextContent('Open in browser window');fireEvent.click(screen.getByRole('button',{name:'Focus Acquisition Opportunities window'}));expect(open).toHaveBeenCalledTimes(2);expect(first.focus).toHaveBeenCalled();
  act(()=>window.dispatchEvent(new MessageEvent('message',{origin:window.location.origin,source:first,data:{type:'bowser-fantasy-news-dock',pane:'acquisition'}})));expect(first.close).toHaveBeenCalledTimes(1);expect(pane('Acquisition Opportunities')).toHaveTextContent('Yahoo league context unavailable');
  fireEvent.click(screen.getByRole('button',{name:'Pop out Acquisition Opportunities'}));fireEvent.click(screen.getByRole('button',{name:'Close Acquisition Opportunities'}));expect(second.close).toHaveBeenCalledTimes(1);expect(togglePane('Acquisition Opportunities')).toHaveAttribute('aria-pressed','false');fireEvent.click(togglePane('Acquisition Opportunities'));expect(screen.getAllByRole('region',{name:'Acquisition Opportunities',exact:true})).toHaveLength(1);
  expect(open.mock.calls[1][0]).toContain('pane=acquisition');expect(open.mock.calls[1][0]).not.toContain('Private');
});

test('browser close and app-wide close recover content and reopen state without private messages',async()=>{
  const first=childWindow(),second=childWindow();vi.spyOn(window,'open').mockReturnValueOnce(first).mockReturnValueOnce(second);renderPage({yahoo:yahoo()});await ready();fireEvent.click(screen.getByRole('button',{name:'Pop out Acquisition Opportunities'}));first.closed=true;
  await waitFor(()=>expect(screen.getByRole('button',{name:'Reopen Acquisition Opportunities window'})).toBeInTheDocument(),{timeout:2200});expect(pane('Acquisition Opportunities')).toHaveTextContent('Fixture Gamma');fireEvent.click(screen.getByRole('button',{name:'Reopen Acquisition Opportunities window'}));act(()=>closeFantasyNewsWindows());expect(second.close).toHaveBeenCalledTimes(1);expect(pane('Acquisition Opportunities')).toHaveTextContent('Fixture Gamma');
  for(const child of [first,second])expect(child.postMessage.mock.calls.every(([message])=>Object.keys(message).every(key=>['type','articleId','hours'].includes(key)))).toBe(true);
});

test('logout closes private acquisition popout and removes old-account observations',async()=>{
  const child=childWindow();vi.spyOn(window,'open').mockReturnValue(child);const view=renderPage({yahoo:yahoo()});await ready();fireEvent.click(screen.getByRole('button',{name:'Pop out Acquisition Opportunities'}));view.rerender(<LhqProvider><FantasyNews {...props} yahoo={{account:null,status:{connected:false}}}/></LhqProvider>);
  expect(child.close).toHaveBeenCalledTimes(1);expect(pane('Acquisition Opportunities')).toHaveTextContent('Yahoo league context unavailable');expect(pane('Acquisition Opportunities')).not.toHaveTextContent('Private Account');
});

test('standalone popout authenticates messages and never writes layout or private selection to storage',async()=>{
  window.history.replaceState(null,'','/#/fantasy-news?pane=acquisition&popout=1');const opener=childWindow();vi.stubGlobal('opener',opener);renderPage({yahoo:yahoo()});await within(pane('Acquisition Opportunities')).findByText('Fixture Gamma');expect(screen.queryByRole('region',{name:'News workspace'})).not.toBeInTheDocument();expect(localStorage.getItem(NEWS_LAYOUT_KEY)).toBeNull();
  act(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://attacker.test',source:opener,data:{type:'bowser-fantasy-news-selection',hours:24}})));expect(screen.getByLabelText('News window')).toHaveValue('168');
  act(()=>window.dispatchEvent(new MessageEvent('message',{origin:window.location.origin,source:opener,data:{type:'bowser-fantasy-news-selection',hours:24}})));expect(screen.getByLabelText('News window')).toHaveValue('24');
  vi.spyOn(window,'close').mockImplementation(()=>{});fireEvent.click(screen.getByRole('button',{name:'Return to workspace'}));expect(opener.postMessage).toHaveBeenCalledWith({type:'bowser-fantasy-news-dock',pane:'acquisition'},window.location.origin);
});

test('malformed public scope and unsafe source links fail closed',async()=>{
  expect(safeNewsUrl('javascript:alert(1)')).toBeNull();expect(safeNewsUrl('https://example.test/report')).toBe('https://example.test/report');fetch.mockResolvedValue(reply({articles,meta:{scope:'private_yahoo'}}));renderPage();expect(await screen.findByRole('alert')).toHaveTextContent('unexpected response');expect(rows()).toHaveLength(0);
});

test('blocked preference storage does not prevent collapse and restore controls',async()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Blocked');});renderPage();await ready();expect(screen.getByRole('alert')).toHaveTextContent('Layout could not be saved');fireEvent.click(screen.getByRole('button',{name:'Collapse News workspace'}));fireEvent.click(screen.getByRole('button',{name:'Expand News workspace'}));expect(rows()).toHaveLength(4);
});

test('visible central neighbors reorder across collapsed panels while docks remain fixed',async()=>{
  renderPage();await ready();fireEvent.click(togglePane('Role & performance'));fireEvent.click(screen.getByRole('button',{name:'Collapse Player focus'}));fireEvent.click(screen.getByRole('button',{name:'Move Role & performance left'}));const panels=screen.getByRole('region',{name:'Central research panels'});
  expect([...panels.querySelectorAll('section.fn-pane')].map(p=>p.getAttribute('aria-label'))).toEqual(['Role & performance','Evidence desk']);expect(pane('News workspace')).toBeInTheDocument();expect(pane('Acquisition Opportunities')).toBeInTheDocument();
});


test('unknown-date reports keep source order after dated reports without borrowing edit or check clocks',async()=>{
  const unknown={...articles[0],id:'unknown',headline:'Undated fixture report',publishedAt:null,publishedDate:null,publishedAtRaw:null,timestampStatus:'unknown',updatedAt:'2099-01-01T00:00:00Z',checkedAt:'2099-01-01T00:00:00Z'};fetch.mockResolvedValue(reply(payload([unknown,articles[1]])));renderPage();await within(left()).findByRole('button',{name:'Expand Undated fixture report'});expect(rows().map(row=>row.textContent)).toEqual([expect.stringContaining('Fixture Beta'),expect.stringContaining('Undated')]);
  fireEvent.click(within(left()).getByRole('button',{name:'Inspect Undated fixture report'}));expect(pane('Evidence desk')).toHaveTextContent('Publication age unknown');expect(pane('Evidence desk')).not.toHaveTextContent('Older report');
});

test('poll recovers an orphan open window even when a close notification is missed',async()=>{
  const child=childWindow();vi.spyOn(window,'open').mockReturnValue(child);renderPage();await ready();fireEvent.click(screen.getByRole('button',{name:'Pop out Evidence desk'}));const dispatch=vi.spyOn(window,'dispatchEvent').mockImplementation(()=>true);act(()=>closeFantasyNewsWindows());dispatch.mockRestore();expect(pane('Evidence desk')).toHaveTextContent('Open in browser window');
  await waitFor(()=>expect(screen.getByRole('button',{name:'Reopen Evidence desk window'})).toBeInTheDocument(),{timeout:2200});expect(pane('Evidence desk')).toHaveTextContent('Fixture Alpha exact sourced summary');
});
