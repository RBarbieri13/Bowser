import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, ArrowRight, ArrowsHorizontal, Binoculars, CaretDown, Check, Crosshair,
  CrownSimple, Eye, Question, Star, TrendUp, X,
} from "@phosphor-icons/react";
import { ScheduleWeekSelector } from "./ScheduleWeekSelector.jsx";
import {
  ALL_COLUMN_DEFINITIONS, DEFAULT_VISIBLE_STATS, IDENTITY_COLUMNS,
  LEAGUE_OPTIONS, POSITION_ORDER, TEAM_BOX_PREFERENCE_KEY, WEEK_COLUMN_REGISTRY,
  clampColumnWidth, columnGroups, columnsForPosition, readTeamBoxPreferences,
} from "./teamBoxColumns.js";
import { gameTotalPoints, TeamLogo } from "./teamLogos.jsx";

const WEEK_WIDTH = 554;
const TEAM_BOX_STATE_KEY = "bowser:team-box-score-state:v1";
const MARKER_OPTIONS = [
  { key: "favorite", label: "Favorite", icon: Star },
  { key: "like", label: "Like", icon: Check },
  { key: "dislike", label: "Dislike", icon: X },
  { key: "maybe", label: "Maybe", icon: Question },
  { key: "watch", label: "Watch", icon: Eye },
  { key: "research", label: "Research priority", icon: Crosshair },
];

function savedTeamBoxState() {
  try { return JSON.parse(window.sessionStorage.getItem(TEAM_BOX_STATE_KEY) || "{}"); }
  catch { return {}; }
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
        playerId: row.player_id, name: row.player_display_name, position: row.position_group,
        weeks: new Map(), draftKingsPrice: draftKingsPrice(row),
      });
    }
    const player = group.get(row.player_id);
    if (player.draftKingsPrice === null && draftKingsPrice(row) !== null) player.draftKingsPrice = draftKingsPrice(row);
    player.weeks.set(row.week, row);
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

function formatGameDate(item) {
  if (!item.gameday) return item.seasonType === "POST" ? "Postseason" : null;
  const parsed = new Date(`${item.gameday}T${item.gametime || "12:00"}:00-04:00`);
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function FieldMenu({ label, summary, children, className = "" }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === "Escape" || (event.type === "pointerdown" && !root.current?.contains(event.target))) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [open]);
  return (
    <div className={`field filter-menu-field ${className}`} ref={root}>
      <span className="field-label">{label}</span>
      <button type="button" className="filter-menu-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span>{summary}</span><CaretDown weight="bold" aria-hidden="true" />
      </button>
      {open ? <div className="filter-popover">{children}</div> : null}
    </div>
  );
}

function PositionFilter({ selected, onChange }) {
  return (
    <FieldMenu label="Positions" summary={selected.length === POSITION_ORDER.length ? "QB, RB, WR, TE" : selected.join(", ")}>
      <div className="filter-check-list" role="group" aria-label="Positions">
        {POSITION_ORDER.map((position) => (
          <label key={position}>
            <input type="checkbox" checked={selected.includes(position)} onChange={() => {
              const next = selected.includes(position) ? selected.filter((item) => item !== position) : [...selected, position].sort((a, b) => POSITION_ORDER.indexOf(a) - POSITION_ORDER.indexOf(b));
              if (next.length) onChange(next);
            }} />
            <span>{selected.includes(position) ? <Check weight="bold" aria-hidden="true" /> : null}</span>{position}
          </label>
        ))}
      </div>
    </FieldMenu>
  );
}

