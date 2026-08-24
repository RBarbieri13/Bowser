// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { App } from "../src/App.jsx";

const samplePlayer = {
  player_id: "00-test",
  player_display_name: "Test Player",
  team: "BUF",
  position: "QB",
  games_played: 17,
  snaps: 1000,
  snap_pct: 90.4,
  passing_attempts: 500,
  completions: 350,
  completion_pct: 70.4,
  passing_yards: 4200,
  passing_yards_per_game: 247.1,
  passing_yards_per_attempt: 8.4,
  passing_tds: 35,
  interceptions: 8,
  carries: 75,
  rushing_yards: 500,
  rushing_yards_per_game: 29.4,
  rushing_yards_per_attempt: 6.7,
  rushing_tds: 7,
  targets: 0,
  receptions: 0,
  reception_pct: 56.6,
  receiving_yards: 0,
  receiving_yards_per_game: 0,
  receiving_yards_per_reception: null,
  receiving_tds: 0,
  fantasy_points: 411.4,
  fantasy_points_per_game: 24.2,
  adp: 18.6,
  draft_position_rank: 7,
  draft_position_rank_label: "QB7",
  upcoming_matchup: "Sun 12:00 pm vs KC",
  upcoming_game_url: "https://www.espn.com/nfl/game/_/gameId/401-test",
  yahoo_league_status: "LOEG: Robert's Team",
  yahoo_roster_pct: 92,
  yahoo_start_pct: 71,
  yahoo_adds: 840,
  yahoo_drops: 160,
  current_depth_key: "BUF:QB",
  current_depth_rank: 2,
  current_depth_position: "QB",
  player_trends: Array.from({ length: 10 }, (_, index) => ({
    week: index + 1,
    seasonType: "REG",
    gameId: `2025_${String(index + 1).padStart(2, "0")}_BUF_TEST`,
    team: "BUF",
    opponent: index % 2 ? "MIA" : "NYJ",
    snaps: index === 9 ? 96 : 58 + index,
    passAttempts: 25 + index,
    rushAttempts: 3 + (index % 4),
    receptions: 0,
    touches: 3 + (index % 4),
    targets: index % 3,
    fantasyPoints: 12.4 + index,
  })),
  rank: 1,
};

const sampleProfile = {
  data: {
    player: {
      playerId: "00-test", name: "Test Player", team: "BUF", position: "QB", headshotUrl: null,
      leagueStatus: "Roster data not connected",
    },
    gameLogs: [{
      season_type: "REG", week: 1, team: "BUF", opponent_team: "KC", position: "QB",
      fantasy_points: 31.2, snap_pct: 100, position_finish: 1, passing_attempts: 31, completions: 24,
      passing_yards_per_attempt: 9.1, passing_yards: 282, passing_tds: 3, interceptions: 0, sacks_suffered: 2,
      carries: 8, rushing_yards: 46, rushing_yards_per_attempt: 5.8, rushing_tds: 1,
      targets: 0, receptions: 0, receiving_yards: 0, receiving_yards_per_reception: null, receiving_tds: 0,
    }],
    seasonStats: [{
      season: 2025, team: "BUF", games_played: 17, position_finish: 1, fantasy_points: 411.4,
      passing_attempts: 500, completions: 350, passing_yards_per_attempt: 8.4, passing_yards: 4200,
      passing_tds: 35, interceptions: 8, sacks_suffered: 22, carries: 75, rushing_yards: 500,
      rushing_yards_per_attempt: 6.7, rushing_tds: 7, targets: 0, receptions: 0,
      receiving_yards: 0, receiving_yards_per_reception: null, receiving_tds: 0,
    }],
    depthChart: {
      team: "BUF",
      groups: [{ position: "QB", players: [{ playerId: "00-test", name: "Test Player", position: "QB", positionRank: 1, fantasyPoints: 411.4, selected: true }] }],
    },
  },
  meta: { season: 2025, scoring: "ppr", queryMs: 2.1 },
};

const sampleBoxScores = {
  data: [{
    player_id: "00-test", player_display_name: "Test Player", position_group: "QB", position: "QB",
    week: 1, season_type: "REG", opponent_team: "KC", snaps: 70, snap_pct: 100,
    completions: 24, passing_attempts: 31, passing_yards: 282, passing_tds: 3, interceptions: 0,
    carries: 8, rushing_yards: 46, rushing_tds: 1, targets: 0, receptions: 0,
    receiving_yards: 0, receiving_tds: 0, fantasy_points: 31.2,
  }],
  meta: {
    season: 2025, team: "BUF", scoring: "ppr", seasonType: "ALL",
    weeks: [{ week: 1, opponent: "KC", seasonType: "REG", gameId: "2025_01_BUF_KC", homeAway: "home", gameday: "2025-09-07", gametime: "13:00", scoreLabel: "W 31-24" }],
    schedule: [
      { week: 1, opponent: "KC", seasonType: "REG", gameId: "2025_01_BUF_KC", homeAway: "home", gameday: "2025-09-07", gametime: "13:00", scoreLabel: "W 31-24" },
      { week: 20, opponent: "BAL", seasonType: "POST", gameId: "2025_20_BAL_BUF", homeAway: "home", gameday: "2026-01-18", gametime: "18:30", scoreLabel: "W 27-24" },
    ],
    playerCount: 1, queryMs: 2.4,
  },
};

