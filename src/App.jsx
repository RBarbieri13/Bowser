import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaretDown, CaretUp, Check, Info, MagnifyingGlass, Minus, Plus, SlidersHorizontal, X,
} from "@phosphor-icons/react";


const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const GROUPS = [
  {
    name: "Player Details",
    key: "player",
    columns: [
      { key: "select", label: "", width: 52, align: "center", sortable: false },
      { key: "rank", label: "Rank", width: 60, align: "center" },
      { key: "name", field: "player_display_name", label: "Name", width: 139, align: "left" },
      { key: "team", label: "Team", width: 69, align: "center" },
      { key: "position", label: "POS", width: 64, align: "center" },
      { key: "games_played", label: "GP", width: 60, align: "center" },
      { key: "snaps", label: "Snaps", width: 80 },
      { key: "snap_pct", label: "Snap %", width: 74, format: "percent" },
    ],
  },
  {
    name: "Passing",
    key: "passing",
    columns: [
      { key: "passing_attempts", label: "ATT", width: 50 },
      { key: "completions", label: "CMP", width: 57 },
      { key: "completion_pct", label: "CMP %", width: 62, format: "percent" },
      { key: "passing_yards", label: "YDS", width: 63 },
      { key: "passing_yards_per_game", label: "YDS/G", width: 65, format: "decimal" },
      { key: "passing_yards_per_attempt", label: "Y/A", width: 48, format: "decimal" },
      { key: "passing_tds", label: "TD", width: 42 },
      { key: "interceptions", label: "INT", width: 49 },
    ],
  },
  {
    name: "Rushing",
    key: "rushing",
    columns: [
      { key: "carries", label: "ATT", width: 50 },
      { key: "rushing_yards", label: "YDS", width: 56 },
      { key: "rushing_yards_per_game", label: "YDS/G", width: 59, format: "decimal" },
      { key: "rushing_yards_per_attempt", label: "Y/A", width: 43, format: "decimal" },
      { key: "rushing_tds", label: "TD", width: 40 },
    ],
  },
  {
    name: "Receiving",
    key: "receiving",
    columns: [
      { key: "targets", label: "TGT", width: 53 },
      { key: "receptions", label: "REC", width: 52 },
      { key: "reception_pct", label: "REC %", width: 62, format: "percent" },
      { key: "receiving_yards", label: "YDS", width: 57 },
      { key: "receiving_yards_per_game", label: "YDS/G", width: 58, format: "decimal" },
      { key: "receiving_yards_per_reception", label: "Y/R", width: 42, format: "decimal" },
      { key: "receiving_tds", label: "TD", width: 36 },
    ],
  },
  {
    name: "DFS",
    key: "dfs",
    columns: [
      { key: "draft_kings_price", label: "DraftKings Price", width: 90, align: "center", sortable: false },
      { key: "fantasy_points_per_game", label: "Fantasy Points", width: 90, format: "decimal" },
    ],
  },
];

const COLUMNS = GROUPS.flatMap((group) => group.columns.map((column) => ({ ...column, group: group.key })));

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
  if (typeof value === "number" || /^-?\d+(\.\d+)?$/.test(String(value))) return numberFormatter.format(Number(value));
  return String(value).replaceAll(",", "/");
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

