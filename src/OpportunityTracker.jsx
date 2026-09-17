import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, CaretDown, ChartBar, FirstAid,
  Gauge, Info, Lightning, ShieldCheck, UsersThree,
} from "@phosphor-icons/react";
import { TeamLogo } from "./teamLogos.jsx";
import { ScheduleWeekSelector } from "./ScheduleWeekSelector.jsx";
import { WeekRangePicker } from "./WeekRangePicker.jsx";
import { TrendChart, TrendMetricSelect } from "./TrendChart.jsx";
import { TREND_METRICS, trendValue } from "./trendMetrics.js";
import "./OpportunityTracker.css";

const POSITION_LABELS = { QB: "Quarterbacks", RB: "Running backs", WR: "Wide receivers", TE: "Tight ends" };
const SCORING_LABELS = { ppr: "PPR", half: "Half PPR", standard: "Standard" };
const DEFAULT_METRICS = Object.freeze({
  QB: Object.freeze(["snaps", "pass_attempts", "fantasy_points"]),
  RB: Object.freeze(["snaps", "rush_attempts", "fantasy_points"]),
  WR: Object.freeze(["snaps", "targets", "fantasy_points"]),
  TE: Object.freeze(["snaps", "targets", "fantasy_points"]),
});
export const OPPORTUNITY_PREFS_KEY = "bowser:opportunity-tracker:v1";
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const validWeek = (value) => Number.isInteger(value) && value >= 1 && value <= 22;

export function validateOpportunityPreferences(value) {
  const saved = object(value);
  const source = saved.version === 1 ? saved : {};
  const metrics = Object.fromEntries(Object.entries(DEFAULT_METRICS).map(([position, defaults]) => [position,
    defaults.map((metric, index) => Object.hasOwn(TREND_METRICS, source.metrics?.[position]?.[index]) ? source.metrics[position][index] : metric),
  ]));
  const weekSelections = {};
  for (const season of [2025, 2026]) {
    const selection = source.weekSelections?.[season];
    if (!selection || !validWeek(selection.start) || !validWeek(selection.end) || selection.start > selection.end) continue;
    weekSelections[season] = { start: selection.start, end: selection.end, extras: [...new Set(Array.isArray(selection.extras) ? selection.extras.filter(validWeek) : [])].sort((a, b) => a - b) };
  }
  return {
    version: 1,
    games: [5, 8, 10, 18].includes(source.games) ? source.games : 10,
    scoring: Object.hasOwn(SCORING_LABELS, source.scoring) ? source.scoring : "ppr",
    metrics,
    weekSelections,
  };
}

function readPreferences() {
  try { return validateOpportunityPreferences(JSON.parse(window.localStorage.getItem(OPPORTUNITY_PREFS_KEY))); }
  catch { return validateOpportunityPreferences(null); }
}

const metricLabel = (metric, scoring) => metric === "fantasy_points" ? `${SCORING_LABELS[scoring]} points` : TREND_METRICS[metric].label;
const slotLabel = (slot) => `${slot?.season || ""} W${slot?.week ?? "?"}`.trim();
function calendarLabel(slots) {
  if (!slots.length) return "Calendar history unavailable";
  return slots.length === 1 ? slotLabel(slots[0]) : `${slotLabel(slots[0])}–${slotLabel(slots.at(-1))}`;
}

function alignedHistory(player, slots, season) {
  const history = (player.history || []).filter((game) => game && (game.seasonType || game.season_type || "REG") === "REG");
  if (!slots.length) return history;
  const byWeek = new Map(history.map((game) => [`${game.season ?? season}:${game.week}`, game]));
  return slots.map((slot) => byWeek.get(`${slot.season ?? season}:${slot.week}`) || { ...slot, missing: true });
}

function averageFor(history, metric) {
  const values = history.map((game) => trendValue(game, metric)).filter((value) => value !== null && Number.isFinite(value));
  return { value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, count: values.length };
}