function StatisticsFilter({ visibleStats, onChange }) {
  const selected = new Set(visibleStats);
  const isDefault = DEFAULT_VISIBLE_STATS.every((key) => selected.has(key)) && selected.size === DEFAULT_VISIBLE_STATS.length;
  const groups = Object.values(WEEK_COLUMN_REGISTRY).reduce((result, column) => {
    (result[column.group] ||= []).push(column);
    return result;
  }, {});
  return (
    <FieldMenu label="Statistics" summary={isDefault ? "All defaults" : `${visibleStats.length} selected`} className="statistics-filter-field">
      <div className="filter-popover-heading"><div><strong>Stat columns</strong><small>Changes repeat across every week.</small></div><button type="button" onClick={() => onChange(DEFAULT_VISIBLE_STATS)}>Reset defaults</button></div>
      <div className="statistics-menu" role="group" aria-label="Statistical categories">
        {Object.entries(groups).map(([group, columns]) => (
          <fieldset key={group}><legend>{group}</legend>{columns.map((column) => (
            <label key={column.key}>
              <input type="checkbox" checked={selected.has(column.key)} onChange={() => {
                const next = selected.has(column.key) ? visibleStats.filter((key) => key !== column.key) : [...visibleStats, column.key];
                if (next.length) onChange(DEFAULT_VISIBLE_STATS.filter((key) => next.includes(key)));
              }} />
              <span>{selected.has(column.key) ? <Check weight="bold" aria-hidden="true" /> : null}</span>{column.name}
            </label>
          ))}</fieldset>
        ))}
      </div>
    </FieldMenu>
  );
}

function LeagueFilter({ selected, onChange }) {
  return (
    <FieldMenu label="My Leagues" summary={selected.length === LEAGUE_OPTIONS.length ? "All leagues" : `${selected.length} selected`} className="league-filter-field">
      <div className="filter-popover-heading"><div><strong>Owned players</strong><small>Roster sync is not connected yet.</small></div><Binoculars aria-hidden="true" /></div>
      <div className="filter-check-list" role="group" aria-label="My leagues">
        <label><input type="checkbox" checked={selected.length === LEAGUE_OPTIONS.length} onChange={() => onChange(LEAGUE_OPTIONS)} /><span>{selected.length === LEAGUE_OPTIONS.length ? <Check weight="bold" /> : null}</span>All leagues</label>
        {LEAGUE_OPTIONS.map((league) => <label key={league}><input type="checkbox" checked={selected.includes(league)} onChange={() => {
          const next = selected.includes(league) ? selected.filter((item) => item !== league) : [...selected, league];
          if (next.length) onChange(next);
        }} /><span>{selected.includes(league) ? <Check weight="bold" /> : null}</span>{league}</label>)}
      </div>
      <p className="filter-placeholder-note">Selections are saved now. Ownership filtering activates after rosters are connected.</p>
    </FieldMenu>
  );
}

function ResizeHandle({ columnKey, width, onResize }) {
  const definition = ALL_COLUMN_DEFINITIONS.find((column) => column.key === columnKey);
  const startDrag = (event) => {
    event.preventDefault();
    const origin = event.clientX;
    const initial = width;
    const move = (moveEvent) => onResize(columnKey, initial + moveEvent.clientX - origin);
    const end = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", end); };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end, { once: true });
  };
  const onKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") return onResize(columnKey, definition.min);
    if (event.key === "End") return onResize(columnKey, definition.max);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    onResize(columnKey, width + direction * (event.shiftKey ? 12 : 4));
  };
  return (
    <span
      role="separator" tabIndex="0" className="column-resizer" aria-label={`Resize ${definition.name || definition.label} column`}
      aria-orientation="vertical" aria-valuemin={definition.min} aria-valuemax={definition.max} aria-valuenow={width}
      onPointerDown={startDrag} onKeyDown={onKeyDown} onDoubleClick={() => onResize(columnKey, definition.defaultWidth)}
    />
  );
}

function WeekResizeHandle({ width, onResize }) {
  const startDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const origin = event.clientX;
    const initial = width;
    const move = (moveEvent) => onResize(Math.max(220, Math.min(720, initial + moveEvent.clientX - origin)));
    const end = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end, { once: true });
  };
  const onKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Home") return onResize(220);
    if (event.key === "End") return onResize(720);
    onResize(Math.max(220, Math.min(720, width + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 24 : 8))));
  };
  return (
    <span
      role="separator"
      tabIndex="0"
      className="week-group-resizer"
      aria-label="Resize all week groups"
      aria-orientation="vertical"
      aria-valuemin="220"
      aria-valuemax="720"
      aria-valuenow={width}
      title="Drag to resize every displayed week"
      onPointerDown={startDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onResize(WEEK_WIDTH)}
    ><ArrowsHorizontal weight="bold" aria-hidden="true" /></span>
  );
}

