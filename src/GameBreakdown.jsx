import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowsOutLineVertical, CaretDown, Football,
  Gauge, Info, UsersThree,
} from "@phosphor-icons/react";
import { DriveWaterfall } from "./DriveWaterfall.jsx";

const OPPORTUNITY_METRICS = [
  { key: "snaps", label: "Snaps", short: "SNP", color: "#42d392" },
  { key: "rushAttempts", label: "Rush attempts", short: "RSH", color: "#ff6b66" },
  { key: "passAttempts", label: "Pass attempts", short: "PASS", color: "#5ba8ff" },
  { key: "targets", label: "Targets", short: "TGT", color: "#d8ae50" },
];

const PRODUCTION_METRICS = [
  { key: "yards", label: "Yards", short: "YDS", color: "#d8ae50" },
  { key: "touchdowns", label: "Touchdowns", short: "TD", color: "#ff6b66" },
  { key: "receptions", label: "Receptions", short: "REC", color: "#a77cf4" },
  { key: "fantasyPoints", label: "Fantasy points", short: "FPTS", color: "#42d392" },
];

const CONSOLE_STORAGE_KEY = "bowser:game-participation-console:v1";

function safeConsolePreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONSOLE_STORAGE_KEY) || "{}");
    return {
      height: Math.min(720, Math.max(320, Number(parsed.height) || 470)),
      density: parsed.density === "comfortable" ? "comfortable" : "compact",
      mode: parsed.mode === "production" ? "production" : "opportunity",
      scale: parsed.scale === "team-roster" ? "team-roster" : "game-segments",
    };
  } catch {
    return { height: 470, density: "compact", mode: "opportunity", scale: "game-segments" };
  }
}

