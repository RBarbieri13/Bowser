import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowCounterClockwise, CaretDown, CaretUp, Check, Columns, Eye, EyeSlash, Info, MagnifyingGlass, Minus, Plus, SlidersHorizontal, Sparkle, X,
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
  PLAYER_TABLE_COLUMNS,
  PLAYER_TABLE_GROUPS,
  PLAYER_TABLE_SEGMENTS,
  PLAYER_TABLE_PREFERENCE_KEY,
  readPlayerTablePreferences,
} from "./playerTableColumns.js";


const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const SIDEBAR_WIDTH_KEY = "bowser:sidebar-width:v1";
const COMPACT_GROUP_NAMES = { player: "Players", draft: "Draft", yahoo: "Yahoo", upcoming: "Next", usage: "Usage", trends: "Trends" };
const TREND_PARENT_COLUMNS = {
  trend_snaps: "snaps",
  trend_touches: "carries",
  trend_targets: "targets",
  trend_fantasy_points: "fantasy_points",
};
const REQUIRED_PLAYER_COLUMNS = new Set(["name"]);
const PLAYER_VIEW_PRESETS = [
  { key: "core", name: "Core", columns: ["select", "rank", "name", "upcoming_matchup", "team", "position", "games_played", "snaps", "fantasy_points"] },
  { key: "opportunity", name: "Opportunity", columns: ["select", "rank", "name", "upcoming_matchup", "team", "position", "games_played", "snaps", "trend_snaps", "carries", "trend_touches", "targets", "trend_targets", "fantasy_points", "trend_fantasy_points"] },
  { key: "passing", name: "Passing", groups: ["player", "upcoming", "usage", "passing", "dfs"] },
  { key: "rushing", name: "Rushing", groups: ["player", "upcoming", "usage", "rushing", "dfs"] },
  { key: "receiving", name: "Receiving", groups: ["player", "upcoming", "usage", "receiving", "dfs"] },
  { key: "dfs", name: "DFS", groups: ["player", "draft", "upcoming", "usage", "dfs", "trends"] },
  { key: "all", name: "All", groups: PLAYER_TABLE_GROUPS.map((group) => group.key) },
];
const TREND_METRICS = {
  snaps: { label: "Snaps", unit: "snaps", className: "snaps", decimals: 0 },
  touches: { label: "Touches", unit: "touches (CAR+REC)", className: "touches", decimals: 0 },
  targets: { label: "Targets", unit: "targets", className: "targets", decimals: 0 },
  fantasy_points: { label: "Fantasy points", unit: "fantasy points", className: "fantasy", decimals: 1 },
};

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

function trendGamesFor(row) {
  const games = row.player_trends ?? row.trends ?? row.last_10_games ?? row.recent_games;
  return Array.isArray(games) ? games.slice(-10) : [];
}

function trendMetricValue(game, metric) {
  if (metric === "fantasy_points") {
    const value = game.fantasyPoints ?? game.fantasy_points;
    return value === null || value === undefined ? null : Number(value);
  }
  if (metric === "touches") {
    if (game.touches !== null && game.touches !== undefined && Number.isFinite(Number(game.touches))) return Number(game.touches);
    const carries = game.carries ?? game.rushAttempts ?? game.rush_attempts;
    const receptions = game.receptions;
    if ((carries === null || carries === undefined) && (receptions === null || receptions === undefined)) return null;
    return (Number(carries) || 0) + (Number(receptions) || 0);
  }
  const value = game[metric];
  return value === null || value === undefined ? null : Number(value);
}

function percentile(values, proportion) {
  if (!values.length) return 1;
  const ordered = [...values].sort((a, b) => a - b);
  const position = (ordered.length - 1) * proportion;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return ordered[lower];
  return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower);
}

let sharedTrendObserver;
const trendVisibilityCallbacks = new WeakMap();

function observeTrendVisibility(node, callback) {
  if (typeof IntersectionObserver === "undefined") {
    callback();
    return () => {};
  }
  if (!sharedTrendObserver) {
    sharedTrendObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        trendVisibilityCallbacks.get(entry.target)?.();
        trendVisibilityCallbacks.delete(entry.target);
        sharedTrendObserver.unobserve(entry.target);
      });
    }, { rootMargin: "160px 320px" });
  }
  trendVisibilityCallbacks.set(node, callback);
  sharedTrendObserver.observe(node);
  return () => {
    trendVisibilityCallbacks.delete(node);
    sharedTrendObserver?.unobserve(node);
  };
}

