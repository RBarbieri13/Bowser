// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DfsLineupBuilder } from "../src/lhq/DfsLineupBuilder.jsx";

const payload = {
  meta: {
    season: 2026,
    week: 2,
    canonicalSlate: "fixture-classic",
    key: "fixture-classic",
    captureId: "capture-a",
    captureIdentity: "2026:W2:fixture-classic:capture-a",
    capturedAt: "2026-09-17T12:00:00Z",
    contest: "classic",
    label: "Fixture Classic",
    salaryCap: 50000,
    lineupSlots: ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "DST"],
    positions: ["QB", "RB", "WR", "TE", "DST"],
    records: { salaryPlayers: 10, matchedPlayers: 9, unmatchedPlayers: 1, dstPlayers: 1, projectedPlayers: 9 },
    rules: "Classic fixture rules",
  },
  data: [
    { id: "qb", athleteKey: "qb", playerId: "00-qb", draftKingsId: "1", name: "Fixture QB", position: "QB", team: "BUF", salary: 7000, projection: 21, eligibleSlots: ["QB"], projectionSource: "Projection Source" },
    { id: "rb", athleteKey: "rb", playerId: "00-rb", draftKingsId: "2", name: "Fixture RB", position: "RB", team: "DET", salary: 6500, projection: 17, eligibleSlots: ["RB", "FLEX"], projectionSource: "Projection Source" },
    { id: "wr", athleteKey: "wr", playerId: "00-wr", draftKingsId: "3", name: "Fixture WR", position: "WR", team: "NYG", salary: 6200, projection: 16, eligibleSlots: ["WR", "FLEX"], projectionSource: "Projection Source" },
    { id: "te", athleteKey: "te", playerId: "00-te", draftKingsId: "4", name: "Fixture TE", position: "TE", team: "DAL", salary: 4300, projection: 9, eligibleSlots: ["TE", "FLEX"], projectionSource: "Projection Source" },
    { id: "dst", athleteKey: "dst", playerId: null, draftKingsId: "5", name: "Fixture Defense", position: "DST", team: "BUF", salary: 3100, projection: null, eligibleSlots: ["DST"], projectionUnavailableReason: "No sourced projection" },
  ],
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => payload })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("fetches its own slate pool, filters players, fills slots and saves by capture", async () => {
  render(<DfsLineupBuilder slate="fixture-classic" season={2026} onOpen={() => {}} />);
  await screen.findByText("Fixture Classic");
  await screen.findByRole("tab", { name: "Lineup 1" });
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/v1/meta?"), expect.objectContaining({ cache: "no-store" }));
  expect(new URL(fetch.mock.calls[0][0], "http://fixture.test").searchParams.get("view")).toBe("dfs-lineup");
  expect(new URL(fetch.mock.calls[0][0], "http://fixture.test").searchParams.get("dfsSlate")).toBe("fixture-classic");

  fireEvent.change(screen.getByLabelText("Filter lineup pool position"), { target: { value: "DST" } });
  expect(screen.getByText("Fixture Defense")).toBeInTheDocument();
  expect(screen.queryByText("Fixture QB")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Filter lineup pool position"), { target: { value: "All" } });
  fireEvent.change(screen.getByLabelText("Search lineup pool"), { target: { value: "fixture q" } });
  expect(screen.getByText("Fixture QB")).toBeInTheDocument();
  expect(screen.queryByText("Fixture RB")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Search lineup pool"), { target: { value: "" } });
  fireEvent.click(within(screen.getByText("Fixture QB").closest('[role="listitem"]')).getByText("Add"));
  expect(screen.getByRole("button", { name: /QB Fixture QB/ })).toBeInTheDocument();
  expect(screen.getByText("$43,000")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /DST Open slot/ }));
  fireEvent.click(within(screen.getByText("Fixture Defense").closest('[role="listitem"]')).getByText("Add"));
  expect(screen.getByText(/partial projection/i)).toBeInTheDocument();
  await waitFor(() => expect(JSON.parse(localStorage.getItem("bowser:dfs-lineups:v1:2026:w2:fixture-classic:capture-a"))[0].slots.some(slot => slot.playerId === "dst")).toBe(true));
});

test("does not load saved lineups from another capture", async () => {
  localStorage.setItem("bowser:dfs-lineups:v1:2026:w2:fixture-classic:old-capture", JSON.stringify([{ name: "Old capture", snapshot: { season: 2026, week: 2, slate: "fixture-classic", captureIdentity: "old" }, slots: [] }]));
  render(<DfsLineupBuilder slate="fixture-classic" season={2026} />);
  await screen.findByText("Fixture Classic");
  await screen.findByRole("tab", { name: "Lineup 1" });
  expect(screen.queryByRole("tab", { name: "Old capture" })).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Lineup 1" })).toBeInTheDocument();
});
