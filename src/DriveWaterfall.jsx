import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUUpRight, CaretLeft, CaretRight, Flag, FlagCheckered,
  Pause, Target, Warning, XCircle,
} from "@phosphor-icons/react";

const DESIGN_WIDTH = 1500;
const RESULT = {
  TD: { Icon: FlagCheckered, color: "#3ECF8E", background: "rgba(62,207,142,.16)", name: "Touchdown" },
  FG: { Icon: Target, color: "#E8C468", background: "rgba(232,196,104,.14)", name: "Field goal" },
  PUNT: { Icon: ArrowUUpRight, color: "#A3A3A3", background: "#242424", name: "Punt" },
  DOWNS: { Icon: XCircle, color: "#E58080", background: "rgba(229,128,128,.15)", name: "Turnover on downs" },
  INT: { Icon: Warning, color: "#E58080", background: "rgba(229,128,128,.17)", name: "Interception" },
  HALF: { Icon: Pause, color: "#A3A3A3", background: "#242424", name: "End of half" },
  KNEEL: { Icon: Flag, color: "#A3A3A3", background: "#242424", name: "Kneel out" },
};

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function fieldSpan(drive, awayTeam) {
  const away = drive.team === awayTeam;
  const x0 = away ? drive.ownStart : 100 - drive.ownStart;
  const x1 = clamp(away ? drive.ownStart + drive.yards : 100 - drive.ownStart - drive.yards, 0, 100);
  return { left: Math.min(x0, x1), width: Math.max(1.5, Math.abs(x1 - x0)), endX: x1, away };
}

function scoreParts(score = "0–0") {
  const [away = 0, home = 0] = String(score).split(/[–-]/).map(Number);
  return { away, home };
}

function teamTotals(drives, team) {
  return drives.filter((drive) => drive.team === team).reduce((total, drive) => ({
    yards: total.yards + Number(drive.yards || 0),
    plays: total.plays + Number(drive.plays || 0),
    top: total.top + Number(drive.topMin || 0),
    passYards: total.passYards + Number(drive.passYards || 0),
    runYards: total.runYards + Number(drive.runYards || 0),
  }), { yards: 0, plays: 0, top: 0, passYards: 0, runYards: 0 });
}

function periodKey(startMin) {
  if (startMin >= 60) return "OT";
  if (startMin >= 45) return "Q4";
  if (startMin >= 30) return "Q3";
  if (startMin >= 15) return "Q2";
  return "Q1";
}

function periodLabel(period) {
  return { Q1: "1ST QUARTER", Q2: "2ND QUARTER", Q3: "HALFTIME", Q4: "4TH QUARTER", OT: "OVERTIME" }[period];
}

function leaderLabel(margin, awayTeam, homeTeam) {
  if (!margin) return "TIED";
  return margin > 0 ? `${awayTeam} +${margin}` : `${homeTeam} +${Math.abs(margin)}`;
}

function hexToRgb(hex) {
  const value = String(hex).replace("#", "");
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16)).join(",");
}

function PeriodBreak({ period, score, awayTeam, homeTeam, awayColor, homeColor }) {
  const { away, home } = scoreParts(score);
  const leaderColor = away === home ? "#B4B4B4" : away > home ? awayColor : homeColor;
  const major = ["Q1", "Q3", "OT"].includes(period);
  const scoreCopy = period === "Q1" ? "KICKOFF · 0–0" : `${awayTeam} ${away} – ${home} ${homeTeam}`;
  return major ? (
    <div className="dw-period-major" aria-label={`${periodLabel(period)} ${scoreCopy}`}>
      <i /><span>{periodLabel(period)} <b style={{ color: leaderColor }}>{scoreCopy}</b></span><i />
    </div>
  ) : (
    <div className="dw-period-minor" aria-label={`${periodLabel(period)} ${scoreCopy}`}>
      <span>{periodLabel(period)}</span><b style={{ color: leaderColor }}>{scoreCopy}</b><i />
    </div>
  );
}