const sampleGameBreakdown = {
  data: {
    game: { gameId: "2025_01_BUF_KC", week: 1, seasonType: "REG", awayTeam: "KC", homeTeam: "BUF", awayScore: 24, homeScore: 31, gameday: "2025-09-07", gametime: "13:00", stadium: "Highmark Stadium", overtime: false },
    teams: [
      { team: "KC", result: "L", pointsFor: 24, pointsAgainst: 31, passPlays: 39, passPct: 61.9, rushPlays: 24, rushPct: 38.1, offensiveSnaps: 63, pctTimeLeading: 20, pctTimeTrailing: 70 },
      { team: "BUF", result: "W", pointsFor: 31, pointsAgainst: 24, passPlays: 31, passPct: 50, rushPlays: 31, rushPct: 50, offensiveSnaps: 62, pctTimeLeading: 70, pctTimeTrailing: 20 },
    ],
    totalOffensiveSnaps: 125,
    quarterScores: [{ quarter: 1, away_points: 7, home_points: 10 }, { quarter: 2, away_points: 7, home_points: 7 }, { quarter: 3, away_points: 3, home_points: 7 }, { quarter: 4, away_points: 7, home_points: 7 }],
    timeline: [{ sequence: 0, quarter: 1, clock: "15:00", elapsed_seconds: 0, away_score: 0, home_score: 0, leader: "tied", description: "Game start" }, { sequence: 1, quarter: 1, clock: "10:00", elapsed_seconds: 300, away_score: 0, home_score: 7, leader: "home", description: "BUF touchdown" }],
    drives: [
      { driveNumber: 1, team: "KC", startMin: 0, topMin: 3.2, plays: 7, yards: 62, passPlays: 5, runPlays: 2, passYards: 48, runYards: 14, ownStart: 25, result: "TD", scoreAfter: "7–0", marginAfter: 7, rawResult: "Touchdown" },
      { driveNumber: 2, team: "BUF", startMin: 3.2, topMin: 2.4, plays: 5, yards: 35, passPlays: 3, runPlays: 2, passYards: 24, runYards: 11, ownStart: 20, result: "FG", scoreAfter: "7–3", marginAfter: 4, rawResult: "Field goal" },
    ],
    segments: Array.from({ length: 6 }, (_, segment) => ({ segment, label: `${segment * 10}:00–${segment === 5 ? "Final" : `${(segment + 1) * 10}:00`}`, phase: `Phase ${segment + 1}` })),
    teamSegments: ["KC", "BUF"].flatMap((team) => Array.from({ length: 6 }, (_, segment) => ({ team, segment, rushPlays: 4 + segment, passPlays: 6 + segment, offensivePlays: 10 + segment * 2, yards: 45 + segment * 8, epa: 0.4, successfulPlays: 5, passPct: 60, rushPct: 40, successRate: 50 }))),
    playerSegments: ["KC", "BUF"].map((team, teamIndex) => ({
      team, playerId: `00-${team}`, playerDisplayName: team === "BUF" ? "Test Player" : "Road Player", position: "QB", headshotUrl: null,
      segments: Array.from({ length: 6 }, (_, segment) => ({ segment, snaps: 8 + segment, rushAttempts: segment % 2, passAttempts: 3 + segment, targets: 0, yards: 28 + segment * 9, touchdowns: segment === 4 ? 1 : 0, receptions: 0, fantasyPoints: 1.2 + segment })),
      total: { snaps: 63 + teamIndex, rushAttempts: 3, passAttempts: 33, targets: 0, yards: 303, touchdowns: 1, receptions: 0, fantasyPoints: 22.2 },
    })),
    boxScore: sampleBoxScores.data.map((row) => ({ ...row, team: "BUF" })),
    availability: { scoringTimeline: true, driveWaterfall: true, playerParticipation: true },
  },
  meta: { methodology: { driveWaterfall: "Drive totals from nflverse play-by-play.", playerParticipation: "Player participation from nflverse." } },
};

const sampleOpportunityTracker = {
  data: {
    team: "NYG",
    groups: [
      { position: "QB", players: [{
        playerId: "00-test", name: "Test Player", team: "NYG", position: "QB", depthPosition: "QB", depthRank: 1,
        rosterStatus: "ACT", rosterStatusLabel: "Active roster", rookie: false, yearsExperience: 3, headshotUrl: null,
        hasNFLHistory: true, opportunityMetric: "passAttempts",
        averages: { snaps: 68, snapPct: 98, opportunity: 31, fantasyPoints: 24.2 },
        trend: { direction: "up", delta: 9, label: "Snap share up 9 pts over prior 3" },
        history: Array.from({ length: 10 }, (_, index) => ({ gameId: `game-${index}`, week: index + 1, team: "NYG", opponent: "DAL", snaps: 59 + index, snapPct: 90 + index, passAttempts: 22 + index, carries: 4, targets: 0, fantasyPoints: 15 + index })),
      }] },
      { position: "RB", players: [{
        playerId: "rookie-test", name: "Rookie Runner", team: "NYG", position: "RB", depthPosition: "RB", depthRank: 4,
        rosterStatus: "ACT", rosterStatusLabel: "Active roster", rookie: true, yearsExperience: 0, headshotUrl: null,
        hasNFLHistory: false, opportunityMetric: "carries", averages: { snaps: null, snapPct: null, opportunity: null, fantasyPoints: null },
        trend: { direction: "new", delta: null, label: "No 2025 NFL game history" }, history: [],
      }] },
      { position: "WR", players: [] }, { position: "TE", players: [] },
    ],
  },
  meta: { rosterSeason: 2026, historySeason: 2025, gameWindow: 10, playerCount: 2, playersWithHistory: 1, rookies: 1, depthUpdatedAt: "2026-08-18T07:33:20Z", ordering: "Official nflverse depth rank, then recent recorded snap volume", injuryNewsAvailable: false, injuryNewsMessage: "The 2026 injury feed is not published yet.", source: { name: "nflverse", license: "CC BY 4.0", url: "https://github.com/nflverse/nflverse-data" }, queryMs: 3.2 },
};

