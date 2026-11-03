// DFS defaults use schedule dates and Tuesday 00:00 America/Chicago.
// This fallback ending week requires complete coverage; it is not the Current
// statistics label. calendarContext.currentWeek uses the first completed-and-
// imported game, and Player Database can explicitly select partial weeks.
export function playerCalendarDefaults(meta, now = Date.now()) {
  const complete = meta?.latestCompleteWeek ?? Math.max(1, ...(meta?.availableWeeks || []));
  const weeks = (meta?.scheduleWeeks || []).filter(w => /^\d{4}-\d{2}-\d{2}$/.test(w.firstGameDate) && Number.isInteger(w.week)).sort((a,b) => a.week-b.week);
  if (!weeks.length) return { baseWeek: complete, dfsWeek: null };
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit' }).format(now);
  const today = Date.parse(`${date}T00:00:00Z`);
  const start = week => {
    const day = new Date(`${week.firstGameDate}T00:00:00Z`);
    return day.getTime() - ((day.getUTCDay()+5)%7)*86400000;
  };
  const current = weeks.filter(w => start(w) <= today).at(-1) || weeks[0];
  const afterSeason = today > Date.parse(`${weeks.at(-1).lastGameDate}T00:00:00Z`) + 2*86400000;
  return { dfsWeek: current.week, baseWeek: Math.max(1, Math.min(complete, afterSeason ? complete : current.week-1)) };
}

// Report imported game coverage separately from the schedule: partial weeks are selectable.
export function statisticsWeekStatus(meta, week) {
 const coverage = meta?.weekCoverage?.find(w => w.week === week);
 if (!coverage) return {label:'Game coverage unavailable',partial:false};
 const {sourcedGames=0,scheduledGames=0,completedGames=0}=coverage;
 return {partial:sourcedGames<scheduledGames,label:sourcedGames===0
  ? `No game statistics imported yet (${completedGames} completed)`
  : `${sourcedGames} of ${scheduledGames} games imported${sourcedGames<scheduledGames?' · partial week':''}`};
}
