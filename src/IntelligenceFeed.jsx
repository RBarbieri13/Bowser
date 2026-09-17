import { useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise, ArrowSquareOut, Broadcast, ChartLineUp, Clock, Database,
  Funnel, MagnifyingGlass, Pulse, ShieldCheck, Sparkle, WarningCircle,
} from "@phosphor-icons/react";
import { TeamLogo } from "./teamLogos.jsx";

const POSITIONS = ["QB", "RB", "WR", "TE"];
const IMPACTS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function ageLabel(value) {
  const minutes = Math.round((Date.parse(value) - Date.now()) / 60000);
  if (!Number.isFinite(minutes)) return "Time unavailable";
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return relativeTime.format(hours, "hour");
  return relativeTime.format(Math.round(hours / 24), "day");
}

function sentimentLabel(sentiment) {
  const score = Number(sentiment?.score || 0);
  if (score >= 25) return "Rising";
  if (score <= -25) return "Falling";
  return "Neutral";
}

function EventCard({ event, onOpenPlayer, season }) {
  return (
    <article className={`intel-event impact-${event.fantasyImpact.toLowerCase()}`}>
      <div className="intel-player-mark">
        <TeamLogo team={event.player.team} />
        <span>{event.player.position}</span>
      </div>
      <div className="intel-event-body">
        <header>
          <div>
            <button type="button" className="intel-player-name player-name-link" onClick={e => onOpenPlayer?.({ ...event.player, player_id: event.player.gsisId, season }, e.currentTarget)}>{event.player.name} <small>{event.player.team}</small></button>
            <h2>{event.headline}</h2>
          </div>
          <time dateTime={event.lastUpdatedAt}>{ageLabel(event.lastUpdatedAt)}</time>
        </header>
        <div className="intel-badges">
          <span className={`impact-badge ${event.fantasyImpact.toLowerCase()}`}>{event.fantasyImpact} impact</span>
          <span>{event.status.replaceAll("_", " ")}</span>
          <span>{event.eventType.replaceAll("_", " ")}</span>
          <span>{event.sourceQuality.confidence}% source confidence</span>
        </div>
        <p>{event.summary}</p>
        <div className="intel-analysis">
          <Sparkle weight="fill" aria-hidden="true" />
          <div><b>Fantasy read</b><span>{event.fantasyAnalysis}</span></div>
        </div>
        <footer>
          <div className="intel-sentiment">
            <span>Fantasy sentiment</span>
            <i><b style={{ "--sentiment-position": `${Math.max(0, Math.min(100, (event.sentiment.score + 100) / 2))}%` }} /></i>
            <strong>{event.sentiment.score > 0 ? "+" : ""}{event.sentiment.score} · {sentimentLabel(event.sentiment)}</strong>
          </div>
          <div className="intel-source-links">
            {event.sources.map((source) => (
              <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                {source.sourceName}<ArrowSquareOut aria-hidden="true" />
              </a>
            ))}
          </div>
        </footer>
      </div>
    </article>
  );
}