function latestPlayerUrl() {
  const calls = fetch.mock.calls.map(([input]) => String(input)).filter((url) => url.startsWith("/api/v1/player-stats?"));
  return new URL(calls.at(-1), "http://local");
}

function latestBoxScoreUrl() {
  const calls = fetch.mock.calls.map(([input]) => String(input)).filter((url) => url.startsWith("/api/v1/team-box-scores?"));
  return new URL(calls.at(-1), "http://local");
}

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = String(input);
    if (url === "/api/v1/meta") {
      return {
        ok: true,
        json: async () => ({ positions: ["QB", "RB", "WR", "TE"], teams: ["NYG", "BUF", "KC"], weekOptions: Array.from({ length: 22 }, (_, index) => ({ week: index + 1 })) }),
      };
    }
    if (url.startsWith("/api/v1/player-profile?")) return { ok: true, json: async () => sampleProfile };
    if (url.startsWith("/api/v1/game-breakdown?")) return { ok: true, json: async () => sampleGameBreakdown };
    if (url.startsWith("/api/v1/team-box-scores?")) return { ok: true, json: async () => sampleBoxScores };
    if (url.startsWith("/api/v1/opportunity-tracker?")) return { ok: true, json: async () => sampleOpportunityTracker };
    return {
      ok: true,
      json: async () => ({
        data: [samplePlayer],
        meta: {
          returnedCount: 1,
          totalCount: 609,
          queryMs: 4.2,
          depthCharts: {
            "BUF:QB": {
              players: [
                { playerId: "00-starter", name: "Starter Quarterback", depthPosition: "QB", depthRank: 1, rosterStatus: "ACT", selected: false },
                { playerId: "00-test", name: "Test Player", depthPosition: "QB", depthRank: 2, rosterStatus: "ACT", selected: true },
                { playerId: "00-third", name: "Third Quarterback", depthPosition: "QB", depthRank: 3, rosterStatus: "ACT", selected: false },
              ],
            },
          },
        },
      }),
    };
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("statistics table UI", () => {
  test("uses the Bowser mascot lockup and navigates to team box scores", async () => {
    render(<App />);
    expect(screen.getByAltText("Bowser")).toBeInTheDocument();
    window.location.hash = "#/team-box-scores";
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(await screen.findByRole("heading", { name: "Team Box Scores" })).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "QB week-by-week player statistics" })).toBeInTheDocument();
    expect(screen.getAllByText("$").length).toBeGreaterThan(0);
    expect(screen.getAllByText("FPTS").length).toBeGreaterThan(0);
    expect(screen.queryByText("DK FPTX")).not.toBeInTheDocument();
    expect(document.querySelector(".team-filter-logo")).toHaveAttribute("src", expect.stringContaining("/nyg.png"));
    expect(screen.getByText("55 PTS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test Player" })).toBeInTheDocument();
  });

  test("persists a manually resizable icon-only navigation sidebar", async () => {
    render(<App />);
    const resizer = screen.getByRole("separator", { name: "Resize navigation sidebar" });
    expect(resizer).toHaveAttribute("aria-valuenow", "216");
    fireEvent.keyDown(resizer, { key: "Home" });
    expect(resizer).toHaveAttribute("aria-valuenow", "56");
    expect(document.querySelector(".app-shell")).toHaveClass("sidebar-icon-only");
    expect(localStorage.getItem("bowser:sidebar-width:v1")).toBe("56");
    expect(screen.getByRole("link", { name: "Player Database" })).toHaveAttribute("title", "Player Database");
  });

  test("renders the roster-backed Opportunity Tracker with trend charts and rookie states", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/opportunity-tracker";
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Opportunity Tracker" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Opportunity Tracker" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Quarterbacks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Running backs" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Snaps: NYG Week 1, 59/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pass att: NYG Week 1, 22/)).toBeInTheDocument();
    expect(screen.getByLabelText(/PPR pts: NYG Week 1, 15/)).toBeInTheDocument();
    expect(screen.getByText("Awaiting NFL debut")).toBeInTheDocument();
    expect(screen.getByText(/injury feed is not published yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "RB" }));
    expect(screen.queryByRole("heading", { name: "Quarterbacks" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Running backs" })).toBeInTheDocument();
  });

  test("renders a four-league Yahoo-ready League Hub without inventing private data", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/league-hub";
    render(<App />);

    expect(await screen.findByRole("heading", { name: "League Hub" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "League Hub" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("option", { name: "All four leagues" })).toBeInTheDocument();
    expect(screen.getAllByText("LOEG").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Loongi League").length).toBeGreaterThan(0);
    expect(screen.getAllByText("College Football Fantasy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("League 4").length).toBeGreaterThan(0);
    expect(screen.getByText("0 of 4 leagues")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect Yahoo/i })).toBeDisabled();
    expect(screen.getByText("No private Yahoo data is stored in this build.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Waivers" }));
    expect(screen.getByRole("button", { name: "Waivers" })).toHaveAttribute("aria-pressed", "true");
  });

  test("uses a collapsed schedule brush, adds sporadic weeks, and resizes every week column", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/team-box-scores";
    render(<App />);

    const scheduleTrigger = await screen.findByRole("button", { name: /schedule/i });
    expect(scheduleTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Add individual weeks" })).not.toBeInTheDocument();

    await user.click(scheduleTrigger);
    expect(scheduleTrigger).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector(".schedule-opponent-logo")).toHaveAttribute("src", expect.stringContaining("/kc.png"));
    expect(screen.getAllByText("55 PTS").length).toBeGreaterThan(1);

    await user.click(screen.getByRole("button", { name: /Selected week 7/i }));
    await waitFor(() => expect(latestBoxScoreUrl().searchParams.get("weeks")).toBe("7"));

    const brushTrack = document.querySelector(".schedule-filmstrip-scroll");
    vi.spyOn(brushTrack, "getBoundingClientRect").mockReturnValue({ left: 0, right: 1200, top: 0, bottom: 106, width: 1200, height: 106, x: 0, y: 0, toJSON: () => ({}) });
    const rangeEnd = screen.getByRole("button", { name: "Resize last selected week" });
    fireEvent(rangeEnd, new MouseEvent("pointerdown", { bubbles: true, clientX: 650 }));
    fireEvent(document, new MouseEvent("pointermove", { bubbles: true, clientX: 928 }));
    fireEvent(document, new MouseEvent("pointerup", { bubbles: true, clientX: 928 }));
    await waitFor(() => expect(latestBoxScoreUrl().searchParams.get("weeks")).toBe("7,8,9,10"));

    await user.click(screen.getByRole("button", { name: "Add individual weeks" }));
    await user.click(screen.getByRole("button", { name: /Select week 20/i }));

    await waitFor(() => expect(latestBoxScoreUrl().searchParams.get("weeks").split(",")).toContain("20"));
    expect(screen.getAllByText(/W7–10 \+ W20/).length).toBeGreaterThan(0);

    const widthControl = screen.getByLabelText("Week column width");
    fireEvent.change(widthControl, { target: { value: "220" } });
    const table = await screen.findByRole("table", { name: "QB week-by-week player statistics" });
    expect(table).toHaveStyle({ width: "592px" });
    const synchronizedWeekResizer = screen.getAllByRole("separator", { name: "Resize all week groups" })[0];
    expect(synchronizedWeekResizer).toHaveAttribute("aria-valuenow", "220");
    fireEvent.keyDown(synchronizedWeekResizer, { key: "ArrowRight", shiftKey: true });
    expect(screen.getByLabelText("Week column width")).toHaveValue("244");
    expect(JSON.parse(localStorage.getItem("bowser:team-box-preferences:v2")).weekWidth).toBe(244);

    expect(screen.getByText("31.2")).toHaveClass("metric-high");
    expect(screen.getByLabelText("Minimum DraftKings price")).toBeDisabled();
  });

  test("opens a game breakdown with the active scoring and restores box-score state on return", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/team-box-scores";
    render(<App />);

    await screen.findByRole("table", { name: "QB week-by-week player statistics" });
    await user.selectOptions(screen.getByLabelText("Scoring"), "half");
    await user.click(screen.getByRole("button", { name: /schedule/i }));
    await user.click(screen.getByRole("button", { name: "Open Week 1 against KC game breakdown" }));

    expect(await screen.findByRole("heading", { name: /KC 24.*31 BUF/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Scoreboard–Rail Waterfall v2" })).toBeInTheDocument();
    expect(screen.getByText("1ST QUARTER")).toBeInTheDocument();
    expect(screen.getByLabelText(/KC · Touchdown · 7 plays, 62 yds/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Key player participation" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "BUF opportunity by game segment" })).toBeInTheDocument();
    expect(screen.getAllByText("Snaps").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rush attempts").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pass attempts").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Targets").length).toBeGreaterThan(0);
    const segmentCell = document.querySelector(".participation-table tbody td .kpi-stack");
    expect(segmentCell.querySelectorAll(".kpi-lane")).toHaveLength(4);
    const userProduction = user;
    await userProduction.click(screen.getByRole("button", { name: "Production" }));
    expect(screen.getByLabelText("Sort participation players")).toHaveValue("yards");
    expect(screen.getAllByText("Yards").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Touchdowns").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Receptions").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fantasy points").length).toBeGreaterThan(0);
    const resizer = screen.getByRole("separator", { name: "Resize player participation section" });
    fireEvent.keyDown(resizer, { key: "ArrowDown" });
    expect(resizer).toHaveAttribute("aria-valuenow", "494");
    const gameCall = fetch.mock.calls.map(([input]) => String(input)).find((url) => url.startsWith("/api/v1/game-breakdown?"));
    expect(new URL(gameCall, "http://local").searchParams.get("scoring")).toBe("half");

    await user.click(screen.getByRole("button", { name: "Back to team box scores" }));
    expect(await screen.findByLabelText("Scoring")).toHaveValue("half");
  });

  test("synchronizes column widths, stat visibility, markers, and league preferences across remounts", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/team-box-scores";
    const view = render(<App />);
    const table = await screen.findByRole("table", { name: "QB week-by-week player statistics" });

    const fptsResize = screen.getByRole("separator", { name: "Resize Fantasy points column" });
    fireEvent.keyDown(fptsResize, { key: "ArrowRight", shiftKey: true });
    expect(fptsResize).toHaveAttribute("aria-valuenow", "74");
    expect(table.querySelector('col[data-column="fantasy_points"]')).toHaveStyle({ width: "74px" });

    const playerResize = screen.getByRole("separator", { name: "Resize Player column" });
    fireEvent.keyDown(playerResize, { key: "ArrowRight", shiftKey: true });
    expect(table).toHaveStyle({ width: "950px" });

    await user.click(screen.getByRole("button", { name: /All defaults/ }));
    await user.click(screen.getByRole("checkbox", { name: "Passing yards" }));
    expect(table.querySelector('col[data-column="passing_yards"]')).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset defaults" }));
    expect(table.querySelector('col[data-column="passing_yards"]')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Test Player: No marker" }));
    const markerMenu = screen.getByRole("radiogroup", { name: "Marker for Test Player" });
    expect(markerMenu.parentElement).toBe(document.body);
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(screen.getByRole("radio", { name: "Like" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Dislike" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Maybe" })).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Favorite" }));
    expect(screen.getByRole("button", { name: "Test Player: Favorite" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All leagues" }));
    await user.click(screen.getByRole("checkbox", { name: "LOEG" }));
    expect(screen.getByText(/Roster sync is not connected yet/)).toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem("bowser:team-box-preferences:v2"));
    expect(stored.columnWidths.fantasy_points).toBe(74);
    expect(stored.columnWidths.player).toBe(202);
    expect(stored.markers["00-test"]).toBe("favorite");
    expect(stored.selectedLeagues).not.toContain("LOEG");

    view.unmount();
    render(<App />);
    const restoredTable = await screen.findByRole("table", { name: "QB week-by-week player statistics" });
    expect(restoredTable.querySelector('col[data-column="fantasy_points"]')).toHaveStyle({ width: "74px" });
    expect(await screen.findByRole("button", { name: "Test Player: Favorite" })).toBeInTheDocument();
  });

  test("renders total fantasy points and exposes individual and range week controls", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("button", { name: "Test Player" })).toBeInTheDocument();
    expect(screen.getByText("411.4")).toBeInTheDocument();

    expect(screen.queryByText("SELECT TOP")).not.toBeInTheDocument();
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("limit")).toBe("all"));
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("positions")).toBe("QB,RB,WR,TE"));

    await user.selectOptions(screen.getByLabelText("Position(s)"), "QB");
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("positions")).toBe("QB"));

    await user.selectOptions(screen.getByLabelText("Position(s)"), "FLEX");
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("positions")).toBe("RB,WR,TE"));

    await user.selectOptions(screen.getByLabelText("Team"), "BUF");
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("teams")).toBe("BUF"));

    await user.click(screen.getByRole("button", { name: /Regular · W1–18/ }));
    await user.click(screen.getByRole("button", { name: "Show only week 7" }));
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("weeks")).toBe("7"));

    await user.selectOptions(screen.getByLabelText("From"), "3");
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("weeks")).toBe("3,4,5,6,7"));

    await user.click(screen.getByRole("button", { name: "Full season" }));
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("weeks").split(",")).toHaveLength(22));
  });

  test("shows, hides, resizes, and restores every Player Database column", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await screen.findByRole("button", { name: "Test Player" });
    const table = screen.getByRole("table", { name: /2025 NFL player fantasy statistics/i });
    expect(screen.queryByRole("button", { name: "ADP" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Details" })).toHaveAttribute("colspan", "6");
    expect(screen.getByRole("columnheader", { name: "Usage" })).toHaveAttribute("colspan", "4");
    expect(screen.getByRole("columnheader", { name: "Passing" })).toHaveAttribute("colspan", "5");
    expect(screen.getByRole("columnheader", { name: "Rushing" })).toHaveAttribute("colspan", "4");
    expect(screen.getByRole("columnheader", { name: "Receiving" })).toHaveAttribute("colspan", "5");
    expect(screen.getByRole("columnheader", { name: "Fantasy" })).toHaveAttribute("colspan", "2");
    expect(screen.getByRole("link", { name: "Sun 12:00 pm vs KC" })).toHaveAttribute("href", expect.stringContaining("401-test"));
    expect(table.querySelector('col[data-column="draft_kings_price"]')).not.toBeInTheDocument();
    expect(table.querySelector('col[data-column="draft_kings_projection"]')).not.toBeInTheDocument();
    expect(table.querySelector('col[data-column="snap_pct"]')).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show draft rankings" }));
    expect(screen.getByRole("button", { name: "ADP" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "POS RK" })).toBeInTheDocument();
    expect(screen.getByText("18.6")).toHaveClass("draft-metric");
    expect(screen.getByText("QB7")).toHaveClass("draft-metric");

    const adpResizer = screen.getByRole("separator", { name: "Resize ADP column" });
    fireEvent.keyDown(adpResizer, { key: "ArrowRight", shiftKey: true });
    expect(adpResizer).toHaveAttribute("aria-valuenow", "76");
    expect(table.querySelector('col[data-column="adp"]')).toHaveStyle({ width: "76px" });

    await user.click(screen.getByRole("button", { name: "Hide draft rankings" }));
    expect(table.querySelector('col[data-column="adp"]')).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show draft rankings" })).toHaveAttribute("aria-pressed", "false");
    let stored = JSON.parse(localStorage.getItem("bowser:player-table-preferences:v1"));
    expect(stored.showDraftMetrics).toBe(false);
    expect(stored.columnWidths.adp).toBe(76);

    view.unmount();
    render(<App />);
    await screen.findByRole("button", { name: "Test Player" });
    expect(screen.queryByRole("button", { name: "ADP" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show draft rankings" }));
    expect(screen.getByRole("separator", { name: "Resize ADP column" })).toHaveAttribute("aria-valuenow", "76");

    await user.click(screen.getByRole("button", { name: "Show Yahoo fantasy statistics" }));
    expect(screen.getByText("% Ros")).toBeInTheDocument();
    expect(screen.getByText("LOEG: Robert's Team")).toHaveClass("yahoo-metric");
    expect(screen.getByLabelText("840 adds and 160 drops")).toBeInTheDocument();
    stored = JSON.parse(localStorage.getItem("bowser:player-table-preferences:v1"));
    expect(stored.showYahooMetrics).toBe(true);
  });

  test("shows sticky Player Trends beside their source metrics and an accessible depth chart", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await screen.findByRole("button", { name: "Test Player" });
    const table = screen.getByRole("table", { name: /2025 NFL player fantasy statistics/i });
    const columnOrder = Array.from(table.querySelectorAll("col")).map((column) => column.dataset.column);

    expect(columnOrder.indexOf("trend_snaps")).toBe(columnOrder.indexOf("snaps") + 1);
    expect(columnOrder.indexOf("trend_pass_attempts")).toBe(columnOrder.indexOf("passing_tds") + 1);
    expect(columnOrder.indexOf("trend_rush_attempts")).toBe(columnOrder.indexOf("rushing_tds") + 1);
    expect(columnOrder.indexOf("trend_targets")).toBe(columnOrder.indexOf("receiving_tds") + 1);
    expect(columnOrder.indexOf("trend_fantasy_points")).toBe(columnOrder.indexOf("fantasy_points") + 1);
    expect(columnOrder).not.toContain("depth_rank");
    expect(screen.getByRole("img", { name: /Snaps trend for Test Player: Week 1: 58;.*Week 10: 96/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Pass attempts trend for Test Player/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Rush attempts trend for Test Player/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Targets trend for Test Player: Week 1: 0/ })).toBeInTheDocument();
    expect(table.querySelector('.trend-rushing .trend-bar-item[title*="rush attempts"]')).toBeInTheDocument();
    const snapTrend = screen.getByRole("img", { name: /Snaps trend for Test Player/ });
    const targetTrend = screen.getByRole("img", { name: /Targets trend for Test Player/ });
    expect(snapTrend).toHaveAttribute("data-scale-mode", "focus");
    expect(snapTrend).toHaveAttribute("title", expect.stringContaining("focused row scale"));
    expect(targetTrend).toHaveAttribute("data-scale-mode", "zero");
    expect(targetTrend.querySelector('.trend-bar-item[data-week="1"]')).toHaveClass("zero");
    expect(Number.parseFloat(targetTrend.querySelector('.trend-bar-item[data-week="3"] i').style.getPropertyValue("--trend-height"))).toBeGreaterThan(20);
    expect(screen.getByText("Focus scale")).toBeInTheDocument();
    expect(screen.getAllByText("0 baseline").length).toBeGreaterThan(0);
    expect(latestPlayerUrl().searchParams.get("includeTrends")).toBe("1");

    const depthButton = screen.getByRole("button", { name: "Test Player is QB 2 on the BUF depth chart" });
    expect(depthButton).toHaveAttribute("aria-expanded", "false");
    await user.click(depthButton);
    expect(depthButton).toHaveAttribute("aria-expanded", "true");
    expect(depthButton).toHaveAttribute("aria-describedby", depthButton.getAttribute("aria-controls"));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toBeVisible();
    expect(tooltip).toHaveTextContent("BUF QB depth chart");
    expect(tooltip).toHaveTextContent("Starter Quarterback");
    expect(tooltip).toHaveTextContent("Third Quarterback");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    expect(depthButton).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Custom Columns" }));
    expect(screen.getByRole("dialog", { name: "Build a Player Database view" })).toBeVisible();
    await user.click(within(screen.getByRole("group", { name: "Trend window" })).getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Apply & save" }));
    expect(table.querySelectorAll(".trend-snaps .trend-bar-item")).toHaveLength(5);
    expect(screen.getAllByText("Last 5").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Hide player trends" }));
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("includeTrends")).toBe("0"));
    expect(table.querySelector('col[data-column="trend_snaps"]')).not.toBeInTheDocument();
    let stored = JSON.parse(localStorage.getItem("bowser:player-table-preferences:v1"));
    expect(stored.showPlayerTrends).toBe(false);

    view.unmount();
    render(<App />);
    await screen.findByRole("button", { name: "Test Player" });
    expect(screen.getByRole("button", { name: "Show player trends" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("table", { name: /2025 NFL player fantasy statistics/i }).querySelector('col[data-column="trend_snaps"]')).not.toBeInTheDocument();
  });

  test("collapses, proportionally resizes, auto-fits, and restores Player Database sections", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await screen.findByRole("button", { name: "Test Player" });
    let table = screen.getByRole("table", { name: /2025 NFL player fantasy statistics/i });

    await user.click(screen.getByRole("button", { name: "Custom Columns" }));
    const passingGroup = screen.getByText("Passing", { selector: ".column-settings-group > header b" }).closest("section");
    await user.click(within(passingGroup).getByLabelText("Hide Passing section"));
    await user.click(screen.getByRole("button", { name: "Apply & save" }));
    expect(table.querySelector('col[data-column="passing_attempts"]')).not.toBeInTheDocument();
    expect(table.querySelector('col[data-column="collapsed-passing"]')).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore Passing" })).toBeInTheDocument();
    let stored = JSON.parse(localStorage.getItem("bowser:player-table-preferences:v1"));
    expect(stored.collapsedGroups).toContain("passing");

    await user.click(screen.getByRole("button", { name: "Restore Passing" }));
    expect(table.querySelector('col[data-column="passing_attempts"]')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Section Resize" }));
    const passingResizer = screen.getByRole("separator", { name: "Resize Passing section" });
    const attemptsBefore = Number.parseInt(table.querySelector('col[data-column="passing_attempts"]').style.width, 10);
    const yardsBefore = Number.parseInt(table.querySelector('col[data-column="passing_yards"]').style.width, 10);
    fireEvent.keyDown(passingResizer, { key: "ArrowLeft", shiftKey: true });
    expect(Number.parseInt(table.querySelector('col[data-column="passing_attempts"]').style.width, 10)).toBeLessThan(attemptsBefore);
    expect(Number.parseInt(table.querySelector('col[data-column="passing_yards"]').style.width, 10)).toBeLessThan(yardsBefore);

    await user.click(screen.getByRole("button", { name: "Auto Fit" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Auto Fit" })).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(table.querySelector('col[data-column="snaps"]')).toHaveStyle({ width: "60px" }));
    stored = JSON.parse(localStorage.getItem("bowser:player-table-preferences:v1"));
    expect(stored.autoFit).toBe(true);

    view.unmount();
    render(<App />);
    await screen.findByRole("button", { name: "Test Player" });
    table = screen.getByRole("table", { name: /2025 NFL player fantasy statistics/i });
    expect(screen.getByRole("button", { name: "Auto Fit" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(table.querySelector('col[data-column="snaps"]')).toHaveStyle({ width: "60px" }));
  });

  test("customizes individual columns, follows trend dependencies, and consolidates collapsed sections", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Test Player" });
    const table = screen.getByRole("table", { name: /2025 NFL player fantasy statistics/i });

    await user.click(screen.getByRole("button", { name: "Custom Columns" }));
    const rushingGroup = screen.getByText("Rushing", { selector: ".column-settings-group > header b" }).closest("section");
    await user.click(within(rushingGroup).getByRole("button", { name: "Expand Rushing column choices" }));
    await user.click(within(rushingGroup).getByLabelText("Hide Rush attempts column"));

    const passingGroup = screen.getByText("Passing", { selector: ".column-settings-group > header b" }).closest("section");
    const receivingGroup = screen.getByText("Receiving", { selector: ".column-settings-group > header b" }).closest("section");
    await user.click(within(passingGroup).getByLabelText("Hide Passing section"));
    await user.click(within(receivingGroup).getByLabelText("Hide Receiving section"));
    await user.click(screen.getByRole("button", { name: "Apply & save" }));

    expect(table.querySelector('col[data-column="carries"]')).not.toBeInTheDocument();
    expect(table.querySelector('col[data-column="trend_rush_attempts"]')).not.toBeInTheDocument();
    expect(table.querySelector('col[data-column="passing_attempts"]')).not.toBeInTheDocument();
    expect(table.querySelector('col[data-column="targets"]')).not.toBeInTheDocument();
    expect(table.querySelector('[data-column^="collapsed-"]')).not.toBeInTheDocument();
    expect(table).toHaveClass("smart-compact");
    const consolidated = screen.getByRole("button", { name: "2 collapsed sections" });
    expect(consolidated).toBeInTheDocument();
    await user.click(consolidated);
    await user.click(screen.getByRole("menuitem", { name: "Restore all" }));
    expect(table.querySelector('col[data-column="passing_attempts"]')).toBeInTheDocument();
    expect(table.querySelector('col[data-column="targets"]')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Custom Columns" }));
    const usageGroup = screen.getByText("Usage", { selector: ".column-settings-group > header b" }).closest("section");
    await user.click(within(usageGroup).getByRole("button", { name: "Expand Usage column choices" }));
    await user.click(within(usageGroup).getByLabelText("Hide Snap trend column"));
    await user.click(screen.getByRole("button", { name: "Apply & save" }));
    expect(table.querySelector('col[data-column="trend_snaps"]')).not.toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem("bowser:player-table-preferences:v1"));
    expect(stored.hiddenColumns).toContain("carries");
    expect(stored.hiddenColumns).toContain("trend_snaps");
    expect(stored.collapsedGroups).toEqual([]);
  });

  test("highlights quick presets and saves a named Column Studio view", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "prompt").mockReturnValue("Weekly Research");
    render(<App />);
    await screen.findByRole("button", { name: "Test Player" });
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize Snaps column" }), { key: "ArrowRight", shiftKey: true });
    await user.click(screen.getByRole("button", { name: "Team" }));
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("sort")).toBe("team"));
    await user.click(screen.getByRole("button", { name: "Custom Columns" }));
    const balanced = screen.getByRole("button", { name: /Balanced/ });
    expect(balanced).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Opportunity/ }));
    expect(screen.getByRole("button", { name: /Opportunity/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Save full view including column sizes and sorting" }));
    const savedView = JSON.parse(localStorage.getItem("bowser:player-table-saved-views:v1")).find((view) => view.name === "Weekly Research");
    expect(savedView.config.columnWidths.snaps).toBe(76);
    expect(savedView.config.sorts).toEqual([{ key: "team", direction: "asc" }]);
  });

  test("reorders visible sections across hidden optional groups", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Test Player" });
    await user.click(screen.getByRole("button", { name: "Custom Columns" }));

    const visibleOrder = () => [...document.querySelectorAll(".column-studio-order > div > span")]
      .map((chip) => chip.childNodes[1]?.textContent?.trim() || "");
    expect(visibleOrder()).toEqual(["Details", "Usage", "Passing", "Rushing", "Receiving", "Fantasy"]);

    await user.click(screen.getByRole("button", { name: "Move Fantasy left" }));
    expect(visibleOrder()).toEqual(["Details", "Usage", "Passing", "Rushing", "Fantasy", "Receiving"]);

    const receivingChip = [...document.querySelectorAll(".column-studio-order > div > span")]
      .find((chip) => chip.textContent.includes("Receiving"));
    const fantasyChip = [...document.querySelectorAll(".column-studio-order > div > span")]
      .find((chip) => chip.textContent.includes("Fantasy"));
    fireEvent.dragStart(receivingChip);
    await waitFor(() => expect(receivingChip).toHaveClass("dragging"));
    fireEvent.dragOver(fantasyChip);
    fireEvent.drop(fantasyChip);
    expect(visibleOrder()).toEqual(["Details", "Usage", "Passing", "Rushing", "Receiving", "Fantasy"]);
  });

  test("stages saved-view selection until Apply and lets Current layout clear the selection", async () => {
    localStorage.setItem("bowser:player-table-saved-views:v1", JSON.stringify([{
      id: "saved-opportunity",
      name: "Saved Opportunity",
      config: {
        hiddenColumns: ["passing_attempts", "completions", "passing_yards", "passing_tds", "trend_pass_attempts"],
        collapsedGroups: ["passing"],
        showDraftMetrics: false,
        showYahooMetrics: false,
        showPlayerTrends: true,
        smartCompact: true,
        autoFit: false,
        trendGameCount: 5,
        groupOrder: ["player", "usage", "passing", "rushing", "receiving", "draft", "yahoo", "dfs", "advanced", "fantasy"],
        columnWidths: { snaps: 88 },
        sorts: [{ key: "team", direction: "asc" }],
      },
    }]));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Test Player" });
    const table = screen.getByRole("table", { name: /2025 NFL player fantasy statistics/i });

    await user.click(screen.getByRole("button", { name: "Custom Columns" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Saved view" }), "saved-opportunity");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(table.querySelector('col[data-column="passing_attempts"]')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("bowser:player-table-preferences:v1")).activeViewId).toBe("default");

    await user.click(screen.getByRole("button", { name: "Custom Columns" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Saved view" }), "saved-opportunity");
    await user.click(screen.getByRole("button", { name: "Apply & save" }));
    expect(table.querySelector('col[data-column="passing_attempts"]')).not.toBeInTheDocument();
    expect(table.querySelector('col[data-column="snaps"]')).toHaveStyle({ width: "88px" });
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("sort")).toBe("team"));
    expect(JSON.parse(localStorage.getItem("bowser:player-table-preferences:v1")).activeViewId).toBe("saved-opportunity");

    await user.click(screen.getByRole("button", { name: "Custom Columns" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Saved view" }), "default");
    await user.click(screen.getByRole("button", { name: "Apply & save" }));
    expect(JSON.parse(localStorage.getItem("bowser:player-table-preferences:v1")).activeViewId).toBe("default");
  });

  test("opens an accessible player card with three working tabs", async () => {
    const user = userEvent.setup();
    render(<App />);
    const playerButton = await screen.findByRole("button", { name: "Test Player" });
    await user.click(playerButton);

    const dialog = await screen.findByRole("dialog", { name: "Test Player" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("31.2")).toBeInTheDocument();
    expect(screen.getByText("Roster data not connected")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Season Stats" }));
    expect(screen.getByRole("tabpanel", { name: "Season Stats" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Depth Chart" }));
    expect(screen.getByRole("tabpanel", { name: "Depth Chart" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close player card" }));
    await waitFor(() => expect(playerButton).toHaveFocus());
  });

  test("cycles unsorted state and supports a shift-click secondary sort", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await screen.findByRole("button", { name: "Test Player" });
    const nameButton = screen.getByRole("button", { name: "Name" });
    const teamButton = screen.getByRole("button", { name: "Team" });

    await user.click(nameButton);
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("sort")).toBe("name"));
    expect(nameButton.closest("th")).toHaveAttribute("aria-sort", "ascending");

    fireEvent.click(teamButton, { shiftKey: true });
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("sort")).toBe("name,team"));
    expect(teamButton.closest("th")).toHaveAttribute("aria-sort", "ascending");
    expect(JSON.parse(localStorage.getItem("bowser:player-table-preferences:v1")).sorts).toEqual([
      { key: "name", direction: "asc" },
      { key: "team", direction: "asc" },
    ]);

    view.unmount();
    render(<App />);
    await screen.findByRole("button", { name: "Test Player" });
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("sort")).toBe("name,team"));
    const restoredNameButton = screen.getByRole("button", { name: "Name" });
    const restoredTeamButton = screen.getByRole("button", { name: "Team" });
    expect(restoredNameButton.closest("th")).toHaveAttribute("aria-sort", "ascending");
    expect(restoredTeamButton.closest("th")).toHaveAttribute("aria-sort", "ascending");

    await user.click(restoredNameButton);
    await user.click(restoredNameButton);
    await user.click(restoredNameButton);
    expect(restoredNameButton.closest("th")).toHaveAttribute("aria-sort", "none");
  });
});