function DriveRow({ drive, previousScore, awayTeam, homeTeam, awayColor, homeColor }) {
  const { left, width, endX, away } = fieldSpan(drive, awayTeam);
  const teamColor = away ? awayColor : homeColor;
  const result = RESULT[drive.result] || RESULT.HALF;
  const ResultIcon = result.Icon;
  const scored = drive.result === "TD" || drive.result === "FG";
  const margin = Number(drive.marginAfter || 0);
  const leadColor = margin === 0 ? "#B4B4B4" : margin > 0 ? awayColor : homeColor;
  const leaderRgb = hexToRgb(margin > 0 ? awayColor : homeColor);
  const railAlpha = Math.min(.40, .10 + Math.abs(margin) / 10 * .30);
  const railBackground = margin === 0 ? "#1F1F1F" : `rgba(${leaderRgb},${railAlpha})`;
  const passPct = drive.yards > 0
    ? clamp(Math.round(Number(drive.passYards || 0) / Math.max(Number(drive.yards), 1) * 100), 0, 100)
    : Number(drive.passPlays || 0) > 0 ? 100 : 0;
  const showPass = width * passPct / 100 >= 5.5 && drive.passPlays > 0;
  const showRun = width * (100 - passPct) / 100 >= 5.5 && drive.runPlays > 0;
  const tooltip = `${drive.team} · ${result.name} · ${drive.plays} plays, ${drive.yards} yds · ${drive.passPlays}P/${drive.runPlays}R · ${Number(drive.topMin).toFixed(1)} min · start own ${drive.ownStart} · ${drive.scoreAfter} (${leaderLabel(margin, awayTeam, homeTeam)})`;
  return (
    <div className="dw-drive-row">
      <div className="dw-score-rail" style={{ background: railBackground, borderColor: scored ? teamColor : "#232323" }}>
        {scored && <span>{previousScore}</span>}
        <strong style={{ color: leadColor }}>{drive.scoreAfter}</strong>
        <small style={{ color: leadColor }}>{leaderLabel(margin, awayTeam, homeTeam)}</small>
      </div>
      <div className="dw-field-lane">
        <div className="dw-drive-stat" style={{ left: `${Math.min(left, 52)}%` }}>
          <span><b style={{ color: teamColor }}>{drive.team}</b> · {drive.plays} PL · {drive.yards} YD · {Number(drive.topMin).toFixed(1)}′</span>
          <em style={{ color: result.color, background: result.background, borderColor: result.color }}>
            <ResultIcon weight="bold" />{drive.result}
          </em>
        </div>
        <div
          className={`dw-drive-bar ${scored ? "is-scoring" : ""}`}
          style={{ left: `${left}%`, width: `${width}%`, borderColor: teamColor, boxShadow: scored ? `0 0 12px rgba(${hexToRgb(teamColor)},.5)` : "none" }}
          title={tooltip}
          tabIndex="0"
          aria-label={tooltip}
        >
          <span className="dw-pass-segment" style={{ width: `${passPct}%` }} title={`${drive.passPlays} passes → ${drive.passYards} yds`}>
            {showPass && <b>{drive.passPlays}P</b>}
          </span>
          <span className="dw-run-segment" title={`${drive.runPlays} rushes → ${drive.runYards} yds`}>
            {showRun && <b>{drive.runPlays}R</b>}
          </span>
        </div>
        {away
          ? <CaretRight className="dw-direction" weight="bold" style={{ left: `${endX}%`, color: teamColor, marginLeft: 1 }} />
          : <CaretLeft className="dw-direction" weight="bold" style={{ left: `${endX}%`, color: teamColor, marginLeft: -13 }} />}
      </div>
    </div>
  );
}

function TeamSummary({ team, color, totals, mirrored = false }) {
  const positivePass = Math.max(0, totals.passYards);
  const positiveRun = Math.max(0, totals.runYards);
  const totalSplit = positivePass + positiveRun;
  const passPct = totalSplit ? Math.round(positivePass / totalSplit * 100) : 0;
  return (
    <div className={`dw-team-summary ${mirrored ? "mirrored" : ""}`}>
      <div className="dw-team-copy">
        <strong style={{ background: color }}>{team}</strong>
        <span>{Math.round(totals.yards)} total yds · {totals.plays} plays · {totals.top.toFixed(1)}′ possession</span>
      </div>
      <div className="dw-team-split" title={`${team}: ${Math.round(positivePass)} passing yards, ${Math.round(positiveRun)} rushing yards`}>
        <span style={{ width: `${passPct}%` }}>{passPct}% PASS</span><b>{100 - passPct}% RUN</b>
      </div>
      <div className="dw-yardage-copy"><span>{Math.round(positivePass)} pass yds</span><b>{Math.round(positiveRun)} run yds</b></div>
    </div>
  );
}

