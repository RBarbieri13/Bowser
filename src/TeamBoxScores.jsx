import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CaretDown, Check, TrendUp } from "@phosphor-icons/react";
import { ScheduleWeekSelector } from "./ScheduleWeekSelector.jsx";

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
const TEAM_BOX_STATE_KEY = "bowser:team-box-score-state:v1";

function savedTeamBoxState() {
  try {
    return JSON.parse(window.sessionStorage.getItem(TEAM_BOX_STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function draftKingsPrice(row) {
  const value = row.draftkings_salary ?? row.dk_salary ?? row.draftkings_price;
  return value === null || value === undefined || value === "" ? null : Number(value);
}

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
        draftKingsPrice: draftKingsPrice(row),
      });
    }
    if (group.get(row.player_id).draftKingsPrice === null && draftKingsPrice(row) !== null) {
      group.get(row.player_id).draftKingsPrice = draftKingsPrice(row);
    }
    group.get(row.player_id).weeks.set(row.week, row);
  }
  return POSITION_ORDER.map((position) => ({ position, players: [...byPosition.get(position).values()] }))
    .filter((group) => group.players.length);
}

function metricMaxima(rows) {
  const maxima = new Map();
  for (const row of rows) {
    for (const key of ["fantasy_points", "snaps", "targets", "carries"]) {
      const value = Number(row[key]);
      if (!Number.isFinite(value)) continue;
      const lookup = `${row.week}:${key}`;
      maxima.set(lookup, Math.max(maxima.get(lookup) || 0, value));
    }
  }
  return maxima;
}

