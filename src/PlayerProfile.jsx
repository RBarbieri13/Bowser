import { useEffect, useMemo, useRef, useState } from "react";
import { ChartLineUp, LinkBreak, ListBullets, User, UsersThree, X } from "@phosphor-icons/react";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const TEAM_NAMES = {
  ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills",
  CAR: "Carolina Panthers", CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys", DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers",
  HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars", KC: "Kansas City Chiefs",
  LA: "Los Angeles Rams", LAC: "Los Angeles Chargers", LV: "Las Vegas Raiders", MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants",
  NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers", SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers", TB: "Tampa Bay Buccaneers", TEN: "Tennessee Titans", WAS: "Washington Commanders",
};

const GAME_GROUPS = [
  {
    label: "Fantasy",
    columns: [
      { key: "fantasy_points", label: "FPTS", decimal: true },
      { key: "snap_pct", label: "SNP%" },
      { key: "position_finish", label: "FIN", finish: true, tone: false },
    ],
  },
  {
    label: "Passing",
    columns: [
      { key: "passing_attempts", label: "ATT" }, { key: "completions", label: "CMP" },
      { key: "passing_yards_per_attempt", label: "Y/A", decimal: true }, { key: "passing_yards", label: "YDS" },
      { key: "passing_tds", label: "TD" }, { key: "interceptions", label: "INT", inverse: true },
      { key: "sacks_suffered", label: "SK", inverse: true },
    ],
  },
  {
    label: "Rushing",
    columns: [
      { key: "carries", label: "ATT" }, { key: "rushing_yards", label: "YDS" },
      { key: "rushing_yards_per_attempt", label: "Y/A", decimal: true }, { key: "rushing_tds", label: "TD" },
    ],
  },
  {
    label: "Receiving",
    columns: [
      { key: "targets", label: "TGT" }, { key: "receptions", label: "REC" },
      { key: "receiving_yards", label: "YDS" }, { key: "receiving_yards_per_reception", label: "Y/R", decimal: true },
      { key: "receiving_tds", label: "TD" },
    ],
  },
];

const SEASON_GROUPS = GAME_GROUPS.map((group) => ({
  ...group,
  columns: group.columns.filter((column) => !["snap_pct", "position_finish"].includes(column.key)),
}));

function displayValue(value, column, position) {
  if (column.finish) return value ? `${position}${value}` : "—";
  if (value === null || value === undefined || value === "") return "—";
  return column.decimal ? decimal.format(Number(value)) : number.format(Number(value));
}

function quantileTone(logs, column, value) {
  if (column.tone === false || value === null || value === undefined) return "neutral";
  const values = logs.map((row) => Number(row[column.key])).filter(Number.isFinite).sort((a, b) => a - b);
  if (values.length < 3 || values[0] === values.at(-1)) return "neutral";
  const low = values[Math.floor((values.length - 1) * 0.34)];
  const high = values[Math.ceil((values.length - 1) * 0.66)];
  if (low === high) {
    if (column.inverse) return Number(value) <= low ? "positive" : "negative";
    if (low === 0) return Number(value) > 0 ? "positive" : "neutral";
    return "neutral";
  }
  if (column.inverse) {
    if (Number(value) <= low) return "positive";
    if (Number(value) >= high) return "negative";
  } else {
    if (Number(value) >= high) return "positive";
    if (Number(value) <= low) return "negative";
  }
  return "neutral";
}

function StatTableHead({ groups, prefixColumns }) {
  return (
    <thead>
      <tr className="profile-group-row">
        <th colSpan={prefixColumns.length} aria-hidden="true" />
        {groups.map((group) => <th key={group.label} colSpan={group.columns.length}>{group.label}</th>)}
      </tr>
      <tr className="profile-column-row">
        {prefixColumns.map((column) => <th key={column}>{column}</th>)}
        {groups.flatMap((group) => group.columns.map((column) => <th key={`${group.label}-${column.key}`}>{column.label}</th>))}
      </tr>
    </thead>
  );
}

