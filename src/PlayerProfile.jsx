import { DataTable } from './DataTable.jsx';
import { formatTableValue } from './tableSettings.js';
import { TrendChart, TrendMetricSelect } from './TrendChart.jsx';
import { useEffect, useMemo, useRef, useState } from "react";
import { ChartLineUp, Fire, LinkBreak, ListBullets, User, UsersThree, X } from "@phosphor-icons/react";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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

const TEAM_HEROES = {
  ARI: ["#97233F", "#4A1020"], ATL: ["#A71930", "#4B0B16"], BAL: ["#241773", "#110B3A"], BUF: ["#00338D", "#00224F"],
  CAR: ["#0085CA", "#003E60"], CHI: ["#0B162A", "#C83803"], CIN: ["#FB4F14", "#7B2107"], CLE: ["#311D00", "#FF3C00"],
  DAL: ["#003594", "#041E42"], DEN: ["#FB4F14", "#4B1807"], DET: ["#0076B6", "#003B5C"], GB: ["#203731", "#0D1B18"],
  HOU: ["#03202F", "#A71930"], IND: ["#002C5F", "#00162F"], JAX: ["#006778", "#00333C"], KC: ["#E31837", "#760C1D"],
  LA: ["#003594", "#001B4A"], LAC: ["#0080C6", "#004B76"], LV: ["#222222", "#000000"], MIA: ["#008E97", "#00464B"],
  MIN: ["#4F2683", "#281342"], NE: ["#002244", "#001122"], NO: ["#A28B4D", "#504424"], NYG: ["#0B2265", "#051135"],
  NYJ: ["#125740", "#082B20"], PHI: ["#004C54", "#00262A"], PIT: ["#3A3A3A", "#171717"], SEA: ["#002244", "#001122"],
  SF: ["#AA0000", "#520000"], TB: ["#D50A0A", "#650505"], TEN: ["#0C2340", "#4B92DB"], WAS: ["#5A1414", "#280909"],
};

const PROFILE_TABS = [
  { key: "logs", label: "Game Logs", icon: ListBullets },
  { key: "heat", label: "Heat Map", icon: Fire },
  { key: "season", label: "Season Stats", icon: ChartLineUp },
  { key: "depth", label: "Depth Chart", icon: UsersThree },
];

const TRAJECTORY_METRICS = [
  { key: "fantasy_points", label: "FPTS", format: (value) => oneDecimal.format(value) },
  { key: "snap_pct", label: "SNAP %", format: (value) => `${whole.format(value)}%` },
  { key: "touches", label: "TOUCHES", format: (value) => whole.format(value) },
  { key: "targets", label: "TARGETS", format: (value) => whole.format(value) },
];

const FANTASY_COLUMNS = [
  { key: "fantasy_points", label: "FPTS", width: 80, kind: "fpts", decimal: true },
  { key: "position_finish", label: "FIN", width: 56, kind: "finish" },
  { key: "snap_pct", label: "SNAP %", width: 118, kind: "snap" },
];

const RUSHING_COLUMNS = [
  { key: "carries", label: "ATT", width: 52 },
  { key: "rushing_yards", label: "YDS", width: 64 },
  { key: "rushing_yards_per_attempt", label: "AVG", width: 56, decimal: true, muted: true },
  { key: "rushing_tds", label: "TD", width: 44, kind: "td" },
];

const RECEIVING_COLUMNS = [
  { key: "targets", label: "TGT", width: 48 },
  { key: "receptions", label: "REC", width: 48 },
  { key: "receiving_yards", label: "YDS", width: 64 },
  { key: "receiving_tds", label: "TD", width: 44, kind: "td" },
];

const PASSING_COLUMNS = [
  { key: "passing_attempts", label: "ATT", width: 52 },
  { key: "completions", label: "CMP", width: 52 },
  { key: "passing_yards", label: "YDS", width: 64 },
  { key: "passing_yards_per_attempt", label: "Y/A", width: 56, decimal: true, muted: true },
  { key: "passing_tds", label: "TD", width: 44, kind: "td" },
  { key: "interceptions", label: "INT", width: 44 },
  { key: "sacks_suffered", label: "SK", width: 44 },
];

function isQuarterback(position) {
  return position === "QB";
}

