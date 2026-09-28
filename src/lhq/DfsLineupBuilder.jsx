import { useEffect, useMemo, useState } from "react";
import { fmt, salary, stamp } from "./model.js";
import {
  assignPlayer,
  createLineup,
  removeSlot,
  sanitizeLineups,
  selectedPlayers,
  snapshotKey,
  validateLineup,
} from "./dfsLineupModel.js";
import "./DfsLineupBuilder.css";

function loadSaved(key, meta) {
  try {
    return sanitizeLineups(JSON.parse(localStorage.getItem(key)), meta);
  } catch {
    return [];
  }
}

function saveLineups(key, lineups) {
  try {
    localStorage.setItem(key, JSON.stringify(lineups));
  } catch {}
}

function playerSearch(row, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.name, row.team, row.position, row.game, row.status].some(value => String(value || "").toLowerCase().includes(q));
}

export function DfsLineupBuilder({ slate = "current", season = 2026, onOpen }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lineups, setLineups] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [activeSlot, setActiveSlot] = useState(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("All");
  const [hydratedKey, setHydratedKey] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ view: "dfs-lineup", dfsSlate: slate || "current", season: String(season) });
    setLoading(true);
    setError("");
    fetch(`/api/v1/meta?${params}`, { signal: controller.signal, credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error?.message || `DFS lineup request failed (${response.status})`);
        return data;
      })
      .then(data => {
        if (!controller.signal.aborted) setPayload(data);
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setPayload(null);
          setError(err.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slate, season]);

  const meta = payload?.meta || {};
  const players = payload?.data || [];
  const storageKey = payload ? snapshotKey(meta) : "";

  useEffect(() => {
    if (!payload || !storageKey) return;
    const saved = loadSaved(storageKey, meta);
    const initial = saved.length ? saved : [createLineup(meta, "Lineup 1")];
    setLineups(initial);
    setActiveId(initial[0]?.id || "");
    setActiveSlot(initial[0]?.slots.find(slot => !slot.playerId)?.id || initial[0]?.slots[0]?.id || null);
    setHydratedKey(storageKey);
  }, [payload?.meta?.captureIdentity, storageKey]);

  useEffect(() => {
    if (hydratedKey && hydratedKey === storageKey) saveLineups(storageKey, lineups);
  }, [hydratedKey, storageKey, lineups]);

  const lineup = lineups.find(item => item.id === activeId) || lineups[0] || null;
  const decoratedSlots = useMemo(() => selectedPlayers(lineup, players), [lineup, players]);
  const validation = useMemo(() => validateLineup(lineup, players, meta), [lineup, players, meta]);
  const visiblePlayers = useMemo(() => players
    .filter(row => position === "All" || row.position === position || row.rosterPosition === position)
    .filter(row => playerSearch(row, search))
    .sort((a, b) => (Number.isFinite(b.projection) ? b.projection : -1) - (Number.isFinite(a.projection) ? a.projection : -1)
      || (b.salary ?? -1) - (a.salary ?? -1)
      || a.name.localeCompare(b.name)), [players, position, search]);

  const updateLineup = transform => setLineups(items => items.map(item => item.id === lineup?.id ? transform(item) : item));
  const choosePlayer = player => {
    updateLineup(item => assignPlayer(item, players, player.id, activeSlot, meta));
    const next = selectedPlayers(assignPlayer(lineup, players, player.id, activeSlot, meta), players).find(slot => !slot.player)?.id;
    setActiveSlot(next || activeSlot);
  };
  const createNew = () => {
    const next = createLineup(meta, `Lineup ${lineups.length + 1}`);
    setLineups(items => [...items, next]);
    setActiveId(next.id);
    setActiveSlot(next.slots[0]?.id || null);
  };
  const deleteCurrent = () => {
    if (lineups.length <= 1) return;
    const remaining = lineups.filter(item => item.id !== lineup.id);
    setLineups(remaining);
    setActiveId(remaining[0]?.id || "");
    setActiveSlot(remaining[0]?.slots[0]?.id || null);
  };

  if (loading) return <aside className="dfs-lineup-builder" aria-label="DraftKings lineup builder"><p role="status">Loading DraftKings lineup pool...</p></aside>;
  if (error) return <aside className="dfs-lineup-builder" aria-label="DraftKings lineup builder"><p role="alert" className="dfs-lineup-error">{error}</p></aside>;
  if (!payload) return null;

  return <aside className="dfs-lineup-builder" aria-label="DraftKings lineup builder">
    <header className="dfs-lineup-header">
      <div>
        <span>{meta.contest === "showdown" ? "Showdown Builder" : "Classic Builder"}</span>
        <strong>{meta.label || "DraftKings lineup"}</strong>
        <small>{meta.season} W{meta.week} / {stamp(meta.capturedAt)} / {meta.records?.salaryPlayers ?? players.length} DK rows</small>
      </div>
      <button className="dfs-lineup-mini" onClick={createNew}>New</button>
    </header>

    <div className="dfs-lineup-tabs" role="tablist" aria-label="Saved lineups">
      {lineups.map(item => <button key={item.id} role="tab" aria-selected={item.id === lineup?.id} onClick={() => { setActiveId(item.id); setActiveSlot(item.slots.find(slot => !slot.playerId)?.id || item.slots[0]?.id || null); }}>{item.name}</button>)}
    </div>

    {lineup && <div className="dfs-lineup-name">
      <label><span>Name</span><input value={lineup.name} onChange={event => updateLineup(item => ({ ...item, name: event.target.value.slice(0, 60), updatedAt: new Date().toISOString() }))} /></label>
      <button className="dfs-lineup-mini" disabled={lineups.length <= 1} onClick={deleteCurrent}>Delete</button>
    </div>}

    <div className="dfs-lineup-totals">
      <b className={validation.remainingSalary < 0 ? "bad" : ""}>{validation.remainingSalary < 0 ? "-" : ""}{salary(Math.abs(validation.remainingSalary))}</b>
      <span>remaining</span>
      <b>{validation.projectionComplete ? fmt(validation.projection, 2) : `${fmt(validation.projection, 2)}*`}</b>
      <span>{validation.projectionComplete ? "projected" : "partial projection"}</span>
    </div>

    <div className="dfs-lineup-slots">
      {decoratedSlots.map(slot => <button key={slot.id} className={activeSlot === slot.id ? "active" : ""} onClick={() => setActiveSlot(slot.id)}>
        <b>{slot.slot}</b>
        {slot.player ? <span><strong>{slot.player.name}</strong><small>{slot.player.team || "--"} / {salary(slot.player.salary)} / {fmt(slot.player.projection, 1)} FPTS</small></span> : <span><strong>Open slot</strong><small>Select from the pool below</small></span>}
        {slot.player && <em aria-label={`Remove ${slot.player.name}`} onClick={event => { event.stopPropagation(); updateLineup(item => removeSlot(item, slot.id)); }}>x</em>}
      </button>)}
    </div>

    <div className="dfs-lineup-validation" aria-live="polite">
      {validation.errors.length ? validation.errors.map(message => <p key={message} className="dfs-lineup-error">{message}</p>) : <p>{validation.complete ? "Lineup filled" : `${validation.filled}/${decoratedSlots.length} slots filled`} / {meta.rules}</p>}
      {!validation.projectionComplete && <p>*Projection total is incomplete because at least one selected player has no sourced projection.</p>}
    </div>

    <div className="dfs-lineup-filters">
      <input aria-label="Search lineup pool" placeholder="Search players, team, game" value={search} onChange={event => setSearch(event.target.value)} />
      <select aria-label="Filter lineup pool position" value={position} onChange={event => setPosition(event.target.value)}>
        <option>All</option>
        {(meta.contest === "showdown" ? ["CPT", "FLEX", ...(meta.positions || [])] : (meta.positions || [])).map(pos => <option key={pos}>{pos}</option>)}
      </select>
    </div>

    <div className="dfs-lineup-pool" role="list" aria-label="DraftKings player pool">
      {visiblePlayers.map(player => <div role="listitem" key={player.id} className={!Number.isFinite(player.projection) ? "incomplete" : ""}>
        <button className="dfs-lineup-player" disabled={!player.playerId || !onOpen} onClick={event => onOpen?.(player, event.currentTarget)}>{player.name}</button>
        <small>{player.position}{player.rosterPosition && player.rosterPosition !== player.position ? ` / ${player.rosterPosition}` : ""} / {player.team || "--"} / {player.status || "OK"}</small>
        <b>{salary(player.salary)}</b>
        <span>{fmt(player.projection, 1)} FPTS</span>
        <button className="dfs-lineup-add" onClick={() => choosePlayer(player)}>Add</button>
        <small className="dfs-lineup-source">{player.projectionSource || player.projectionUnavailableReason || "Projection unavailable"}{meta.contest === "showdown" && player.rosterPosition === "CPT" ? " / CPT 1.5x" : ""}</small>
      </div>)}
    </div>
  </aside>;
}
