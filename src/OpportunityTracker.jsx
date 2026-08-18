import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, CaretDown, ChartBar, FirstAid,
  Gauge, Info, Lightning, ShieldCheck, UsersThree,
} from "@phosphor-icons/react";
import { TeamLogo } from "./teamLogos.jsx";

const POSITION_LABELS = { QB: "Quarterbacks", RB: "Running backs", WR: "Wide receivers", TE: "Tight ends" };
const METRIC_LABELS = { passAttempts: "Pass att", carries: "Carries", targets: "Targets" };

function metricValue(game, metric) {
  const value = Number(game?.[metric] || 0);
  return Number.isFinite(value) ? value : 0;
}

function MiniBars({ history, metric, label, tone }) {
  const values = history.map((game) => metricValue(game, metric));
  const maximum = Math.max(1, ...values);
  const slots = [...Array(Math.max(0, 10 - history.length)).fill(null), ...history];
  const summary = history.length
    ? `${label}: ${history.map((game) => `${game.team} Week ${game.week}, ${metricValue(game, metric)}`).join("; ")}`
    : `${label}: no recorded 2025 games`;
  return (
    <figure className={`opportunity-spark ${tone}`} aria-label={summary}>
      <figcaption>{label}</figcaption>
      <div className="opportunity-spark-bars" aria-hidden="true">
        {slots.map((game, index) => {
          if (!game) return <i key={`empty-${index}`} className="empty" />;
          const value = metricValue(game, metric);
          return (
            <i
              key={`${game.gameId || game.week}-${index}`}
              style={{ "--bar-height": `${Math.max(value > 0 ? 8 : 2, value / maximum * 100)}%` }}
              title={`${game.team} W${game.week} ${game.opponent ? `vs ${game.opponent}` : ""}: ${value} ${label.toLowerCase()}`}
            />
          );
        })}
      </div>
      <strong>{history.length ? values.at(-1) : "—"}</strong>
    </figure>
  );
}

