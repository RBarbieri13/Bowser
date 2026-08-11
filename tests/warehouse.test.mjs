import assert from "node:assert/strict";
import test, { after } from "node:test";

import { closeDatabase, getMeta, queryPlayers, QueryValidationError } from "../server/stats-store.mjs";

after(() => closeDatabase());

test("warehouse metadata exposes complete 2025 scope", () => {
  const meta = getMeta();
  assert.equal(meta.season, 2025);
  assert.equal(meta.warehouse.players, 609);
  assert.equal(meta.warehouse.player_stat_rows, 5630);
  assert.equal(meta.warehouse.stat_rows_with_snap_match, 5630);
  for (const position of ["QB", "RB", "WR", "TE"]) assert.ok(meta.positions.includes(position));
});

test("postseason round names are normalized and snap-backed", () => {
  const result = queryPlayers(new URLSearchParams("seasonType=POST&scoring=ppr&limit=500"));
  assert.ok(result.data.length > 100);
  assert.ok(result.data.some((row) => row.snaps > 0));
  assert.equal(getMeta().warehouse.postseason_weeks.length, 4);
});

test("default request returns ranked PPR leaders quickly", () => {
  const result = queryPlayers(new URLSearchParams("seasonType=REG&scoring=ppr&limit=10"));
  assert.equal(result.data.length, 10);
  assert.ok(result.meta.totalCount > 300);
  assert.equal(result.data[0].rank, 1);
  assert.ok(result.data[0].fantasy_points_per_game >= result.data[1].fantasy_points_per_game);
  assert.ok(result.meta.queryMs < 250);
});

test("filters, weeks, search and sorting are server-side", () => {
  const result = queryPlayers(new URLSearchParams({
    seasonType: "REG", scoring: "half", positions: "QB", weeks: "1,2,3,4",
    search: "Allen", sort: "passing_yards", direction: "desc", limit: "25",
  }));
  assert.ok(result.data.length >= 1);
  assert.ok(result.data.every((row) => row.position === "QB"));
  assert.ok(result.data.every((row) => row.player_display_name.toLowerCase().includes("allen") || row.team.toLowerCase().includes("allen")));
});

test("PPR adds exactly one point per reception over standard", () => {
  const common = "seasonType=REG&search=Ja%27Marr%20Chase&limit=1";
  const standard = queryPlayers(new URLSearchParams(`${common}&scoring=standard`));
  const ppr = queryPlayers(new URLSearchParams(`${common}&scoring=ppr`));
  assert.equal(standard.data.length, 1);
  assert.equal(ppr.data.length, 1);
  assert.equal(Number((ppr.data[0].fantasy_points - standard.data[0].fantasy_points).toFixed(1)), ppr.data[0].receptions);
});

test("custom ranks and invalid query values are deterministic", () => {
  const ranked = queryPlayers(new URLSearchParams("ranks=1-3,8&limit=10"));
  assert.deepEqual(ranked.data.map((row) => row.rank), [1, 2, 3, 8]);
  assert.throws(() => queryPlayers(new URLSearchParams("sort=drop_table")), QueryValidationError);
  assert.throws(() => queryPlayers(new URLSearchParams("ranks=9-2")), QueryValidationError);
});

test("all players and multi-column sorts are queryable", () => {
  const all = queryPlayers(new URLSearchParams("seasonType=ALL&limit=all"));
  assert.equal(all.data.length, 609);
  const sorted = queryPlayers(new URLSearchParams("seasonType=REG&sort=position,name&direction=asc,asc&limit=all"));
  assert.equal(sorted.data.length, 608);
  assert.deepEqual(sorted.meta.sorts, [
    { key: "position", direction: "asc" },
    { key: "name", direction: "asc" },
  ]);
});
