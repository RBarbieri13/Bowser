// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { TeamBoxScores } from '../src/TeamBoxScores.jsx';
import { resolveTrendBlocks, sanitizeTrendBlocks, TEAM_TABLE_COLUMNS } from '../src/teamBoxColumns.js';
import { TREND_METRIC_KEYS } from '../src/trendMetrics.js';

const stateKey = 'bowser:team-box-score-state:v1';
const schedule = [1, 2, 3, 4].map(week => ({week, seasonType:'REG', gameId:`2026_${week}_NYG_DAL`, opponent:'DAL', homeAway:'home', scoreLabel:'W 24–17'}));
const allSlots = [...Array.from({length:18},(_,index)=>({season:2025,week:index+1})),...Array.from({length:4},(_,index)=>({season:2026,week:index+1}))];
const players = [{id:'a',name:'Alpha Runner',snap:42,fpts:14.1,projection:12.1,salary:5100,rank:2},{id:'b',name:'Beta Runner',snap:2,fpts:-0.6,projection:8.5,salary:4300,rank:62}];
function response(input) {
  const query = new URL(input,'http://local').searchParams;
  const weeks = query.get('weeks').split(',').map(Number);
  const count = Number(query.get('trendWeeks') || 10);
  const anchors = (query.get('trendAnchors') || '').split(',').map(Number).filter(Boolean);
  const history = (anchor, player) => allSlots.slice(0,18+anchor).slice(-count).map((slot,index)=>({...slot,key:`${slot.season}-${slot.week}`,snaps:index===count-2?null:player.snap,passingYards:player.id==='a'?100:5, fantasyPoints:player.fpts}));
  return {data:players.flatMap(player=>weeks.filter(week=>week<=4).map(week=>({player_id:player.id,player_display_name:player.name,position_group:'RB',position:'RB',week,season:2026,season_type:'REG',snaps:player.snap+week-1,snap_pct:player.snap,targets:2,receptions:1,carries:3,rushing_yards:15,rushing_tds:0,receiving_yards:4,receiving_tds:0,fantasy_points:player.fpts,position_finish:player.rank,draft_kings_price:week===3?null:player.salary+week*100,draft_kings_projection:week===3?null:player.projection+week,dfs_meta:{salarySource:'DraftKings',projectionSource:'Source fixture',reason:week===3?'No archive for 2026 Week 3':null},trendsByAnchor:Object.fromEntries(anchors.map(anchor=>[String(anchor),history(anchor,player)]))}))),meta:{season:2026,team:'NYG',weeks:schedule.filter(item=>weeks.includes(item.week)),schedule,playerCount:2,queryMs:1,trendsByAnchor:Object.fromEntries(anchors.map(anchor=>[String(anchor),{slots:allSlots.slice(0,18+anchor).slice(-count),domains:{snaps:{min:0,max:84},passing_yards:{min:0,max:200},fantasy_points:{min:-10,max:50}},season:2026,week:anchor}]))}};
}
const getQuery = () => new URL(fetch.mock.calls.at(-1)[0],'http://local').searchParams;
const table = () => screen.getByRole('table',{name:'RB week-by-week player statistics'});
const bodyOrder = () => [...table().querySelectorAll('tbody tr')].map(row=>row.dataset.playerId);
const renderPage = (props={}) => render(<TeamBoxScores season={2026} meta={{teams:['NYG','BUF']}} onOpenPlayer={vi.fn()} {...props} />);
beforeEach(()=>{localStorage.clear();sessionStorage.clear();sessionStorage.setItem(stateKey,JSON.stringify({season:2026,weekStart:1,weekEnd:4}));global.fetch=vi.fn(async input=>({ok:true,json:async()=>response(String(input))}));});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

