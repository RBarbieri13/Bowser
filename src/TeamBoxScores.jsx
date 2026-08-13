import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CaretDown, TrendUp } from "@phosphor-icons/react";
import { WeekRangePicker } from "./WeekRangePicker.jsx";

const POSITION_ORDER = ["QB", "RB", "WR", "TE"];
const WEEK_COLUMNS = {
  QB: [
    ["snaps", "SNP"], ["snap_pct", "SNP%"], ["passing_line", "CMP-ATT"],
    ["passing_yards", "YDS"], ["passing_tds", "TD"], ["interceptions", "INT"],
    ["carries", "ATT"], ["rushing_yards", "YDS"], ["rushing_tds", "TD"],
    ["fantasy_points", "FPTS"],
  ],
  SKILL: [
    ["snaps", "SNP"], ["snap_pct", "SNP%"], ["targets", "TGT"],
    ["receptions", "REC"], ["receiving_yards", "YDS"], ["receiving_tds", "TD"],
    ["carries", "ATT"], ["rushing_yards", "YDS"], ["rushing_tds", "TD"],
    ["fantasy_points", "FPTS"],
  ],
};

const WEEK_WIDTH = 554;
const IDENTITY_WIDTH = 408;

function formatStat(value, key) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "snap_pct") return `${Number(value).toFixed(0)}%`;
  if (key === "fantasy_points") return Number(value).toFixed(1);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value));
}

function groupRows(rows) {
  const byPosition = new Map(POSITION_ORDER.map((position) => [position, new Map()]));
  for (const row of rows) {
    const group = byPosition.get(row.position_group);
    if (!group) continue;
    if (!group.has(row.player_id)) {
      group.set(row.player_id, {
        playerId: row.player_id,
        name: row.player_display_name,
        position: row.position_group,
        weeks: new Map(),
      });
    }
    group.get(row.player_id).weeks.set(row.week, row);
  }
  return POSITION_ORDER.map((position) => ({ position, players: [...byPosition.get(position).values()] }))
    .filter((group) => group.players.length);
}

function WeekSubgroups({ position }) {
  return position === "QB" ? (
    <>
      <th colSpan="2" scope="colgroup">Misc.</th>
      <th colSpan="4" scope="colgroup">Passing</th>
      <th colSpan="3" scope="colgroup">Rushing</th>
      <th rowSpan="2" className="box-fpts-header">FPTS</th>
    </>
  ) : (
    <>
      <th colSpan="2" scope="colgroup">Misc.</th>
      <th colSpan="4" scope="colgroup">Receiving</th>
      <th colSpan="3" scope="colgroup">Rushing</th>
      <th rowSpan="2" className="box-fpts-header">FPTS</th>
    </>
  );
}

