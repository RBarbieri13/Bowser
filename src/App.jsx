import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaretDown, CaretUp, Check, Eye, EyeSlash, Info, MagnifyingGlass, Minus, Plus, SlidersHorizontal, X,
} from "@phosphor-icons/react";
import { PlayerProfile } from "./PlayerProfile.jsx";
import { WeekRangePicker } from "./WeekRangePicker.jsx";
import { AppHeader } from "./AppHeader.jsx";
import { TeamBoxScores } from "./TeamBoxScores.jsx";
import { GameBreakdown } from "./GameBreakdown.jsx";
import { OpportunityTracker } from "./OpportunityTracker.jsx";
import { LeagueHub } from "./LeagueHub.jsx";
import {
  clampPlayerTableWidth,
  PLAYER_TABLE_GROUPS,
  PLAYER_TABLE_PREFERENCE_KEY,
  readPlayerTablePreferences,
} from "./playerTableColumns.js";


const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const SIDEBAR_WIDTH_KEY = "bowser:sidebar-width:v1";
const COLLAPSED_GROUP_WIDTH = 46;
const COMPACT_GROUP_NAMES = { player: "Players", draft: "Draft", yahoo: "Yahoo", upcoming: "Next", usage: "Usage" };

function initialSidebarWidth() {
  const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
  return Number.isFinite(stored) && stored >= 56 && stored <= 280 ? stored : 216;
}

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

function formatCell(value, format) {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "decimal") return decimalFormatter.format(value);
  if (format === "percent") return `${decimalFormatter.format(value)}%`;
  if (format === "wholePercent") return `${numberFormatter.format(value)}%`;
  if (typeof value === "number" || /^-?\d+(\.\d+)?$/.test(String(value))) return numberFormatter.format(Number(value));
  return String(value).replaceAll(",", "/");
}

function splitUpcomingMatchup(value) {
  const text = String(value || "—");
  const match = text.match(/^(.*?)(?:\s+)(vs|@)\s+(.+)$/i);
  return match ? [match[1], `${match[2]} ${match[3]}`] : [text];
}

function autoFitPlayerWidth(column, rows) {
  if (column.key === "select") return column.minWidth;
  const values = [column.label];
  for (const row of rows) {
    if (column.key === "draft_kings_price" || column.key === "draft_kings_projection") {
      values.push("—");
      continue;
    }
    const rawValue = row[column.field || column.key];
    if (column.key === "upcoming_matchup") values.push(...splitUpcomingMatchup(rawValue));
    else if (column.key === "yahoo_add_drop_ratio") values.push("Trend");
    else values.push(formatCell(rawValue, column.format));
  }
  const longest = values.reduce((length, value) => Math.max(length, String(value || "").length), 0);
  const textColumn = ["name", "upcoming_matchup", "yahoo_league_status"].includes(column.key);
  const estimatedWidth = Math.ceil(longest * (textColumn ? 6.8 : 7.1) + (textColumn ? 20 : 24));
  return clampPlayerTableWidth(column.key, estimatedWidth);
}

function Checkbox({ checked, mixed = false, label, onChange }) {
  return (
    <label className="check-control" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className={`checkbox-visual${mixed ? " mixed" : ""}`} aria-hidden="true">
        {mixed ? <Minus weight="bold" /> : checked ? <Check weight="bold" /> : null}
      </span>
    </label>
  );
}

function SelectField({ label, value, onChange, children, info, className = "" }) {
  return (
    <label className={`field ${className}`.trim()}>
      <span className="field-label">
        {label}
        {info ? <span className="info-icon" title={info}><Info weight="bold" aria-hidden="true" /></span> : null}
      </span>
      <span className="select-wrap">
        <select value={value} onChange={onChange}>{children}</select>
        <CaretDown weight="bold" aria-hidden="true" />
      </span>
    </label>
  );
}

function SortIcon({ active, direction, priority }) {
  if (!active) return null;
  return <span className="sort-indicator" aria-hidden="true">{direction === "asc" ? <CaretUp weight="bold" /> : <CaretDown weight="bold" />}{priority > 0 ? <small>{priority + 1}</small> : null}</span>;
}