test('renders exact weekly salary, projection, and NFL positional finish; links the player',async()=>{
  const open=vi.fn();renderPage({onOpenPlayer:open});await screen.findByRole('button',{name:'Alpha Runner',exact:true});
  const first=table().querySelector('tbody tr');
  expect(first.querySelector('[data-week="1"][data-stat="draft_kings_price"]')).toHaveTextContent('$5,200');
  expect(first.querySelector('[data-week="2"][data-stat="draft_kings_price"]')).toHaveTextContent('$5,300');
  expect(first.querySelector('[data-week="3"][data-stat="draft_kings_price"]')).toHaveTextContent('—');
  expect(first.querySelector('[data-week="3"][data-stat="draft_kings_price"]')).toHaveAttribute('title','No archive for 2026 Week 3');
  expect(first.querySelector('[data-week="1"][data-stat="position_finish"]')).toHaveTextContent('RB2');
  expect(first.querySelector('[data-week="1"][data-stat="draft_kings_projection"]')).toHaveTextContent('13.1');
  expect(screen.getByLabelText('Minimum DraftKings price')).toBeEnabled();
  fireEvent.click(screen.getByRole('button',{name:'Alpha Runner',exact:true}));expect(open.mock.calls[0][0].playerId).toBe('a');
});

test('every weekly leaf header sorts its own week; null data stays last and widths synchronize',async()=>{
  renderPage();await screen.findByRole('button',{name:'Alpha Runner',exact:true});
  const expected=TEAM_TABLE_COLUMNS.filter(column=>['Misc.','Receiving','Rushing','Fantasy','DFS'].includes(column.group));
  for(const column of expected) expect(within(table()).getByRole('button',{name:`Sort Week 1 ${column.label}`,exact:true})).toBeVisible();
  const sort=within(table()).getByRole('button',{name:'Sort Week 2 Fantasy points'});
  fireEvent.click(sort);expect(bodyOrder()).toEqual(['a','b']);fireEvent.click(sort);expect(bodyOrder()).toEqual(['b','a']);
  const resize=screen.getByRole('separator',{name:'Resize DraftKings salary column'});fireEvent.keyDown(resize,{key:'ArrowRight',shiftKey:true});
  const widths=[...table().querySelectorAll('col[data-column="draft_kings_price"]')].map(col=>col.style.width);expect(new Set(widths)).toEqual(new Set(['88px']));
  expect(JSON.parse(localStorage.getItem('bowser:team-box-preferences:v2')).columnWidths.draft_kings_price).toBe(88);
});

test('restores the native statistic picker and ignores removed shared-table formatting preferences',async()=>{
  localStorage.setItem('bowser:team-box-table:v3', JSON.stringify({
    hidden:['draft_kings_projection'], density:'comfortable', numberFormat:'integer', heatmap:false,
    order:['fantasy_points','draft_kings_price','snaps'], widths:{player:360}, autoFit:true,
  }));
  renderPage();await screen.findByRole('button',{name:'Alpha Runner',exact:true});
  expect(screen.queryByRole('button',{name:'Table settings'})).not.toBeInTheDocument();
  expect(table().querySelectorAll('col[data-column="draft_kings_projection"]')).toHaveLength(4);
  expect(document.querySelector('main')).not.toHaveClass('density-comfortable');
  expect(table().querySelector('[data-stat="fantasy_points"]')).toHaveTextContent('14.1');
  expect(table().querySelector('.metric-heat')).not.toBeNull();
  expect(table().querySelector('col[data-column="player"]')).toHaveStyle({width:'190px'});
  expect([...table().querySelectorAll('col[data-week="1"]')][0]).toHaveAttribute('data-column','snaps');
  fireEvent.click(screen.getByRole('button',{name:'All defaults'}));
  const picker=screen.getByRole('group',{name:'Statistical categories'});
  fireEvent.click(within(picker).getByRole('checkbox',{name:'DraftKings projection'}));
  expect(table().querySelectorAll('col[data-column="draft_kings_projection"]')).toHaveLength(0);
  expect(JSON.parse(localStorage.getItem('bowser:team-box-preferences:v2')).visibleStats).not.toContain('draft_kings_projection');
  fireEvent.click(screen.getByRole('button',{name:'Reset defaults'}));
  expect(table().querySelectorAll('col[data-column="draft_kings_projection"]')).toHaveLength(4);
});