function TeamFilter({ team, teams, onChange }) {
  return (
    <label className="field team-filter-field">
      <span className="field-label">Team</span>
      <span className="select-wrap team-select-wrap">
        <select aria-label="Team" value={team} onChange={onChange}>{teams.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <TeamLogo team={team} className="team-filter-logo" decorative />
        <CaretDown weight="bold" aria-hidden="true" />
      </span>
    </label>
  );
}

function markerMenuPosition(trigger, menuHeight = 268) {
  const rect = trigger?.getBoundingClientRect();
  if (!rect) return { left: 8, top: 8 };
  const margin = 8;
  const gap = 6;
  const menuWidth = 176;
  const availableBelow = window.innerHeight - rect.bottom - margin;
  const openAbove = availableBelow < menuHeight && rect.top > availableBelow;
  const preferredTop = openAbove ? rect.top - menuHeight - gap : rect.bottom + gap;
  return {
    left: Math.max(margin, Math.min(rect.left, window.innerWidth - menuWidth - margin)),
    top: Math.max(margin, Math.min(preferredTop, window.innerHeight - menuHeight - margin)),
  };
}

function PlayerMarker({ player, marker, onChange }) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 });
  const root = useRef(null);
  const trigger = useRef(null);
  const popover = useRef(null);
  const current = MARKER_OPTIONS.find((option) => option.key === marker);
  const CurrentIcon = current?.icon || Star;
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === "Escape" || (event.type === "pointerdown" && !root.current?.contains(event.target) && !popover.current?.contains(event.target))) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => setMenuPosition(markerMenuPosition(trigger.current, popover.current?.offsetHeight || 268));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open]);
  const toggle = () => {
    if (!open) setMenuPosition(markerMenuPosition(trigger.current));
    setOpen((value) => !value);
  };
  return (
    <div className="player-marker" ref={root}>
      <button ref={trigger} type="button" className={`marker-trigger ${marker || "unmarked"}`} onClick={toggle} aria-expanded={open} aria-label={`${player.name}: ${current?.label || "No marker"}`}>
        <CurrentIcon weight={marker ? "fill" : "regular"} aria-hidden="true" />
      </button>
      {open ? createPortal(<div ref={popover} className="marker-popover" style={menuPosition} role="radiogroup" aria-label={`Marker for ${player.name}`}>
        {MARKER_OPTIONS.map((option) => { const Icon = option.icon; return <button type="button" key={option.key} className={option.key} role="radio" aria-checked={marker === option.key} onClick={() => { onChange(option.key); setOpen(false); }}><Icon weight="fill" /><span>{option.label}</span></button>; })}
        <button type="button" className="clear" role="radio" aria-checked={!marker} onClick={() => { onChange(null); setOpen(false); }}><X /><span>Clear marker</span></button>
      </div>, document.body) : null}
    </div>
  );
}

