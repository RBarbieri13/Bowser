// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  snap_pct: 90,
  passing_attempts: 500,
  completions: 350,
  completion_pct: 70,
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
  reception_pct: null,
  receiving_yards: 0,
  receiving_yards_per_game: 0,
  receiving_yards_per_reception: null,
  receiving_tds: 0,
  fantasy_points: 411.4,
  fantasy_points_per_game: 24.2,
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
    boxScore: sampleBoxScores.data.map((row) => ({ ...row, team: "BUF" })),
    availability: { scoringTimeline: true },
  },
  meta: { methodology: { playMix: "Rush and pass play mix from nflverse play-by-play." } },
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
        json: async () => ({ positions: ["QB", "RB", "WR", "TE"], teams: ["BUF", "KC"], weekOptions: Array.from({ length: 22 }, (_, index) => ({ week: index + 1 })) }),
      };
    }
    if (url.startsWith("/api/v1/player-profile?")) return { ok: true, json: async () => sampleProfile };
    if (url.startsWith("/api/v1/game-breakdown?")) return { ok: true, json: async () => sampleGameBreakdown };
    if (url.startsWith("/api/v1/team-box-scores?")) return { ok: true, json: async () => sampleBoxScores };
    return {
      ok: true,
      json: async () => ({ data: [samplePlayer], meta: { returnedCount: 1, totalCount: 609, queryMs: 4.2 } }),
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
    expect(screen.getByText("DK Salary")).toBeInTheDocument();
    expect(screen.getByText("DK Proj.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test Player" })).toBeInTheDocument();
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
    fireEvent.change(widthControl, { target: { value: "320" } });
    const table = await screen.findByRole("table", { name: "QB week-by-week player statistics" });
    expect(table).toHaveStyle({ width: "776px" });

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
    expect(screen.getByRole("heading", { name: "Score by quarter" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Score over time" })).toBeInTheDocument();
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
    expect(table).toHaveStyle({ width: "1034px" });

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

    await user.click(screen.getByLabelText("Limit results to top players"));
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("limit")).toBe("all"));

    await user.selectOptions(screen.getByLabelText("Position(s)"), "QB");
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("positions")).toBe("QB"));

    await user.click(screen.getByRole("button", { name: /Regular · W1–18/ }));
    await user.click(screen.getByRole("button", { name: "Show only week 7" }));
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("weeks")).toBe("7"));

    await user.selectOptions(screen.getByLabelText("From"), "3");
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("weeks")).toBe("3,4,5,6,7"));

    await user.click(screen.getByRole("button", { name: "Full season" }));
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("weeks").split(",")).toHaveLength(22));
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
    render(<App />);
    await screen.findByRole("button", { name: "Test Player" });
    const nameButton = screen.getByRole("button", { name: "Name" });
    const teamButton = screen.getByRole("button", { name: "Team" });

    await user.click(nameButton);
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("sort")).toBe("name"));
    expect(nameButton.closest("th")).toHaveAttribute("aria-sort", "ascending");

    fireEvent.click(teamButton, { shiftKey: true });
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("sort")).toBe("name,team"));
    expect(teamButton.closest("th")).toHaveAttribute("aria-sort", "ascending");

    await user.click(nameButton);
    await user.click(nameButton);
    await user.click(nameButton);
    expect(nameButton.closest("th")).toHaveAttribute("aria-sort", "none");
  });
});