function heatClass(week, key, value, maxima) {
  if (!["fantasy_points", "snaps", "targets", "carries"].includes(key) || value === null || value === undefined) return "";
  const numeric = Number(value);
  if (numeric <= 0) return " metric-heat metric-zero";
  const ratio = numeric / Math.max(1, maxima.get(`${week}:${key}`) || numeric);
  if (ratio >= .75) return " metric-heat metric-high";
  if (ratio >= .4) return " metric-heat metric-medium";
  return " metric-heat metric-low";
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

function formatGameDate(item) {
  if (!item.gameday) return item.seasonType === "POST" ? "Postseason" : null;
  const parsed = new Date(`${item.gameday}T${item.gametime || "12:00"}:00-04:00`);
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function PositionSection({ group, weeks, upcomingWeek, onOpenPlayer, onOpenGame, weekWidth, maxima }) {
  const columns = group.position === "QB" ? WEEK_COLUMNS.QB : WEEK_COLUMNS.SKILL;
  const weekScale = weekWidth / WEEK_WIDTH;
  const tableWidth = IDENTITY_WIDTH + weeks.length * weekWidth;
  return (
    <section className={`box-position-section position-${group.position.toLowerCase()}`} aria-labelledby={`position-${group.position}`}>
      <h2 id={`position-${group.position}`} className="sr-only">{group.position} weekly box scores</h2>
      <table className="boxscore-table" style={{ width: tableWidth, minWidth: tableWidth, "--week-scale": weekScale }}>
        <caption>{group.position} week-by-week player statistics</caption>
        <colgroup>
          <col style={{ width: 64 }} /><col style={{ width: 190 }} />
          <col style={{ width: 82 }} /><col style={{ width: 72 }} />
          {weeks.flatMap(({ week }) => columns.map(([key], index) => (
            <col key={`${week}-${key}-${index}`} style={{ width: (index === 2 ? 76 : index === 9 ? 62 : 52) * weekScale }} />
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
                {item.gameId ? (
                  <button type="button" className="box-game-link" onClick={() => onOpenGame?.(item)} aria-label={`Open Week ${item.week} game breakdown`}>
                    <span>Week {item.week}</span>
                    <strong>{item.opponent ? `${item.homeAway === "away" ? "@" : "vs"} ${item.opponent}` : "No game"} · {item.scoreLabel || "Scheduled"}</strong>
                    <small>{formatGameDate(item)}</small>
                  </button>
                ) : (
                  <><span>Week {item.week}</span><strong>No game</strong><small>{formatGameDate(item)}</small></>
                )}
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
                      className={`${key === "fantasy_points" ? "box-fpts-cell" : ""}${!stats ? " no-game" : ""}${stats ? heatClass(week, key, value, maxima) : ""}`}
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

function PositionFilter({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const toggle = (position) => {
    const next = selected.includes(position)
      ? selected.filter((item) => item !== position)
      : [...selected, position].sort((a, b) => POSITION_ORDER.indexOf(a) - POSITION_ORDER.indexOf(b));
    if (next.length) onChange(next);
  };
  return (
    <div className="field position-filter-field">
      <span className="field-label">Positions</span>
      <button type="button" className="position-filter-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span>{selected.length === POSITION_ORDER.length ? "QB, RB, WR, TE" : selected.join(", ")}</span>
        <CaretDown weight="bold" aria-hidden="true" />
      </button>
      {open ? (
        <div className="position-filter-menu" role="group" aria-label="Positions">
          {POSITION_ORDER.map((position) => (
            <label key={position}>
              <input type="checkbox" checked={selected.includes(position)} onChange={() => toggle(position)} />
              <span>{selected.includes(position) ? <Check weight="bold" aria-hidden="true" /> : null}</span>
              {position}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TeamBoxScores({ meta, onOpenPlayer, onOpenGame }) {
  const initialState = useRef(savedTeamBoxState()).current;
  const [team, setTeam] = useState(initialState.team || "NYG");
  const [scoring, setScoring] = useState(["ppr", "half", "standard"].includes(initialState.scoring) ? initialState.scoring : "ppr");
  const [weekStart, setWeekStart] = useState(Number(initialState.weekStart) || 1);
  const [weekEnd, setWeekEnd] = useState(Number(initialState.weekEnd) || 18);
  const [extraWeeks, setExtraWeeks] = useState(Array.isArray(initialState.extraWeeks) ? initialState.extraWeeks : []);
  const [positions, setPositions] = useState(Array.isArray(initialState.positions) && initialState.positions.length ? initialState.positions : POSITION_ORDER);
  const [dkMin, setDkMin] = useState(initialState.dkMin || "3000");
  const [dkMax, setDkMax] = useState(initialState.dkMax || "11000");
  const [weekWidth, setWeekWidth] = useState(Number(initialState.weekWidth) || WEEK_WIDTH);
  const [schedule, setSchedule] = useState([]);
  const [payload, setPayload] = useState({ data: [], meta: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const scroller = useRef(null);

  const selectedWeeks = useMemo(
    () => [...new Set([
      ...Array.from({ length: weekEnd - weekStart + 1 }, (_, index) => weekStart + index),
      ...extraWeeks.filter((week) => week < weekStart || week > weekEnd),
    ])].sort((a, b) => a - b),
    [weekStart, weekEnd, extraWeeks],
  );
  const visibleExtraWeeks = useMemo(
    () => extraWeeks.filter((week) => week < weekStart || week > weekEnd).sort((a, b) => a - b),
    [extraWeeks, weekStart, weekEnd],
  );
  const changeRange = (start, end) => {
    setWeekStart(start);
    setWeekEnd(end);
    setExtraWeeks((current) => current.filter((week) => week < start || week > end));
  };

  useEffect(() => {
    window.sessionStorage.setItem(TEAM_BOX_STATE_KEY, JSON.stringify({
      team, scoring, weekStart, weekEnd, extraWeeks, positions, dkMin, dkMax, weekWidth,
    }));
  }, [team, scoring, weekStart, weekEnd, extraWeeks, positions, dkMin, dkMax, weekWidth]);

  const openGame = (game) => onOpenGame?.(game, scoring);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      team,
      scoring: "ppr",
      seasonType: "ALL",
      weeks: Array.from({ length: 22 }, (_, index) => index + 1).join(","),
    });
    fetch(`/api/v1/team-box-scores?${params}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (result?.meta?.schedule || result?.meta?.weeks) {
          const nextSchedule = result.meta.schedule || result.meta.weeks;
          const matchupWeeks = new Set(nextSchedule.filter((item) => item.gameId).map((item) => Number(item.week)));
          setSchedule(nextSchedule);
          setExtraWeeks((current) => current.filter((week) => matchupWeeks.has(Number(week))));
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [team]);

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

  const hasDraftKingsData = useMemo(
    () => payload.data.some((row) => Number.isFinite(draftKingsPrice(row))),
    [payload.data],
  );
  const groups = useMemo(() => {
    const minimum = Number(dkMin) || 0;
    const maximum = Number(dkMax) || Number.MAX_SAFE_INTEGER;
    return groupRows(payload.data)
      .filter((group) => positions.includes(group.position))
      .map((group) => ({
        ...group,
        players: group.players.filter((player) => !hasDraftKingsData || (Number(player.draftKingsPrice) >= minimum && Number(player.draftKingsPrice) <= maximum)),
      }))
      .filter((group) => group.players.length);
  }, [payload.data, positions, dkMin, dkMax, hasDraftKingsData]);
  const maxima = useMemo(() => metricMaxima(payload.data), [payload.data]);
  const weeks = payload.meta?.weeks || selectedWeeks.map((week) => ({ week, opponent: null, seasonType: week <= 18 ? "REG" : "POST" }));
  const upcomingWeek = null;

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
          <PositionFilter selected={positions} onChange={setPositions} />
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
          <div className={`field dk-price-field${hasDraftKingsData ? "" : " unavailable"}`}>
            <span className="field-label">DraftKings Price</span>
            <span className="dk-price-inputs">
              <input aria-label="Minimum DraftKings price" type="number" min="0" step="100" value={dkMin} onChange={(event) => setDkMin(event.target.value)} disabled={!hasDraftKingsData} />
              <span>to</span>
              <input aria-label="Maximum DraftKings price" type="number" min="0" step="100" value={dkMax} onChange={(event) => setDkMax(event.target.value)} disabled={!hasDraftKingsData} />
            </span>
            {!hasDraftKingsData ? <small>Price feed not connected</small> : null}
          </div>
          <label className="field week-width-field">
            <span className="field-label">Week Width <small>{Math.round(weekWidth / WEEK_WIDTH * 100)}%</small></span>
            <span className="week-width-control">
              <input aria-label="Week column width" type="range" min="320" max="720" step="8" value={weekWidth} onChange={(event) => setWeekWidth(Number(event.target.value))} />
            </span>
          </label>
        </div>
        <ScheduleWeekSelector
          team={team}
          schedule={schedule}
          start={weekStart}
          end={weekEnd}
          extras={extraWeeks}
          onRangeChange={changeRange}
          onExtrasChange={setExtraWeeks}
          onOpenGame={openGame}
        />
        <div className="boxscore-context">
          <strong>{team}</strong>
          <span>{weekStart === weekEnd ? `Week ${weekStart}` : `Weeks ${weekStart}–${weekEnd}`}{visibleExtraWeeks.length ? ` + ${visibleExtraWeeks.map((week) => `W${week}`).join(", ")}` : ""}</span>
          <span>{scoring === "ppr" ? "PPR" : scoring === "half" ? "Half PPR" : "Standard"}</span>
          <span className="dk-status">DraftKings salary + projection awaiting source</span>
          <div className="box-scroll-buttons" aria-label="Scroll weekly columns">
            <button type="button" onClick={() => scroller.current?.scrollBy({ left: -weekWidth, behavior: "smooth" })} aria-label="Previous weeks"><ArrowLeft /></button>
            <button type="button" onClick={() => scroller.current?.scrollBy({ left: weekWidth, behavior: "smooth" })} aria-label="Next weeks"><ArrowRight /></button>
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
              weekWidth={weekWidth}
              maxima={maxima}
              onOpenGame={openGame}
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
