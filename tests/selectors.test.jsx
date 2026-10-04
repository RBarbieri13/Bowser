// @vitest-environment jsdom
import {useState} from 'react';
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,test,vi} from 'vitest';
import {GameSelector,gamePresentation} from '../src/lhq/GameSelector.jsx';
import {FilterDropdown,FilterPill,FilterSegments} from '../src/lhq/FilterPill.jsx';
import {addCommentary} from '../src/marketCommentary.js';
afterEach(cleanup);
const games=[{gameId:'one',awayTeam:'MIN',homeTeam:'MIA',state:'in',quarter:'4th Quarter',clock:'2:11',awayScore:34,homeScore:13,possession:'MIN'},{gameId:'two',awayTeam:'NYG',homeTeam:'LAR',homeScore:21,awayScore:17,state:'post',overtime:true},{gameId:'three',awayTeam:'WAS',homeTeam:'DAL',kickoffUtc:'2026-10-04T20:25:00Z',favoriteTeam:'DAL',spread:-3.5,overUnder:47.5}];
function Games({single=false}){const [selected,setSelected]=useState([]);return <GameSelector games={games} selected={selected} onChange={setSelected} single={single}/>;}
test('game boxes preserve live/final/pre states, real zero and unavailable fields; all assets are local',()=>{
 render(<Games/>);const live=screen.getByRole('button',{name:/MIN @ MIA/}),final=screen.getByRole('button',{name:/NYG @ LA/}),pre=screen.getByRole('button',{name:/WAS @ DAL/});
 expect(live).toHaveTextContent('4th Quarter 2:11');expect(within(live).getByLabelText('Live')).toBeInTheDocument();expect(within(live).getByLabelText('MIN possession')).toBeInTheDocument();
 expect(final).toHaveTextContent('Final · OT');expect(pre).toHaveTextContent('Sun 4:25 PM');expect(pre).toHaveTextContent('-3.5');expect(pre).toHaveTextContent('o47.5');
 expect(screen.getByAltText('LA helmet')).toHaveAttribute('src','/logos/nfl/LAR.png');for(const img of screen.getAllByRole('img'))expect(img.getAttribute('src')).toMatch(/^\/logos\/nfl\/[A-Z]+\.png$/);
 expect(gamePresentation({awayTeam:'MIN',homeTeam:'MIA'}).teams.map(t=>t.value)).toEqual(['—','—']);expect(gamePresentation({...games[0],awayScore:0}).teams[0].value).toBe('0');
});
test('plain click isolates, Shift/Meta adds, selected again and All clear; single ignores modifiers',()=>{
 const view=render(<Games/>);const a=()=>screen.getByRole('button',{name:/MIN @ MIA/}),b=()=>screen.getByRole('button',{name:/NYG @ LA/});
 fireEvent.click(a());expect(a()).toHaveAttribute('aria-pressed','true');expect(b()).toHaveAttribute('data-faded','true');fireEvent.click(b(),{shiftKey:true});expect(a()).toHaveAttribute('aria-pressed','true');expect(b()).toHaveAttribute('aria-pressed','true');
 fireEvent.click(a(),{metaKey:true});expect(a()).toHaveAttribute('aria-pressed','false');fireEvent.click(b());expect(screen.getByRole('button',{name:'All 3 games'})).toHaveAttribute('aria-pressed','true');
 fireEvent.click(a());fireEvent.click(screen.getByRole('button',{name:'All 3 games'}));expect(a()).toHaveAttribute('aria-pressed','false');view.unmount();render(<Games single/>);fireEvent.click(a());fireEvent.click(b(),{shiftKey:true});expect(a()).toHaveAttribute('aria-pressed','false');expect(b()).toHaveAttribute('aria-pressed','true');
});
test('pill dropdown supports multi selection, search, keyboard and restores trigger focus on Escape',async()=>{
 const user=userEvent.setup();function Demo(){const [value,setValue]=useState([]);return <FilterDropdown label="Teams" searchable options={['MIN','MIA','DAL']} value={value} onChange={setValue}/>;}render(<Demo/>);
 const trigger=screen.getByRole('button',{name:'Teams'});await user.click(trigger);await user.click(screen.getByRole('option',{name:'MIN'}));await user.click(screen.getByRole('option',{name:'MIA'}));expect(trigger).toHaveTextContent('2');expect(trigger).toHaveAttribute('data-on','true');
 await user.type(screen.getByRole('textbox',{name:'Search Teams'}),'DA');expect(screen.queryByRole('option',{name:'MIN'})).not.toBeInTheDocument();await user.keyboard('{ArrowDown}{Enter}');expect(trigger).toHaveTextContent('3');await user.keyboard('{Escape}');expect(trigger).toHaveFocus();expect(trigger).toHaveAttribute('aria-expanded','false');
 await user.keyboard(' ');await user.click(screen.getByRole('button',{name:'Clear teams'}));expect(trigger).not.toHaveTextContent('3');expect(trigger).toHaveAttribute('data-on','false');
});
test('single and multi segmented pills use exclusive and OR selection respectively; both sizes and disabled exist',()=>{
 function Demo(){const [single,s]=useState('Week'),[multi,m]=useState([]);return <><FilterSegments label="Range" options={['Week','Season']} value={single} onChange={s}/><FilterSegments label="Positions" options={['All','QB','RB','WR']} value={multi} onChange={m} multiple/><FilterPill size="default" disabled>Disabled</FilterPill></>;}render(<Demo/>);
 fireEvent.click(screen.getByRole('button',{name:'Season'}));expect(screen.getByRole('button',{name:'Week'})).toHaveAttribute('aria-pressed','false');expect(screen.getByRole('button',{name:'Season'})).toHaveAttribute('aria-pressed','true');
 fireEvent.click(screen.getByRole('button',{name:'QB'}));fireEvent.click(screen.getByRole('button',{name:'WR'}));expect(screen.getByRole('button',{name:'QB'})).toHaveAttribute('aria-pressed','true');expect(screen.getByRole('button',{name:'WR'})).toHaveAttribute('aria-pressed','true');fireEvent.click(screen.getByRole('button',{name:'All'}));expect(screen.getByRole('button',{name:'QB'})).toHaveAttribute('aria-pressed','false');expect(screen.getByRole('button',{name:'Disabled'})).toBeDisabled();expect(screen.getByRole('button',{name:'Disabled'})).toHaveStyle({height:'40px'});expect(screen.getByRole('button',{name:'Season'})).toHaveStyle({height:'32px'});
});
test('disabled dropdown does not open and single selection returns focus',async()=>{
 const user=userEvent.setup(),change=vi.fn();const view=render(<FilterDropdown label="No access" options={['MIN']} disabled value={[]} onChange={change}/>);await user.click(screen.getByRole('button',{name:'No access'}));expect(screen.queryByRole('listbox')).not.toBeInTheDocument();expect(change).not.toHaveBeenCalled();view.unmount();render(<FilterDropdown label="Context" options={['MIN','MIA']} multiple={false} value="MIN" onChange={change}/>);const trigger=screen.getByRole('button',{name:'Context'});await user.click(trigger);await user.click(screen.getByRole('option',{name:'MIA'}));expect(change).toHaveBeenCalledWith('MIA');expect(trigger).toHaveFocus();
});
test('commentary topic selection unions sourced records without duplicates or fabricated counts',()=>{
 const now=Date.parse('2026-10-04T12:00:00Z'),records=['injury','role','waiver'].map((topic,i)=>({id:String(i),espnId:'1',publishedAt:'2026-10-04T10:00:00Z',answers:{topic:{choice:topic,confidence:1}}}));
 expect(addCommentary([{espnId:'1'}],{records},{now,topic:['injury','role']})[0].newsCount).toBe(2);expect(addCommentary([{espnId:'1'}],{records},{now,topic:[]})[0].newsCount).toBe(3);
});

test('non-searchable popover transfers keyboard focus into options on open',async()=>{
 const user=userEvent.setup();function Demo(){const [v,set]=useState([]);return <FilterDropdown label="Positions" options={['QB','RB','WR']} value={v} onChange={set}/>;}render(<Demo/>);await user.tab();expect(screen.getByRole('button',{name:'Positions'})).toHaveFocus();await user.keyboard('{Enter}');expect(screen.getByRole('option',{name:'QB'})).toHaveFocus();await user.keyboard('{ArrowDown}{Enter}');expect(screen.getByRole('option',{name:'RB'})).toHaveAttribute('aria-selected','true');await user.keyboard('{Escape}');expect(screen.getByRole('button',{name:'Positions'})).toHaveFocus();
});
