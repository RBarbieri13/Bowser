import { test,expect } from 'vitest';
import { playerCalendarDefaults,statisticsWeekStatus } from '../src/lhq/playerCalendar.js';
import {calendarContext} from '../src/lhq/weekWindowModel.js';
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

test('partial weeks report imported coverage without waiting for Monday',()=>{
 expect(statisticsWeekStatus({weekCoverage:[{week:8,scheduledGames:14,completedGames:13,sourcedGames:13}]},8)).toEqual({partial:true,label:'13 of 14 games imported · partial week'});
 expect(statisticsWeekStatus({weekCoverage:[{week:8,scheduledGames:14,completedGames:13,sourcedGames:0}]},8).label).toContain('No game statistics imported');
});

test('upcoming DFS remains independent when Current statistics is waiting for the first new-week import',()=>{
 const observed={...meta,availableWeeks:[4],weekCoverage:[{week:4,scheduledGames:16,completedGames:16,sourcedGames:16,completedSourcedGames:16},{week:5,scheduledGames:15,completedGames:0,sourcedGames:0,completedSourcedGames:0}]};
 const thursday=Date.parse('2026-10-08T18:00:00Z');
 expect(playerCalendarDefaults(observed,thursday).dfsWeek).toBe(5);
 expect(calendarContext(observed,thursday).currentWeek).toBe(4);
 const imported={...observed,availableWeeks:[4,5],weekCoverage:[observed.weekCoverage[0],{week:5,scheduledGames:15,completedGames:1,sourcedGames:1,completedSourcedGames:1}]};
 const afterImport=Date.parse('2026-10-09T04:30:00Z');
 expect(calendarContext(imported,afterImport).currentWeek).toBe(5);
 expect(playerCalendarDefaults(imported,afterImport).dfsWeek).toBe(5);
});