function PositionSection({ group, weeks, upcomingWeek, onOpenPlayer }) {
  const columns = group.position === "QB" ? WEEK_COLUMNS.QB : WEEK_COLUMNS.SKILL;
  const tableWidth = IDENTITY_WIDTH + weeks.length * WEEK_WIDTH;
  return (
    <section className={`box-position-section position-${group.position.toLowerCase()}`} aria-labelledby={`position-${group.position}`}>
      <h2 id={`position-${group.position}`} className="sr-only">{group.position} weekly box scores</h2>
      <table className="boxscore-table" style={{ width: tableWidth, minWidth: tableWidth }}>
        <caption>{group.position} week-by-week player statistics</caption>
        <colgroup>
          <col style={{ width: 64 }} /><col style={{ width: 190 }} />
          <col style={{ width: 82 }} /><col style={{ width: 72 }} />
          {weeks.flatMap(({ week }) => columns.map(([key], index) => (
            <col key={`${week}-${key}-${index}`} style={{ width: index === 2 ? 76 : index === 9 ? 62 : 52 }} />
          )))}
        </colgroup>
        <thead>
          <tr className="box-week-row">
            <th rowSpan="3" className="box-sticky box-position-head">Pos</th>
            <th rowSpan="3" className="box-sticky box-player-head">Player</th>
            <th colSpan="2" className="box-sticky box-upcoming-title">
              <span>Upcoming</span>
              <strong>{upcomingWeek ? `Week ${upcomingWeek}` : "Next slate"}</strong>
            </th>
            {weeks.map((item) => (
              <th key={item.week} colSpan="10" className="box-week-title">
                <span>Week {item.week}</span>
                <strong>{item.opponent ? `vs ${item.opponent}` : "No game"}</strong>
                {item.seasonType === "POST" ? <small>Postseason</small> : null}
              </th>
            ))}
          </tr>
          <tr className="box-subgroup-row">
            <th rowSpan="2" className="box-sticky box-salary-head">DK Salary</th>
            <th rowSpan="2" className="box-sticky box-projection-head">DK Proj.</th>
            {weeks.map((item) => <WeekSubgroups key={item.week} position={group.position} />)}
          </tr>
          <tr className="box-column-row">
            {weeks.flatMap((item) => columns.slice(0, -1).map(([, label], index) => (
              <th key={`${item.week}-${label}-${index}`}>{label}</th>
            )))}
          </tr>
        </thead>
        <tbody>
          {group.players.map((player, playerIndex) => (
            <tr key={player.playerId}>
              {playerIndex === 0 ? (
                <th rowSpan={group.players.length} scope="rowgroup" className="box-sticky box-position-cell">{group.position}</th>
              ) : null}
              <th scope="row" className="box-sticky box-player-cell">
                <button type="button" onClick={(event) => onOpenPlayer(player, event.currentTarget)}>{player.name}</button>
              </th>
              <td className="box-sticky box-salary-cell unavailable" title="DraftKings salary source not connected">—</td>
              <td className="box-sticky box-projection-cell unavailable" title="DraftKings projection source not connected">—</td>
              {weeks.flatMap(({ week }) => {
                const stats = player.weeks.get(week);
                return columns.map(([key], index) => {
                  const value = key === "passing_line"
                    ? (stats ? `${stats.completions}-${stats.passing_attempts}` : null)
                    : stats?.[key];
                  return (
                    <td
                      key={`${week}-${key}-${index}`}
                      className={`${key === "fantasy_points" ? "box-fpts-cell" : ""}${!stats ? " no-game" : ""}`}
                    >
                      {key === "passing_line" ? (value || "—") : formatStat(value, key)}
                    </td>
                  );
                });
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function TeamBoxScores({ meta, onOpenPlayer }) {
  const [team, setTeam] = useState("NYG");
  const [scoring, setScoring] = useState("ppr");
  const [weekStart, setWeekStart] = useState(1);
  const [weekEnd, setWeekEnd] = useState(18);
  const [payload, setPayload] = useState({ data: [], meta: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const scroller = useRef(null);

  const selectedWeeks = useMemo(
    () => Array.from({ length: weekEnd - weekStart + 1 }, (_, index) => weekStart + index),
    [weekStart, weekEnd],
  );

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      team,
      scoring,
      seasonType: "ALL",
      weeks: selectedWeeks.join(","),
    });
    setLoading(true);
    setError("");
    fetch(`/api/v1/team-box-scores?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "The team query failed.");
        return result;
      })
      .then(setPayload)
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [team, scoring, selectedWeeks]);

  const groups = useMemo(() => groupRows(payload.data), [payload.data]);
  const weeks = payload.meta?.weeks || selectedWeeks.map((week) => ({ week, opponent: null, seasonType: week <= 18 ? "REG" : "POST" }));
  const upcomingWeek = weekEnd < 22 ? weekEnd + 1 : null;

  return (
    <main className="page-content team-boxscore-page">
      <section className="boxscore-toolbar" aria-labelledby="team-boxscore-title">
        <div className="boxscore-intro">
          <span className="page-eyebrow"><TrendUp weight="bold" aria-hidden="true" /> Sequential analysis</span>
          <h1 id="team-boxscore-title">Team Box Scores</h1>
          <p>Compare every fantasy-relevant player across completed weeks, from left to right.</p>
        </div>
        <div className="boxscore-filters" aria-label="Team box score filters">
          <label className="field">
            <span className="field-label">Team</span>
            <span className="select-wrap">
              <select aria-label="Team" value={team} onChange={(event) => setTeam(event.target.value)}>
                {(meta?.teams || ["NYG"]).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <CaretDown weight="bold" aria-hidden="true" />
            </span>
          </label>
          <WeekRangePicker start={weekStart} end={weekEnd} onChange={(start, end) => { setWeekStart(start); setWeekEnd(end); }} />
          <label className="field">
            <span className="field-label">Scoring</span>
            <span className="select-wrap">
              <select aria-label="Scoring" value={scoring} onChange={(event) => setScoring(event.target.value)}>
                <option value="ppr">PPR</option>
                <option value="half">Half PPR</option>
                <option value="standard">Standard</option>
              </select>
              <CaretDown weight="bold" aria-hidden="true" />
            </span>
          </label>
        </div>
        <div className="boxscore-context">
          <strong>{team}</strong>
          <span>{weekStart === weekEnd ? `Week ${weekStart}` : `Weeks ${weekStart}–${weekEnd}`}</span>
          <span>{scoring === "ppr" ? "PPR" : scoring === "half" ? "Half PPR" : "Standard"}</span>
          <span className="dk-status">DraftKings salary + projection awaiting source</span>
          <div className="box-scroll-buttons" aria-label="Scroll weekly columns">
            <button type="button" onClick={() => scroller.current?.scrollBy({ left: -WEEK_WIDTH, behavior: "smooth" })} aria-label="Previous weeks"><ArrowLeft /></button>
            <button type="button" onClick={() => scroller.current?.scrollBy({ left: WEEK_WIDTH, behavior: "smooth" })} aria-label="Next weeks"><ArrowRight /></button>
          </div>
        </div>
      </section>

      <section className="boxscore-panel" aria-label={`${team} weekly team box scores`}>
        {loading ? <div className="progress" role="progressbar" aria-label="Updating team box scores"><span /></div> : null}
        {error ? <div className="error-banner" role="alert"><span>{error}</span></div> : null}
        <div className="boxscore-scroller" ref={scroller} tabIndex="0" aria-label="Scrollable weekly team box scores">
          {!loading && !error && !groups.length ? <div className="boxscore-empty">No player data is available for this team and week range.</div> : null}
          {groups.map((group) => (
            <PositionSection
              key={group.position}
              group={group}
              weeks={weeks}
              upcomingWeek={upcomingWeek}
              onOpenPlayer={(player, opener) => onOpenPlayer(player, opener, scoring)}
            />
          ))}
        </div>
        <footer className="data-status" aria-live="polite">
          <span><strong>{payload.meta?.playerCount ?? 0}</strong> players · <strong>{weeks.length}</strong> weeks</span>
          <span>{payload.meta ? `${payload.meta.queryMs} ms query` : "Loading warehouse"}</span>
          <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">Data: nflverse · CC BY 4.0</a>
        </footer>
      </section>
    </main>
  );
}