function InlinePlayerTrend({ row, metric, gameCount = 10 }) {
  const definition = TREND_METRICS[metric];
  const games = trendGamesFor(row).slice(-gameCount);
  const chartRef = useRef(null);
  const [isVisible, setIsVisible] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (isVisible || !chartRef.current) return undefined;
    return observeTrendVisibility(chartRef.current, () => setIsVisible(true));
  }, [isVisible]);
  const points = games.map((game) => ({
    game,
    value: trendMetricValue(game, metric),
  }));
  const slots = [
    ...Array.from({ length: Math.max(0, gameCount - points.length) }, () => ({ game: null, value: null })),
    ...points,
  ];
  const availableValues = points.map((point) => point.value).filter((value) => Number.isFinite(value));
  if (!games.length) {
    return <span className="player-trend-empty" aria-label={`No regular-season ${definition.label.toLowerCase()} trend available`}>No games</span>;
  }
  if (!availableValues.length) {
    return <span className="player-trend-empty" aria-label={`Regular-season games exist, but ${definition.label.toLowerCase()} data is unavailable`}>No data</span>;
  }
  const scale = Math.max(1, percentile(availableValues.map((value) => Math.max(0, value)), .9));
  const playerName = row.player_display_name || row.name || "Player";
  const summary = points.map(({ game, value }) => `Week ${game.week}: ${Number.isFinite(value) ? (definition.decimals ? decimalFormatter.format(value) : numberFormatter.format(value)) : "no data"}`).join("; ");
  if (!isVisible) {
    return <span ref={chartRef} className={`inline-player-trend trend-${definition.className} trend-awaiting-viewport`} role="img" aria-label={`${definition.label} trend for ${playerName}: ${summary}`}><i /></span>;
  }
  return (
    <span ref={chartRef} className={`inline-player-trend trend-${definition.className}`} role="img" aria-label={`${definition.label} trend for ${playerName}: ${summary}`}>
      {slots.map(({ game, value }, index) => {
        const emptySlot = !game;
        const missing = !Number.isFinite(value);
        const displayValue = missing ? "—" : definition.decimals ? decimalFormatter.format(value) : numberFormatter.format(value);
        const height = missing ? 0 : value <= 0 ? 2 : Math.max(4, Math.min(22, (Math.max(0, value) / scale) * 22));
        const gameLabel = emptySlot ? "No earlier recorded game" : `Week ${game.week}: ${missing ? "no data" : `${displayValue} ${definition.unit}`}${game.opponent ? ` vs ${game.opponent}` : ""}`;
        return (
          <span className={`trend-bar-item${missing ? " missing" : ""}${emptySlot ? " empty-slot" : ""}`} key={game?.gameId ?? game?.game_id ?? `${game?.week ?? "empty"}-${index}`} title={gameLabel} aria-hidden="true">
            <b>{displayValue}</b>
            {missing ? <i /> : <i style={{ height: `${height}px` }} />}
          </span>
        );
      })}
    </span>
  );
}

