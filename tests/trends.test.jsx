// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { TrendChart, TrendMetricSelect } from '../src/TrendChart.jsx';
import { TREND_METRIC_KEYS } from '../src/trendMetrics.js';
afterEach(cleanup);
test('42 snaps is exactly 21 times 2 snaps across players on a shared domain', () => {
  for (const [name, snaps] of [['Cam',42],['Tyrone',2]]) render(<TrendChart playerName={name} history={[{season:2026,week:1,snaps}]} domain={{min:0,max:100}} />);
  const bar = name => screen.getByRole('img',{name:new RegExp(`Snaps trend for ${name}`)}).querySelector('i');
  expect(parseFloat(bar('Cam').style.height)/parseFloat(bar('Tyrone').style.height)).toBe(21);
  expect(parseFloat(bar('Cam').style.top)).toBeCloseTo(58);
  expect(parseFloat(bar('Tyrone').style.top)).toBeCloseTo(98);
});
test('missing, zero, positive, and negative values retain calendar positions and signed baselines', () => {
  render(<TrendChart metric="fantasy_points" domain={{min:-10,max:40}} history={[
    {season:2025,week:16,fantasyPoints:null},{season:2025,week:17,fantasyPoints:0},
    {season:2025,week:18,fantasyPoints:20},{season:2026,week:1,fantasyPoints:-2},
  ]}/>);
  const chart=screen.getByRole('img'), bars=chart.querySelectorAll('.trend-bar-item');
  expect([...bars].map(b=>[b.dataset.season,b.dataset.week])).toEqual([['2025','16'],['2025','17'],['2025','18'],['2026','1']]);
  expect(bars[0].querySelector('i')).toBeNull();
  expect(bars[0]).toHaveAttribute('data-value','');
  expect(bars[1]).toHaveAttribute('data-value','0');
  expect(bars[2].querySelector('i')).toHaveStyle({top:'40%',height:'40%'});
  expect(bars[3].querySelector('i')).toHaveStyle({top:'80%',height:'4%'});
  expect(bars[3]).toHaveClass('negative');
});
test('every trend selector exposes the identical full metric catalogue', () => {
  for(let i=0;i<3;i++)render(<TrendMetricSelect label={`Chart ${i}`} metric="snaps" onChange={()=>{}}/>);
  for(const select of screen.getAllByRole('combobox'))expect([...select.options].map(o=>o.value)).toEqual(TREND_METRIC_KEYS);
  expect(TREND_METRIC_KEYS).toContain('position_finish');
});
