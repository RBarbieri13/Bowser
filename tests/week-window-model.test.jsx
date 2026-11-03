import {test,expect} from 'vitest';
import {calendarContext,rangeCoverageLabel,rangeThrough,scheduleWeekDates,slateShortLabel,weekRangeLabel} from '../src/lhq/weekWindowModel.js';
const meta={availableWeeks:[1,2,3,4,5,6,7,8],latestCompleteWeek:7,scheduleWeeks:[{week:8,firstGameDate:'2026-10-29',lastGameDate:'2026-11-02'},{week:9,firstGameDate:'2026-11-05',lastGameDate:'2026-11-09'}]};
test('historical3–6 and recent4through6 are identical, independent of todays week',()=>{
 expect(rangeThrough(6,4)).toEqual({from:3,through:6});
 expect(weekRangeLabel(3,6)).toBe('Weeks 3–6');
 expect(rangeThrough(6,1)).toEqual({from:6,through:6});
 expect(weekRangeLabel(6,6)).toBe('Week 6');
 expect(rangeThrough(3,5)).toEqual({from:1,through:3});
 expect(rangeThrough(22,4)).toEqual({from:19,through:22});
});
test('Tuesday Chicago midnight after DST separates current calendar from partial imported week',()=>{
 const monday=calendarContext(meta,Date.parse('2026-11-03T05:59:59Z'));
 const tuesday=calendarContext(meta,Date.parse('2026-11-03T06:00:00Z'));
 expect(monday.currentWeek).toBe(8);expect(monday.date).toBe('2026-11-02');
 expect(tuesday.currentWeek).toBe(9);expect(tuesday.latestPlayed).toBe(8);expect(tuesday.date).toBe('2026-11-03');
 expect(scheduleWeekDates(meta,8)).toBe('Oct 29–Nov 2');
});
test('historical seasons, missing schedule and postseason do not invent a current NFL week',()=>{
 const historical=calendarContext({...meta,scheduleWeeks:[{week:22,firstGameDate:'2026-02-08',lastGameDate:'2026-02-08'}]},Date.parse('2026-11-03T18:00:00Z'));
 expect(historical.currentWeek).toBeNull();expect(historical.afterSeason).toBe(true);
 expect(calendarContext({},Date.parse('2026-11-03T18:00:00Z')).currentWeek).toBeNull();
 const postseason={scheduleWeeks:[{week:21,firstGameDate:'2027-01-31',lastGameDate:'2027-01-31'},{week:22,firstGameDate:'2027-02-14',lastGameDate:'2027-02-14'}]};
 expect(calendarContext(postseason,Date.parse('2027-02-14T18:00:00Z')).currentWeek).toBe(22);
 expect(calendarContext(postseason,Date.parse('2027-02-16T06:00:00Z')).currentWeek).toBeNull();
 expect(scheduleWeekDates(postseason,22)).toBe('Feb 14');
 expect(scheduleWeekDates(postseason,4)).toBe('Dates unavailable');
});
test('source-native slate roles survive compact labels',()=>{
 expect(slateShortLabel({label:'2026 W8 · Monday Only · CHI @ SEA · Showdown · 11-02 · CPT · archived'})).toBe('Monday Only · CHI @ SEA · Showdown · 11-02 · CPT');
 expect(slateShortLabel({label:'2026 W8 · Monday Only · CHI @ SEA · Showdown · 11-02 · FLEX · archived'})).toContain('FLEX');
});

test('coverage counts the entire inclusive range and never implies zero games are complete',()=>{
 const coverage={weekCoverage:[{week:3,sourcedGames:16,scheduledGames:16},{week:4,sourcedGames:16,scheduledGames:16},{week:5,sourcedGames:15,scheduledGames:15},{week:6,sourcedGames:14,scheduledGames:14},{week:8,sourcedGames:13,scheduledGames:14},{week:9,sourcedGames:0,scheduledGames:15},{week:22,sourcedGames:0,scheduledGames:0}]};
 expect(rangeCoverageLabel(coverage,3,6)).toBe('61 of 61 games imported');
 expect(rangeCoverageLabel(coverage,8,9)).toBe('13 of 29 games imported · incomplete range');
 expect(rangeCoverageLabel(coverage,22,22)).toBe('No scheduled game coverage available');
 expect(rangeCoverageLabel(coverage,19,22)).toBe('Source coverage unavailable for part of this range');
});