function gameGroups(position) {
  return isQuarterback(position)
    ? [{ label: "Fantasy", columns: FANTASY_COLUMNS }, { label: "Passing", columns: PASSING_COLUMNS }, { label: "Rushing", columns: RUSHING_COLUMNS }]
    : [{ label: "Fantasy", columns: FANTASY_COLUMNS }, { label: "Rushing", columns: RUSHING_COLUMNS }, { label: "Receiving", columns: RECEIVING_COLUMNS }];
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mean(rows, key) {
  if (!rows.length) return 0;
  return rows.reduce((sum, row) => sum + numeric(row[key]), 0) / rows.length;
}

function total(rows, key) {
  return rows.reduce((sum, row) => sum + numeric(row[key]), 0);
}

function formatCell(value, column, position) {
  if (column.kind === "finish") return value ? `${position}${whole.format(value)}` : "—";
  if (value === null || value === undefined || value === "") return "—";
  return column.decimal ? oneDecimal.format(Number(value)) : whole.format(Number(value));
}

function enrichLog(log) {
  return {
    ...log,
    touches: numeric(log.carries) + numeric(log.receptions),
    opportunities: numeric(log.carries) + numeric(log.targets),
    total_tds: numeric(log.passing_tds) + numeric(log.rushing_tds) + numeric(log.receiving_tds),
    catch_pct: numeric(log.targets) > 0 ? (numeric(log.receptions) / numeric(log.targets)) * 100 : 0,
  };
}

function summaryValue(rows, column, mode) {
  const key = column.key;
  if (key === "position_finish") return null;
  if (key === "snap_pct") return mean(rows, key);
  if (key === "rushing_yards_per_attempt") {
    const attempts = total(rows, "carries");
    return attempts ? total(rows, "rushing_yards") / attempts : null;
  }
  if (key === "passing_yards_per_attempt") {
    const attempts = total(rows, "passing_attempts");
    return attempts ? total(rows, "passing_yards") / attempts : null;
  }
  return mode === "average" ? mean(rows, key) : total(rows, key);
}

function FptsPill({ value, average }) {
  const tone = value >= average * 1.15 ? "great" : value <= average * 0.6 ? "poor" : "typical";
  return <span className={`profile-fpts-pill ${tone}`}>{oneDecimal.format(value)}</span>;
}

function SnapMeter({ value }) {
  const pct = Math.max(0, Math.min(100, numeric(value)));
  return <span className="profile-snap-meter"><b>{whole.format(pct)}%</b><i aria-hidden="true"><span style={{ width: `${pct}%` }} /></i></span>;
}

function TrajectoryStrip({ profile, trendWeeks, onTrendWeeks }) {
  const [metric, setMetric] = useState("fantasy_points");
  return <section className="profile-trajectory" aria-labelledby="trajectory-title"><header><div><h3 id="trajectory-title">Season trajectory</h3><span>{profile.player.name} · aligned regular-season calendar weeks</span></div><div className="profile-trajectory-controls"><TrendMetricSelect metric={metric} onChange={setMetric} label="Player trajectory metric"/><label>History<select aria-label="Player trajectory history" value={trendWeeks} onChange={event=>onTrendWeeks(Number(event.target.value))}>{[5,8,10,18].map(n=><option key={n} value={n}>{n} calendar weeks</option>)}</select></label></div></header><TrendChart history={profile.history || []} metric={metric} domain={profile.meta?.trendDomains?.[metric]} playerName={profile.player.name} height={96}/></section>;
}

function GameLogHeader({ groups }) {
  return (
    <thead>
      <tr className="profile-log-groups"><th colSpan="2" aria-hidden="true" />{groups.map((group) => <th key={group.label} colSpan={group.columns.length}>{group.label}</th>)}</tr>
      <tr className="profile-log-columns"><th>WK</th><th>OPP</th>{groups.flatMap((group) => group.columns.map((column) => <th key={`${group.label}-${column.key}`}>{column.label}</th>))}</tr>
    </thead>
  );
}

function GameLogRow({ log, groups, position, average }) {
  return (
    <tr>
      <th scope="row">{log.week}</th>
      <td className="profile-opponent"><strong>{log.opponent_team || "—"}</strong><span className={`result-${String(log.result || "").toLowerCase()}`}>{log.result || "—"}</span></td>
      {groups.flatMap((group) => group.columns.map((column) => {
        const value = log[column.key];
        if (column.kind === "fpts") return <td key={`${group.label}-${column.key}`}><FptsPill value={numeric(value)} average={average} /></td>;
        if (column.kind === "snap") return <td key={`${group.label}-${column.key}`}><SnapMeter value={value} /></td>;
        const className = [column.muted ? "is-muted" : "", column.kind === "td" ? (numeric(value) > 0 ? "is-touchdown" : "is-zero") : "", column.kind === "finish" && numeric(value) <= 6 ? "is-top-finish" : ""].filter(Boolean).join(" ");
        return <td key={`${group.label}-${column.key}`} className={className}>{formatCell(value, column, position)}</td>;
      }))}
    </tr>
  );
}

function SummaryRow({ logs, groups, position, mode }) {
  return (
    <tr className={`profile-summary-row ${mode}`}>
      <th scope="row" colSpan="2">{mode === "average" ? "PER GAME" : "TOTALS"}</th>
      {groups.flatMap((group) => group.columns.map((column) => {
        const value = summaryValue(logs, column, mode);
        if (column.kind === "fpts") return <td key={`${group.label}-${column.key}`}><span className="profile-summary-fpts">{oneDecimal.format(value || 0)}</span></td>;
        if (column.kind === "snap") return <td key={`${group.label}-${column.key}`}>{value === null ? "—" : `${whole.format(value)}%`}</td>;
        const className = [column.muted ? "is-muted" : "", column.kind === "td" && numeric(value) > 0 ? "is-touchdown" : ""].filter(Boolean).join(" ");
        return <td key={`${group.label}-${column.key}`} className={className}>{formatCell(value, column, position)}</td>;
      }))}
    </tr>
  );
}

function GameLogTable({ logs, profile }) {
  const [period,setPeriod] = useState('ALL');
  const groups = gameGroups(profile.player.position);
  const columns = [{key:'week',label:'Week',group:'Game',width:64,required:true},{key:'season_type',label:'Phase',group:'Game',width:76},{key:'opponent_team',label:'Opponent',group:'Game',width:95},...groups.flatMap(group=>group.columns.map(column=>({...column,group:group.label,width:column.width || 90,decimals:column.kind==='fpts'?1:undefined,type:column.kind==='snap'?'percent':'number'}))),{key:'draft_kings_price',label:'DK salary',group:'DFS',width:110,type:'currency'},{key:'draft_kings_projection',label:'DK projection',group:'DFS',width:120,decimals:2}];
  const filtered = logs.filter(log=>period==='ALL'||log.season_type===period);
  return <DataTable id={`profile-logs-${profile.player.position}`} title={`${profile.player.name} game logs`} columns={columns} rows={filtered} rowKey={row=>`${row.season_type}-${row.week}`} defaultSorts={[{key:'week',desc:false}]} filters={<label>Phase<select aria-label="Game log phase" value={period} onChange={event=>setPeriod(event.target.value)}><option value="ALL">Regular + postseason</option><option value="REG">Regular season</option><option value="POST">Postseason</option></select></label>} renderCell={(row,column,prefs)=>column.kind==='finish' && row[column.key]!=null?`${profile.player.position}${row[column.key]}`:formatTableValue(row[column.key],column,prefs)}/>;
}

function GameLogs({ profile, trendWeeks, onTrendWeeks }) {
  const logs = useMemo(() => profile.gameLogs.map(enrichLog), [profile.gameLogs]);
  return (
    <section className="profile-tab-panel profile-logs-panel" role="tabpanel" id="game-logs-panel" aria-labelledby="game-logs-tab">
      <header className="profile-panel-heading"><div><h3>Game Logs</h3></div><span>{profile.meta.season} · Regular + postseason</span></header>
      <TrajectoryStrip profile={profile} trendWeeks={trendWeeks} onTrendWeeks={onTrendWeeks} />
      <GameLogTable logs={logs} profile={profile} />
      <p className="profile-note">Weekly finish compares all NFL peers before filters. Historical DFS values appear only for their exact week; unavailable records are shown as —.</p>
    </section>
  );
}

const HEAT_GROUPS = {
  fantasy: [
    { key: "fantasy_points", label: "FPTS", decimal: true }, { key: "position_finish", label: "FIN", finish: true },
    { key: "snap_pct", label: "SNAP %", percent: true }, { key: "opportunities", label: "OPPS" }, { key: "total_tds", label: "TD" },
  ],
  rushing: [
    { key: "carries", label: "ATT" }, { key: "rushing_yards", label: "YDS" },
    { key: "rushing_yards_per_attempt", label: "AVG", decimal: true }, { key: "rushing_tds", label: "TD" },
  ],
  receiving: [
    { key: "targets", label: "TGT" }, { key: "receptions", label: "REC" }, { key: "receiving_yards", label: "YDS" },
    { key: "receiving_tds", label: "TD" }, { key: "catch_pct", label: "CATCH %", percent: true },
  ],
};

function heatStrength(value, column, max) {
  if (column.finish) return Math.max(0, Math.min(1, 1 - (numeric(value) - 1) / 40));
  return max > 0 ? Math.max(0, Math.min(1, numeric(value) / max)) : 0;
}

function HeatMap({ profile }) {
  const [activeGroup, setActiveGroup] = useState("fantasy");
  const logs = useMemo(() => profile.gameLogs.map(enrichLog), [profile.gameLogs]);
  const columns = HEAT_GROUPS[activeGroup];
  const maxima = Object.fromEntries(columns.map((column) => [column.key, Math.max(...logs.map((log) => numeric(log[column.key])), 0)]));
  return (
    <section className="profile-tab-panel profile-heat-panel" role="tabpanel" id="heat-map-panel" aria-labelledby="heat-map-tab">
      <header className="profile-panel-heading"><div><h3>Heat Map</h3></div><div className="profile-heat-pills" role="group" aria-label="Heat map stat group">{Object.keys(HEAT_GROUPS).map((key) => <button type="button" key={key} aria-pressed={activeGroup === key} className={activeGroup === key ? "active" : ""} onClick={() => setActiveGroup(key)}>{key[0].toUpperCase() + key.slice(1)}</button>)}</div></header>
      <DataTable id={`profile-heat-${activeGroup}`} title={`${profile.player.name} heat map`} columns={[{key:'week',label:'Week',group:'Game',width:64,required:true},{key:'opponent_team',label:'Opponent',group:'Game',width:100},...columns.map(column=>({...column,width:110,group:activeGroup,type:column.percent?'percent':'number',decimals:column.decimal?1:0}))]} rows={logs} rowKey={row=>`${row.season_type}-${row.week}`} renderCell={(row,column,prefs)=>{if(['week','opponent_team'].includes(column.key))return undefined;const value=row[column.key];return <span className="profile-heat-tile" style={{background:prefs.heatmap&&value!=null?`rgba(66,211,146,${0.04+0.38*heatStrength(value,column,maxima[column.key])})`:'transparent'}}>{column.finish&&value!=null?`${profile.player.position}${value}`:formatTableValue(value,column,prefs)}</span>;}}/>
      <footer className="profile-heat-legend"><span>Shading = share of this player’s season best in that column</span><i aria-hidden="true" /><small>0</small><small>BEST</small></footer>
    </section>
  );
}

function seasonColumns(position) {
  const common = [
    { key: "games_played", label: "GP" }, { key: "fantasy_points", label: "FPTS", decimal: true, className: "is-fantasy" },
    { key: "fantasy_points_per_game", label: "FPTS/G", decimal: true, className: "is-fantasy" }, { key: "position_finish", label: "FIN", finish: true },
    { key: "snap_pct", label: "SNAP %", percent: true, muted: true },
  ];
  if (isQuarterback(position)) return [...common,
    { key: "passing_attempts", label: "ATT" }, { key: "completions", label: "CMP" }, { key: "passing_yards", label: "PASS YDS" },
    { key: "passing_yards_per_attempt", label: "YPA", decimal: true, muted: true }, { key: "passing_tds", label: "PASS TD", td: true },
    { key: "interceptions", label: "INT" }, { key: "carries", label: "RUSH ATT" }, { key: "rushing_yards", label: "RUSH YDS" }, { key: "rushing_tds", label: "RUSH TD", td: true },
  ];
  return [...common,
    { key: "carries", label: "ATT" }, { key: "rushing_yards", label: "RUSH YDS" }, { key: "rushing_yards_per_attempt", label: "YPC", decimal: true, muted: true },
    { key: "rushing_tds", label: "RUSH TD", td: true }, { key: "targets", label: "TGT" }, { key: "receptions", label: "REC" },
    { key: "receiving_yards", label: "REC YDS" }, { key: "receiving_tds", label: "REC TD", td: true },
  ];
}

function SeasonStats({ profile }) {
  const columns = seasonColumns(profile.player.position);
  return (
    <section className="profile-tab-panel profile-season-panel" role="tabpanel" id="season-stats-panel" aria-labelledby="season-stats-tab">
      <header className="profile-panel-heading"><div><h3>Season Stats</h3></div><span>{profile.meta.scoring.toUpperCase()} scoring</span></header>
      <DataTable id={`profile-seasons-${profile.player.position}`} title={`${profile.player.name} season statistics`} columns={[{key:'season',label:'Year',group:'Season',width:80,required:true},...columns.map(column=>({...column,group:'Statistics',width:110,type:column.percent?'percent':'number',decimals:column.decimal?1:0}))]} rows={profile.seasonStats} rowKey={row=>row.season} renderCell={(row,column,prefs)=>column.finish&&row[column.key]!=null?`${profile.player.position}${row[column.key]}`:formatTableValue(row[column.key],column,prefs)}/>
      <p className="profile-note">Additional seasons appear automatically as they are loaded into the Bowser warehouse.</p>
    </section>
  );
}

function DepthChart({ profile, onSelectPlayer }) {
  const visibleDepth = { QB: 2, RB: 3, WR: 3, TE: 2 };
  const groups = ["QB", "RB", "WR", "TE"].map((position) => {
    const group = profile.depthChart.groups.find((candidate) => candidate.position === position) || { position, players: [] };
    return { ...group, players: group.players.slice(0, visibleDepth[position]) };
  });
  return (
    <section className="profile-tab-panel profile-depth-panel" role="tabpanel" id="depth-chart-panel" aria-labelledby="depth-chart-tab">
      <header className="profile-panel-heading"><div><h3>Depth Chart</h3><p>Team production order · positional finish shown beside each player</p></div><span>{TEAM_NAMES[profile.depthChart.team] || profile.depthChart.team}</span></header>
      <div className="profile-depth-grid">{groups.map((group) => <article className="profile-depth-card" key={group.position}><h4>{group.position}</h4>{group.players.length ? <ol>{group.players.map((depthPlayer) => <li key={depthPlayer.playerId} className={depthPlayer.selected ? "selected" : ""}><button type="button" onClick={() => onSelectPlayer(depthPlayer.playerId, depthPlayer.name)} aria-current={depthPlayer.selected ? "true" : undefined}><span>{depthPlayer.name}</span><small>{depthPlayer.position}{depthPlayer.positionRank} · {oneDecimal.format(depthPlayer.fantasyPointsPerGame || 0)} FPTS/G</small></button></li>)}</ol> : <p>No recorded {group.position} production.</p>}</article>)}</div>
    </section>
  );
}

function tabDomId(key) {
  return key === "logs" ? "game-logs" : key === "heat" ? "heat-map" : key === "season" ? "season-stats" : "depth-chart";
}

export function PlayerProfile({ player, season = 2026, scoring, initialTab = "logs", onClose, onSelectPlayer }) {
  const safeInitialTab = PROFILE_TABS.some((tab) => tab.key === initialTab) ? initialTab : "logs";
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState(safeInitialTab);
  const [error, setError] = useState("");
  const [headshotFailed, setHeadshotFailed] = useState(false);
  const [trendWeeks,setTrendWeeks] = useState(10);
  const dialogRef = useRef(null);
  const firstTabRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setProfile(null);
    setError("");
    setHeadshotFailed(false);
    setActiveTab(safeInitialTab);
    fetch(`/api/v1/player-profile?${new URLSearchParams({ playerId: player.playerId, scoring, season: String(season), trendWeeks:String(trendWeeks) })}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || "The player profile could not be loaded.");
        return payload;
      })
      .then((payload) => setProfile({ ...payload.data, meta: payload.meta }))
      .catch((requestError) => { if (requestError.name !== "AbortError") setError(requestError.message); });
    return () => controller.abort();
  }, [player.playerId, season, scoring, safeInitialTab, trendWeeks]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstTabRef.current?.focus();
    const onKeyDown = (event) => {
      if (!dialogRef.current?.contains(event.target)) return;
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
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [onClose]);

  const seasonRow = profile?.seasonStats?.[0];
  const heroColors = TEAM_HEROES[profile?.player.team] || ["#263238", "#111719"];
  const heroStyle = { "--profile-team-start": heroColors[0], "--profile-team-end": heroColors[1] };
  const heroPositionFinish = seasonRow?.position_finish ? `${profile.player.position}${seasonRow.position_finish} overall` : `${profile?.player.position || player.position || "NFL"} overall`;

  const selectTab = (key) => {
    setActiveTab(key);
    requestAnimationFrame(() => document.getElementById(`${tabDomId(key)}-tab`)?.focus({ preventScroll: true }));
  };

  const onTabsKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = PROFILE_TABS.findIndex((tab) => tab.key === activeTab);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? PROFILE_TABS.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + PROFILE_TABS.length) % PROFILE_TABS.length;
    selectTab(PROFILE_TABS[nextIndex].key);
  };

  return (
    <div className="profile-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="player-profile player-profile-v2" role="dialog" aria-modal="true" aria-labelledby="player-profile-title" ref={dialogRef}>
        <header className="profile-hero" style={heroStyle}>
          <div className="profile-media-tile">{profile?.player.headshotUrl && !headshotFailed ? <img src={profile.player.headshotUrl} alt="" onError={() => setHeadshotFailed(true)} /> : <User weight="duotone" aria-hidden="true" />}</div>
          <div className="profile-identity"><span className="profile-eyebrow">Bowser player card</span><h2 id="player-profile-title">{profile?.player.name || player.name}</h2>{profile ? <div className="profile-metadata"><span><strong>{profile.player.position}</strong></span><span><strong>{profile.player.team}</strong><em>{TEAM_NAMES[profile.player.team] || "NFL team"}</em></span><span className="league-status"><LinkBreak aria-hidden="true" /><strong>My leagues</strong><em>{profile.player.leagueStatus}</em></span></div> : null}</div>
          <div className="profile-hero-summary"><button type="button" className="profile-close" onClick={onClose} aria-label="Close player card"><X weight="bold" /></button>{seasonRow ? <div><strong>{oneDecimal.format(seasonRow.fantasy_points_per_game || 0)} <span>FPTS/G</span></strong><small>{heroPositionFinish} · {seasonRow.season}</small></div> : null}</div>
        </header>
        <nav className="profile-tabs" role="tablist" aria-label="Player details" onKeyDown={onTabsKeyDown}>{PROFILE_TABS.map(({ key, label, icon: Icon }, index) => <button type="button" key={key} id={`${tabDomId(key)}-tab`} role="tab" aria-selected={activeTab === key} aria-controls={`${tabDomId(key)}-panel`} tabIndex={activeTab === key ? 0 : -1} className={activeTab === key ? "active" : ""} onClick={() => selectTab(key)} ref={index === 0 ? firstTabRef : undefined}><Icon weight="bold" aria-hidden="true" />{label}</button>)}</nav>
        <div className="profile-content">
          {!profile && !error ? <div className="profile-loading" role="status"><span aria-hidden="true" />Loading player warehouse data…</div> : null}
          {error ? <div className="profile-error" role="alert"><strong>Player card unavailable</strong><span>{error}</span><button type="button" onClick={onClose}>Close</button></div> : null}
          {profile && activeTab === "logs" ? <GameLogs profile={profile} trendWeeks={trendWeeks} onTrendWeeks={setTrendWeeks} /> : null}
          {profile && activeTab === "heat" ? <HeatMap profile={profile} /> : null}
          {profile && activeTab === "season" ? <SeasonStats profile={profile} /> : null}
          {profile && activeTab === "depth" ? <DepthChart profile={profile} onSelectPlayer={onSelectPlayer} /> : null}
        </div>
      </section>
    </div>
  );
}