function PositionSection({ group, weeks, upcomingWeek, onOpenPlayer, onOpenGame, weekWidth, onWeekResize, maxima, columnWidths, visibleStats, markers, onMarkerChange, onResize, showIdentityHandles, resizableWeekKeys }) {
  const columns = columnsForPosition(group.position, visibleStats);
  const groups = columnGroups(columns);
  const weekScale = weekWidth / WEEK_WIDTH;
  const identityWidth = IDENTITY_COLUMNS.filter((column) => column.key !== "position").reduce((sum, column) => sum + columnWidths[column.key], 0);
  const oneWeekWidth = columns.reduce((sum, column) => sum + columnWidths[column.key] * weekScale, 0);
  const tableWidth = identityWidth + weeks.length * oneWeekWidth;
  const sticky = {
    "--w-position": `${columnWidths.position}px`, "--w-marker": `${columnWidths.marker}px`, "--w-player": `${columnWidths.player}px`,
    "--w-salary": `${columnWidths.dk_salary}px`, "--w-projection": `${columnWidths.dk_projection}px`, "--week-scale": weekScale,
  };
  const identityHandles = Object.fromEntries(IDENTITY_COLUMNS.map((column) => [column.key, showIdentityHandles ? <ResizeHandle key={column.key} columnKey={column.key} width={columnWidths[column.key]} onResize={onResize} /> : null]));
  return (
    <section className={`box-position-section position-${group.position.toLowerCase()}`} aria-labelledby={`position-${group.position}`} style={{ "--position-rail-width": `${columnWidths.position}px` }}>
      <h2 id={`position-${group.position}`} className="sr-only">{group.position} weekly box scores</h2>
      <div className="box-position-rail" aria-hidden="true"><span>{group.position}</span>{identityHandles.position}</div>
      <table className="boxscore-table" style={{ width: tableWidth, minWidth: tableWidth, ...sticky }}>
        <caption>{group.position} week-by-week player statistics</caption>
        <colgroup>
          {IDENTITY_COLUMNS.map((column) => <col key={column.key} data-column={column.key} style={{ width: columnWidths[column.key] }} />)}
          {weeks.flatMap(({ week }) => columns.map((column) => <col key={`${week}-${column.key}`} data-column={column.key} style={{ width: columnWidths[column.key] * weekScale }} />))}
        </colgroup>
        <thead>
          <tr className="box-week-row">
            <th rowSpan="3" className="sr-only box-position-head">Position</th>
            <th colSpan="2" className="box-sticky box-player-title">Player</th>
            <th colSpan="2" className="box-sticky box-upcoming-title"><span>Upcoming</span><strong>{upcomingWeek ? `Week ${upcomingWeek}` : "Next slate"}</strong></th>
            {weeks.map((item, weekIndex) => {
              const totalPoints = gameTotalPoints(item);
              return <th key={item.week} colSpan={columns.length} className="box-week-title">
                {item.gameId ? <button type="button" className="box-game-link" onClick={() => onOpenGame?.(item)} aria-label={`Open Week ${item.week} game breakdown`}><span className="box-game-kicker"><span>Week {item.week}</span>{totalPoints !== null ? <b title="Total points scored">{totalPoints} PTS</b> : null}</span><strong className="box-matchup"><TeamLogo team={item.opponent} className="box-opponent-logo" decorative /><span>{item.opponent ? `${item.homeAway === "away" ? "@" : "vs"} ${item.opponent}` : "No game"} · {item.scoreLabel || "Scheduled"}</span></strong><small>{formatGameDate(item)}</small></button> : <><span>Week {item.week}</span><strong>No game</strong><small>{formatGameDate(item)}</small></>}
                {showIdentityHandles && weekIndex === 0 ? <WeekResizeHandle width={weekWidth} onResize={onWeekResize} /> : null}
              </th>;
            })}
          </tr>
          <tr className="box-subgroup-row">
            <th rowSpan="2" className="box-sticky box-marker-head" aria-label="Player marker">Mark{identityHandles.marker}</th>
            <th rowSpan="2" className="box-sticky box-player-head" aria-label="Player">{identityHandles.player}</th>
            <th rowSpan="2" className="box-sticky box-salary-head"><span className="dk-column-label"><CrownSimple weight="fill" aria-hidden="true" />DK$</span>{identityHandles.dk_salary}</th>
            <th rowSpan="2" className="box-sticky box-projection-head"><span className="dk-column-label"><CrownSimple weight="fill" aria-hidden="true" />DK FPTX</span>{identityHandles.dk_projection}</th>
            {weeks.flatMap((item) => groups.map((columnGroup) => <th key={`${item.week}-${columnGroup.name}`} colSpan={columnGroup.columns.length} rowSpan={columnGroup.name === "Fantasy" ? 2 : undefined} className={`box-week-subgroup${columnGroup.name === "Fantasy" ? " box-fpts-header" : ""}`}>{columnGroup.name === "Fantasy" ? <>FPTS{resizableWeekKeys.has("fantasy_points") && item.week === weeks[0]?.week ? <ResizeHandle columnKey="fantasy_points" width={columnWidths.fantasy_points} onResize={onResize} /> : null}</> : columnGroup.name}</th>))}
          </tr>
          <tr className="box-column-row">
            {weeks.flatMap((item, weekIndex) => columns.filter((column) => column.group !== "Fantasy").map((column) => <th key={`${item.week}-${column.key}`} className={`stat-${column.key}`}>{column.label}{resizableWeekKeys.has(column.key) && weekIndex === 0 ? <ResizeHandle columnKey={column.key} width={columnWidths[column.key]} onResize={onResize} /> : null}</th>))}
          </tr>
        </thead>
        <tbody>{group.players.map((player, playerIndex) => <tr key={player.playerId}>
          {playerIndex === 0 ? <th rowSpan={group.players.length} scope="rowgroup" className="sr-only box-position-cell">{group.position}</th> : null}
          <td className="box-sticky box-marker-cell"><PlayerMarker player={player} marker={markers[player.playerId]} onChange={(marker) => onMarkerChange(player.playerId, marker)} /></td>
          <th scope="row" className="box-sticky box-player-cell"><button type="button" onClick={(event) => onOpenPlayer(player, event.currentTarget)}>{player.name}</button></th>
          <td className="box-sticky box-salary-cell unavailable" title="DraftKings salary source not connected">—</td>
          <td className="box-sticky box-projection-cell unavailable" title="DraftKings projection source not connected">—</td>
          {weeks.flatMap(({ week }) => { const stats = player.weeks.get(week); return columns.map((column) => {
            const value = column.key === "passing_line" ? (stats ? `${stats.completions}-${stats.passing_attempts}` : null) : stats?.[column.key];
            return <td key={`${week}-${column.key}`} title={value ?? undefined} className={`${column.key === "fantasy_points" ? "box-fpts-cell" : ""}${!stats ? " no-game" : ""}${stats ? heatClass(week, column.key, value, maxima) : ""}`}>{column.key === "passing_line" ? (value || "—") : formatStat(value, column.key)}</td>;
          }); })}
        </tr>)}</tbody>
      </table>
    </section>
  );
}

