import test from "node:test";
import assert from "node:assert/strict";
import { queryDfsLineup } from "../server/dfs-lineups.mjs";
import { getDfsSlate } from "../server/dfs-store.mjs";
import handler from "../api/v1/meta.mjs";
import {
  assignPlayer,
  createLineup,
  sanitizeLineups,
  snapshotKey,
  validateLineup,
} from "../src/lhq/dfsLineupModel.js";

const params = value => new URLSearchParams(value);

test("lineup API exposes full Classic pool including DST and unmatched salary records", () => {
  const lineup = queryDfsLineup(params("dfsSlate=2026-w2-dk-153427"));
  const playerSlate = getDfsSlate("2026-w2-dk-153427");
  assert.equal(lineup.meta.contest, "classic");
  assert.deepEqual(lineup.meta.lineupSlots, ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "DST"]);
  assert.equal(lineup.meta.salaryCap, 50000);
  assert.ok(lineup.data.length > playerSlate.records.length);
  assert.ok(lineup.meta.records.unmatchedPlayers > 0);
  assert.ok(lineup.meta.records.dstPlayers > 0);
  assert.ok(lineup.data.some(row => row.position === "DST" && row.eligibleSlots.includes("DST")));
  assert.ok(lineup.data.every(row => row.draftKingsId && row.id.includes(row.draftKingsId)));
});

test("lineup API preserves Showdown CPT and FLEX rows with official role pricing", () => {
  const lineup = queryDfsLineup(params("dfsSlate=2026-w2-dk-153434"));
  assert.equal(lineup.meta.contest, "showdown");
  assert.deepEqual(lineup.meta.lineupSlots, ["CPT", "FLEX", "FLEX", "FLEX", "FLEX", "FLEX"]);
  const flex = lineup.data.find(row => row.name === "Jahmyr Gibbs" && row.rosterPosition === "FLEX");
  const captain = lineup.data.find(row => row.name === "Jahmyr Gibbs" && row.rosterPosition === "CPT");
  assert.ok(flex);
  assert.ok(captain);
  assert.equal(captain.athleteKey, flex.athleteKey);
  assert.equal(captain.salary, flex.salary * 1.5);
  assert.equal(captain.projection, Number((flex.projection * 1.5).toFixed(4)));
  assert.equal(captain.projectionMultiplier, 1.5);
  assert.match(captain.projectionBasis, /Captain .*multiplier|CPT/);
});

test("lineup model validates cap, eligibility, duplicate athletes and incomplete projections", () => {
  const meta = { contest: "classic", season: 2026, week: 2, canonicalSlate: "fixture", captureIdentity: "fixture-capture" };
  const players = [
    { id: "qb", athleteKey: "a-qb", name: "Quarterback", position: "QB", salary: 9000, projection: 20 },
    { id: "rb", athleteKey: "a-rb", name: "Runner", position: "RB", salary: 40000, projection: 18 },
    { id: "dst", athleteKey: "a-dst", name: "Defense", position: "DST", salary: 3000, projection: null },
  ];
  let lineup = createLineup(meta);
  lineup = assignPlayer(lineup, players, "qb", "QB-0", meta);
  lineup = assignPlayer(lineup, players, "rb", "FLEX-7", meta);
  lineup = assignPlayer(lineup, players, "dst", "DST-8", meta);
  let result = validateLineup(lineup, players, meta);
  assert.equal(result.remainingSalary, -2000);
  assert.equal(result.projectionComplete, false);
  assert.match(result.errors.join(" "), /over the salary cap/);
  lineup = { ...lineup, slots: lineup.slots.map(slot => slot.id === "RB-1" ? { ...slot, playerId: "qb" } : slot) };
  result = validateLineup(lineup, players, meta);
  assert.match(result.errors.join(" "), /not eligible/);
});

test("Showdown model rejects the same athlete in CPT and FLEX", () => {
  const meta = { contest: "showdown", season: 2026, week: 2, canonicalSlate: "show", captureIdentity: "show-capture" };
  const players = [
    { id: "flex", athleteKey: "same", name: "Captain Candidate", position: "RB", rosterPosition: "FLEX", salary: 10000, projection: 12 },
    { id: "cpt", athleteKey: "same", name: "Captain Candidate", position: "RB", rosterPosition: "CPT", salary: 15000, projection: 18 },
  ];
  let lineup = createLineup(meta);
  lineup = assignPlayer(lineup, players, "cpt", "CPT-0", meta);
  lineup = { ...lineup, slots: lineup.slots.map(slot => slot.id === "FLEX-1" ? { ...slot, playerId: "flex" } : slot) };
  const result = validateLineup(lineup, players, meta);
  assert.match(result.errors.join(" "), /multiple slots/);
});

test("saved lineups are scoped to exact season/week/slate/capture", () => {
  const meta = { contest: "classic", season: 2026, week: 2, canonicalSlate: "a", captureId: "one", captureIdentity: "2026:W2:a:one" };
  const lineup = createLineup(meta, "Capture one");
  assert.equal(snapshotKey(meta), "bowser:dfs-lineups:v1:2026:w2:a:one");
  assert.equal(sanitizeLineups([lineup], meta).length, 1);
  assert.equal(sanitizeLineups([lineup], { ...meta, captureIdentity: "2026:W2:a:two", captureId: "two" }).length, 0);
});

test("metadata API routes dfs-lineup through the existing meta function", () => {
  const invoke = url => {
    const response = { setHeader() {}, end(text) { this.body = JSON.parse(text); } };
    handler({ method: "GET", url }, response);
    return response;
  };
  const ok = invoke("/api/v1/meta?view=dfs-lineup&dfsSlate=2026-w2-dk-153427");
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.meta.contest, "classic");
  const bad = invoke("/api/v1/meta?view=dfs-lineup&dfsSlate=missing");
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.error.field, "dfsSlate");
});
