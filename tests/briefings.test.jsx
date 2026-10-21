// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {Briefings} from '../src/lhq/Briefings.jsx';
import {parseBriefingPack,safeSourceUrl,splitPlayerText,optionSignal} from '../src/lhq/briefingModel.js';
vi.mock('../src/lhq/shared.jsx',()=>({Shell:({children})=><div>{children}</div>,Source:()=>null,Picker:()=>null,PlayerName:({row,onOpen,name})=><button onClick={e=>onOpen(row,e.currentTarget)}>{name||row.name}</button>}));
afterEach(cleanup);
const player={name:'Sample Runner',player_id:'test-runner',position:'RB',team:'TEST',aliases:['Sample Runner']};
const report=(type,date)=>({id:`${type}-${date}`,type,date,season:2026,week:7,title:`${type} report`,context:'Observed snapshot',sources:[{name:'Source',url:'https://example.com/report',date}],sections:[{id:`${type}-overview`,title:'Overview',league:'',blocks:[{kind:'paragraph',text:'Sample Runner is a consideration.'},{kind:'table',headers:['Player','Bid'],rows:[['Sample Runner','2'],['Another Runner','10']]}]},{id:`${type}-league`,title:'Example League',league:'example',blocks:[{kind:'paragraph',text:'Only this league.'}]}]});
const pack=()=>({schema:'bowser-private-briefings-v1',reports:[report('waiver','2026-10-21'),report('daily','2026-10-20')],players:[player]});
describe('private briefing contract',()=>{
 it('rejects malformed structures before render and disallows active URLs',()=>{
  expect(()=>parseBriefingPack('{bad')).toThrow();
  const bad=pack();bad.reports[0].sections[0].blocks[1].rows=[['too short']];expect(()=>parseBriefingPack(JSON.stringify(bad))).toThrow();
  const badSource=pack();badSource.reports[0].sources[0].date={invalid:true};expect(()=>parseBriefingPack(JSON.stringify(badSource))).toThrow();
  expect(safeSourceUrl('javascript:alert(1)')).toBeNull();expect(safeSourceUrl('https://user:secret@example.com')).toBeNull();expect(safeSourceUrl('https://example.com')).toBe('https://example.com/');
 });
 it('does not match fragments or ambiguous aliases',()=>{
  expect(splitPlayerText('Sample Runner and Sample Runners',[player]).filter(x=>x.player)).toHaveLength(1);
  expect(splitPlayerText('Sample Runner',[player,{...player,player_id:'different'}]).some(x=>x.player)).toBe(false);
 });
 it('distinguishes numerical projection gain from same-position rank evidence',()=>{
  expect(optionSignal({pts:5,rank:'RB20'},{pts:7,rank:'RB30'})).toEqual({delta:2,rankOnly:false});
  expect(optionSignal({pts:5,rank:'RB20'},{pts:4,rank:'RB10'})).toEqual({delta:-1,rankOnly:true});
  expect(optionSignal({pts:null,rank:'RB20'},{pts:4,rank:'WR10'})).toEqual({delta:null,rankOnly:false});
 });
 it('opens the existing player flow, filters leagues, sorts numeric strings, and clears private data',()=>{
  const onOpen=vi.fn(),setPack=vi.fn();render(<Briefings pack={pack()} setPack={setPack} onOpen={onOpen} season={2026}/>);
  fireEvent.click(screen.getAllByText('Sample Runner',{selector:'button'})[0]);expect(onOpen.mock.calls[0][0]).toMatchObject({player_id:'test-runner',season:2026});
  fireEvent.click(screen.getByRole('button',{name:'Bid'}));expect(screen.getAllByRole('row')[1].textContent).toContain('Sample Runner');
  fireEvent.click(screen.getByRole('button',{name:/Bid/}));expect(screen.getAllByRole('row')[1].textContent).toContain('Another Runner');
  fireEvent.click(screen.getByRole('button',{name:'Clear private reports'}));expect(setPack).toHaveBeenCalledWith(null);
 });
 it('links an older daily briefing to the newer waiver plan without changing its date',()=>{
  render(<Briefings pack={pack()} setPack={vi.fn()} onOpen={vi.fn()} season={2026}/>);fireEvent.click(screen.getByRole('button',{name:'Daily briefing'}));
  expect(screen.getByText(/Newer than this daily edition/)).toBeTruthy();expect(screen.getByText(/Snapshot as of 2026-10-20/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Read full game plan'}));expect(screen.getByText(/Snapshot as of 2026-10-21/)).toBeTruthy();
 });
 it('loads a file only into provided memory state without browser persistence or upload',async()=>{
  const setPack=vi.fn(),fetchSpy=vi.spyOn(globalThis,'fetch'),storageSpy=vi.spyOn(Storage.prototype,'setItem');
  render(<Briefings pack={null} setPack={setPack} onOpen={vi.fn()} season={2026}/>);
  const f={size:1000,text:async()=>JSON.stringify(pack())};fireEvent.change(screen.getByLabelText('Choose private briefing pack'),{target:{files:[f]}});
  await vi.waitFor(()=>expect(setPack).toHaveBeenCalled());expect(fetchSpy).not.toHaveBeenCalled();expect(storageSpy).not.toHaveBeenCalled();fetchSpy.mockRestore();storageSpy.mockRestore();
 });
 it('links roster alternatives and team defenses without inventing missing player profiles',()=>{
  const p=pack();p.reports[1].sections[0].blocks=[{kind:'comparison',rows:[{slot:'RB',bench:'Sample Runner',starter:{name:'Sample Runner',pts:5,rank:'RB20'},options:[{name:'Titans',position:'DEF',pts:6,rank:'DST4'},{name:'Unknown Kicker',position:'K',pts:4,rank:'K10'}]}]}];
  render(<Briefings pack={p} setPack={vi.fn()} onOpen={vi.fn()} season={2026}/>);fireEvent.click(screen.getByRole('button',{name:'Daily briefing'}));
  expect(screen.getByRole('link',{name:'Titans'}).getAttribute('href')).toContain('team=TEN');
  expect(screen.queryByRole('button',{name:'Unknown Kicker'})).toBeNull();expect(screen.getAllByRole('button',{name:'Sample Runner'}).length).toBeGreaterThan(1);
 });
 it('renders imported text inert, including markup and unsafe news links',()=>{
  const p=pack();p.reports[0].sections[0].blocks.push({kind:'news',text:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)',date:'2026-10-21'});
  const {container}=render(<Briefings pack={parseBriefingPack(JSON.stringify(p))} setPack={vi.fn()} onOpen={vi.fn()} season={2026}/>);
  expect(container.querySelector('img')).toBeNull();expect(container.querySelector('a[href^="javascript"]')).toBeNull();expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
 });
});