export function TeamBoxScores({ meta, onOpenPlayer, onOpenGame }) {
  const initialState = useRef(savedTeamBoxState()).current;
  const initialPreferences = useRef(readTeamBoxPreferences()).current;
  const [team, setTeam] = useState(initialState.team || "NYG");
  const [scoring, setScoring] = useState(["ppr", "half", "standard"].includes(initialState.scoring) ? initialState.scoring : "ppr");
  const [weekStart, setWeekStart] = useState(Number(initialState.weekStart) || 1);
  const [weekEnd, setWeekEnd] = useState(Number(initialState.weekEnd) || 18);
  const [extraWeeks, setExtraWeeks] = useState(Array.isArray(initialState.extraWeeks) ? initialState.extraWeeks : []);
  const [positions, setPositions] = useState(Array.isArray(initialState.positions) && initialState.positions.length ? initialState.positions : POSITION_ORDER);
  const [dkMin, setDkMin] = useState(initialState.dkMin || "3000");
  const [dkMax, setDkMax] = useState(initialState.dkMax || "11000");
  const [weekWidth, setWeekWidth] = useState(initialPreferences.weekWidth);
  const [columnWidths, setColumnWidths] = useState(initialPreferences.columnWidths);
  const [visibleStats, setVisibleStats] = useState(initialPreferences.visibleStats);
  const [markers, setMarkers] = useState(initialPreferences.markers);
  const [selectedLeagues, setSelectedLeagues] = useState(initialPreferences.selectedLeagues);
  const [schedule, setSchedule] = useState([]);
  const [payload, setPayload] = useState({ data: [], meta: null });
  const [loading, setLoading] = useState(true);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [error, setError] = useState("");
  const scroller = useRef(null);

  const selectedWeeks = useMemo(() => [...new Set([...Array.from({ length: weekEnd - weekStart + 1 }, (_, index) => weekStart + index), ...extraWeeks.filter((week) => week < weekStart || week > weekEnd)])].sort((a, b) => a - b), [weekStart, weekEnd, extraWeeks]);
  const visibleExtraWeeks = useMemo(() => extraWeeks.filter((week) => week < weekStart || week > weekEnd).sort((a, b) => a - b), [extraWeeks, weekStart, weekEnd]);
  const changeRange = (start, end) => { setWeekStart(start); setWeekEnd(end); setExtraWeeks((current) => current.filter((week) => week < start || week > end)); };

  useEffect(() => { window.sessionStorage.setItem(TEAM_BOX_STATE_KEY, JSON.stringify({ team, scoring, weekStart, weekEnd, extraWeeks, positions, dkMin, dkMax })); }, [team, scoring, weekStart, weekEnd, extraWeeks, positions, dkMin, dkMax]);
  useEffect(() => { setPreferencesReady(true); }, []);
  useEffect(() => {
    if (preferencesReady) window.localStorage.setItem(TEAM_BOX_PREFERENCE_KEY, JSON.stringify({ version: 2, weekWidth, columnWidths, visibleStats, markers, selectedLeagues }));
  }, [preferencesReady, weekWidth, columnWidths, visibleStats, markers, selectedLeagues]);
  const resizeColumn = (key, width) => setColumnWidths((current) => ({ ...current, [key]: clampColumnWidth(key, width) }));
  const openGame = (game) => onOpenGame?.(game, scoring);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ team, scoring: "ppr", seasonType: "ALL", weeks: Array.from({ length: 22 }, (_, index) => index + 1).join(",") });
    fetch(`/api/v1/team-box-scores?${params}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : null).then((result) => {
      if (result?.meta?.schedule || result?.meta?.weeks) {
        const nextSchedule = result.meta.schedule || result.meta.weeks;
        const matchupWeeks = new Set(nextSchedule.filter((item) => item.gameId).map((item) => Number(item.week)));
        setSchedule(nextSchedule); setExtraWeeks((current) => current.filter((week) => matchupWeeks.has(Number(week))));
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, [team]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ team, scoring, seasonType: "ALL", weeks: selectedWeeks.join(",") });
    setLoading(true); setError("");
    fetch(`/api/v1/team-box-scores?${params}`, { signal: controller.signal }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "The team query failed."); return result; }).then(setPayload).catch((requestError) => { if (requestError.name !== "AbortError") setError(requestError.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [team, scoring, selectedWeeks]);

  const hasDraftKingsData = useMemo(() => payload.data.some((row) => Number.isFinite(draftKingsPrice(row))), [payload.data]);
  const groups = useMemo(() => {
    const minimum = Number(dkMin) || 0; const maximum = Number(dkMax) || Number.MAX_SAFE_INTEGER;
    return groupRows(payload.data).filter((group) => positions.includes(group.position)).map((group) => ({ ...group, players: group.players.filter((player) => !hasDraftKingsData || (Number(player.draftKingsPrice) >= minimum && Number(player.draftKingsPrice) <= maximum)) })).filter((group) => group.players.length);
  }, [payload.data, positions, dkMin, dkMax, hasDraftKingsData]);
  const resizeOwners = useMemo(() => {
    const owners = new Map();
    groups.forEach((group, index) => {
      columnsForPosition(group.position, visibleStats).forEach((column) => {
        if (!owners.has(column.key)) owners.set(column.key, index);
      });
    });
    return owners;
  }, [groups, visibleStats]);
  const maxima = useMemo(() => metricMaxima(payload.data), [payload.data]);
  const weeks = payload.meta?.weeks || selectedWeeks.map((week) => ({ week, opponent: null, seasonType: week <= 18 ? "REG" : "POST" }));

  return <main className="page-content team-boxscore-page">
    <section className="boxscore-toolbar" aria-labelledby="team-boxscore-title">
      <div className="boxscore-intro"><span className="page-eyebrow"><TrendUp weight="bold" aria-hidden="true" /> Sequential analysis</span><h1 id="team-boxscore-title">Team Box Scores</h1><p>Compare every fantasy-relevant player across completed weeks, from left to right.</p></div>
      <div className="boxscore-filters" aria-label="Team box score filters">
        <TeamFilter team={team} teams={meta?.teams || ["NYG"]} onChange={(event) => setTeam(event.target.value)} />
        <PositionFilter selected={positions} onChange={setPositions} />
        <StatisticsFilter visibleStats={visibleStats} onChange={setVisibleStats} />
        <LeagueFilter selected={selectedLeagues} onChange={setSelectedLeagues} />
        <label className="field"><span className="field-label">Scoring</span><span className="select-wrap"><select aria-label="Scoring" value={scoring} onChange={(event) => setScoring(event.target.value)}><option value="ppr">PPR</option><option value="half">Half PPR</option><option value="standard">Standard</option></select><CaretDown weight="bold" aria-hidden="true" /></span></label>
        <div className={`field dk-price-field${hasDraftKingsData ? "" : " unavailable"}`}><span className="field-label dk-filter-label"><CrownSimple weight="fill" aria-hidden="true" />DK$</span><span className="dk-price-inputs"><input aria-label="Minimum DraftKings price" type="number" min="0" step="100" value={dkMin} onChange={(event) => setDkMin(event.target.value)} disabled={!hasDraftKingsData} /><span>to</span><input aria-label="Maximum DraftKings price" type="number" min="0" step="100" value={dkMax} onChange={(event) => setDkMax(event.target.value)} disabled={!hasDraftKingsData} /></span>{!hasDraftKingsData ? <small>Price feed not connected</small> : null}</div>
        <label className="field week-width-field"><span className="field-label">Week Width <small>{Math.round(weekWidth / WEEK_WIDTH * 100)}%</small></span><span className="week-width-control"><input aria-label="Week column width" type="range" min="220" max="720" step="8" value={weekWidth} onChange={(event) => setWeekWidth(Number(event.target.value))} /></span></label>
      </div>
      <ScheduleWeekSelector team={team} schedule={schedule} start={weekStart} end={weekEnd} extras={extraWeeks} onRangeChange={changeRange} onExtrasChange={setExtraWeeks} onOpenGame={openGame} />
      <div className="boxscore-context"><strong className="selected-team-pill"><span>{team}</span><TeamLogo team={team} decorative /></strong><span>{weekStart === weekEnd ? `Week ${weekStart}` : `Weeks ${weekStart}–${weekEnd}`}{visibleExtraWeeks.length ? ` + ${visibleExtraWeeks.map((week) => `W${week}`).join(", ")}` : ""}</span><span>{scoring === "ppr" ? "PPR" : scoring === "half" ? "Half PPR" : "Standard"}</span><span className="dk-status"><CrownSimple weight="fill" aria-hidden="true" />DK$ + DK FPTX awaiting source</span><div className="box-scroll-buttons" aria-label="Scroll weekly columns"><button type="button" onClick={() => scroller.current?.scrollBy({ left: -weekWidth, behavior: "smooth" })} aria-label="Previous weeks"><ArrowLeft /></button><button type="button" onClick={() => scroller.current?.scrollBy({ left: weekWidth, behavior: "smooth" })} aria-label="Next weeks"><ArrowRight /></button></div></div>
    </section>
    <section className="boxscore-panel" aria-label={`${team} weekly team box scores`}>
      {loading ? <div className="progress" role="progressbar" aria-label="Updating team box scores"><span /></div> : null}{error ? <div className="error-banner" role="alert"><span>{error}</span></div> : null}
      <div className="boxscore-scroller" ref={scroller} tabIndex="0" aria-label="Scrollable weekly team box scores">{!loading && !error && !groups.length ? <div className="boxscore-empty">No player data is available for this team and week range.</div> : null}{groups.map((group, index) => <PositionSection key={group.position} group={group} weeks={weeks} upcomingWeek={null} weekWidth={weekWidth} onWeekResize={setWeekWidth} maxima={maxima} columnWidths={columnWidths} visibleStats={visibleStats} markers={markers} onMarkerChange={(playerId, marker) => setMarkers((current) => { const next = { ...current }; if (marker) next[playerId] = marker; else delete next[playerId]; return next; })} onResize={resizeColumn} showIdentityHandles={index === 0} resizableWeekKeys={new Set([...resizeOwners].filter(([, owner]) => owner === index).map(([key]) => key))} onOpenGame={openGame} onOpenPlayer={(player, opener) => onOpenPlayer(player, opener, scoring)} />)}</div>
      <footer className="data-status" aria-live="polite"><div className="performance-legend" aria-label="Performance color legend"><span><i className="strong" />Strong relative performance</span><span><i className="lower" />Lower relative performance</span><span><i className="typical" />Typical range</span></div><span><strong>{payload.meta?.playerCount ?? 0}</strong> players · <strong>{weeks.length}</strong> weeks</span><span>{payload.meta ? `${payload.meta.queryMs} ms query` : "Loading warehouse"}</span><a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">Data: nflverse · CC BY 4.0</a></footer>
    </section>
  </main>;
}