function SelectField({ label, value, onChange, children, info }) {
  return (
    <label className="field">
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

export function App() {
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [responseMeta, setResponseMeta] = useState(null);
  const [seasonType, setSeasonType] = useState("REG");
  const [position, setPosition] = useState("ALL");
  const [scoring, setScoring] = useState("ppr");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 180);
  const [topEnabled, setTopEnabled] = useState(true);
  const [limit, setLimit] = useState("10");
  const [customEnabled, setCustomEnabled] = useState(false);
  const [customRanks, setCustomRanks] = useState("");
  const [appliedRanks, setAppliedRanks] = useState("");
  const [customError, setCustomError] = useState("");
  const [weeks, setWeeks] = useState("");
  const [team, setTeam] = useState("ALL");
  const [minGames, setMinGames] = useState("0");
  const [minSnaps, setMinSnaps] = useState("0");
  const [moreOpen, setMoreOpen] = useState(false);
  const [sorts, setSorts] = useState([{ key: "fantasy_points_per_game", direction: "desc" }]);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSwipeHint, setShowSwipeHint] = useState(() => localStorage.getItem("stats-scroll-hint-dismissed") !== "1");
  const tableScroller = useRef(null);

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
    const controller = new AbortController();
    const querySorts = sorts.length ? sorts : [{ key: "name", direction: "asc" }];
    const params = new URLSearchParams({
      seasonType,
      scoring,
      search: debouncedSearch,
      sort: querySorts.map((item) => item.key).join(","),
      direction: querySorts.map((item) => item.direction).join(","),
      limit: topEnabled ? limit : "all",
      minGames,
      minSnaps,
    });
    if (position !== "ALL") params.set("positions", position);
    if (team !== "ALL") params.set("teams", team);
    if (weeks.trim()) params.set("weeks", weeks.trim());
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
  }, [seasonType, scoring, debouncedSearch, sorts, topEnabled, limit, customEnabled, appliedRanks, position, team, weeks, minGames, minSnaps]);

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
    const normalized = key === "rank" ? "fantasy_points_per_game" : key;
    const defaultDirection = ["name", "team", "position"].includes(normalized) ? "asc" : "desc";
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
    const parts = [seasonType === "REG" ? "Regular season" : seasonType === "POST" ? "Postseason" : "Full season", scoring.toUpperCase()];
    if (position !== "ALL") parts.push(position);
    if (weeks) parts.push(`Weeks ${weeks}`);
    return parts.join(" · ");
  }, [seasonType, scoring, position, weeks]);

  const onHorizontalScroll = () => {
    if (tableScroller.current?.scrollLeft > 16 && showSwipeHint) {
      setShowSwipeHint(false);
      localStorage.setItem("stats-scroll-hint-dismissed", "1");
    }
  };

  return (
    <main className="app-shell">
      <section className="filter-band" aria-label="Statistics filters">
        <div className="filter-grid">
          <SelectField label="Season" value="2025" onChange={() => {}} info="NFL season used for this table.">
            <option value="2025">2025</option>
          </SelectField>
          <SelectField label="Week(s)" value={seasonType} onChange={(event) => { setSeasonType(event.target.value); setWeeks(""); }}>
            <option value="REG">Regular</option>
            <option value="POST">Postseason</option>
            <option value="ALL">Full Season</option>
          </SelectField>
          <SelectField label="Position(s)" value={position} onChange={(event) => setPosition(event.target.value)}>
            <option value="ALL">All</option>
            {(meta?.positions || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </SelectField>
          <SelectField label="Scoring System" value={scoring} onChange={(event) => setScoring(event.target.value)}>
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
        </div>
        <div className="view-tabs" role="tablist" aria-label="Statistic views">
          <button className="active" role="tab" aria-selected="true">Player</button>
          <button role="tab" aria-disabled="true" title="Coming soon" disabled>Offense</button>
          <button role="tab" aria-disabled="true" title="Coming soon" disabled>Defense</button>
        </div>
        {moreOpen ? (
          <div className="more-popover" id="more-filters">
            <div className="popover-heading"><SlidersHorizontal aria-hidden="true" /><span>More filters</span><button onClick={() => setMoreOpen(false)} aria-label="Close more filters"><X /></button></div>
            <label>Team<select value={team} onChange={(event) => setTeam(event.target.value)}><option value="ALL">All teams</option>{(meta?.teams || []).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>NFL weeks<input type="text" value={weeks} onChange={(event) => setWeeks(event.target.value)} placeholder="e.g. 1, 3, 7" /></label>
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

        <div className="top-control">
          <Checkbox checked={topEnabled} label="Limit results to top players" onChange={() => setTopEnabled((current) => !current)} />
          <span>SELECT TOP</span>
          <select value={limit} onChange={(event) => setLimit(event.target.value)} aria-label="Number of top players">
            {['10', '25', '50', '100', 'all'].map((value) => <option value={value} key={value}>{value === 'all' ? 'ALL' : value}</option>)}
          </select>
          <CaretDown weight="bold" aria-hidden="true" />
        </div>

        <div className={`custom-control${customError ? " invalid" : ""}`}>
          <Checkbox checked={customEnabled} label="Enable custom rank filter" onChange={() => setCustomEnabled((current) => !current)} />
          <input value={customRanks} onChange={(event) => setCustomRanks(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyCustomRanks(); }} placeholder="Custom (e.g. 1–5, 16, 30)" aria-invalid={Boolean(customError)} aria-describedby="custom-error" />
          <button onClick={applyCustomRanks}>GO</button>
          <span className="custom-error" id="custom-error" aria-live="polite">{customError}</span>
        </div>
      </section>

      <section className="table-panel" aria-label="2025 NFL player fantasy statistics">
        {loading ? <div className="progress" role="progressbar" aria-label="Updating statistics"><span /></div> : null}
        {error ? <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => window.location.reload()}>Retry</button></div> : null}
        {showSwipeHint ? <div className="swipe-hint">Swipe horizontally for more stats <button onClick={() => { setShowSwipeHint(false); localStorage.setItem("stats-scroll-hint-dismissed", "1"); }} aria-label="Dismiss horizontal scroll hint"><X /></button></div> : null}
        <div className="table-scroller" ref={tableScroller} onScroll={onHorizontalScroll} tabIndex="0" aria-label="Scrollable player statistics table">
          <table>
            <caption>2025 NFL player fantasy statistics. {filterSummary}. {responseMeta?.totalCount ?? 0} matching players.</caption>
            <colgroup>{COLUMNS.map((column) => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
            <thead>
              <tr className="group-row">
                {GROUPS.map((group) => <th key={group.key} colSpan={group.columns.length} scope="colgroup" className={`group-${group.key}`}>{group.name}</th>)}
              </tr>
              <tr className="column-row">
                {COLUMNS.map((column) => {
                  const normalizedSortKey = column.key === "rank" ? "fantasy_points_per_game" : column.key;
                  const sortIndex = sorts.findIndex((item) => item.key === normalizedSortKey);
                  const activeSort = sortIndex >= 0;
                  const activeDirection = activeSort ? sorts[sortIndex].direction : undefined;
                  if (column.key === "select") {
                    return <th key={column.key} className="identity sticky-select"><Checkbox checked={allVisibleSelected} mixed={someVisibleSelected} label="Select all visible players" onChange={toggleAll} /></th>;
                  }
                  return (
                    <th key={column.key} className={`${column.group === "dfs" ? "dfs-head " : ""}${column.key === "rank" ? "identity sticky-rank " : ""}${column.key === "name" ? "identity sticky-name " : ""}${column.key === "snap_pct" || column.key === "interceptions" || column.key === "rushing_tds" || column.key === "receiving_tds" ? "group-end" : ""}`} aria-sort={activeSort ? (activeDirection === "asc" ? "ascending" : "descending") : "none"}>
                      {column.sortable === false ? <span>{column.label}</span> : <button onClick={(event) => handleSort(column.key, event.shiftKey)} title="Click to cycle sort; Shift-click adds a secondary sort"><span>{column.label}</span><SortIcon active={activeSort} direction={activeDirection} priority={sortIndex} /></button>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {!loading && !error && rows.length === 0 ? (
                <tr><td className="empty-state" colSpan={COLUMNS.length}><strong>No players match these filters.</strong><button onClick={() => { setSearch(""); setPosition("ALL"); setTeam("ALL"); setWeeks(""); setMinGames("0"); setMinSnaps("0"); setCustomEnabled(false); }}>Clear filters</button></td></tr>
              ) : rows.map((row) => (
                <tr key={row.player_id} className={selected.has(row.player_id) ? "selected" : ""}>
                  {COLUMNS.map((column) => {
                    if (column.key === "select") return <td key={column.key} className="identity sticky-select"><Checkbox checked={selected.has(row.player_id)} label={`Select ${row.player_display_name}`} onChange={() => toggleRow(row.player_id)} /></td>;
                    const field = column.field || column.key;
                    const value = column.key === "draft_kings_price" ? null : row[field];
                    return <td key={column.key} title={column.key === "name" ? row.player_display_name : undefined} className={`${column.align === "center" ? "center " : ""}${column.key === "rank" ? "identity sticky-rank " : ""}${column.key === "name" ? "identity sticky-name player-name " : ""}${column.key === "fantasy_points_per_game" ? "fantasy-cell " : ""}${column.key === "snap_pct" || column.key === "interceptions" || column.key === "rushing_tds" || column.key === "receiving_tds" ? "group-end" : ""}`}>{formatCell(value, column.format)}</td>;
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
        </footer>
      </section>
    </main>
  );
}