function PlayerColumnResizeHandle({ column, width, onResize }) {
  const finishResize = useRef(null);
  useEffect(() => () => finishResize.current?.(), []);

  const startResize = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const originWidth = width;
    const move = (moveEvent) => onResize(column.key, originWidth + moveEvent.clientX - originX);
    const finish = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      finishResize.current = null;
    };
    finishResize.current?.();
    finishResize.current = finish;
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish, { once: true });
  };

  const onKeyDown = (event) => {
    const step = event.shiftKey ? 12 : 4;
    if (event.key === "ArrowLeft") onResize(column.key, width - step);
    else if (event.key === "ArrowRight") onResize(column.key, width + step);
    else if (event.key === "Home") onResize(column.key, column.minWidth);
    else if (event.key === "End") onResize(column.key, column.maxWidth);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <span
      className="column-resizer player-column-resizer"
      role="separator"
      tabIndex="0"
      aria-label={`Resize ${column.label || "selection"} column`}
      aria-orientation="vertical"
      aria-valuemin={column.minWidth}
      aria-valuemax={column.maxWidth}
      aria-valuenow={width}
      onPointerDown={startResize}
      onKeyDown={onKeyDown}
      onDoubleClick={(event) => { event.stopPropagation(); onResize(column.key, column.defaultWidth); }}
    />
  );
}

function PlayerGroupResizeHandle({ group, width, enabled, onResize, onReset }) {
  const finishResize = useRef(null);
  useEffect(() => () => finishResize.current?.(), []);
  if (!enabled) return null;
  const minWidth = group.columns.reduce((total, column) => total + column.minWidth, 0);
  const maxWidth = group.columns.reduce((total, column) => total + column.maxWidth, 0);

  const startResize = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const originWidth = width;
    const move = (moveEvent) => onResize(group.key, originWidth + moveEvent.clientX - originX);
    const finish = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      finishResize.current = null;
    };
    finishResize.current?.();
    finishResize.current = finish;
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish, { once: true });
  };

  const onKeyDown = (event) => {
    const step = event.shiftKey ? 32 : 12;
    if (event.key === "ArrowLeft") onResize(group.key, width - step);
    else if (event.key === "ArrowRight") onResize(group.key, width + step);
    else if (event.key === "Home") onResize(group.key, minWidth);
    else if (event.key === "End") onResize(group.key, maxWidth);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <span
      className="player-group-resizer"
      role="separator"
      tabIndex="0"
      aria-label={`Resize ${group.name} section`}
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      onPointerDown={startResize}
      onKeyDown={onKeyDown}
      onDoubleClick={(event) => { event.stopPropagation(); onReset(group.key); }}
    />
  );
}