export function DriveWaterfall({
  drives = [], awayTeam, homeTeam, awayColor = "#E58080", homeColor = "#3ECF8E", week,
  overtime = false,
}) {
  const frameRef = useRef(null);
  const canvasRef = useRef(null);
  const [frameHeight, setFrameHeight] = useState(0);
  const finalScore = drives.at(-1)?.scoreAfter || "0–0";
  const { away: awayScore, home: homeScore } = scoreParts(finalScore);
  const awayTotals = useMemo(() => teamTotals(drives, awayTeam), [drives, awayTeam]);
  const homeTotals = useMemo(() => teamTotals(drives, homeTeam), [drives, homeTeam]);
  const leadChanges = useMemo(() => {
    let previous = 0;
    return drives.reduce((count, drive) => {
      const current = Math.sign(Number(drive.marginAfter || 0));
      const changed = current !== 0 && previous !== 0 && current !== previous;
      if (current !== 0) previous = current;
      return count + (changed ? 1 : 0);
    }, 0);
  }, [drives]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return undefined;
    const update = () => {
      const scale = Math.min(1, frame.clientWidth / DESIGN_WIDTH);
      canvas.style.transform = `scale(${scale})`;
      setFrameHeight(Math.ceil(canvas.scrollHeight * scale));
    };
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drives.length]);

  let previousScore = "0–0";
  let previousPeriod = "";
  return (
    <section className="drive-waterfall-frame" ref={frameRef} style={{ height: frameHeight || "auto" }} aria-labelledby="drive-waterfall-title">
      <div className="drive-waterfall" ref={canvasRef} style={{ "--dw-away": awayColor, "--dw-home": homeColor }}>
        <header className="dw-title-block">
          <h1 id="drive-waterfall-title">Scoreboard–Rail Waterfall v2</h1>
          <p>Bar fill = run/pass split; frame = team, left rail = live scoreboard. Period breaks carry the score into the break; every drive ends in a color-coded outcome chip.</p>
        </header>
        <div className="dw-summary-panel">
          <TeamSummary team={awayTeam} color={awayColor} totals={awayTotals} />
          <div className="dw-game-score">
            <span>WK {week} · {overtime ? "FINAL/OT" : "FINAL"}</span>
            <strong><b style={{ color: awayColor }}>{awayScore}</b><i>–</i><b style={{ color: homeColor }}>{homeScore}</b></strong>
            <small>{leadChanges} LEAD CHANGES</small>
          </div>
          <TeamSummary team={homeTeam} color={homeColor} totals={homeTotals} mirrored />
        </div>
        <div className="dw-axis-row">
          <strong>SCOREBOARD</strong>
          <div>{[`${awayTeam} GOAL`, "10", "20", "30", "40", "50", "40", "30", "20", "10", `${homeTeam} GOAL`].map((label, index) => <span key={`${label}-${index}`} style={{ left: `${index * 10}%`, color: index === 0 ? awayColor : index === 10 ? homeColor : undefined }}>{label}</span>)}</div>
        </div>
        <div className="dw-sequence">
          {drives.map((drive) => {
            const period = periodKey(Number(drive.startMin));
            const showPeriod = period !== previousPeriod;
            const before = previousScore;
            previousScore = drive.scoreAfter;
            previousPeriod = period;
            return (
              <Fragment key={drive.driveNumber ?? `${drive.team}-${drive.startMin}`}>
                {showPeriod && <PeriodBreak period={period} score={before} awayTeam={awayTeam} homeTeam={homeTeam} awayColor={awayColor} homeColor={homeColor} />}
                <DriveRow drive={drive} previousScore={before} awayTeam={awayTeam} homeTeam={homeTeam} awayColor={awayColor} homeColor={homeColor} />
              </Fragment>
            );
          })}
        </div>
        <footer className="dw-legend">
          <span>Bar fill = yardage: <b>passing</b> vs <i>rushing</i> · number inside = play count (P passes / R rushes)</span>
          <span>Frame: <b style={{ color: awayColor }}>{awayTeam} →</b> · <b style={{ color: homeColor }}>← {homeTeam}</b></span>
          <span>Outcome chips: <b>TD</b> · <i>FG</i> · <em>turnover</em> · grey = punt/clock</span>
          <span>Rail tint = leader · struck score = before the drive</span>
        </footer>
      </div>
    </section>
  );
}
