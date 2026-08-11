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
  fantasy_points_per_game: 24.2,
  rank: 1,
};

function latestPlayerUrl() {
  const calls = fetch.mock.calls.map(([input]) => String(input)).filter((url) => url.startsWith("/api/v1/player-stats?"));
  return new URL(calls.at(-1), "http://local");
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = String(input);
    if (url === "/api/v1/meta") {
      return {
        ok: true,
        json: async () => ({ positions: ["QB", "RB", "WR", "TE"], teams: ["BUF", "KC"] }),
      };
    }
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
  test("renders live rows and exposes every player and week through controls", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText("Test Player")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Limit results to top players"));
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("limit")).toBe("all"));

    await user.selectOptions(screen.getByLabelText("Position(s)"), "QB");
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("positions")).toBe("QB"));

    await user.click(screen.getByRole("button", { name: "Open more filters" }));
    await user.type(screen.getByLabelText("NFL weeks"), "1, 3, 7");
    await waitFor(() => expect(latestPlayerUrl().searchParams.get("weeks")).toBe("1, 3, 7"));
  });

  test("cycles unsorted state and supports a shift-click secondary sort", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Test Player");
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