function formatMetric(key, value) {
  const amount = Number(value || 0);
  return key === "fantasyPoints" ? amount.toFixed(1) : Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

function PlayerAvatar({ player }) {
  const initials = player.playerDisplayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
  return player.headshotUrl
    ? <img src={player.headshotUrl} alt="" loading="lazy" />
    : <span aria-hidden="true">{initials}</span>;
}

function ParticipationConsole({ game, segments = [], players = [], teamSegments = [], onOpenPlayer }) {
  const initial = useMemo(safeConsolePreferences, []);
  const [activeTeam, setActiveTeam] = useState(game.homeTeam);
  const [mode, setMode] = useState(initial.mode);
  const [scale, setScale] = useState(initial.scale);
  const [density, setDensity] = useState(initial.density);
  const [sort, setSort] = useState(initial.mode === "production" ? "yards" : "snaps");
  const [height, setHeight] = useState(initial.height);
  const dragRef = useRef(null);
  const metrics = mode === "opportunity" ? OPPORTUNITY_METRICS : PRODUCTION_METRICS;
  const activePlayers = useMemo(() => players
    .filter((player) => player.team === activeTeam)
    .sort((a, b) => Number(b.total[sort] || 0) - Number(a.total[sort] || 0)), [players, activeTeam, sort]);
  const depthByPlayer = useMemo(() => {
    const counts = {};
    const result = {};
    activePlayers.forEach((player) => {
      counts[player.position] = (counts[player.position] || 0) + 1;
      result[player.playerId] = counts[player.position];
    });
    return result;
  }, [activePlayers]);
  const maxima = useMemo(() => Object.fromEntries(metrics.map((metric) => {
    const values = scale === "team-roster"
      ? activePlayers.map((player) => Number(player.total[metric.key] || 0))
      : activePlayers.flatMap((player) => player.segments.map((segment) => Number(segment[metric.key] || 0)));
    return [metric.key, Math.max(1, ...values)];
  })), [activePlayers, metrics, scale]);
  const totalPlays = teamSegments.filter((row) => row.team === activeTeam).reduce((sum, row) => sum + row.offensivePlays, 0);

  useEffect(() => {
    localStorage.setItem(CONSOLE_STORAGE_KEY, JSON.stringify({ version: 1, height, density, mode, scale }));
  }, [height, density, mode, scale]);

  useEffect(() => {
    if (!metrics.some((metric) => metric.key === sort)) setSort(metrics[0].key);
  }, [metrics, sort]);

  useEffect(() => {
    const move = (event) => {
      if (!dragRef.current) return;
      setHeight(Math.min(720, Math.max(320, dragRef.current.height + event.clientY - dragRef.current.y)));
    };
    const end = () => { dragRef.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
  }, []);

  const resizeByKey = (event) => {
    if (!["ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") setHeight(470);
    else setHeight((current) => Math.min(720, Math.max(320, current + (event.key === "ArrowDown" ? 24 : -24))));
  };

  return (
    <section className={`participation-console ${density}`} style={{ height }} aria-labelledby="participation-title">
      <div
        className="console-resizer"
        role="separator"
        aria-label="Resize player participation section"
        aria-orientation="horizontal"
        aria-valuemin="320"
        aria-valuemax="720"
        aria-valuenow={Math.round(height)}
        tabIndex="0"
        onKeyDown={resizeByKey}
        onPointerDown={(event) => { dragRef.current = { y: event.clientY, height }; event.currentTarget.setPointerCapture?.(event.pointerId); }}
      ><ArrowsOutLineVertical weight="bold" /><span>Participation height: {Math.round(height)}px</span><button type="button" onClick={() => setHeight(470)}>Reset</button></div>
      <div className="console-toolbar">
        <div className="console-title"><span>Multi-KPI player console</span><h2 id="participation-title">Key player participation</h2></div>
        <div className="team-toggle" role="group" aria-label="Participation team">
          {[game.homeTeam, game.awayTeam].map((team) => <button type="button" key={team} className={activeTeam === team ? "active" : ""} onClick={() => setActiveTeam(team)}>{team}</button>)}
        </div>
        <div className="mode-toggle" role="group" aria-label="Participation metric mode">
          <button type="button" className={mode === "opportunity" ? "active" : ""} aria-pressed={mode === "opportunity"} onClick={() => setMode("opportunity")}>Opportunity</button>
          <button type="button" className={mode === "production" ? "active" : ""} aria-pressed={mode === "production"} onClick={() => setMode("production")}>Production</button>
        </div>
        <div className="metric-legend" aria-label={`${mode} metrics`}>
          {metrics.map((metric) => <span key={metric.key}><i style={{ background: metric.color }} />{metric.label}</span>)}
        </div>
        <label className="console-select">Same-metric scale<select aria-label="Participation scaling" value={scale} onChange={(event) => setScale(event.target.value)}><option value="game-segments">Game segments</option><option value="team-roster">Team roster totals</option></select><CaretDown /></label>
        <label className="console-select">Sort by<select aria-label="Sort participation players" value={sort} onChange={(event) => setSort(event.target.value)}>{metrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select><CaretDown /></label>
        <div className="density-toggle" role="group" aria-label="Participation density"><button className={density === "compact" ? "active" : ""} onClick={() => setDensity("compact")}>Compact</button><button className={density === "comfortable" ? "active" : ""} onClick={() => setDensity("comfortable")}>Comfortable</button></div>
      </div>
      <div className="same-metric-note"><Info weight="fill" /> Every bar is compared only with the same KPI across {scale === "game-segments" ? "the selected team’s game segments" : "the selected team’s roster totals"}. Metrics never share a scale.</div>
      <div className="participation-table-wrap">
        <table className="participation-table" aria-label={`${activeTeam} ${mode} by game segment`}>
          <thead><tr><th><span>Player</span><small>{activePlayers.length} selected · scroll for all</small></th>{segments.map((segment) => <th key={segment.segment}><span>{segment.label}</span><small>{segment.phase}</small></th>)}<th><span>Total</span><small>Share of team</small></th></tr></thead>
          <tbody>
            {activePlayers.map((player) => (
              <tr key={player.playerId}>
                <th><button type="button" className="participation-player" onClick={(event) => onOpenPlayer?.({ player_id: player.playerId, player_display_name: player.playerDisplayName }, event.currentTarget)}><span className="participation-avatar"><PlayerAvatar player={player} /></span><span><b>{player.playerDisplayName}</b><small>{player.position} / {depthByPlayer[player.playerId]}</small></span></button></th>
                {segments.map((segmentMeta) => {
                  const values = player.segments.find((item) => item.segment === segmentMeta.segment) || {};
                  return <td key={`${player.playerId}-${segmentMeta.segment}`}><div className="kpi-stack">{metrics.map((metric) => {
                    const value = Number(values[metric.key] || 0);
                    const width = Math.max(value === 0 ? 0 : 3, Math.min(100, value / maxima[metric.key] * 100));
                    return <div className="kpi-lane" key={metric.key} title={`${player.playerDisplayName} · ${segmentMeta.label} · ${metric.label}: ${formatMetric(metric.key, value)}`}><span>{metric.short}</span><i><b style={{ width: `${width}%`, background: metric.color }} /></i><strong style={{ color: metric.color }}>{formatMetric(metric.key, value)}</strong></div>;
                  })}</div></td>;
                })}
                <td><div className="kpi-stack total">{metrics.map((metric) => {
                  const value = Number(player.total[metric.key] || 0);
                  const rosterTotal = activePlayers.reduce((sum, row) => sum + Number(row.total[metric.key] || 0), 0);
                  return <div className="kpi-lane" key={metric.key}><span>{metric.short}</span><i><b style={{ width: `${Math.min(100, rosterTotal ? value / rosterTotal * 100 : 0)}%`, background: metric.color }} /></i><strong style={{ color: metric.color }}>{formatMetric(metric.key, value)}</strong></div>;
                })}</div></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th><span>Team total</span><small>{activeTeam} · {totalPlays} plays</small></th>{segments.map((segmentMeta) => <td key={`total-${segmentMeta.segment}`}><div className="segment-team-total">{metrics.map((metric) => <span key={metric.key} style={{ color: metric.color }}>{formatMetric(metric.key, activePlayers.reduce((sum, player) => sum + Number(player.segments.find((item) => item.segment === segmentMeta.segment)?.[metric.key] || 0), 0))}</span>)}</div></td>)}<td><div className="segment-team-total">{metrics.map((metric) => <span key={metric.key} style={{ color: metric.color }}>{formatMetric(metric.key, activePlayers.reduce((sum, player) => sum + Number(player.total[metric.key] || 0), 0))}</span>)}</div></td></tr></tfoot>
        </table>
      </div>
    </section>
  );
}

export function GameBreakdown({ gameId, scoring = "ppr", onBack, onOpenPlayer }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/game-breakdown?${new URLSearchParams({ gameId, scoring })}`, { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "Game breakdown failed."); return result; })
      .then(setPayload).catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, [gameId, scoring]);
  const data = payload?.data;
  const game = data?.game;
  if (error) return <main className="page-content game-breakdown-page"><button className="game-back" onClick={onBack}><ArrowLeft /> Back to team box scores</button><div className="error-banner" role="alert">{error}</div></main>;
  if (!game) return <main className="page-content game-breakdown-page"><div className="progress" role="progressbar" aria-label="Loading game breakdown"><span /></div></main>;
  return (
    <main className="page-content game-breakdown-page broadcast-game-page">
      <div className="broadcast-toolbar"><button className="game-back" onClick={onBack}><ArrowLeft /> Back to team box scores</button><span><Gauge weight="bold" /> Broadcast analytics timeline</span><small>Week {game.week} · {scoring.toUpperCase()}</small></div>
      <h1 className="sr-only">{game.awayTeam} {game.awayScore} — {game.homeScore} {game.homeTeam}</h1>
      {data.availability.driveWaterfall
        ? <DriveWaterfall drives={data.drives || []} awayTeam={game.awayTeam} homeTeam={game.homeTeam} awayColor="#E58080" homeColor="#3ECF8E" week={game.week} overtime={game.overtime} />
        : <div className="game-unavailable"><Football /> Drive-by-drive play-by-play is unavailable for this matchup.</div>}
      <div className="broadcast-main-analysis">
        {data.availability.playerParticipation
          ? <ParticipationConsole game={game} segments={data.segments || []} players={data.playerSegments || []} teamSegments={data.teamSegments || []} onOpenPlayer={onOpenPlayer} />
          : <div className="game-unavailable"><UsersThree /> Player participation is unavailable for this matchup.</div>}
      </div>
      <footer className="data-status"><span>{payload.meta.methodology.driveWaterfall} {payload.meta.methodology.playerParticipation}</span><a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">Data: nflverse · CC BY 4.0</a></footer>
    </main>
  );
}
