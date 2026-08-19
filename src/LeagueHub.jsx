import { useMemo, useState } from "react";
import {
  ArrowsLeftRight,
  CalendarCheck,
  CaretDown,
  CheckCircle,
  ClipboardText,
  GearSix,
  Heartbeat,
  Lightning,
  MagnifyingGlass,
  ShieldCheck,
  Sparkle,
  Target,
  TrendUp,
  Trophy,
  UsersFour,
  WarningCircle,
  WifiSlash,
} from "@phosphor-icons/react";

const LEAGUES = [
  { id: "loeg", name: "LOEG", shortName: "LOEG", teamName: "Team name needed", color: "#3ecf8e" },
  { id: "loongi", name: "Loongi League", shortName: "LOONGI", teamName: "Team name needed", color: "#6ea8e5" },
  { id: "college", name: "College Football Fantasy", shortName: "CFF", teamName: "Team name needed", color: "#d9b45a" },
  { id: "league-4", name: "League 4", shortName: "L4", teamName: "League identity needed", color: "#b284e8", placeholder: true },
];

const WORKSPACES = ["Overview", "Lineups", "Waivers", "Trades", "Exposure"];

const ACTIONS = [
  { icon: CalendarCheck, label: "Set every lineup", detail: "Starters, flex spots, game-time status", tone: "accent" },
  { icon: MagnifyingGlass, label: "Scan the waiver wire", detail: "Availability and FAAB differ by league", tone: "blue" },
  { icon: ArrowsLeftRight, label: "Review trades", detail: "Compare value against each league format", tone: "gold" },
  { icon: Heartbeat, label: "Resolve injury risk", detail: "Late status, backups, and contingency plans", tone: "red" },
];

function ConnectionBadge() {
  return <span className="league-connection-badge"><WifiSlash weight="bold" /> Yahoo setup required</span>;
}

function EmptyModule({ icon: Icon, title, children }) {
  return (
    <div className="league-empty-module">
      <Icon weight="duotone" aria-hidden="true" />
      <div><strong>{title}</strong><span>{children}</span></div>
    </div>
  );
}

