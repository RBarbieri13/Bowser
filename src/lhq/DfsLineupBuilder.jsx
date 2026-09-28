import { useEffect, useMemo, useState } from "react";
import { fmt, stamp } from "./model.js";
import {
  assignPlayer,
  eligibleForSlot,
  createLineup,
  removeSlot,
  sanitizeLineups,
  selectedPlayers,
  snapshotKey,
  validateLineup,
} from "./dfsLineupModel.js";
import "./DfsLineupBuilder.css";

const salary=value=>Number.isFinite(value)?`$${value.toLocaleString('en-US')}`:'—';

function loadSaved(key, meta) {
  try {
    return sanitizeLineups(JSON.parse(localStorage.getItem(key)), meta);
  } catch {
    return [];
  }
}

function saveLineups(key, lineups) {
  try {
    localStorage.setItem(key, JSON.stringify(lineups)); return true;
  } catch { return false; }
}

function playerSearch(row, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.name, row.team, row.position, row.game, row.status].some(value => String(value || "").toLowerCase().includes(q));
}

export function DfsLineupBuilder({ slate = "current", season = 2026, onOpen }) {
  const [captureChoice,setCaptureChoice]=useState({slate:null,id:""});
  const captureId=captureChoice.slate===slate?captureChoice.id:"";
  const [savedOk,setSavedOk]=useState(true),[selectionNotice,setSelectionNotice]=useState("");
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
    const params = new URLSearchParams({ view: "dfs-lineup", dfsSlate: slate || "current", season: String(season), ...(captureId?{captureId}:{}) });
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
  }, [slate, season, captureId]);

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
    if (hydratedKey && hydratedKey === storageKey) setSavedOk(saveLineups(storageKey, lineups));
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
    const preferred=lineup?.slots.find(slot=>slot.id===activeSlot&&eligibleForSlot(player,slot.slot,meta.contest));
    const slot=preferred||lineup?.slots.find(slot=>!slot.playerId&&eligibleForSlot(player,slot.slot,meta.contest));
    if(!slot){setSelectionNotice("Select an eligible slot to replace a player.");return;}
    const nextLineup=assignPlayer(lineup,players,player.id,slot.id,meta);
    if(nextLineup===lineup){setSelectionNotice("This athlete is already in the lineup. Remove the existing entry to change roles.");return;}
    updateLineup(()=>nextLineup);setSelectionNotice("");
    setActiveSlot(selectedPlayers(nextLineup,players).find(slot=>!slot.player)?.id||slot.id);
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

    {meta.availabilityMessage&&<p className="dfs-lineup-source-notice">{meta.availabilityMessage}</p>}
    <label className="dfs-capture-select">Salary capture<select aria-label="Salary capture" value={captureId} onChange={e=>setCaptureChoice({slate,id:e.target.value})}><option value="">Latest verified capture</option>{(meta.captures||[]).map(c=><option key={c.captureId} value={c.captureId}>{stamp(c.capturedAt)} · {c.salaryPlayers} prices</option>)}</select></label>
    <div className="dfs-lineup-tabs" role="tablist" aria-label="Saved lineups">
      {lineups.map(item => <button key={item.id} role="tab" aria-selected={item.id === lineup?.id} onClick={() => { setActiveId(item.id); setActiveSlot(item.slots.find(slot => !slot.playerId)?.id || item.slots[0]?.id || null); }}>{item.name}</button>)}
    </div>

    {lineup && <div className="dfs-lineup-name">
      <label><span>Name</span><input value={lineup.name} onChange={event => updateLineup(item => ({ ...item, name: event.target.value.slice(0, 60), updatedAt: new Date().toISOString() }))} /></label>
      <button className="dfs-lineup-mini" disabled={lineups.length <= 1} onClick={deleteCurrent}>Delete</button>
    </div>}

    <div className="dfs-lineup-save-state" role="status">{savedOk?"Saved on this device · exact slate & capture":"Device storage unavailable — changes are not saved."}</div>
    <div className="dfs-lineup-totals">
      <b>{salary(validation.salary)}</b><span>salary used</span>
      <b className={validation.remainingSalary < 0 ? "bad" : ""}>{validation.remainingSalary < 0 ? "-" : ""}{salary(Math.abs(validation.remainingSalary))}</b>
      <span>remaining</span>
      <b>{validation.projectionComplete ? fmt(validation.projection, 2) : `${fmt(validation.projection, 2)}*`}</b>
      <span>{validation.projectionComplete ? "projected" : "partial projection"}</span>
    </div>

    <div className="dfs-lineup-slots">
      {decoratedSlots.map(slot => <div key={slot.id} className="dfs-lineup-slot-row"><button className={activeSlot === slot.id ? "active" : ""} onClick={() => setActiveSlot(slot.id)}>
        <b>{slot.slot}</b>
        {slot.player ? <span><strong>{slot.player.name}</strong><small>{slot.player.team || "--"} / {salary(slot.player.salary)} / {fmt(slot.player.projection, 1)} FPTS</small></span> : <span><strong>Open slot</strong><small>Select from the pool below</small></span>}
      </button>{slot.player&&<button className="dfs-lineup-remove" aria-label={`Remove ${slot.player.name}`} onClick={()=>updateLineup(item=>removeSlot(item,slot.id))}>×</button>}</div>)}
    </div>

    <div className="dfs-lineup-validation" aria-live="polite">{selectionNotice&&<p>{selectionNotice}</p>}
      {validation.errors.length ? validation.errors.map(message => <p key={message} className="dfs-lineup-error">{message}</p>) : <p>{validation.complete ? "Lineup filled" : `${validation.filled}/${decoratedSlots.length} slots filled`} / {meta.rules}</p>}
      {!validation.projectionComplete && <p>*Partial total: open slots or players without a sourced projection remain.</p>}
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
