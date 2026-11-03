import {test,expect} from 'vitest';
import {calendarContext,rangeCoverageLabel,rangeThrough,scheduleWeekDates,slateShortLabel,weekRangeLabel} from '../src/lhq/weekWindowModel.js';
const meta={availableWeeks:[1,2,3,4,5,6,7,8],latestCompleteWeek:7,weekCoverage:[{week:8,scheduledGames:14,completedGames:13,sourcedGames:13,completedSourcedGames:13},{week:9,scheduledGames:15,completedGames:0,sourcedGames:0,completedSourcedGames:0}],scheduleWeeks:[{week:8,firstGameDate:'2026-10-29',lastGameDate:'2026-11-02'},{week:9,firstGameDate:'2026-11-05',lastGameDate:'2026-11-09'}]};
test('historical3–6 and recent4through6 are identical, independent of todays week',()=>{
 expect(rangeThrough(6,4)).toEqual({from:3,through:6});
 expect(weekRangeLabel(3,6)).toBe('Weeks 3–6');
 expect(rangeThrough(6,1)).toEqual({from:6,through:6});
 expect(weekRangeLabel(6,6)).toBe('Week 6');
 expect(rangeThrough(3,5)).toEqual({from:1,through:3});
 expect(rangeThrough(22,4)).toEqual({from:19,through:22});
});
test('Tuesday Chicago midnight after DST advances schedule context while Current statistics stays on the imported week',()=>{
 const monday=calendarContext(meta,Date.parse('2026-11-03T05:59:59Z'));
 const tuesday=calendarContext(meta,Date.parse('2026-11-03T06:00:00Z'));
 expect(monday.currentWeek).toBe(8);expect(monday.calendarWeek).toBe(8);expect(monday.date).toBe('2026-11-02');
 expect(tuesday.currentWeek).toBe(8);expect(tuesday.calendarWeek).toBe(9);expect(tuesday.latestPlayed).toBe(8);expect(tuesday.date).toBe('2026-11-03');
 expect(tuesday.awaitingFirstImport).toBe(true);expect(tuesday.currentWeekBasis).toBe('completed-and-imported');
 expect(scheduleWeekDates(meta,8)).toBe('Oct 29–Nov 2');
});
test('historical seasons, missing schedule and postseason do not invent a current NFL week',()=>{
 const historical=calendarContext({...meta,scheduleWeeks:[{week:22,firstGameDate:'2026-02-08',lastGameDate:'2026-02-08'}]},Date.parse('2026-11-03T18:00:00Z'));
 expect(historical.currentWeek).toBeNull();expect(historical.afterSeason).toBe(true);
 expect(calendarContext({},Date.parse('2026-11-03T18:00:00Z')).currentWeek).toBeNull();
 const postseason={availableWeeks:[21,22],weekCoverage:[{week:21,completedGames:2,sourcedGames:2,completedSourcedGames:2},{week:22,completedGames:1,sourcedGames:1,completedSourcedGames:1}],scheduleWeeks:[{week:21,firstGameDate:'2027-01-31',lastGameDate:'2027-01-31'},{week:22,firstGameDate:'2027-02-14',lastGameDate:'2027-02-14'}]};
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

test('Current statistics waits through Monday, Tuesday, Wednesday and Thursday until final-game statistics are imported',()=>{
 for(const date of ['2026-11-03T04:00:00Z','2026-11-03T18:00:00Z','2026-11-04T18:00:00Z','2026-11-06T03:00:00Z']){
  expect(calendarContext(meta,Date.parse(date)).currentWeek).toBe(8);
 }
 const thursdayLate=Date.parse('2026-11-06T05:00:00Z');
 const withWeek9=(completedGames,sourcedGames,completedSourcedGames,availableWeeks=[...meta.availableWeeks,9])=>({...meta,availableWeeks,weekCoverage:[meta.weekCoverage[0],{week:9,scheduledGames:15,completedGames,sourcedGames,completedSourcedGames}]});
 expect(calendarContext(withWeek9(1,0,0),thursdayLate).currentWeek).toBe(8); // final score alone
 expect(calendarContext(withWeek9(0,1,0),thursdayLate).currentWeek).toBe(8); // statistics without final scores
 expect(calendarContext(withWeek9(1,1,0),thursdayLate).currentWeek).toBe(8); // evidence belongs to different games
 expect(calendarContext(withWeek9(1,1,1,meta.availableWeeks),thursdayLate).currentWeek).toBe(8); // unpublished statistics week
 const imported=calendarContext(withWeek9(1,1,1),thursdayLate);
 expect(imported.currentWeek).toBe(9);expect(imported.calendarWeek).toBe(9);expect(imported.awaitingFirstImport).toBe(false);
 expect(calendarContext(withWeek9(1,1,1),Date.parse('2026-11-09T18:00:00Z')).currentWeek).toBe(9);
});
test('older coverage can advance Current statistics only if a same-game overlap is guaranteed',()=>{
 const legacy=(completedGames,sourcedGames)=>({...meta,availableWeeks:[...meta.availableWeeks,9],weekCoverage:[meta.weekCoverage[0],{week:9,scheduledGames:15,completedGames,sourcedGames}]});
 const now=Date.parse('2026-11-06T05:00:00Z');
 expect(calendarContext(legacy(1,1),now).currentWeek).toBe(8);
 expect(calendarContext(legacy(14,1),now).currentWeek).toBe(8);
 expect(calendarContext(legacy(14,2),now).currentWeek).toBe(9);
});
test('a future date or missing coverage cannot fabricate Current statistics',()=>{
 const ahead={...meta,availableWeeks:[...meta.availableWeeks,9],weekCoverage:[meta.weekCoverage[0],{week:9,completedGames:1,sourcedGames:1,completedSourcedGames:1}]};
 expect(calendarContext(ahead,Date.parse('2026-11-04T18:00:00Z')).currentWeek).toBe(8);
 const unknown=calendarContext({...meta,weekCoverage:[]},Date.parse('2026-11-05T18:00:00Z'));
 expect(unknown.currentWeek).toBeNull();expect(unknown.calendarWeek).toBe(9);expect(unknown.awaitingFirstImport).toBe(true);
 expect(calendarContext(meta,Date.parse('2026-10-01T18:00:00Z')).currentWeek).toBeNull();
});
test('postseason stays on the last imported game until the next scheduled round is sourced',()=>{
 const rounds={availableWeeks:[21],weekCoverage:[{week:21,completedGames:2,sourcedGames:2,completedSourcedGames:2},{week:22,completedGames:0,sourcedGames:0,completedSourcedGames:0}],scheduleWeeks:[{week:21,firstGameDate:'2027-01-31',lastGameDate:'2027-01-31'},{week:22,firstGameDate:'2027-02-14',lastGameDate:'2027-02-14'}]};
 const beforeFinal=calendarContext(rounds,Date.parse('2027-02-14T18:00:00Z'));
 expect(beforeFinal.currentWeek).toBe(21);expect(beforeFinal.calendarWeek).toBe(22);
 const afterFinal=calendarContext({...rounds,availableWeeks:[21,22],weekCoverage:[rounds.weekCoverage[0],{week:22,completedGames:1,sourcedGames:1,completedSourcedGames:1}]},Date.parse('2027-02-15T04:00:00Z'));
 expect(afterFinal.currentWeek).toBe(22);
});