function LeagueCard({ league, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`league-switch-card${selected ? " selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
      style={{ "--league-color": league.color }}
    >
      <span className="league-monogram">{league.shortName}</span>
      <span className="league-switch-copy">
        <small>{league.placeholder ? "Unconfigured league" : "Yahoo Fantasy · 2026"}</small>
        <strong>{league.name}</strong>
        <em>{league.teamName}</em>
      </span>
      <span className="league-status-dot" aria-label="Not connected" />
    </button>
  );
}

export function LeagueHub() {
  const [activeLeague, setActiveLeague] = useState("all");
  const [workspace, setWorkspace] = useState("Overview");
  const currentLeague = useMemo(() => LEAGUES.find((league) => league.id === activeLeague), [activeLeague]);
  const scopeLabel = currentLeague?.name || "All four leagues";

  return (
    <main className="league-hub-page">
      <section className="league-hub-hero">
        <div>
          <span className="page-eyebrow"><Trophy weight="duotone" /> Multi-league command center</span>
          <h1>League Hub</h1>
          <p>One control dashboard for lineups, waivers, trades, injuries, standings, and player exposure across every Yahoo team.</p>
        </div>
        <div className="league-hub-connection">
          <div><span>Yahoo connection</span><strong>0 of 4 leagues</strong><small>Live league data is not connected yet</small></div>
          <ConnectionBadge />
        </div>
      </section>

      <section className="league-hub-toolbar" aria-label="League Hub controls">
        <label>
          <span>League scope</span>
          <div className="league-hub-select">
            <select value={activeLeague} onChange={(event) => setActiveLeague(event.target.value)} aria-label="League scope">
              <option value="all">All four leagues</option>
              {LEAGUES.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
            </select>
            <CaretDown weight="bold" aria-hidden="true" />
          </div>
        </label>
        <label>
          <span>Season</span>
          <div className="league-hub-select"><select aria-label="League season" defaultValue="2026"><option>2026</option></select><CaretDown weight="bold" /></div>
        </label>
        <div className="league-hub-view-tabs" role="group" aria-label="League Hub workspace">
          {WORKSPACES.map((item) => <button type="button" key={item} className={workspace === item ? "active" : ""} aria-pressed={workspace === item} onClick={() => setWorkspace(item)}>{item}</button>)}
        </div>
        <button type="button" className="league-connect-button" disabled title="Yahoo OAuth application credentials are required before connection can begin">
          <GearSix weight="bold" /> Connect Yahoo
        </button>
      </section>

      <section className="league-switcher" aria-label="Your four fantasy leagues">
        {LEAGUES.map((league) => <LeagueCard key={league.id} league={league} selected={activeLeague === league.id} onSelect={() => setActiveLeague((current) => current === league.id ? "all" : league.id)} />)}
      </section>

      <div className="league-hub-context-line">
        <span><ShieldCheck weight="bold" /> {scopeLabel}</span>
        <strong>{workspace}</strong>
        <small>Modules will populate after the first Yahoo sync.</small>
      </div>

      <section className="league-hub-grid">
        <article className="league-panel league-action-panel">
          <header><div><Lightning weight="duotone" /><span><small>Weekly command queue</small><h2>Decisions that need attention</h2></span></div><b>4 workflows</b></header>
          <div className="league-action-list">
            {ACTIONS.map(({ icon: Icon, label, detail, tone }) => (
              <div className={`league-action-row ${tone}`} key={label}>
                <span><Icon weight="duotone" /></span><div><strong>{label}</strong><small>{detail}</small></div><em>Awaiting sync</em>
              </div>
            ))}
          </div>
        </article>

        <article className="league-panel league-matchup-panel">
          <header><div><CalendarCheck weight="duotone" /><span><small>This week</small><h2>Matchup board</h2></span></div><b>All leagues</b></header>
          <EmptyModule icon={Trophy} title="Matchups will appear here">Opponent, projected score, live result, win probability, and lineup completion for each team.</EmptyModule>
          <div className="league-placeholder-rows" aria-hidden="true"><i /><i /><i /><i /></div>
        </article>

        <article className="league-panel league-roster-panel">
          <header><div><UsersFour weight="duotone" /><span><small>Roster control</small><h2>Team health matrix</h2></span></div><b>4 teams</b></header>
          <div className="league-health-head"><span>League</span><span>Lineup</span><span>Injuries</span><span>Byes</span><span>Open spots</span></div>
          {LEAGUES.map((league) => (
            <div className="league-health-row" key={league.id}>
              <span style={{ "--league-color": league.color }}><i />{league.shortName}</span><span>—</span><span>—</span><span>—</span><span>—</span>
            </div>
          ))}
        </article>

        <article className="league-panel league-waiver-panel">
          <header><div><Target weight="duotone" /><span><small>Available talent</small><h2>Waiver radar</h2></span></div><b>Cross-league</b></header>
          <EmptyModule icon={MagnifyingGlass} title="A different waiver pool in every league">Rank free agents by need, projected opportunity, roster percentage, and the leagues where each player is available.</EmptyModule>
          <div className="league-tool-chips"><span>Availability map</span><span>FAAB planner</span><span>Claims queue</span></div>
        </article>

        <article className="league-panel league-trade-panel">
          <header><div><ArrowsLeftRight weight="duotone" /><span><small>Roster improvement</small><h2>Trade center</h2></span></div><b>Inbox + finder</b></header>
          <EmptyModule icon={ArrowsLeftRight} title="Evaluate offers in league context">See incoming offers, surplus and need by position, trade partners, and value adjusted to each scoring format.</EmptyModule>
          <div className="league-tool-chips"><span>Offer inbox</span><span>Trade finder</span><span>Value delta</span></div>
        </article>

        <article className="league-panel league-exposure-panel">
          <header><div><TrendUp weight="duotone" /><span><small>Portfolio view</small><h2>Player exposure</h2></span></div><b>Across 4 teams</b></header>
          <EmptyModule icon={Sparkle} title="Know where outcomes overlap">Track repeated players, opponent conflicts, bye-week concentration, injury concentration, and start/sit disagreements.</EmptyModule>
          <div className="league-tool-chips"><span>Shared players</span><span>Bye conflicts</span><span>Risk concentration</span></div>
        </article>

        <article className="league-panel league-standings-panel">
          <header><div><Trophy weight="duotone" /><span><small>Season position</small><h2>Standings snapshot</h2></span></div><b>Records + playoffs</b></header>
          <EmptyModule icon={ClipboardText} title="Four seasons at a glance">Record, points for, rank, playoff odds, waiver priority, FAAB balance, and schedule difficulty.</EmptyModule>
        </article>

        <article className="league-panel league-setup-panel">
          <header><div><WarningCircle weight="duotone" /><span><small>Connection checklist</small><h2>Information needed from you</h2></span></div><b>Setup</b></header>
          <ol>
            <li><CheckCircle weight="bold" /><span><strong>Identify all four leagues</strong><small>Confirm the fourth league name and Robert's team name in each league.</small></span></li>
            <li><CheckCircle weight="bold" /><span><strong>Provide each Yahoo league key</strong><small>Usually available in the league URL or from the Yahoo Fantasy API.</small></span></li>
            <li><CheckCircle weight="bold" /><span><strong>Authorize a Yahoo developer app</strong><small>Client ID and secret belong in Vercel environment variables, never chat or Git.</small></span></li>
            <li><CheckCircle weight="bold" /><span><strong>Confirm league rules</strong><small>Team count, scoring, lineup slots, waivers, FAAB, playoffs, keepers, and draft format.</small></span></li>
          </ol>
        </article>
      </section>

      <footer className="league-hub-footer">
        <span><WifiSlash weight="bold" /> No private Yahoo data is stored in this build.</span>
        <a href="https://football.fantasysports.yahoo.com/" target="_blank" rel="noreferrer">Fantasy data provided by Yahoo Fantasy</a>
      </footer>
    </main>
  );
}
