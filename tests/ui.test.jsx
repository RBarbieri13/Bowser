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
    weeks: [{ week: 1, opponent: "KC", seasonType: "REG" }], playerCount: 1, queryMs: 2.4,
  },
};

function latestPlayerUrl() {
  const calls = fetch.mock.calls.map(([input]) => String(input)).filter((url) => url.startsWith("/api/v1/player-stats?"));
  return new URL(calls.at(-1), "http://local");
}

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = String(input);
    if (url === "/api/v1/meta") {
      return {
        ok: true,
        json: async () => ({ positions: ["QB", "RB", "WR", "TE"], teams: ["BUF", "KC"], weekOptions: Array.from({ length: 22 }, (_, index) => ({ week: index + 1 })) }),
      };
    }
    if (url.startsWith("/api/v1/player-profile?")) return { ok: true, json: async () => sampleProfile };
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
