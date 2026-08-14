import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock, Football, TrendUp } from "@phosphor-icons/react";

const POSITIONS = ["QB", "RB", "WR", "TE"];

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function clockLabel(seconds) {
  const minute = Math.floor(Number(seconds || 0) / 60);
  return `${minute}'`;
}

function TeamSummary({ team }) {
  return (
    <article className={`game-team-summary ${team.result === "W" ? "is-win" : team.result === "L" ? "is-loss" : "is-tie"}`}>
      <div><strong>{team.team}</strong><span>{team.result} · {team.pointsFor}-{team.pointsAgainst}</span></div>
      <dl>
        <div><dt>Pass</dt><dd>{team.passPlays} · {pct(team.passPct)}</dd></div>
        <div><dt>Run</dt><dd>{team.rushPlays} · {pct(team.rushPct)}</dd></div>
        <div><dt>Off. snaps</dt><dd>{team.offensiveSnaps}</dd></div>
        <div><dt>Time leading</dt><dd>{pct(team.pctTimeLeading)}</dd></div>
        <div><dt>Time trailing</dt><dd>{pct(team.pctTimeTrailing)}</dd></div>
      </dl>
    </article>
  );
}

function GameFlow({ game, timeline }) {
  const maxSeconds = Math.max(3600, ...timeline.map((event) => Number(event.elapsed_seconds || 0)));
  const chartEvents = timeline.slice(1).filter((event, index, events) => {
    const next = events[index + 1];
    return !next || Number(next.elapsed_seconds || 0) - Number(event.elapsed_seconds || 0) > 90;
  });
  return (
    <section className="game-flow-panel" aria-labelledby="game-flow-title">
      <div className="game-section-heading"><div><span className="page-eyebrow"><TrendUp weight="bold" /> Game flow</span><h2 id="game-flow-title">Score over time</h2></div><span>Scoring events · regulation + overtime</span></div>
      <div className="game-flow-chart" role="img" aria-label={`${game.awayTeam} versus ${game.homeTeam} score progression`}>
        <div className="flow-axis"><span>Kickoff</span><span>Q2</span><span>Half</span><span>Q4</span><span>Final</span></div>
        <div className="flow-track">
          {chartEvents.map((event) => (
            <div className={`flow-event ${event.leader}`} key={`${event.sequence}-${event.elapsed_seconds}`} style={{ left: `${Math.min(100, Number(event.elapsed_seconds || 0) / maxSeconds * 100)}%` }} title={event.description}>
              <span>{event.away_score}-{event.home_score}</span><small>{clockLabel(event.elapsed_seconds)}</small>
            </div>
          ))}
        </div>
      </div>
      <ol className="flow-event-list" aria-label="Scoring timeline">
        {timeline.slice(1).map((event) => <li key={`list-${event.sequence}`}><time>Q{event.quarter} {event.clock}</time><strong>{event.away_score}-{event.home_score}</strong><span>{event.description}</span></li>)}
      </ol>
    </section>
  );
}

function TeamBox({ team, rows, onOpenPlayer }) {
  const filtered = rows.filter((row) => row.team === team);
  return (
    <section className="game-player-box" aria-labelledby={`game-team-${team}`}>
      <h2 id={`game-team-${team}`}>{team} fantasy box score</h2>
      <div className="game-player-table-wrap">
        <table>
          <thead><tr><th>Pos</th><th>Player</th><th>FPTS</th></tr></thead>
          <tbody>{POSITIONS.flatMap((position) => filtered.filter((row) => row.position_group === position).map((row) => (
            <tr key={`${team}-${row.player_id}`}><td>{position}</td><th><button type="button" onClick={(event) => onOpenPlayer?.(row, event.currentTarget)}>{row.player_display_name}</button></th><td className={Number(row.fantasy_points) >= 10 ? "fpts-high" : Number(row.fantasy_points) <= 1 ? "fpts-low" : ""}>{Number(row.fantasy_points).toFixed(1)}</td></tr>
          )))}</tbody>
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
  const awayWon = Number(game?.awayScore) > Number(game?.homeScore);
  const homeWon = Number(game?.homeScore) > Number(game?.awayScore);
  const date = useMemo(() => game?.gameday ? new Date(`${game.gameday}T${game.gametime || "12:00"}:00-04:00`).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "", [game]);
  if (error) return <main className="page-content game-breakdown-page"><button className="game-back" onClick={onBack}><ArrowLeft /> Back to team box scores</button><div className="error-banner" role="alert">{error}</div></main>;
  if (!game) return <main className="page-content game-breakdown-page"><div className="progress" role="progressbar" aria-label="Loading game breakdown"><span /></div></main>;
  return (
    <main className="page-content game-breakdown-page">
      <button className="game-back" onClick={onBack}><ArrowLeft /> Back to team box scores</button>
      <header className="game-hero">
        <div><span>Week {game.week} · {game.seasonType === "POST" ? "Postseason" : "Regular season"}</span><h1>{game.awayTeam} <strong className={awayWon ? "is-winning" : ""}>{game.awayScore}</strong><i>—</i><strong className={homeWon ? "is-winning" : ""}>{game.homeScore}</strong> {game.homeTeam}</h1><p><Clock weight="bold" /> {date} · {game.stadium || "Venue unavailable"}</p></div>
        <div className="game-final"><Football weight="fill" /><span>{game.overtime ? "Final/OT" : "Final"}</span></div>
      </header>
      <section className="quarter-score-panel"><h2>Score by quarter</h2><table><thead><tr><th>Team</th>{data.quarterScores.map((q) => <th key={q.quarter}>Q{q.quarter}</th>)}<th>Final</th></tr></thead><tbody><tr><th>{game.awayTeam}</th>{data.quarterScores.map((q) => <td key={`a-${q.quarter}`}>{q.away_points}</td>)}<td className={awayWon ? "is-winning" : ""}>{game.awayScore}</td></tr><tr><th>{game.homeTeam}</th>{data.quarterScores.map((q) => <td key={`h-${q.quarter}`}>{q.home_points}</td>)}<td className={homeWon ? "is-winning" : ""}>{game.homeScore}</td></tr></tbody></table></section>
      <section className="game-summary-grid">{data.teams.map((team) => <TeamSummary key={team.team} team={team} />)}<article className="game-total-snaps"><span>Combined offensive snaps</span><strong>{data.totalOffensiveSnaps}</strong><small>Rush + pass scrimmage plays</small></article></section>
      {data.availability.scoringTimeline ? <GameFlow game={game} timeline={data.timeline} /> : <div className="game-unavailable">Game-flow timeline unavailable for this matchup.</div>}
      <div className="game-box-grid"><TeamBox team={game.awayTeam} rows={data.boxScore} onOpenPlayer={onOpenPlayer} /><TeamBox team={game.homeTeam} rows={data.boxScore} onOpenPlayer={onOpenPlayer} /></div>
      <footer className="data-status"><span>{payload.meta.methodology.playMix}</span><a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">Data: nflverse · CC BY 4.0</a></footer>
    </main>
  );
}