function formatAverage(value, metric) {
  if (value === null) return "—";
  return `${value.toFixed(1)}${metric.endsWith("_pct") ? "%" : ""}`;
}

function PlayerPortrait({ player }) {
  if (player.headshotUrl) return <img src={player.headshotUrl} alt="" loading="lazy" />;
  return <span aria-hidden="true">{player.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>;
}

function TrendContext({ history, metric, scoring }) {
  const recent = history.slice(-3);
  const prior = history.slice(-6, -3);
  const currentAverage = averageFor(recent, metric);
  const previousAverage = averageFor(prior, metric);
  const label = metricLabel(metric, scoring);
  const comparable = currentAverage.count > 0 && previousAverage.count > 0;
  const difference = comparable ? currentAverage.value - previousAverage.value : null;
  const direction = difference === null || Math.abs(difference) < 0.05 ? "flat" : difference > 0 ? "up" : "down";
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : ArrowRight;
  return <>
    <span className={`opportunity-trend ${direction}`}>
      <Icon weight="bold" aria-hidden="true" />
      {difference === null ? `${label}: comparison unavailable` : `${label} ${difference > 0 ? "+" : ""}${difference.toFixed(1)} avg`}
    </span>
    <small>{calendarLabel(recent)}{prior.length ? ` vs ${calendarLabel(prior)}` : ""}</small>
    <small>{currentAverage.count}/{recent.length} recent · {previousAverage.count}/{prior.length} prior values</small>
    {metric === "position_finish" ? <small>Position finish: lower is better</small> : null}
  </>;
}

function PlayerRow({ player, metrics, slots, domains, season, scoring, onOpenPlayer }) {
  const history = alignedHistory(player, slots, season);
  const recent = history.slice(-3);
  const hasRecordedHistory = player.hasNFLHistory;
  return (
    <article className={`opportunity-player-row${hasRecordedHistory ? "" : " no-history"}`} aria-label={`${player.name} opportunity`}>
      <div className="opportunity-player-identity">
        <div className="opportunity-player-photo"><PlayerPortrait player={player} /></div>
        <div>
          <span className="opportunity-depth">{player.depthRank ? `${player.depthPosition || player.position} ${player.depthRank}` : "Rostered"}</span>
          <button type="button" onClick={(event) => onOpenPlayer?.({ ...player, player_id: player.playerId, player_display_name: player.name, season }, event.currentTarget, scoring)}>{player.name}</button>
          <small title={player.statusDetail || player.rosterStatusLabel}>{player.rookie ? `${player.rookieYear || 2026} rookie` : `${player.yearsExperience ?? "—"} yrs exp`} · {player.rosterStatusLabel}</small>
          <small className="opportunity-weekly-values" aria-label={`${player.name} fantasy and DFS values`}>
            <span title={`NFL position finish · ${player.position_finish_season || season} W${player.position_finish_week || "—"}`}>FIN {player.position_finish == null ? "—" : `${player.position}${player.position_finish}`}</span>
            {" · "}<span>DK {player.draft_kings_price == null ? "—" : `$${Number(player.draft_kings_price).toLocaleString("en-US")}`}</span>
            {" · "}<span>PROJ {player.draft_kings_projection == null ? "—" : Number(player.draft_kings_projection).toFixed(2)}</span>
          </small>
        </div>
      </div>
      <div className="opportunity-player-context">
        <TrendContext history={history} metric={metrics[1]} scoring={scoring} />
        {!hasRecordedHistory ? <span className="opportunity-rookie-note"><Lightning weight="fill" aria-hidden="true" />No recorded games in this window</span> : null}
      </div>
      <div className="opportunity-player-charts">
        {metrics.map((metric, index) => <figure key={index} className="opportunity-metric-chart">
          <figcaption>{metricLabel(metric, scoring)}</figcaption>
          <TrendChart history={history} metric={metric} domain={domains?.[metric]} playerName={player.name} height={44} />
        </figure>)}
      </div>
      <dl className="opportunity-player-averages" aria-label={`Last three calendar weeks averages for ${player.name}`}>
        {metrics.map((metric, index) => {
          const average = averageFor(recent, metric);
          return <div key={index} title={`${metricLabel(metric, scoring)} · ${calendarLabel(recent)} · ${average.count} of ${recent.length} calendar values available; missing values excluded`}>
            <dt>{metricLabel(metric, scoring)}</dt><dd>{formatAverage(average.value, metric)}</dd><small>{average.count}/{recent.length} values</small>
          </div>;
        })}
      </dl>
    </article>
  );
}

function PositionGroup({ group, metrics, onMetricChange, games, ...chartProps }) {
  return (
    <section className={`opportunity-position-card position-${group.position.toLowerCase()}`} aria-labelledby={`opportunity-${group.position}`}>
      <header>
        <div><span>{group.position}</span><div><h2 id={`opportunity-${group.position}`}>{POSITION_LABELS[group.position]}</h2><p>Official depth rank · recent opportunity order</p></div></div>
        <strong>{group.players.length} players</strong>
      </header>
      <div className="opportunity-position-table" tabIndex="0" aria-label={`${POSITION_LABELS[group.position]} scrollable trends`}>
        <div className="opportunity-position-columns">
          <span>Player / roster status</span><span>Chart 2 · last 3 vs prior 3</span>
          <div className="opportunity-chart-selectors">
            {metrics.map((metric, index) => <div key={index}><span>Chart {index + 1} · {games} calendar weeks</span><TrendMetricSelect metric={metric} onChange={(value) => onMetricChange(group.position, index, value)} label={`${group.position} chart ${index + 1} metric`} /></div>)}
          </div>
          <span>Last 3 calendar weeks avg</span>
        </div>
        <div className="opportunity-position-roster">
          {group.players.map((player) => <PlayerRow key={`${player.team}-${player.playerId}`} player={player} metrics={metrics} {...chartProps} />)}
        </div>
      </div>
    </section>
  );
}

export function OpportunityTracker({ season = 2026, meta, onOpenPlayer, onSeasonChange, onOpenGame }) {
  const [team, setTeam] = useState("NYG");
  const [position, setPosition] = useState("ALL");
  const [rosterFilter, setRosterFilter] = useState("ALL");
  const [dfsSlate,setDfsSlate] = useState("current");
  const [preferences, setPreferences] = useState(readPreferences);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { games, scoring, metrics } = preferences;
  const { start, end, extras } = preferences.weekSelections[season] || { start: 1, end: season === 2026 ? 1 : 18, extras: [] };
  const selectedWeeks = [...new Set([...Array.from({ length: end - start + 1 }, (_, index) => start + index), ...extras])].sort((a, b) => a - b).join(",");
  const teams = [...new Set([...(meta?.teams || []), team])];
  const seasons = [...new Set([...(meta?.seasons || [2026, 2025]).map(Number), season])].sort((a, b) => b - a);

  useEffect(() => {
    try { window.localStorage.setItem(OPPORTUNITY_PREFS_KEY, JSON.stringify(preferences)); } catch { /* Preferences remain usable when storage is unavailable. */ }
  }, [preferences]);

  const changeSelection = (change) => setPreferences((current) => ({
    ...current,
    weekSelections: { ...current.weekSelections, [season]: { ...(current.weekSelections[season] || { start: 1, end: season === 2026 ? 1 : 18, extras: [] }), ...change } },
  }));
  const changeRange = (nextStart, nextEnd) => changeSelection({ start: nextStart, end: nextEnd });
  const changeMetric = (pos, index, metric) => {
    if (!Object.hasOwn(TREND_METRICS, metric)) return;
    setPreferences((current) => ({ ...current, metrics: { ...current.metrics, [pos]: current.metrics[pos].map((value, i) => i === index ? metric : value) } }));
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setPayload(null);
    setError("");
    const params = new URLSearchParams({ season: String(season), team, games: String(games), scoring, weeks: selectedWeeks, dfsSlate });
    fetch(`/api/v1/opportunity-tracker?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "The opportunity query failed.");
        return result;
      })
      .then((result) => { if (!controller.signal.aborted) setPayload(result); })
      .catch((requestError) => { if (!controller.signal.aborted && requestError.name !== "AbortError") setError(requestError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [team, season, games, scoring, selectedWeeks, dfsSlate]);

  const visibleGroups = useMemo(() => (payload?.data?.groups || []).map((group) => ({
    ...group,
    players: group.players.filter((player) => {
      if (position !== "ALL" && player.position !== position) return false;
      if (rosterFilter === "ROOKIES" && !player.rookie) return false;
      if (rosterFilter === "ACTIVE" && player.rosterStatus !== "ACT") return false;
      if (rosterFilter === "NO_HISTORY" && player.hasNFLHistory) return false;
      return true;
    }),
  })).filter((group) => group.players.length), [payload, position, rosterFilter]);
  const trackerMeta = payload?.meta;
  const slots = trackerMeta?.trendSlots || [];
  const source = trackerMeta?.source;
  const rosterSeason = trackerMeta?.rosterSeason || 2026;

  return (
    <main className="page-content opportunity-tracker-page">
      <div className="opportunity-filter-bar"><label>DFS slate<select aria-label="Opportunity DFS slate" value={dfsSlate} onChange={event=>setDfsSlate(event.target.value)}><option value="current">Current upcoming slate</option><option value="selected-week">Selected historical week</option></select></label><span>Fantasy finish: selected statistical week · DFS: {trackerMeta?.dfs?.season || season} W{trackerMeta?.dfs?.week || (dfsSlate === "selected-week" ? end : "—")} · Missing source records appear as —.</span></div>
      <section className="opportunity-hero" aria-labelledby="opportunity-title">
        <div className="opportunity-title-block">
          <span className="page-eyebrow"><Gauge weight="bold" /> Team participation</span>
          <h1 id="opportunity-title">Opportunity Tracker</h1>
          <p>Compare the full fantasy-position roster across the same NFL calendar weeks. Choose any metric for each chart.</p>
        </div>
        <div className="opportunity-team-lockup"><TeamLogo team={team} decorative /><div><span>{rosterSeason} roster</span><strong>{team}</strong><small>{season} statistics selection</small></div></div>
      </section>

      <section className="opportunity-controls" aria-label="Opportunity tracker filters">
        <label><span>Statistics year</span><div className="opportunity-select"><select aria-label="Opportunity statistics year" value={season} onChange={(event) => onSeasonChange?.(Number(event.target.value))}>{seasons.map((year) => <option key={year} value={year}>{year}</option>)}</select><CaretDown weight="bold" /></div></label>
        <label><span>Team</span><div className="opportunity-select"><select aria-label="Opportunity team" value={team} onChange={(event) => setTeam(event.target.value)}>{teams.map((item) => <option key={item} value={item}>{item}</option>)}</select><CaretDown weight="bold" /></div></label>
        <label><span>Scoring</span><div className="opportunity-select"><select aria-label="Opportunity scoring" value={scoring} onChange={(event) => setPreferences((current) => ({ ...current, scoring: event.target.value }))}>{Object.entries(SCORING_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><CaretDown weight="bold" /></div></label>
        <WeekRangePicker start={start} end={end} onChange={changeRange} />
        <label><span>History window</span><div className="opportunity-select"><select aria-label="Opportunity history window" value={games} onChange={(event) => setPreferences((current) => ({ ...current, games: Number(event.target.value) }))}>{[5, 8, 10, 18].map((count) => <option key={count} value={count}>{count} calendar weeks</option>)}</select><CaretDown weight="bold" /></div></label>
        <div className="opportunity-segmented" role="group" aria-label="Position group">
          <span>Position</span><div>{["ALL", "QB", "RB", "WR", "TE"].map((item) => <button type="button" aria-pressed={position === item} className={position === item ? "active" : ""} onClick={() => setPosition(item)} key={item}>{item === "ALL" ? "All" : item}</button>)}</div>
        </div>
        <label><span>Roster view</span><div className="opportunity-select"><select aria-label="Opportunity roster view" value={rosterFilter} onChange={(event) => setRosterFilter(event.target.value)}><option value="ALL">Full roster</option><option value="ACTIVE">Active roster</option><option value="ROOKIES">{rosterSeason} rookies</option><option value="NO_HISTORY">No window history</option></select><CaretDown weight="bold" /></div></label>
        <button type="button" className="opportunity-reset" onClick={() => setPreferences(validateOpportunityPreferences(null))}>Reset chart preferences</button>
      </section>
      <ScheduleWeekSelector team={team} season={season} schedule={trackerMeta?.schedule || []} start={start} end={end} extras={extras} onRangeChange={changeRange} onExtrasChange={(nextExtras) => changeSelection({ extras: nextExtras })} onOpenGame={(game) => onOpenGame?.(game, scoring)} />
      <div className="opportunity-source-note opportunity-calendar-note"><Info weight="fill" aria-hidden="true" /><span><strong>{games} regular-season calendar weeks · {calendarLabel(slots)} · {SCORING_LABELS[scoring]}</strong>Latest completed regular week at or before your last selected week anchors history. The window can continue into the prior season. Same metric, same scale across players; bye, DNP and unavailable values stay gaps. Averages exclude unavailable values.</span></div>

      {trackerMeta ? (
        <section className="opportunity-summary" aria-label="Team opportunity summary">
          <article><UsersThree weight="duotone" /><div><strong>{trackerMeta.playerCount}</strong><span>Fantasy-position players</span></div></article>
          <article><ShieldCheck weight="duotone" /><div><strong>{trackerMeta.playersWithHistory}</strong><span>With history in this window</span></div></article>
          <article><Lightning weight="duotone" /><div><strong>{trackerMeta.rookies}</strong><span>{rosterSeason} rookies</span></div></article>
          <article className="news-status"><FirstAid weight="duotone" /><div><strong>Roster status snapshot</strong><span>{trackerMeta.injuryNewsMessage || "Practice-report injury news is unavailable. Sourced roster status is shown instead."}</span></div></article>
        </section>
      ) : null}

      {error ? <div className="opportunity-state error" role="alert"><strong>Opportunity data unavailable</strong><span>{error}</span></div> : null}
      {loading ? <div className="opportunity-state" role="status"><ChartBar className="spin" /><strong>Building the team opportunity grid…</strong></div> : null}
      {!loading && !error ? <div className="opportunity-grid">{visibleGroups.map((group) => <PositionGroup key={group.position} group={group} metrics={metrics[group.position]} onMetricChange={changeMetric} games={games} slots={slots} domains={trackerMeta?.trendDomains} season={season} scoring={scoring} onOpenPlayer={onOpenPlayer} />)}</div> : null}
      {!loading && !error && !visibleGroups.length ? <div className="opportunity-state"><strong>No players match this view.</strong><button type="button" onClick={() => { setPosition("ALL"); setRosterFilter("ALL"); }}>Show full roster</button></div> : null}

      {trackerMeta ? <footer className="data-status"><span><strong>{rosterSeason} depth chart:</strong> official nflverse snapshot {trackerMeta.depthUpdatedAt ? new Date(trackerMeta.depthUpdatedAt).toLocaleDateString() : "unavailable"}</span><span><strong>Statistics:</strong> {calendarLabel(slots)}</span><span>{trackerMeta.ordering}</span><span>{trackerMeta.queryMs} ms query</span>{source?.url ? <a href={source.url} target="_blank" rel="noreferrer">Data: {source.name || "nflverse"} · {source.license}</a> : null}</footer> : null}
    </main>
  );
}