function routeFromHash() {
  const gameMatch = window.location.hash.match(/^#\/game\/([^?]+)/);
  if (gameMatch) {
    const query = window.location.hash.split("?")[1] || "";
    const scoring = new URLSearchParams(query).get("scoring");
    return { page: "game", gameId: decodeURIComponent(gameMatch[1]), scoring: ["ppr", "half", "standard"].includes(scoring) ? scoring : "ppr" };
  }
  if (window.location.hash.includes("opportunity-tracker")) return { page: "opportunity-tracker", gameId: null };
  if (window.location.hash.includes("league-hub")) return { page: "league-hub", gameId: null };
  return { page: window.location.hash.includes("team-box-scores") ? "team-box-scores" : "players", gameId: null };
}

export function App() {
  const initialTablePreferences = useMemo(() => readPlayerTablePreferences(), []);
  const [route, setRoute] = useState(routeFromHash);
  const currentPage = route.page;
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [responseMeta, setResponseMeta] = useState(null);
  const [position, setPosition] = useState("ALL");
  const [scoring, setScoring] = useState("ppr");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 180);
  const [customEnabled, setCustomEnabled] = useState(false);
  const [customRanks, setCustomRanks] = useState("");
  const [appliedRanks, setAppliedRanks] = useState("");
  const [customError, setCustomError] = useState("");
  const [weekStart, setWeekStart] = useState(1);
  const [weekEnd, setWeekEnd] = useState(18);
  const [team, setTeam] = useState("ALL");
  const [minGames, setMinGames] = useState("0");
  const [minSnaps, setMinSnaps] = useState("0");
  const [moreOpen, setMoreOpen] = useState(false);
  const [sorts, setSorts] = useState([{ key: "fantasy_points", direction: "desc" }]);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSwipeHint, setShowSwipeHint] = useState(() => localStorage.getItem("stats-scroll-hint-dismissed") !== "1");
  const [profilePlayer, setProfilePlayer] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(initialSidebarWidth);
  const [showDraftMetrics, setShowDraftMetrics] = useState(initialTablePreferences.showDraftMetrics);
  const [showYahooMetrics, setShowYahooMetrics] = useState(initialTablePreferences.showYahooMetrics);
  const [autoFitPlayerTable, setAutoFitPlayerTable] = useState(initialTablePreferences.autoFit);
  const [collapsedPlayerGroups, setCollapsedPlayerGroups] = useState(initialTablePreferences.collapsedGroups);
  const [sectionResizeEnabled, setSectionResizeEnabled] = useState(false);
  const [playerColumnWidths, setPlayerColumnWidths] = useState(initialTablePreferences.columnWidths);
  const tableScroller = useRef(null);
  const profileOpener = useRef(null);

  useEffect(() => {
    const syncPage = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", syncPage);
    return () => window.removeEventListener("hashchange", syncPage);
  }, []);

  const resizeSidebar = useCallback((nextWidth) => {
    setSidebarWidth(Math.round(Math.max(56, Math.min(280, Number(nextWidth) || 216))));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(PLAYER_TABLE_PREFERENCE_KEY, JSON.stringify({
      version: 1,
      showDraftMetrics,
      showYahooMetrics,
      autoFit: autoFitPlayerTable,
      collapsedGroups: collapsedPlayerGroups,
      columnWidths: playerColumnWidths,
    }));
  }, [showDraftMetrics, showYahooMetrics, autoFitPlayerTable, collapsedPlayerGroups, playerColumnWidths]);

  const resizePlayerColumn = useCallback((key, nextWidth) => {
    const width = clampPlayerTableWidth(key, nextWidth);
    if (width === null) return;
    setAutoFitPlayerTable(false);
    setPlayerColumnWidths((current) => current[key] === width ? current : { ...current, [key]: width });
  }, []);

  const availablePlayerGroups = useMemo(() => PLAYER_TABLE_GROUPS
    .filter((group) => (showDraftMetrics || group.key !== "draft") && (showYahooMetrics || group.key !== "yahoo")), [showDraftMetrics, showYahooMetrics]);

  const resizePlayerGroup = useCallback((groupKey, nextTotalWidth) => {
    const group = PLAYER_TABLE_GROUPS.find((item) => item.key === groupKey);
    if (!group) return;
    setAutoFitPlayerTable(false);
    setPlayerColumnWidths((current) => {
      const currentTotal = group.columns.reduce((total, column) => total + current[column.key], 0);
      const minTotal = group.columns.reduce((total, column) => total + column.minWidth, 0);
      const maxTotal = group.columns.reduce((total, column) => total + column.maxWidth, 0);
      const targetTotal = Math.max(minTotal, Math.min(maxTotal, Number(nextTotalWidth) || currentTotal));
      const ratio = targetTotal / currentTotal;
      const next = { ...current };
      group.columns.forEach((column) => {
        next[column.key] = clampPlayerTableWidth(column.key, current[column.key] * ratio);
      });
      return next;
    });
  }, []);

  const resetPlayerGroup = useCallback((groupKey) => {
    const group = PLAYER_TABLE_GROUPS.find((item) => item.key === groupKey);
    if (!group) return;
    setAutoFitPlayerTable(false);
    setPlayerColumnWidths((current) => ({
      ...current,
      ...Object.fromEntries(group.columns.map((column) => [column.key, column.defaultWidth])),
    }));
  }, []);

  const togglePlayerGroup = useCallback((groupKey) => {
    setCollapsedPlayerGroups((current) => current.includes(groupKey)
      ? current.filter((key) => key !== groupKey)
      : [...current, groupKey]);
  }, []);

  useEffect(() => {
    if (!autoFitPlayerTable) return;
    const columns = availablePlayerGroups
      .filter((group) => !collapsedPlayerGroups.includes(group.key))
      .flatMap((group) => group.columns);
    setPlayerColumnWidths((current) => {
      const next = { ...current };
      let changed = false;
      columns.forEach((column) => {
        const width = autoFitPlayerWidth(column, rows);
        if (next[column.key] !== width) {
          next[column.key] = width;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [autoFitPlayerTable, availablePlayerGroups, collapsedPlayerGroups, rows]);

  const collapsedPlayerGroupSet = useMemo(() => new Set(collapsedPlayerGroups), [collapsedPlayerGroups]);
  const visiblePlayerGroups = useMemo(() => availablePlayerGroups.map((group) => {
    if (!collapsedPlayerGroupSet.has(group.key)) {
      return { ...group, collapsed: false, columns: group.columns.map((column) => ({ ...column, group: group.key, width: playerColumnWidths[column.key] })) };
    }
    return {
      ...group,
      collapsed: true,
      columns: [{ key: `collapsed-${group.key}`, label: "", group: group.key, synthetic: true, width: COLLAPSED_GROUP_WIDTH }],
    };
  }), [availablePlayerGroups, collapsedPlayerGroupSet, playerColumnWidths]);
  const visiblePlayerColumns = useMemo(() => visiblePlayerGroups.flatMap((group) => group.columns), [visiblePlayerGroups]);
  const playerTableWidth = useMemo(() => visiblePlayerColumns.reduce(
    (total, column) => total + column.width, 0,
  ), [visiblePlayerColumns]);
  const playerGroupEndKeys = useMemo(() => new Set(visiblePlayerGroups.map((group) => group.columns.at(-1).key)), [visiblePlayerGroups]);
  const playerTableStyle = useMemo(() => ({
    width: `${playerTableWidth}px`,
    minWidth: `${playerTableWidth}px`,
    "--sticky-rank-left": `${playerColumnWidths.select}px`,
    "--sticky-name-left": `${playerColumnWidths.select + playerColumnWidths.rank}px`,
  }), [playerTableWidth, playerColumnWidths]);

  const selectedWeeks = useMemo(
    () => Array.from({ length: weekEnd - weekStart + 1 }, (_, index) => weekStart + index),
    [weekStart, weekEnd],
  );

  useEffect(() => {
    fetch("/api/v1/meta")
      .then((response) => {
        if (!response.ok) throw new Error("The local warehouse could not be opened.");
        return response.json();
      })
      .then(setMeta)
      .catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(() => {
    if (currentPage !== "players") return undefined;
    const controller = new AbortController();
    const querySorts = sorts.length ? sorts : [{ key: "name", direction: "asc" }];
    const params = new URLSearchParams({
      seasonType: "ALL",
      scoring,
      search: debouncedSearch,
      sort: querySorts.map((item) => item.key).join(","),
      direction: querySorts.map((item) => item.direction).join(","),
      limit: "all",
      minGames,
      minSnaps,
      weeks: selectedWeeks.join(","),
    });
    if (position === "ALL") params.set("positions", "QB,RB,WR,TE");
    else if (position === "FLEX") params.set("positions", "RB,WR,TE");
    else params.set("positions", position);
    if (team !== "ALL") params.set("teams", team);
    if (customEnabled && appliedRanks) params.set("ranks", appliedRanks);
    setLoading(true);
    setError("");
    fetch(`/api/v1/player-stats?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || "The query failed.");
        return payload;
      })
      .then((payload) => {
        setRows(payload.data);
        setResponseMeta(payload.meta);
      })
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [currentPage, scoring, debouncedSearch, sorts, customEnabled, appliedRanks, position, team, selectedWeeks, minGames, minSnaps]);

  const allVisibleSelected = rows.length > 0 && rows.every((row) => selected.has(row.player_id));
  const someVisibleSelected = rows.some((row) => selected.has(row.player_id)) && !allVisibleSelected;

  const toggleAll = useCallback(() => {
    setSelected((current) => {
      const next = new Set(current);
      if (rows.every((row) => next.has(row.player_id))) rows.forEach((row) => next.delete(row.player_id));
      else rows.forEach((row) => next.add(row.player_id));
      return next;
    });
  }, [rows]);

  const toggleRow = useCallback((playerId) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId); else next.add(playerId);
      return next;
    });
  }, []);

  const handleSort = (key, shiftKey = false) => {
    if (key === "select" || key === "draft_kings_price") return;
    const normalized = key === "rank" ? "fantasy_points" : key;
    const defaultDirection = ["name", "team", "position", "adp", "draft_position_rank"].includes(normalized) ? "asc" : "desc";
    setSorts((current) => {
      const index = current.findIndex((item) => item.key === normalized);
      if (!shiftKey) {
        if (current.length === 1 && index === 0) {
          if (current[0].direction === defaultDirection) {
            return [{ key: normalized, direction: defaultDirection === "desc" ? "asc" : "desc" }];
          }
          return [];
        }
        return [{ key: normalized, direction: defaultDirection }];
      }
      const next = [...current];
      if (index === -1) return [...next, { key: normalized, direction: defaultDirection }].slice(0, 3);
      if (next[index].direction === defaultDirection) {
        next[index] = { ...next[index], direction: defaultDirection === "desc" ? "asc" : "desc" };
      } else next.splice(index, 1);
      return next;
    });
  };

  const applyCustomRanks = () => {
    const value = customRanks.trim();
    if (!value) {
      setAppliedRanks("");
      setCustomEnabled(false);
      setCustomError("");
      return;
    }
    if (!/^\s*\d+(\s*[–-]\s*\d+)?(\s*,\s*\d+(\s*[–-]\s*\d+)?)*\s*$/.test(value)) {
      setCustomError("Use ranks such as 1-5, 16, 30.");
      return;
    }
    setCustomEnabled(true);
    setAppliedRanks(value);
    setCustomError("");
  };

  const filterSummary = useMemo(() => {
    const range = weekStart === weekEnd ? `Week ${weekStart}` : `Weeks ${weekStart}–${weekEnd}`;
    const parts = [range, scoring.toUpperCase()];
    if (position !== "ALL") parts.push(position === "FLEX" ? "RB/WR/TE" : position);
    if (team !== "ALL") parts.push(team);
    return parts.join(" · ");
  }, [weekStart, weekEnd, scoring, position, team]);

  const openProfile = (row, opener, profileScoring = scoring) => {
    profileOpener.current = opener;
    setProfilePlayer({
      playerId: row.player_id || row.playerId,
      name: row.player_display_name || row.name,
      scoring: profileScoring,
    });
  };

  const closeProfile = useCallback(() => {
    setProfilePlayer(null);
    window.requestAnimationFrame(() => profileOpener.current?.focus());
  }, []);

  const onHorizontalScroll = () => {
    if (tableScroller.current?.scrollLeft > 16 && showSwipeHint) {
      setShowSwipeHint(false);
      localStorage.setItem("stats-scroll-hint-dismissed", "1");
    }
  };

  return (
    <div className={`app-shell${sidebarWidth < 112 ? " sidebar-icon-only" : ""}`} style={{ "--sidebar-width": `${sidebarWidth}px` }}>
      <AppHeader currentPage={currentPage === "game" ? "team-box-scores" : currentPage} width={sidebarWidth} collapsed={sidebarWidth < 112} onResize={resizeSidebar} />
      {currentPage === "game" ? (
        <GameBreakdown gameId={route.gameId} scoring={route.scoring} onBack={() => { window.location.hash = "#/team-box-scores"; }} onOpenPlayer={(row, opener) => openProfile(row, opener, route.scoring)} />
      ) : currentPage === "team-box-scores" ? (
        <TeamBoxScores meta={meta} onOpenPlayer={openProfile} onOpenGame={(game, gameScoring) => { window.location.hash = `#/game/${encodeURIComponent(game.gameId)}?scoring=${gameScoring}`; }} />
      ) : currentPage === "opportunity-tracker" ? (
        <OpportunityTracker meta={meta} onOpenPlayer={openProfile} />
      ) : currentPage === "league-hub" ? (
        <LeagueHub />
      ) : (
      <main className="page-content player-database-page">
      <section className="filter-band" aria-label="Statistics filters">
        <div className="filter-grid">
          <SelectField className="season-field" label="Season" value="2025" onChange={() => {}} info="NFL season used for this table.">
            <option value="2025">2025</option>
          </SelectField>
          <WeekRangePicker start={weekStart} end={weekEnd} onChange={(start, end) => { setWeekStart(start); setWeekEnd(end); }} />
          <SelectField className="position-field" label="Position(s)" value={position} onChange={(event) => setPosition(event.target.value)}>
            <option value="ALL">All</option>
            <option value="QB">QB</option>
            <option value="RB">RB</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
            <option value="FLEX">RB/WR/TE</option>
          </SelectField>
          <SelectField className="team-field" label="Team" value={team} onChange={(event) => setTeam(event.target.value)}>
            <option value="ALL">All teams</option>
            {(meta?.teams || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </SelectField>
          <SelectField className="scoring-field" label="Scoring System" value={scoring} onChange={(event) => setScoring(event.target.value)}>
            <option value="ppr">PPR</option>
            <option value="half">Half PPR</option>
            <option value="standard">Standard</option>
          </SelectField>
          <div className="more-field">
            <span className="field-label">More Filters</span>
            <button className={`more-button${moreOpen ? " open" : ""}`} onClick={() => setMoreOpen((current) => !current)} aria-expanded={moreOpen} aria-controls="more-filters" aria-label={moreOpen ? "Close more filters" : "Open more filters"}>
              <Plus weight="bold" aria-hidden="true" />
            </button>
          </div>
          <div className="draft-toggle-field">
            <span className="field-label">Draft Rankings</span>
            <button
              type="button"
              className={showDraftMetrics ? "active" : ""}
              aria-pressed={showDraftMetrics}
              aria-label={showDraftMetrics ? "Hide draft rankings" : "Show draft rankings"}
              onClick={() => setShowDraftMetrics((current) => !current)}
              title="Show or hide 2026 FantasyPros PPR ADP and positional rank"
            >
              {showDraftMetrics ? <Eye weight="bold" aria-hidden="true" /> : <EyeSlash weight="bold" aria-hidden="true" />}
              <span>{showDraftMetrics ? "Shown" : "Hidden"}</span>
            </button>
          </div>
          <div className="draft-toggle-field yahoo-toggle-field">
            <span className="field-label">Yahoo Stats</span>
            <button
              type="button"
              className={showYahooMetrics ? "active" : ""}
              aria-pressed={showYahooMetrics}
              aria-label={showYahooMetrics ? "Hide Yahoo fantasy statistics" : "Show Yahoo fantasy statistics"}
              onClick={() => setShowYahooMetrics((current) => !current)}
              title="Show or hide Yahoo league ownership and transaction-trend fields"
            >
              {showYahooMetrics ? <Eye weight="bold" aria-hidden="true" /> : <EyeSlash weight="bold" aria-hidden="true" />}
              <span>{showYahooMetrics ? "Shown" : "Hidden"}</span>
            </button>
          </div>
        </div>
        <div className="view-tabs" role="tablist" aria-label="Statistic views">
          <button className="active" role="tab" aria-selected="true">Player</button>
          <button role="tab" aria-disabled="true" title="Coming soon" disabled>Offense</button>
          <button role="tab" aria-disabled="true" title="Coming soon" disabled>Defense</button>
        </div>
        {moreOpen ? (
          <div className="more-popover" id="more-filters">
            <div className="popover-heading"><SlidersHorizontal aria-hidden="true" /><span>More filters</span><button onClick={() => setMoreOpen(false)} aria-label="Close more filters"><X /></button></div>
            <label>Minimum games<input type="number" min="0" max="25" value={minGames} onChange={(event) => setMinGames(event.target.value)} /></label>
            <label>Minimum snaps<input type="number" min="0" max="3000" value={minSnaps} onChange={(event) => setMinSnaps(event.target.value)} /></label>
          </div>
        ) : null}
      </section>

      <section className="query-band" aria-label="Search and result controls">
        <label className="search-control">
          <MagnifyingGlass aria-hidden="true" />
          <span className="sr-only">Find player or team</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find player or team…" />
          {search ? <button onClick={() => setSearch("")} aria-label="Clear search"><X /></button> : null}
        </label>

        <div className={`custom-control${customError ? " invalid" : ""}`}>
          <Checkbox checked={customEnabled} label="Enable custom rank filter" onChange={() => setCustomEnabled((current) => !current)} />
          <input value={customRanks} onChange={(event) => setCustomRanks(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyCustomRanks(); }} placeholder="Custom (e.g. 1–5, 16, 30)" aria-invalid={Boolean(customError)} aria-describedby="custom-error" />
          <button onClick={applyCustomRanks}>GO</button>
          <span className="custom-error" id="custom-error" aria-live="polite">{customError}</span>
        </div>

        <div className="player-table-tools" aria-label="Player table width controls">
          <button
            type="button"
            className={sectionResizeEnabled ? "active" : ""}
            aria-pressed={sectionResizeEnabled}
            onClick={() => setSectionResizeEnabled((current) => !current)}
            title="Show proportional resize handles on every section header"
          >
            <SlidersHorizontal aria-hidden="true" />
            <span>Section Resize</span>
          </button>
          <button
            type="button"
            className={autoFitPlayerTable ? "active" : ""}
            aria-pressed={autoFitPlayerTable}
            onClick={() => setAutoFitPlayerTable((current) => !current)}
            title="Fit every visible column to its displayed values"
          >
            {autoFitPlayerTable ? <Check weight="bold" aria-hidden="true" /> : null}
            <span>Auto Fit</span>
          </button>
        </div>
      </section>

      <section className="table-panel" aria-label="2025 NFL player fantasy statistics">
        {loading ? <div className="progress" role="progressbar" aria-label="Updating statistics"><span /></div> : null}
        {error ? <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => window.location.reload()}>Retry</button></div> : null}
        {showSwipeHint ? <div className="swipe-hint">Swipe horizontally for more stats <button onClick={() => { setShowSwipeHint(false); localStorage.setItem("stats-scroll-hint-dismissed", "1"); }} aria-label="Dismiss horizontal scroll hint"><X /></button></div> : null}
        <header className="table-panel-heading">
          <h1>Player Database</h1>
          <span>{filterSummary} · All matching</span>
        </header>
        <div className="table-scroller" ref={tableScroller} onScroll={onHorizontalScroll} tabIndex="0" aria-label="Scrollable player statistics table">
          <table style={playerTableStyle}>
            <caption>2025 NFL player fantasy statistics. {filterSummary}. {responseMeta?.totalCount ?? 0} matching players.</caption>
            <colgroup>{visiblePlayerColumns.map((column) => <col key={column.key} data-column={column.key} style={{ width: `${column.width}px` }} />)}</colgroup>
            <thead>
              <tr className="group-row">
                {visiblePlayerGroups.map((group) => {
                  const sourceGroup = PLAYER_TABLE_GROUPS.find((item) => item.key === group.key);
                  const groupWidth = sourceGroup.columns.reduce((total, column) => total + playerColumnWidths[column.key], 0);
                  const groupLabel = autoFitPlayerTable ? (COMPACT_GROUP_NAMES[group.key] || group.name) : group.name;
                  return (
                    <th key={group.key} colSpan={group.columns.length} scope="colgroup" className={`group-${group.key}${group.collapsed ? " collapsed" : ""}`}>
                      <span title={group.name}>{group.collapsed ? group.name.slice(0, 3).toUpperCase() : groupLabel}</span>
                      <button
                        type="button"
                        className="group-collapse-button"
                        aria-label={`${group.collapsed ? "Expand" : "Collapse"} ${group.name} section`}
                        aria-expanded={!group.collapsed}
                        onClick={() => togglePlayerGroup(group.key)}
                        title={`${group.collapsed ? "Expand" : "Collapse"} ${group.name}`}
                      >
                        {group.collapsed ? <Plus weight="bold" aria-hidden="true" /> : <Minus weight="bold" aria-hidden="true" />}
                      </button>
                      {!group.collapsed ? <PlayerGroupResizeHandle group={sourceGroup} width={groupWidth} enabled={sectionResizeEnabled} onResize={resizePlayerGroup} onReset={resetPlayerGroup} /> : null}
                    </th>
                  );
                })}
              </tr>
              <tr className="column-row">
                {visiblePlayerColumns.map((column) => {
                  if (column.synthetic) {
                    const group = PLAYER_TABLE_GROUPS.find((item) => item.key === column.group);
                    return <th key={column.key} className="collapsed-group-head"><button type="button" onClick={() => togglePlayerGroup(group.key)} aria-label={`Expand ${group.name} section`} title={`Expand ${group.name}`}><Plus weight="bold" aria-hidden="true" /></button></th>;
                  }
                  const normalizedSortKey = column.key === "rank" ? "fantasy_points" : column.key;
                  const sortIndex = sorts.findIndex((item) => item.key === normalizedSortKey);
                  const activeSort = sortIndex >= 0;
                  const activeDirection = activeSort ? sorts[sortIndex].direction : undefined;
                  if (column.key === "select") {
                    return <th key={column.key} className="identity sticky-select"><Checkbox checked={allVisibleSelected} mixed={someVisibleSelected} label="Select all visible players" onChange={toggleAll} /><PlayerColumnResizeHandle column={column} width={playerColumnWidths[column.key]} onResize={resizePlayerColumn} /></th>;
                  }
                  return (
                    <th key={column.key} className={`${column.group === "dfs" ? "dfs-head " : ""}${column.group === "draft" ? "draft-head " : ""}${column.key === "rank" ? "identity sticky-rank " : ""}${column.key === "name" ? "identity sticky-name " : ""}${playerGroupEndKeys.has(column.key) ? "group-end" : ""}`} aria-sort={activeSort ? (activeDirection === "asc" ? "ascending" : "descending") : "none"}>
                      {column.sortable === false ? <span>{column.label}</span> : <button onClick={(event) => handleSort(column.key, event.shiftKey)} title="Click to cycle sort; Shift-click adds a secondary sort"><span>{column.label}</span><SortIcon active={activeSort} direction={activeDirection} priority={sortIndex} /></button>}
                      <PlayerColumnResizeHandle column={column} width={playerColumnWidths[column.key]} onResize={resizePlayerColumn} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {!loading && !error && rows.length === 0 ? (
                <tr><td className="empty-state" colSpan={visiblePlayerColumns.length}><strong>No players match these filters.</strong><button onClick={() => { setSearch(""); setPosition("ALL"); setTeam("ALL"); setWeekStart(1); setWeekEnd(18); setMinGames("0"); setMinSnaps("0"); setCustomEnabled(false); }}>Clear filters</button></td></tr>
              ) : rows.map((row) => (
                <tr key={row.player_id} className={selected.has(row.player_id) ? "selected" : ""}>
                  {visiblePlayerColumns.map((column) => {
                    if (column.synthetic) return <td key={column.key} className="collapsed-group-cell" aria-label={`${PLAYER_TABLE_GROUPS.find((group) => group.key === column.group)?.name} section collapsed`} />;
                    if (column.key === "select") return <td key={column.key} className="identity sticky-select"><Checkbox checked={selected.has(row.player_id)} label={`Select ${row.player_display_name}`} onChange={() => toggleRow(row.player_id)} /></td>;
                    const field = column.field || column.key;
                    const value = column.key === "draft_kings_price" || column.key === "draft_kings_projection" ? null : row[field];
                    const className = `${column.align === "center" ? "center " : ""}${column.key === "rank" ? "identity sticky-rank " : ""}${column.key === "name" ? "identity sticky-name player-name " : ""}${column.key === "team" ? "team-cell " : ""}${column.key === "position" ? "position-cell " : ""}${column.group === "draft" ? "draft-metric " : ""}${column.group === "yahoo" ? "yahoo-metric " : ""}${column.key === "fantasy_points" ? "fantasy-cell " : ""}${playerGroupEndKeys.has(column.key) ? "group-end" : ""}`;
                    if (column.key === "name") {
                      return <td key={column.key} title={row.player_display_name} className={className}><button type="button" className="player-name-button" onClick={(event) => openProfile(row, event.currentTarget)}>{row.player_display_name}</button></td>;
                    }
                    if (column.key === "upcoming_matchup") {
                      const matchupLines = splitUpcomingMatchup(value);
                      const content = matchupLines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>);
                      return <td key={column.key} className={`${className} upcoming-matchup-cell`}>{row.upcoming_game_url ? <a href={row.upcoming_game_url} target="_blank" rel="noreferrer" aria-label={value || "No upcoming matchup"}>{content}</a> : <span className="upcoming-matchup-copy">{content}</span>}</td>;
                    }
                    if (column.key === "yahoo_add_drop_ratio") {
                      const adds = Number(row.yahoo_adds) || 0;
                      const drops = Number(row.yahoo_drops) || 0;
                      const total = adds + drops;
                      return <td key={column.key} className={className}>{total > 0 ? <span className="yahoo-trend-bar" aria-label={`${adds} adds and ${drops} drops`}><i className="adds" style={{ width: `${100 * adds / total}%` }} /><i className="drops" style={{ width: `${100 * drops / total}%` }} /></span> : "—"}</td>;
                    }
                    return <td key={column.key} className={className}>{formatCell(value, column.format)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="data-status" aria-live="polite">
          <span><strong>{responseMeta?.returnedCount ?? 0}</strong> shown · <strong>{responseMeta?.totalCount ?? 0}</strong> matching</span>
          <span>{responseMeta ? `${responseMeta.queryMs} ms query` : "Loading warehouse"}</span>
          <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">Data: nflverse · CC BY 4.0</a>
          <a href="https://www.fantasypros.com/nfl/adp/ppr-overall.php" target="_blank" rel="noreferrer">Draft: FantasyPros · PPR</a>
          {showYahooMetrics ? <a href="https://football.fantasysports.yahoo.com/" target="_blank" rel="noreferrer">Fantasy data provided by Yahoo Fantasy</a> : null}
        </footer>
      </section>
      </main>
      )}
      {profilePlayer ? (
        <PlayerProfile
          player={profilePlayer}
          scoring={profilePlayer.scoring || scoring}
          onClose={closeProfile}
          onSelectPlayer={(playerId, name) => setProfilePlayer({ playerId, name })}
        />
      ) : null}
    </div>
  );
}