export function IntelligenceFeed({ season = 2026, onOpenPlayer }) {
  const [tab, setTab] = useState("feed");
  const [hours, setHours] = useState("168");
  const [position, setPosition] = useState("ALL");
  const [impact, setImpact] = useState("ALL");
  const [search, setSearch] = useState("");
  const [feed, setFeed] = useState(null);
  const [sources, setSources] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ hours });
    if (position !== "ALL") params.set("position", position);
    if (impact !== "ALL") params.set("impact", impact);
    if (search.trim()) params.set("search", search.trim());
    return params;
  }, [hours, position, impact, search]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/v1/intelligence-feed?${query}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || "Unable to load intelligence feed");
        setFeed(payload);
      } catch (requestError) {
        if (requestError.name !== "AbortError") setError(requestError.message);
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 160);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [query]);

  useEffect(() => {
    fetch("/api/v1/intelligence-sources").then((response) => response.json()).then(setSources).catch(() => {});
  }, []);

  const runLiveScan = async () => {
    if (!feed?.meta?.provider?.configured || !feed?.meta?.provider?.storage?.ready) return;
    const token = window.prompt("Enter the Bowser operator refresh token")?.trim();
    if (!token) return;
    setRefreshing(true); setError("");
    try {
      const response = await fetch("/api/v1/intelligence-runs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": crypto.randomUUID(), "Content-Type": "application/json" },
        body: JSON.stringify({ source: "all", lookbackHours: Number(hours), positions: position === "ALL" ? POSITIONS : [position], query: search.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || "Live refresh failed");
      }
      const refreshed = await fetch(`/api/v1/intelligence-feed?${query}`, { cache: "no-store" });
      const refreshedPayload = await refreshed.json();
      if (!refreshed.ok) throw new Error(refreshedPayload.error?.message || "Refresh completed but the feed could not be reloaded");
      setFeed(refreshedPayload);
    } catch (requestError) { setError(requestError.message); }
    finally { setRefreshing(false); }
  };

  const configured = Boolean(feed?.meta?.provider?.configured);
  const storageReady = Boolean(feed?.meta?.provider?.storage?.ready);
  const refreshReady = configured && storageReady;
  return (
    <main className="intelligence-page">
      <section className="intelligence-hero">
        <div>
          <span className="page-eyebrow"><Broadcast weight="fill" /> Live research service</span>
          <h1>Fantasy Intelligence</h1>
          <p>Source-grounded NFL developments translated into fantasy impact—without confusing buzz, sentiment, and factual confidence.</p>
        </div>
        <div className={`intel-engine-status ${configured ? "ready" : "setup"}`}>
          {configured ? <Pulse weight="bold" /> : <WarningCircle weight="bold" />}
          <div><span>Live engine</span><strong>{refreshReady ? "Ready" : configured ? "Needs storage" : "Needs source access"}</strong><small>{refreshReady ? feed.meta.provider.model : "Verified snapshot mode"}</small></div>
        </div>
      </section>

      <section className="intel-control-deck" aria-label="Intelligence filters">
        <div className="intel-tabs" role="tablist" aria-label="Intelligence view">
          <button role="tab" aria-selected={tab === "feed"} className={tab === "feed" ? "active" : ""} onClick={() => setTab("feed")}><ChartLineUp />Event feed</button>
          <button role="tab" aria-selected={tab === "sources"} className={tab === "sources" ? "active" : ""} onClick={() => setTab("sources")}><Database />Source registry</button>
        </div>
        {tab === "feed" && <div className="intel-filter-row">
          <label className="intel-search"><MagnifyingGlass /><input aria-label="Search intelligence" placeholder="Player, team, or development…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label><span>Freshness</span><select value={hours} onChange={(event) => setHours(event.target.value)}><option value="6">Last 6 hours</option><option value="12">Last 12 hours</option><option value="24">Last 24 hours</option><option value="72">Last 3 days</option><option value="168">Last 7 days</option></select></label>
          <label><span>Position</span><select value={position} onChange={(event) => setPosition(event.target.value)}><option value="ALL">All positions</option>{POSITIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Impact</span><select value={impact} onChange={(event) => setImpact(event.target.value)}><option value="ALL">All impact levels</option>{IMPACTS.map((value) => <option key={value}>{value}</option>)}</select></label>
          <button className="intel-live-button" disabled={!refreshReady || refreshing} onClick={runLiveScan} title={refreshReady ? "Run an authenticated multi-source refresh" : configured ? "Add durable intelligence storage to enable refreshes" : "Configure a core source to enable refreshes"}><ArrowClockwise className={refreshing ? "spinning" : ""} />{refreshing ? "Refreshing" : "Refresh now"}</button>
        </div>}
      </section>

      {error && <div className="intel-error" role="alert"><WarningCircle />{error}</div>}
      {tab === "feed" ? (
        <section className="intel-feed-shell">
          <header className="intel-feed-summary">
            <div><Funnel /><span><b>{feed?.meta?.total ?? 0}</b> matching events</span></div>
            <div><Clock /><span>Snapshot {feed?.meta?.generatedAt ? ageLabel(feed.meta.generatedAt) : "loading"}</span></div>
            <div><ShieldCheck /><span>Confidence is source-based</span></div>
          </header>
          <div className="intel-method-strip"><span><b>Confidence</b> authority + corroboration</span><span><b>Sentiment</b> fantasy-value direction</span><span><b>Buzz</b> discussion velocity</span></div>
          {loading ? <div className="intel-loading" aria-live="polite"><Pulse />Loading intelligence…</div> : feed?.events?.length ? <div className="intel-event-list">{feed.events.map((event) => <EventCard key={event.eventId} event={event} season={season} onOpenPlayer={onOpenPlayer} />)}</div> : <div className="intel-empty"><MagnifyingGlass /><h2>No matching developments</h2><p>Widen the time window or clear a filter.</p></div>}
        </section>
      ) : (
        <section className="intel-source-shell">
          <header><div><h2>Source registry</h2><p>Every requested source is classified by rights, automation access, and its role in Bowser.</p></div><strong>{sources?.summary?.total ?? 0} reviewed</strong></header>
          <div className="intel-source-grid">
            {sources?.sources?.map((source) => <article key={source.id}>
              <div><span className={`source-adoption ${source.adoption}`}>{source.adoption.replaceAll("_", " ")}</span><small>{source.kind.replaceAll("_", " ")}</small></div>
              <h3>{source.name}</h3><p>{source.role}</p>
              <dl><div><dt>License</dt><dd>{source.license}</dd></div><div><dt>Automation</dt><dd>{source.automation.replaceAll("_", " ")}</dd></div></dl>
              <a href={source.url} target="_blank" rel="noreferrer">Inspect source<ArrowSquareOut /></a>
            </article>)}
          </div>
          <header><div><h2>Priority X accounts</h2><p>The deterministic account pass runs separately from broad X and web discovery.</p></div><strong>{sources?.xAccounts?.length ?? 0} active priorities</strong></header>
          <div className="intel-source-grid">
            {sources?.xAccounts?.map((account) => <article key={account.handle}><div><span className="source-adoption primary">priority</span><small>{account.tier.replaceAll("_", " ")}</small></div><h3>{account.handle}</h3><p>{account.name} · {account.sourceType.replaceAll("_", " ")}</p><a href={`https://x.com/${account.handle.slice(1)}`} target="_blank" rel="noreferrer">Inspect account<ArrowSquareOut /></a></article>)}
          </div>
        </section>
      )}
    </main>
  );
}