function DepthChartCell({ row, depthChart, compact = false }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, above: false });
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const closeTimer = useRef(null);
  const rank = row.current_depth_rank ?? row.depth_rank ?? row.depthRank;
  const depthPosition = row.current_depth_position ?? row.depth_position ?? row.position;
  const rawChartSource = depthChart ?? row.current_depth_chart ?? row.depth_chart ?? row.depthChart;
  const rawChart = rawChartSource?.players ?? rawChartSource;
  const chart = (Array.isArray(rawChart) ? rawChart : [])
    .filter((player) => !depthPosition || !player.depthPosition || player.depthPosition === depthPosition)
    .sort((a, b) => (Number(a.depthRank ?? a.depth_rank) || 99) - (Number(b.depthRank ?? b.depth_rank) || 99));
  const hasDepthData = !((rank === null || rank === undefined || rank === "") && !chart.length);
  const playerName = row.player_display_name || row.name || "Player";
  const team = row.current_depth_team ?? row.team ?? "Team";
  const tooltipId = `depth-${String(row.player_id || playerName).replace(/[^a-z0-9_-]/gi, "-")}`;
  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const positionPopover = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const above = rect.bottom + 224 > window.innerHeight && rect.top > 224;
    setPosition({
      top: above ? rect.top - 7 : rect.bottom + 7,
      left: Math.max(120, Math.min(window.innerWidth - 120, rect.left + rect.width / 2)),
      above,
    });
  };
  const openPopover = () => {
    cancelClose();
    positionPopover();
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 100);
  };
  useEffect(() => {
    if (!open) return undefined;
    const reposition = () => positionPopover();
    const dismiss = (event) => {
      if (!triggerRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  if (!hasDepthData) {
    return <span className="depth-chart-empty" title="Current depth-chart data is not available">—</span>;
  }
  const popover = open ? (
    <span
      ref={popoverRef}
      className="player-depth-chart-popover"
      id={tooltipId}
      role="tooltip"
      style={{ top: `${position.top}px`, left: `${position.left}px`, transform: `translate(-50%, ${position.above ? "-100%" : "0"})` }}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <strong>{team} {depthPosition} depth chart</strong>
      {chart.length ? (
        <span className="player-depth-chart-list">
          {chart.map((player, index) => {
            const playerRank = player.depthRank ?? player.depth_rank ?? index + 1;
            const name = player.name ?? player.player_display_name ?? "Unknown player";
            const selected = player.selected || player.playerId === row.player_id || player.player_id === row.player_id;
            return <span key={player.playerId ?? player.player_id ?? `${name}-${playerRank}`} className={selected ? "selected" : ""}><b>{playerRank}</b><span>{name}</span>{player.rosterStatus ? <small>{player.rosterStatus}</small> : null}</span>;
          })}
        </span>
      ) : <em>Depth-chart lineup is not available.</em>}
    </span>
  ) : null;
  return (
    <span className="depth-chart-cell-wrap" onMouseEnter={openPopover} onMouseLeave={scheduleClose}>
      <button ref={triggerRef} type="button" className={`depth-rank-trigger${compact ? " compact" : ""}`} aria-controls={tooltipId} aria-describedby={open ? tooltipId : undefined} aria-expanded={open} aria-label={`${playerName} is ${depthPosition || "position"} ${rank ?? "unranked"} on the ${team} depth chart`} onFocus={openPopover} onBlur={scheduleClose} onClick={() => { if (!open) openPopover(); }}>
        {compact ? <><b>D</b><small>{rank ?? "—"}</small></> : rank ?? "—"}
      </button>
      {popover ? createPortal(popover, document.body) : null}
    </span>
  );
}

function autoFitPlayerWidth(column, rows) {
  if (column.key === "select") return column.minWidth;
  if (column.group === "trends" || column.metric) return column.minWidth;
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

function Checkbox({ checked, mixed = false, label, onChange, disabled = false }) {
  return (
    <label className={`check-control${disabled ? " disabled" : ""}`} aria-label={label}>
      <input type="checkbox" checked={checked} aria-checked={mixed ? "mixed" : checked} onChange={onChange} disabled={disabled} />
      <span className={`checkbox-visual${mixed ? " mixed" : ""}`} aria-hidden="true">
        {mixed ? <Minus weight="bold" /> : checked ? <Check weight="bold" /> : null}
      </span>
    </label>
  );
}

function CustomColumnsPanel({
  open,
  hiddenColumns,
  collapsedGroups,
  showDraftMetrics,
  showYahooMetrics,
  showPlayerTrends,
  smartCompact,
  autoFit,
  trendGameCount,
  onClose,
  onSetHiddenColumns,
  onSetCollapsedGroups,
  onSetGroupGate,
  onSetSmartCompact,
  onSetAutoFit,
  onSetTrendGameCount,
  onReset,
}) {
  const drawerRef = useRef(null);
  const hiddenSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);
  const collapsedSet = useMemo(() => new Set(collapsedGroups), [collapsedGroups]);
  const groupGate = useCallback((groupKey) => {
    if (groupKey === "draft") return showDraftMetrics;
    if (groupKey === "yahoo") return showYahooMetrics;
    if (groupKey === "trends") return showPlayerTrends;
    return true;
  }, [showDraftMetrics, showYahooMetrics, showPlayerTrends]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => drawerRef.current?.focus());
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const setGroupVisible = (group, visible) => {
    const gated = ["draft", "yahoo", "trends"].includes(group.key);
    onSetGroupGate(group.key, visible);
    onSetCollapsedGroups((current) => current.filter((key) => key !== group.key));
    if (gated && !visible) return;
    onSetHiddenColumns((current) => {
      const next = new Set(current);
      group.columns.forEach((column) => {
        if (visible || REQUIRED_PLAYER_COLUMNS.has(column.key)) next.delete(column.key);
        else next.add(column.key);
      });
      return [...next];
    });
  };

  const setColumnVisible = (group, column, visible) => {
    if (REQUIRED_PLAYER_COLUMNS.has(column.key)) return;
    if (visible) onSetGroupGate(group.key, true);
    onSetHiddenColumns((current) => {
      const next = new Set(current);
      if (visible) next.delete(column.key);
      else next.add(column.key);
      return [...next];
    });
  };

  const applyPreset = (preset) => {
    const visibleKeys = new Set(preset.columns || PLAYER_TABLE_GROUPS
      .filter((group) => preset.groups.includes(group.key))
      .flatMap((group) => group.columns.map((column) => column.key)));
    REQUIRED_PLAYER_COLUMNS.forEach((key) => visibleKeys.add(key));
    onSetHiddenColumns(PLAYER_TABLE_COLUMNS.filter((column) => !visibleKeys.has(column.key)).map((column) => column.key));
    onSetCollapsedGroups([]);
    PLAYER_TABLE_GROUPS.forEach((group) => onSetGroupGate(group.key, group.columns.some((column) => visibleKeys.has(column.key))));
  };

  const panel = (
    <div className="column-settings-layer">
      <button type="button" className="column-settings-backdrop" aria-label="Close Custom Columns" onClick={onClose} />
      <aside ref={drawerRef} className="column-settings-drawer" role="dialog" aria-modal="true" aria-labelledby="custom-columns-title" tabIndex="-1">
        <header>
          <div><Columns weight="duotone" aria-hidden="true" /><span><small>View settings</small><h2 id="custom-columns-title">Custom Columns</h2></span></div>
          <button type="button" className="column-settings-close" onClick={onClose} aria-label="Close Custom Columns"><X weight="bold" /></button>
        </header>

        <section className="column-settings-presets" aria-labelledby="column-presets-title">
          <div className="column-settings-section-heading"><span><Sparkle weight="fill" aria-hidden="true" /><b id="column-presets-title">Quick views</b></span><small>Replaces the current layout</small></div>
          <div>{PLAYER_VIEW_PRESETS.map((preset) => <button type="button" key={preset.key} onClick={() => applyPreset(preset)}>{preset.name}</button>)}</div>
        </section>

        <section className="column-settings-behavior" aria-labelledby="view-behavior-title">
          <div className="column-settings-section-heading"><span><SlidersHorizontal aria-hidden="true" /><b id="view-behavior-title">View behavior</b></span></div>
          <label><span><b>Smart Compact</b><small>Auto-pack the table when two or more sections are hidden or collapsed.</small></span><input type="checkbox" checked={smartCompact} onChange={(event) => onSetSmartCompact(event.target.checked)} /></label>
          <label><span><b>Auto Fit</b><small>Fit visible columns to the values currently displayed.</small></span><input type="checkbox" checked={autoFit} onChange={(event) => onSetAutoFit(event.target.checked)} /></label>
          <label className="trend-game-count-setting"><span><b>Trend games</b><small>Choose how many played regular-season games appear in every inline chart.</small></span><select value={trendGameCount} onChange={(event) => onSetTrendGameCount(Number(event.target.value))}>{[3, 5, 6, 8, 10].map((count) => <option value={count} key={count}>{count} games</option>)}</select></label>
        </section>

        <div className="column-settings-groups" aria-label="Available column groups">
          {PLAYER_TABLE_GROUPS.map((group) => {
            const gateVisible = groupGate(group.key);
            const visibleCount = gateVisible ? group.columns.filter((column) => !hiddenSet.has(column.key)).length : 0;
            const allVisible = visibleCount === group.columns.length;
            const mixed = visibleCount > 0 && !allVisible;
            const collapsed = collapsedSet.has(group.key);
            return (
              <section className={`column-settings-group${collapsed ? " collapsed" : ""}`} key={group.key}>
                <header>
                  <span><Checkbox checked={allVisible} mixed={mixed} label={`${allVisible ? "Hide" : "Show"} all ${group.name} columns`} onChange={() => setGroupVisible(group, !allVisible)} /><b>{group.name}</b><small>{visibleCount}/{group.columns.length}</small></span>
                  {group.key !== "player" ? <button type="button" className={collapsed ? "active" : ""} disabled={!gateVisible || visibleCount === 0} aria-pressed={collapsed} onClick={() => onSetCollapsedGroups((current) => collapsed ? current.filter((key) => key !== group.key) : [...new Set([...current, group.key])])}>{collapsed ? "Restore" : "Collapse"}</button> : <em>Required</em>}
                </header>
                <div>
                  {group.columns.map((column) => {
                    const required = REQUIRED_PLAYER_COLUMNS.has(column.key);
                    const visible = gateVisible && !hiddenSet.has(column.key);
                    return <div className="column-settings-column" key={column.key}><Checkbox checked={visible} label={`${visible ? "Hide" : "Show"} ${column.label || "selection"} column`} disabled={required} onChange={() => setColumnVisible(group, column, !visible)} /><span><b>{column.label || "Player selection"}</b>{required ? <small>Always shown</small> : null}</span></div>;
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <footer><button type="button" className="column-settings-reset" onClick={onReset}><ArrowCounterClockwise aria-hidden="true" />Reset default</button><button type="button" className="column-settings-done" onClick={onClose}>Done</button></footer>
      </aside>
    </div>
  );
  return createPortal(panel, document.body);
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
  const [showPlayerTrends, setShowPlayerTrends] = useState(initialTablePreferences.showPlayerTrends);
  const [autoFitPlayerTable, setAutoFitPlayerTable] = useState(initialTablePreferences.autoFit);
  const [smartCompactPlayerTable, setSmartCompactPlayerTable] = useState(initialTablePreferences.smartCompact);
  const [trendGameCount, setTrendGameCount] = useState(initialTablePreferences.trendGameCount);
  const [hiddenPlayerColumns, setHiddenPlayerColumns] = useState(initialTablePreferences.hiddenColumns);
  const [collapsedPlayerGroups, setCollapsedPlayerGroups] = useState(initialTablePreferences.collapsedGroups);
  const [sectionResizeEnabled, setSectionResizeEnabled] = useState(false);
  const [customColumnsOpen, setCustomColumnsOpen] = useState(false);
  const [collapsedSectionsOpen, setCollapsedSectionsOpen] = useState(false);
  const [playerColumnWidths, setPlayerColumnWidths] = useState(initialTablePreferences.columnWidths);
  const tableScroller = useRef(null);
  const profileOpener = useRef(null);
  const customColumnsOpener = useRef(null);

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
      version: 2,
      showDraftMetrics,
      showYahooMetrics,
      showPlayerTrends,
      autoFit: autoFitPlayerTable,
      smartCompact: smartCompactPlayerTable,
      trendGameCount,
      hiddenColumns: hiddenPlayerColumns,
      collapsedGroups: collapsedPlayerGroups,
      columnWidths: playerColumnWidths,
    }));
  }, [showDraftMetrics, showYahooMetrics, showPlayerTrends, autoFitPlayerTable, smartCompactPlayerTable, trendGameCount, hiddenPlayerColumns, collapsedPlayerGroups, playerColumnWidths]);

  const setPlayerGroupGate = useCallback((groupKey, visible) => {
    if (groupKey === "draft") setShowDraftMetrics(visible);
    else if (groupKey === "yahoo") setShowYahooMetrics(visible);
    else if (groupKey === "trends") setShowPlayerTrends(visible);
  }, []);

  const togglePlayerGroupFromToolbar = useCallback((groupKey, visible) => {
    const nextVisible = !visible;
    if (nextVisible) {
      const group = PLAYER_TABLE_GROUPS.find((item) => item.key === groupKey);
      setHiddenPlayerColumns((current) => {
        const hidden = new Set(current);
        if (!group || !group.columns.every((column) => hidden.has(column.key))) return current;
        return current.filter((key) => !group.columns.some((column) => column.key === key));
      });
    }
    setPlayerGroupGate(groupKey, nextVisible);
  }, [setPlayerGroupGate]);

  const resetPlayerView = useCallback(() => {
    setShowDraftMetrics(true);
    setShowYahooMetrics(false);
    setShowPlayerTrends(true);
    setAutoFitPlayerTable(false);
    setSmartCompactPlayerTable(true);
    setTrendGameCount(10);
    setHiddenPlayerColumns(["snap_pct"]);
    setCollapsedPlayerGroups([]);
    setPlayerColumnWidths(Object.fromEntries(PLAYER_TABLE_COLUMNS.map((column) => [column.key, column.defaultWidth])));
  }, []);

  const closeCustomColumns = useCallback(() => {
    setCustomColumnsOpen(false);
    window.requestAnimationFrame(() => customColumnsOpener.current?.focus());
  }, []);

  const resizePlayerColumn = useCallback((key, nextWidth) => {
    const width = clampPlayerTableWidth(key, nextWidth);
    if (width === null) return;
    setAutoFitPlayerTable(false);
    setPlayerColumnWidths((current) => current[key] === width ? current : { ...current, [key]: width });
  }, []);

  const isPlayerGroupEnabled = useCallback((groupKey) => {
    if (groupKey === "draft") return showDraftMetrics;
    if (groupKey === "yahoo") return showYahooMetrics;
    if (groupKey === "trends") return showPlayerTrends;
    return true;
  }, [showDraftMetrics, showYahooMetrics, showPlayerTrends]);
  const hiddenPlayerColumnSet = useMemo(() => new Set(hiddenPlayerColumns), [hiddenPlayerColumns]);
  const collapsedPlayerGroupSet = useMemo(() => new Set(collapsedPlayerGroups), [collapsedPlayerGroups]);
  const playerColumnGroupByKey = useMemo(() => new Map(PLAYER_TABLE_COLUMNS.map((column) => [column.key, column.group])), []);
  const availablePlayerSegments = useMemo(() => PLAYER_TABLE_SEGMENTS
    .filter((segment) => isPlayerGroupEnabled(segment.groupKey))
    .map((segment) => ({
      ...segment,
      columns: segment.columns.filter((column) => {
        if (hiddenPlayerColumnSet.has(column.key)) return false;
        const parentKey = TREND_PARENT_COLUMNS[column.key];
        if (!parentKey) return true;
        const parentGroup = playerColumnGroupByKey.get(parentKey);
        return !hiddenPlayerColumnSet.has(parentKey)
          && !collapsedPlayerGroupSet.has(parentGroup)
          && isPlayerGroupEnabled(parentGroup);
      }),
    }))
    .filter((segment) => segment.columns.length > 0), [isPlayerGroupEnabled, hiddenPlayerColumnSet, collapsedPlayerGroupSet, playerColumnGroupByKey]);

  const fullyHiddenPlayerGroups = useMemo(() => PLAYER_TABLE_GROUPS
    .filter((group) => group.key !== "player" && (!isPlayerGroupEnabled(group.key)
      || group.columns.every((column) => hiddenPlayerColumnSet.has(column.key))))
    .map((group) => group.key), [isPlayerGroupEnabled, hiddenPlayerColumnSet]);
  const smartCompactActive = smartCompactPlayerTable
    && new Set([...fullyHiddenPlayerGroups, ...collapsedPlayerGroups]).size >= 2;

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
    const columns = availablePlayerSegments
      .filter((segment) => !collapsedPlayerGroups.includes(segment.groupKey))
      .flatMap((segment) => segment.columns);
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
  }, [autoFitPlayerTable, availablePlayerSegments, collapsedPlayerGroups, rows]);

  const visiblePlayerGroups = useMemo(() => {
    const renderedExpandedGroups = new Set();
    return availablePlayerSegments.flatMap((segment) => {
      const groupKey = segment.groupKey;
      if (collapsedPlayerGroupSet.has(groupKey)) return [];
      const controlsGroup = segment.controlsGroup === true || !renderedExpandedGroups.has(groupKey);
      renderedExpandedGroups.add(groupKey);
      return [{
        ...segment,
        controlsGroup,
        collapsed: false,
        compactLabelHidden: smartCompactActive && segment.controlsGroup !== true,
        columns: segment.columns.map((column) => ({
          ...column,
          group: groupKey,
          width: smartCompactActive ? autoFitPlayerWidth(column, rows) : playerColumnWidths[column.key],
        })),
      }];
    });
  }, [availablePlayerSegments, collapsedPlayerGroupSet, playerColumnWidths, smartCompactActive, rows]);
  const restorableCollapsedGroups = useMemo(() => collapsedPlayerGroups
    .map((groupKey) => PLAYER_TABLE_GROUPS.find((group) => group.key === groupKey))
    .filter((group) => group && isPlayerGroupEnabled(group.key)
      && group.columns.some((column) => !hiddenPlayerColumnSet.has(column.key))), [collapsedPlayerGroups, isPlayerGroupEnabled, hiddenPlayerColumnSet]);
  const visiblePlayerColumns = useMemo(() => visiblePlayerGroups.flatMap((group) => group.columns), [visiblePlayerGroups]);
  const playerTableWidth = useMemo(() => visiblePlayerColumns.reduce(
    (total, column) => total + column.width, 0,
  ), [visiblePlayerColumns]);
  const playerGroupEndKeys = useMemo(() => new Set(visiblePlayerGroups.map((group) => group.columns.at(-1).key)), [visiblePlayerGroups]);
  const playerTableStyle = useMemo(() => {
    const visibleKeys = new Set(visiblePlayerColumns.map((column) => column.key));
    const selectWidth = visibleKeys.has("select") ? playerColumnWidths.select : 0;
    const rankWidth = visibleKeys.has("rank") ? playerColumnWidths.rank : 0;
    return {
      width: `${playerTableWidth}px`,
      minWidth: `${playerTableWidth}px`,
      "--sticky-rank-left": `${selectWidth}px`,
      "--sticky-name-left": `${selectWidth + rankWidth}px`,
    };
  }, [playerTableWidth, playerColumnWidths, visiblePlayerColumns]);

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
      includeTrends: showPlayerTrends ? "1" : "0",
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
  }, [currentPage, scoring, debouncedSearch, sorts, customEnabled, appliedRanks, position, team, selectedWeeks, minGames, minSnaps, showPlayerTrends]);

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
              onClick={() => togglePlayerGroupFromToolbar("draft", showDraftMetrics)}
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
              onClick={() => togglePlayerGroupFromToolbar("yahoo", showYahooMetrics)}
              title="Show or hide Yahoo league ownership and transaction-trend fields"
            >
              {showYahooMetrics ? <Eye weight="bold" aria-hidden="true" /> : <EyeSlash weight="bold" aria-hidden="true" />}
              <span>{showYahooMetrics ? "Shown" : "Hidden"}</span>
            </button>
          </div>
          <div className="draft-toggle-field player-trends-toggle-field">
            <span className="field-label">Player Trends</span>
            <button
              type="button"
              className={showPlayerTrends ? "active" : ""}
              aria-pressed={showPlayerTrends}
              aria-label={showPlayerTrends ? "Hide player trends" : "Show player trends"}
              onClick={() => togglePlayerGroupFromToolbar("trends", showPlayerTrends)}
              title={`Show or hide each player's last ${trendGameCount} played regular-season games`}
            >
              {showPlayerTrends ? <Eye weight="bold" aria-hidden="true" /> : <EyeSlash weight="bold" aria-hidden="true" />}
              <span>{showPlayerTrends ? "Shown" : "Hidden"}</span>
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

        <div className="player-table-tools" aria-label="Player table view controls">
          <button
            ref={customColumnsOpener}
            type="button"
            className={customColumnsOpen ? "active" : ""}
            aria-haspopup="dialog"
            aria-expanded={customColumnsOpen}
            onClick={() => setCustomColumnsOpen(true)}
            title="Choose columns, section visibility, trend range, and compact behavior"
          >
            <Columns weight="duotone" aria-hidden="true" />
            <span>Custom Columns</span>
          </button>
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
          {restorableCollapsedGroups.length === 1 ? (
            <button type="button" className="collapsed-section-restore" onClick={() => togglePlayerGroup(restorableCollapsedGroups[0].key)}>
              <Plus weight="bold" aria-hidden="true" />Restore {restorableCollapsedGroups[0].name}
            </button>
          ) : restorableCollapsedGroups.length > 1 ? (
            <div className="collapsed-sections-menu">
              <button type="button" className="collapsed-section-restore" aria-expanded={collapsedSectionsOpen} onClick={() => setCollapsedSectionsOpen((current) => !current)}>
                <Plus weight="bold" aria-hidden="true" />{restorableCollapsedGroups.length} collapsed sections<CaretDown weight="bold" aria-hidden="true" />
              </button>
              {collapsedSectionsOpen ? <div role="menu" aria-label="Restore collapsed table sections">
                {restorableCollapsedGroups.map((group) => <button type="button" role="menuitem" key={group.key} onClick={() => togglePlayerGroup(group.key)}>Restore {group.name}</button>)}
                <button type="button" role="menuitem" className="restore-all" onClick={() => { setCollapsedPlayerGroups([]); setCollapsedSectionsOpen(false); }}>Restore all</button>
              </div> : null}
            </div>
          ) : null}
          <span>{filterSummary} · All matching</span>
        </header>
        <div className="table-scroller" ref={tableScroller} onScroll={onHorizontalScroll} tabIndex="0" aria-label="Scrollable player statistics table">
          <table style={playerTableStyle} className={smartCompactActive ? "smart-compact" : ""}>
            <caption>2025 NFL player fantasy statistics. {filterSummary}. {responseMeta?.totalCount ?? 0} matching players.</caption>
            <colgroup>{visiblePlayerColumns.map((column) => <col key={column.key} data-column={column.key} style={{ width: `${column.width}px` }} />)}</colgroup>
            <thead>
              <tr className="group-row">
                {visiblePlayerGroups.map((group) => {
                  const sourceGroup = PLAYER_TABLE_GROUPS.find((item) => item.key === group.groupKey);
                  const groupWidth = sourceGroup.columns.reduce((total, column) => total + playerColumnWidths[column.key], 0);
                  const groupLabel = group.shortName || ((autoFitPlayerTable || smartCompactActive) ? (COMPACT_GROUP_NAMES[group.groupKey] || group.name) : group.name);
                  return (
                    <th key={group.key} colSpan={group.columns.length} scope="colgroup" className={`group-${group.groupKey}${group.controlsGroup ? "" : " passive-group-segment"}${group.compactLabelHidden ? " compact-label-hidden" : ""}`}>
                      <span title={group.name}>{groupLabel}</span>
                      {group.controlsGroup ? <PlayerGroupResizeHandle group={sourceGroup} width={groupWidth} enabled={sectionResizeEnabled} onResize={resizePlayerGroup} onReset={resetPlayerGroup} /> : null}
                    </th>
                  );
                })}
              </tr>
              <tr className="column-row">
                {visiblePlayerColumns.map((column) => {
                  const normalizedSortKey = column.key === "rank" ? "fantasy_points" : column.key;
                  const sortIndex = sorts.findIndex((item) => item.key === normalizedSortKey);
                  const activeSort = sortIndex >= 0;
                  const activeDirection = activeSort ? sorts[sortIndex].direction : undefined;
                  if (column.key === "select") {
                    return <th key={column.key} className="identity sticky-select"><Checkbox checked={allVisibleSelected} mixed={someVisibleSelected} label="Select all visible players" onChange={toggleAll} /><PlayerColumnResizeHandle column={column} width={playerColumnWidths[column.key]} onResize={resizePlayerColumn} /></th>;
                  }
                  return (
                    <th key={column.key} className={`${column.group === "dfs" ? "dfs-head " : ""}${column.group === "draft" ? "draft-head " : ""}${column.key === "rank" ? "identity sticky-rank " : ""}${column.key === "name" ? "identity sticky-name " : ""}${playerGroupEndKeys.has(column.key) ? "group-end" : ""}`} aria-sort={activeSort ? (activeDirection === "asc" ? "ascending" : "descending") : "none"}>
                      {column.sortable === false ? <span>{column.group === "trends" ? `Last ${trendGameCount}` : column.label}</span> : <button onClick={(event) => handleSort(column.key, event.shiftKey)} title="Click to cycle sort; Shift-click adds a secondary sort"><span>{column.label}</span><SortIcon active={activeSort} direction={activeDirection} priority={sortIndex} /></button>}
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
                    if (column.key === "select") return <td key={column.key} className="identity sticky-select"><Checkbox checked={selected.has(row.player_id)} label={`Select ${row.player_display_name}`} onChange={() => toggleRow(row.player_id)} /></td>;
                    const field = column.field || column.key;
                    const value = column.key === "draft_kings_price" || column.key === "draft_kings_projection" ? null : row[field];
                    const className = `${column.align === "center" ? "center " : ""}${column.key === "rank" ? "identity sticky-rank " : ""}${column.key === "name" ? "identity sticky-name player-name " : ""}${column.key === "team" ? "team-cell " : ""}${column.key === "position" ? "position-cell " : ""}${column.group === "draft" ? "draft-metric " : ""}${column.group === "yahoo" ? "yahoo-metric " : ""}${column.key === "fantasy_points" ? "fantasy-cell " : ""}${playerGroupEndKeys.has(column.key) ? "group-end" : ""}`;
                    if (column.key === "name") {
                      return <td key={column.key} title={row.player_display_name} className={className}><span className="player-name-cell-content"><button type="button" className="player-name-button" onClick={(event) => openProfile(row, event.currentTarget)}>{row.player_display_name}</button><DepthChartCell row={row} depthChart={responseMeta?.depthCharts?.[row.current_depth_key]} compact /></span></td>;
                    }
                    if (column.key === "upcoming_matchup") {
                      const matchupLines = splitUpcomingMatchup(value);
                      const content = matchupLines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>);
                      return <td key={column.key} className={`${className} upcoming-matchup-cell`}>{row.upcoming_game_url ? <a href={row.upcoming_game_url} target="_blank" rel="noreferrer" aria-label={value || "No upcoming matchup"}>{content}</a> : <span className="upcoming-matchup-copy">{content}</span>}</td>;
                    }
                    if (column.group === "trends") {
                      return <td key={column.key} className={`${className} player-trend-cell`}><InlinePlayerTrend row={row} metric={column.metric} gameCount={trendGameCount} /></td>;
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
      <CustomColumnsPanel
        open={customColumnsOpen}
        hiddenColumns={hiddenPlayerColumns}
        collapsedGroups={collapsedPlayerGroups}
        showDraftMetrics={showDraftMetrics}
        showYahooMetrics={showYahooMetrics}
        showPlayerTrends={showPlayerTrends}
        smartCompact={smartCompactPlayerTable}
        autoFit={autoFitPlayerTable}
        trendGameCount={trendGameCount}
        onClose={closeCustomColumns}
        onSetHiddenColumns={setHiddenPlayerColumns}
        onSetCollapsedGroups={setCollapsedPlayerGroups}
        onSetGroupGate={setPlayerGroupGate}
        onSetSmartCompact={setSmartCompactPlayerTable}
        onSetAutoFit={setAutoFitPlayerTable}
        onSetTrendGameCount={setTrendGameCount}
        onReset={resetPlayerView}
      />
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
