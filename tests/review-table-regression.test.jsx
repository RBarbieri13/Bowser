// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {PlayerProfile} from '../src/PlayerProfile.jsx';
const reply=data=>({ok:true,json:async()=>data});
const profile={data:{player:{playerId:'review',name:'Review Player',position:'RB',team:'BUF'},gameLogs:[{season_type:'REG',week:1,opponent_team:'KC',fantasy_points:5,carries:4,rushing_yards:12},{season_type:'REG',week:2,opponent_team:'NYJ',fantasy_points:30,carries:12,rushing_yards:72}],history:[{season:2026,week:1,fantasy_points:5,rushing_yards:12},{season:2026,week:2,fantasy_points:30,rushing_yards:72}],seasonStats:[],depthChart:{team:'BUF',groups:[]}},meta:{season:2026,scoring:'ppr'}};
beforeEach(()=>{localStorage.clear();global.fetch=vi.fn(async()=>reply(profile));});afterEach(()=>{cleanup();vi.restoreAllMocks();});
const renderProfile=()=>render(<PlayerProfile player={{playerId:'review',name:'Review Player'}} season={2026} scoring='ppr' onClose={()=>{}}/>);
test('profile history-window change preserves selected statistic',async()=>{renderProfile();await screen.findByLabelText('Player trajectory metric');fireEvent.change(screen.getByLabelText('Player trajectory metric'),{target:{value:'rushing_yards'}});expect(screen.getByLabelText('Player trajectory metric')).toHaveValue('rushing_yards');fireEvent.change(screen.getByLabelText('Player trajectory history'),{target:{value:'5'}});await screen.findByLabelText('Player trajectory metric');expect(screen.getByLabelText('Player trajectory metric').value).toBe('rushing_yards');});
