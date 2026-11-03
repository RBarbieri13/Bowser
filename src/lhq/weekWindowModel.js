const DAY=86400000;
const isoDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?Date.parse(`${value}T00:00:00Z`):NaN;
export const weekNumber=value=>Math.max(1,Math.min(22,Math.trunc(Number(value)||1)));
export function rangeThrough(through,count){const to=weekNumber(through);return {from:Math.max(1,to-Math.max(1,Math.trunc(Number(count)||1))+1),through:to};}
export function weekRangeLabel(from,through){return from===through?`Week ${through}`:`Weeks ${from}–${through}`;}
export function scheduleWeekDates(meta,week){
 const row=meta?.scheduleWeeks?.find(r=>r.week===week),start=isoDay(row?.firstGameDate),end=isoDay(row?.lastGameDate);
 if(!Number.isFinite(start)||!Number.isFinite(end))return 'Dates unavailable';
 const fmt=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
 return start===end?fmt.format(start):`${fmt.format(start)}–${fmt.format(end)}`;
}
export function calendarContext(meta,now=Date.now()){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),today=isoDay(date);
 const rows=(meta?.scheduleWeeks||[]).filter(r=>Number.isInteger(r.week)&&r.week>=1&&r.week<=22&&Number.isFinite(isoDay(r.firstGameDate))&&Number.isFinite(isoDay(r.lastGameDate))).sort((a,b)=>a.week-b.week);
 const start=r=>{const t=isoDay(r.firstGameDate);return t-((new Date(t).getUTCDay()+5)%7)*DAY;};
 const last=rows.length?isoDay(rows.at(-1).lastGameDate):NaN;
 const untilNextTuesday=rows.length?((2-new Date(last).getUTCDay()+7)%7||7):0;
 const before=!!rows.length&&today<start(rows[0]),after=!!rows.length&&today>=last+untilNextTuesday*DAY;
 const current=!before&&!after?rows.filter(r=>start(r)<=today).at(-1):null;
 return {date,dateLabel:new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',month:'short',day:'numeric'}).format(now),currentWeek:current?.week??null,upcomingWeek:before?rows[0].week:null,beforeSeason:before,afterSeason:after,latestPlayed:Math.max(0,...(meta?.availableWeeks||[]))};
}
export function slateShortLabel(option){return (option?.label||'No slate · all players').replace(/^\d{4} W\d+ · /,'').replace(/ · archived$/,'');}

export function defaultSlateKey(slates,week,preferred){
 const choices=slates.filter(o=>o.week===week);
 return choices.find(o=>o.key===preferred)?.key||choices.find(o=>o.contestTypeId!==96&&!o.isLocked)?.key||choices.find(o=>o.contestTypeId!==96)?.key||choices[0]?.key||'none';
}
export function slateStartLabel(option){
 const t=Date.parse(option?.startsAt);if(!Number.isFinite(t))return 'Kickoff time unavailable';
 return new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(t)+' CT';
}
export function rangeCoverageLabel(meta,from,through){
 const rows=Array.from({length:through-from+1},(_,i)=>meta?.weekCoverage?.find(w=>w.week===from+i));
 if(rows.some(r=>!r))return 'Source coverage unavailable for part of this range';
 const sourced=rows.reduce((n,r)=>n+(r.sourcedGames||0),0),scheduled=rows.reduce((n,r)=>n+(r.scheduledGames||0),0);
 if(!scheduled)return 'No scheduled game coverage available';
 return `${sourced} of ${scheduled} games imported${sourced<scheduled?(from===through?' · partial week':' · incomplete range'):''}`;
}