test('inserts anchored calendar trends, switches all metrics, moves via keyboard controls and drag/drop, and persists window',async()=>{
  const view=renderPage();await screen.findByRole('button',{name:'Alpha Runner',exact:true});
  fireEvent.change(screen.getByLabelText('Insert trend after'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Add trend column'}));
  await waitFor(()=>expect(getQuery().get('trendAnchors')).toBe('2'));
  await screen.findByRole('img',{name:/Snaps trend for Alpha Runner:.*2026 Week 2: 42/});
  let block=document.querySelector('.box-trend-header');const id=block.dataset.trendId;
  const chart=screen.getByRole('img',{name:/Snaps trend for Alpha Runner:/});
  expect(chart.querySelectorAll('.trend-bar-item')).toHaveLength(10);expect(chart.querySelectorAll('.missing')).toHaveLength(1);
  const beta=screen.getByRole('img',{name:/Snaps trend for Beta Runner:/});
  expect(parseFloat(chart.querySelector('i').style.height)/parseFloat(beta.querySelector('i').style.height)).toBeCloseTo(21);
  const select=within(block).getByRole('combobox');expect([...select.options].map(option=>option.value)).toEqual(TREND_METRIC_KEYS);
  fireEvent.change(select,{target:{value:'passing_yards'}});expect(screen.getByRole('img',{name:/Passing yards trend for Alpha Runner:/})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:`Move trend ${id} right`}));await waitFor(()=>expect(getQuery().get('trendAnchors')).toBe('3'));
  await screen.findByRole('img',{name:/Passing yards trend for Alpha Runner:.*2026 Week 3: 100/});
  const transfer={setData:vi.fn(),getData:()=>id};fireEvent.dragStart(screen.getByRole('button',{name:'Drag trend after Week 3'}),{dataTransfer:transfer});
  fireEvent.drop(screen.getByLabelText('Drop trend after Week 1').closest('th'),{dataTransfer:transfer});await waitFor(()=>expect(getQuery().get('trendAnchors')).toBe('1'));
  await screen.findByRole('img',{name:/Passing yards trend for Alpha Runner:.*2026 Week 1: 100/});
  fireEvent.change(screen.getByLabelText('Trend history'),{target:{value:'18'}});await waitFor(()=>expect(getQuery().get('trendWeeks')).toBe('18'));
  await waitFor(()=>expect(screen.getByRole('img',{name:/Passing yards trend for Alpha Runner:/}).querySelectorAll('.trend-bar-item')).toHaveLength(18));
  view.unmount();renderPage();await waitFor(()=>expect(document.querySelector('.box-trend-header')).toHaveAttribute('data-anchor','1'));
  expect(screen.getByLabelText('Trend history')).toHaveValue('18');
  fireEvent.click(screen.getByRole('button',{name:`Remove trend ${id}`}));expect(document.querySelector('.box-trend-header')).toBeNull();
});

test('retains the original team, position, scoring, salary and matchup filters without the added filter row',async()=>{
  renderPage({onSeasonChange:vi.fn()});await screen.findByRole('button',{name:'Alpha Runner',exact:true});
  for(const label of ['Player search','Research markers','Minimum weekly projection','Minimum weekly FPTS','Team box score year']) {
    expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
  }
  expect(screen.getByRole('combobox',{name:'Scoring'})).toBeEnabled();
  expect(screen.getByRole('button',{name:'QB, RB, WR, TE'})).toBeEnabled();
  expect(screen.getByLabelText('Week column width')).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Minimum DraftKings price'),{target:{value:'5000'}});expect(bodyOrder()).toEqual(['a']);
  fireEvent.change(screen.getByLabelText('Minimum DraftKings price'),{target:{value:'3000'}});expect(bodyOrder()).toEqual(['a','b']);
  fireEvent.click(screen.getByRole('button',{name:'Beta Runner: No marker'}));fireEvent.click(screen.getByRole('radio',{name:'Favorite'}));
  expect(screen.getByRole('button',{name:'Beta Runner: Favorite'})).toBeEnabled();
});

test('validates persisted block preferences and reanchors to the visible left-hand week',()=>{
  expect(sanitizeTrendBlocks([{id:'bad',afterWeek:99},{id:'a',afterWeek:3,metric:'constructor'},{id:'a',afterWeek:1}])).toEqual([{id:'a',afterWeek:3,metric:'snaps'}]);
  expect(resolveTrendBlocks([{id:'a',afterWeek:3,metric:'snaps'}],[1,2,4])[0].anchor).toBe(2);
  expect(resolveTrendBlocks([{id:'a',afterWeek:1,metric:'snaps'}],[3,4])[0].anchor).toBe(3);
});