function PlayerPortrait({ player }) {
  if (player.headshotUrl) return <img src={player.headshotUrl} alt="" loading="lazy" />;
  return <span aria-hidden="true">{player.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>;
}

function TrendBadge({ trend }) {
  const Icon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : ArrowRight;
  return <span className={`opportunity-trend ${trend.direction}`}><Icon weight="bold" aria-hidden="true" />{trend.label}</span>;
}

function PlayerRow({ player, onOpenPlayer }) {
  const opportunityLabel = METRIC_LABELS[player.opportunityMetric] || "Opportunity";
  return (
    <article className={`opportunity-player-row${player.hasNFLHistory ? "" : " no-history"}`}>
      <div className="opportunity-player-identity">
        <div className="opportunity-player-photo"><PlayerPortrait player={player} /></div>
        <div>
          <span className="opportunity-depth">{player.depthRank ? `${player.depthPosition || player.position} ${player.depthRank}` : "Rostered"}</span>
          {player.hasNFLHistory ? (
            <button type="button" onClick={(event) => onOpenPlayer?.({ player_id: player.playerId, player_display_name: player.name }, event.currentTarget)}>{player.name}</button>
          ) : <strong>{player.name}</strong>}
          <small>{player.rookie ? "2026 rookie" : `${player.yearsExperience ?? "—"} yrs exp`} · {player.rosterStatusLabel}</small>
        </div>
      </div>
      <div className="opportunity-player-context">
        <TrendBadge trend={player.trend} />
        {player.rookie && !player.hasNFLHistory ? <span className="opportunity-rookie-note"><Lightning weight="fill" />Awaiting NFL debut</span> : null}
      </div>
      <div className="opportunity-player-charts">
        <MiniBars history={player.history} metric="snaps" label="Snaps" tone="snaps" />
        <MiniBars history={player.history} metric={player.opportunityMetric} label={opportunityLabel} tone="volume" />
        <MiniBars history={player.history} metric="fantasyPoints" label="PPR pts" tone="points" />
      </div>
      <dl className="opportunity-player-averages">
        <div><dt>Last 3 snaps</dt><dd>{player.averages.snaps ?? "—"}</dd></div>
        <div><dt>{opportunityLabel}</dt><dd>{player.averages.opportunity ?? "—"}</dd></div>
        <div><dt>PPR</dt><dd>{player.averages.fantasyPoints ?? "—"}</dd></div>
      </dl>
    </article>
  );
}

function PositionGroup({ group, onOpenPlayer }) {
  return (
    <section className={`opportunity-position-card position-${group.position.toLowerCase()}`} aria-labelledby={`opportunity-${group.position}`}>
      <header>
        <div><span>{group.position}</span><div><h2 id={`opportunity-${group.position}`}>{POSITION_LABELS[group.position]}</h2><p>Official depth rank · recent opportunity order</p></div></div>
        <strong>{group.players.length} players</strong>
      </header>
      <div className="opportunity-position-columns" aria-hidden="true"><span>Player / status</span><span>Trend & context</span><span>Last 10 recorded games</span><span>Last 3 avg</span></div>
      <div className="opportunity-position-roster">
        {group.players.map((player) => <PlayerRow key={`${player.team}-${player.playerId}`} player={player} onOpenPlayer={onOpenPlayer} />)}
      </div>
    </section>
  );
}

export function OpportunityTracker({ meta, onOpenPlayer }) {
  const teams = meta?.teams || [];
  const [team, setTeam] = useState("NYG");
  const [position, setPosition] = useState("ALL");
  const [rosterFilter, setRosterFilter] = useState("ALL");
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/v1/opportunity-tracker?${new URLSearchParams({ team, games: "10" })}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "The opportunity query failed.");
        return result;
      })
      .then(setPayload)
      .catch((requestError) => { if (requestError.name !== "AbortError") setError(requestError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [team]);

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

  return (
    <main className="page-content opportunity-tracker-page">
      <section className="opportunity-hero" aria-labelledby="opportunity-title">
        <div className="opportunity-title-block">
          <span className="page-eyebrow"><Gauge weight="bold" /> Team participation</span>
          <h1 id="opportunity-title">Opportunity Tracker</h1>
          <p>See the full fantasy-position depth chart, who is earning playing time, and how each player’s opportunity is changing.</p>
        </div>
        <div className="opportunity-team-lockup"><TeamLogo team={team} decorative /><div><span>2026 roster</span><strong>{team}</strong><small>2025 game history</small></div></div>
      </section>

      <section className="opportunity-controls" aria-label="Opportunity tracker filters">
        <label><span>Team</span><div className="opportunity-select"><select value={team} onChange={(event) => setTeam(event.target.value)}>{teams.map((item) => <option key={item} value={item}>{item}</option>)}</select><CaretDown weight="bold" /></div></label>
        <div className="opportunity-segmented" role="group" aria-label="Position group">
          <span>Position</span><div>{["ALL", "QB", "RB", "WR", "TE"].map((item) => <button type="button" className={position === item ? "active" : ""} onClick={() => setPosition(item)} key={item}>{item === "ALL" ? "All" : item}</button>)}</div>
        </div>
        <label><span>Roster view</span><div className="opportunity-select"><select value={rosterFilter} onChange={(event) => setRosterFilter(event.target.value)}><option value="ALL">Full roster</option><option value="ACTIVE">Active roster</option><option value="ROOKIES">2026 rookies</option><option value="NO_HISTORY">No NFL history</option></select><CaretDown weight="bold" /></div></label>
        <div className="opportunity-source-note"><Info weight="fill" /><span><strong>10-game window</strong>Bars compare each metric only with itself across that player’s recorded games.</span></div>
      </section>

      {trackerMeta ? (
        <section className="opportunity-summary" aria-label="Team opportunity summary">
          <article><UsersThree weight="duotone" /><div><strong>{trackerMeta.playerCount}</strong><span>Fantasy-position players</span></div></article>
          <article><ShieldCheck weight="duotone" /><div><strong>{trackerMeta.playersWithHistory}</strong><span>With 2025 game history</span></div></article>
          <article><Lightning weight="duotone" /><div><strong>{trackerMeta.rookies}</strong><span>2026 rookies</span></div></article>
          <article className="news-status"><FirstAid weight="duotone" /><div><strong>Roster status live</strong><span>{trackerMeta.injuryNewsMessage}</span></div></article>
        </section>
      ) : null}

      {error ? <div className="opportunity-state error" role="alert"><strong>Opportunity data unavailable</strong><span>{error}</span></div> : null}
      {loading ? <div className="opportunity-state"><ChartBar className="spin" /><strong>Building the team opportunity grid…</strong></div> : null}
      {!loading && !error ? <div className="opportunity-grid">{visibleGroups.map((group) => <PositionGroup key={group.position} group={group} onOpenPlayer={onOpenPlayer} />)}</div> : null}
      {!loading && !error && !visibleGroups.length ? <div className="opportunity-state"><strong>No players match this view.</strong><button type="button" onClick={() => { setPosition("ALL"); setRosterFilter("ALL"); }}>Show full roster</button></div> : null}

      {trackerMeta ? <footer className="data-status"><span><strong>Depth chart:</strong> official nflverse snapshot {trackerMeta.depthUpdatedAt ? new Date(trackerMeta.depthUpdatedAt).toLocaleDateString() : "unavailable"}</span><span>{trackerMeta.ordering}</span><span>{trackerMeta.queryMs} ms query</span><a href={trackerMeta.source.url} target="_blank" rel="noreferrer">Data: nflverse · {trackerMeta.source.license}</a></footer> : null}
    </main>
  );
}
