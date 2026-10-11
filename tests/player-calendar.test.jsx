import { test,expect } from 'vitest';
import { playerCalendarDefaults } from '../src/lhq/playerCalendar.js';
const meta={latestCompleteWeek:4,scheduleWeeks:[{week:4,firstGameDate:'2026-10-01',lastGameDate:'2026-10-05'},{week:5,firstGameDate:'2026-10-08',lastGameDate:'2026-10-12'},{week:6,firstGameDate:'2026-10-15',lastGameDate:'2026-10-19'}]};
test('Thursday week five uses completed week four; Tuesday central time advances DFS independently of source availability',()=>{
 expect(playerCalendarDefaults(meta,Date.parse('2026-10-08T10:00:00Z'))).toEqual({baseWeek:4,dfsWeek:5});
 expect(playerCalendarDefaults({...meta,latestCompleteWeek:5},Date.parse('2026-10-13T04:59:59Z'))).toEqual({baseWeek:4,dfsWeek:5});
 expect(playerCalendarDefaults({...meta,latestCompleteWeek:5},Date.parse('2026-10-13T05:00:00Z'))).toEqual({baseWeek:5,dfsWeek:6});
 expect(playerCalendarDefaults(meta,Date.parse('2026-10-13T13:00:00Z'))).toEqual({baseWeek:4,dfsWeek:6});
});
test('before season and absent schedule remain conservative',()=>{
 expect(playerCalendarDefaults({latestCompleteWeek:null,availableWeeks:[]},Date.now()).baseWeek).toBe(1);
 expect(playerCalendarDefaults(meta,Date.parse('2026-08-01T00:00:00Z')).dfsWeek).toBe(4);
});