function GameLogs({ profile }) {
  const logs = profile.gameLogs;
  return (
    <section className="profile-tab-panel" role="tabpanel" id="game-logs-panel" aria-labelledby="game-logs-tab">
      <div className="profile-section-heading"><h3>Game Logs</h3><span>2025 · Regular + postseason</span></div>
      <div className="profile-table-scroll" tabIndex="0" aria-label="Scrollable player game log">
        <table className="profile-stat-table game-log-table">
          <caption>{profile.player.name} 2025 game logs</caption>
          <StatTableHead groups={GAME_GROUPS} prefixColumns={["WK", "TYPE", "OPP"]} />
          <tbody>
            {logs.map((log) => (
              <tr key={`${log.season_type}-${log.week}`}>
                <th scope="row">{log.week}</th>
                <td className="season-type-cell">{log.season_type === "POST" ? "POST" : "REG"}</td>
                <td className="opponent-cell">{log.opponent_team || "—"}</td>
                {GAME_GROUPS.flatMap((group) => group.columns.map((column) => (
                  <td key={`${group.label}-${column.key}`} className={`performance-cell ${quantileTone(logs, column, log[column.key])}`}>
                    {displayValue(log[column.key], column, profile.player.position)}
                  </td>
                )))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="performance-legend"><span className="positive" /> Strong relative performance <span className="negative" /> Lower relative performance <span className="neutral" /> Typical range</p>
    </section>
  );
}

function SeasonStats({ profile }) {
  return (
    <section className="profile-tab-panel" role="tabpanel" id="season-stats-panel" aria-labelledby="season-stats-tab">
      <div className="profile-section-heading"><h3>Season Stats</h3><span>{profile.meta.scoring.toUpperCase()} scoring</span></div>
      <div className="profile-table-scroll" tabIndex="0" aria-label="Scrollable player season statistics">
        <table className="profile-stat-table season-stat-table">
          <caption>{profile.player.name} season statistics</caption>
          <StatTableHead groups={SEASON_GROUPS} prefixColumns={["YR", "TM", "G", "FIN"]} />
          <tbody>
            {profile.seasonStats.map((row) => (
              <tr key={row.season}>
                <th scope="row">'{String(row.season).slice(-2)}</th>
                <td>{String(row.team || "—").replaceAll(",", "/")}</td>
                <td>{row.games_played}</td>
                <td>#{row.position_finish}</td>
                {SEASON_GROUPS.flatMap((group) => group.columns.map((column) => (
                  <td key={`${group.label}-${column.key}`}>{displayValue(row[column.key], column, profile.player.position)}</td>
                )))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="profile-note">Bowser currently contains the complete 2025 warehouse. Additional seasons will appear here as they are loaded.</p>
    </section>
  );
}

function DepthChart({ profile, onSelectPlayer }) {
  return (
    <section className="profile-tab-panel depth-panel" role="tabpanel" id="depth-chart-panel" aria-labelledby="depth-chart-tab">
      <div className="profile-section-heading"><h3>Depth Chart</h3><span>{TEAM_NAMES[profile.depthChart.team] || profile.depthChart.team}</span></div>
      <p className="depth-context">2025 team production order · positional finish shown beside each player</p>
      <div className="depth-grid">
        {profile.depthChart.groups.map((group) => (
          <article className="depth-card" key={group.position}>
            <h4>{group.position}</h4>
            <ol>
              {group.players.map((player) => (
                <li key={player.playerId} className={player.selected ? "selected" : ""}>
                  <button type="button" onClick={() => onSelectPlayer(player.playerId, player.name)} aria-current={player.selected ? "true" : undefined}>
                    <span>{player.name}</span>
                    <small>{player.position} {player.positionRank} · {decimal.format(player.fantasyPoints)} FPTS</small>
                  </button>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PlayerProfile({ player, scoring, onClose, onSelectPlayer }) {
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState("logs");
  const [error, setError] = useState("");
  const [headshotFailed, setHeadshotFailed] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setProfile(null);
    setError("");
    setHeadshotFailed(false);
    fetch(`/api/v1/player-profile?${new URLSearchParams({ playerId: player.playerId, scoring })}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || "The player profile could not be loaded.");
        return payload;
      })
      .then((payload) => setProfile({ ...payload.data, meta: payload.meta }))
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      });
    return () => controller.abort();
  }, [player.playerId, scoring]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), [href], select, input, [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const tabs = useMemo(() => [
    { key: "logs", label: "Game Logs", icon: ListBullets },
    { key: "season", label: "Season Stats", icon: ChartLineUp },
    { key: "depth", label: "Depth Chart", icon: UsersThree },
  ], []);

  return (
    <div className="profile-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="player-profile" role="dialog" aria-modal="true" aria-labelledby="player-profile-title" ref={dialogRef}>
        <header className="profile-header">
          <div className="profile-media-tile">{profile?.player.headshotUrl && !headshotFailed ? <img src={profile.player.headshotUrl} alt="" onError={() => setHeadshotFailed(true)} /> : <User weight="duotone" aria-hidden="true" />}</div>
          <div className="profile-identity">
            <span className="profile-eyebrow">Bowser player card</span>
            <h2 id="player-profile-title">{profile?.player.name || player.name}</h2>
            {profile ? (
              <div className="profile-metadata">
                <span><strong>{profile.player.position}</strong> Position</span>
                <span><strong>{profile.player.team}</strong> {TEAM_NAMES[profile.player.team] || "Team"}</span>
                <span className="league-status"><LinkBreak aria-hidden="true" /><strong>My leagues</strong> {profile.player.leagueStatus}</span>
              </div>
            ) : null}
          </div>
          <button type="button" className="profile-close" onClick={onClose} aria-label="Close player card" ref={closeRef}><X weight="bold" /></button>
        </header>

        <nav className="profile-tabs" role="tablist" aria-label="Player details">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              type="button"
              key={key}
              id={`${key === "logs" ? "game-logs" : key === "season" ? "season-stats" : "depth-chart"}-tab`}
              role="tab"
              aria-selected={activeTab === key}
              aria-controls={`${key === "logs" ? "game-logs" : key === "season" ? "season-stats" : "depth-chart"}-panel`}
              className={activeTab === key ? "active" : ""}
              onClick={() => setActiveTab(key)}
            >
              <Icon aria-hidden="true" />{label}
            </button>
          ))}
        </nav>

        <div className="profile-content">
          {!profile && !error ? <div className="profile-loading" role="status">Loading 2025 player data…</div> : null}
          {error ? <div className="profile-error" role="alert"><strong>Player card unavailable</strong><span>{error}</span></div> : null}
          {profile && activeTab === "logs" ? <GameLogs profile={profile} /> : null}
          {profile && activeTab === "season" ? <SeasonStats profile={profile} /> : null}
          {profile && activeTab === "depth" ? <DepthChart profile={profile} onSelectPlayer={onSelectPlayer} /> : null}
        </div>
      </section>
    </div>
  );
}
