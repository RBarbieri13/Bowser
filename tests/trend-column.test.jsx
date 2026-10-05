// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {afterEach,expect,test,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {TrendBars} from '../src/TrendBars.jsx';
import {Grid,TrendControl} from '../src/lhq/shared.jsx';
import {sortRows} from '../src/lhq/model.js';
import {TREND_PALETTES,trendColumn,trendGrade,trendRequestCount,trendWhole,trendWidth,visibleTrendMax} from '../src/trendColumn.js';
afterEach(cleanup);
const history=values=>values.map((snaps,i)=>({season:2026,week:i+1,snaps}));
const column=count=>({key:'trend',label:'Snap trend',group:'usage',...trendColumn({metric:'snaps',count,history:r=>r.history.slice(-count)})});
test.each([2,3,4,5])('%i week columns retain all values and reserve the exact design width',count=>{
 const rows=[{key:'a',history:history([1,2,3,4,5])}];
 const {container}=render(<Grid columns={[column(count)]} rows={rows} widths={{trend:70}}/>);
 expect(container.querySelector('col')).toHaveStyle({width:`${trendWidth(count)}px`});
 expect(container.querySelectorAll('.bowser-trend-slot')).toHaveLength(count);
 expect(container.querySelectorAll('.bowser-trend-value')).toHaveLength(count);
 expect([...container.querySelectorAll('.bowser-trend-slot')].at(-1)).toHaveAttribute('data-week','5');
 expect([...container.querySelectorAll('.bowser-trend-value')].at(-1)).toHaveStyle({color:'#FFFFFF'});
});
test('column max changes with visible rows and history; stored narrow widths cannot clip labels',()=>{
 const rows=[{key:'large',history:history([100,20,10])},{key:'small',history:history([0,2,4])}];
 const {rerender,container}=render(<Grid columns={[column(3)]} rows={rows}/>);
 expect([...container.querySelectorAll('[data-scale-max]')].map(c=>c.dataset.scaleMax)).toEqual(['100','100']);
 expect(container.querySelector('i')).toHaveStyle({height:'12px'});
 rerender(<Grid columns={[column(3)]} rows={[rows[1]]}/>);
 expect(container.querySelector('[data-scale-max]')).toHaveAttribute('data-scale-max','4');
 expect([...container.querySelectorAll('i')].map(b=>b.style.height)).toEqual(['1px','7px','12px']);
 rerender(<Grid columns={[column(2)]} rows={rows}/>);
 expect(container.querySelector('[data-scale-max]')).toHaveAttribute('data-scale-max','20');
 expect(visibleTrendMax([{total:true,history:history([1000])},...rows],r=>r.history,'snaps')).toBe(100);
});
test.each([
 [[1,36],100,'Strong up'],[[1,13],100,'Up'],[[1,12.9],100,'Flat'],
 [[36,1],100,'Strong down'],[[13,1],100,'Down'],[[12.9,1],100,'Flat'],
 [[0,0,0],0,'Flat'],[[null,2,3],3,'Unavailable'],[[1,null,3],3,'Strong up'],
])('grades %j with max %i as %s',(values,max,name)=>expect(trendGrade(values,max).name).toBe(name));
test('sorting follows signed change then latest value, with unknown endpoints last in both directions',()=>{
 const rows=[{key:'b',history:history([2,5])},{key:'a',history:history([0,3])},{key:'c',history:history([9,1])},{key:'gap',history:history([null,100])}];
 expect(sortRows(rows,{key:'trend',desc:true},[column(2)]).map(r=>r.key)).toEqual(['b','a','c','gap']);
 expect(sortRows(rows,{key:'trend',desc:false},[column(2)]).map(r=>r.key)).toEqual(['c','a','b','gap']);
});
test('metric/history arrow remains separate from the descending-first sort header',()=>{
 const sort=vi.fn(),metric=vi.fn(),count=vi.fn();
 render(<Grid columns={[{...column(3),headerControl:<TrendControl label="Snap trend" metric="snaps" count={3} onMetric={metric} onCount={count}/>}]} rows={[]} onSort={sort}/>);
 fireEvent.click(screen.getByRole('button',{name:'Snap trend settings'}));
 const menu=screen.getByRole('dialog',{name:'Snap trend settings'});
 expect(sort).not.toHaveBeenCalled();
 fireEvent.change(within(menu).getByLabelText('Snap trend statistic'),{target:{value:'targets'}});
 fireEvent.change(within(menu).getByLabelText('Snap trend history'),{target:{value:'4'}});
 expect(metric).toHaveBeenCalledWith('targets'); expect(count).toHaveBeenCalledWith(4);
 fireEvent.click(within(menu).getByRole('button',{name:'Done'}));
 fireEvent.click(screen.getByRole('button',{name:'Snap trend',exact:true}));
 expect(sort).toHaveBeenCalledWith({key:'trend',desc:true});
});
test.each(Object.entries(TREND_PALETTES))('%s palette uses early shade then the last three shades', (group,palette)=>{
 const {container}=render(<TrendBars history={history([1,2,3,4,5])} group={group}/>);
 const bars=container.querySelectorAll('i');
 [palette[0],palette[0],...palette].forEach((color,i)=>expect(bars[i]).toHaveStyle({background:color}));
});
test('gaps, true zeros, exact negative values and fractional tooltips stay distinct',()=>{
 const {container}=render(<TrendBars metric="fantasy_points" history={[null,0,14.5,-2.4].map((fantasy_points,i)=>({season:2026,week:i+1,fantasy_points}))}/>);
 const slots=container.querySelectorAll('.bowser-trend-slot');
 expect(slots[0]).toHaveTextContent('—'); expect(slots[0].querySelector('i')).toBeNull();
 expect(slots[1]).toHaveTextContent('0');expect(slots[1].querySelector('i')).toHaveStyle({height:'1px',background:'#2A2A2A'});
 expect(slots[2]).toHaveTextContent('15');expect(slots[2].title).toContain('14.5');
 expect(slots[3]).toHaveClass('negative');expect(slots[3]).toHaveTextContent('-2');expect(slots[3].title).toContain('-2.4');
 expect(container.querySelector('.bowser-trend-arrow')).toHaveTextContent('—');
 expect(trendWhole(2.5)).toBe('3');expect(trendWhole(-2.5)).toBe('-2');
});
test('intermediate display windows use existing API contract without changing calendar anchors',()=>{
 expect([2,3,4,5].map(trendRequestCount)).toEqual([3,3,5,5]);
});
