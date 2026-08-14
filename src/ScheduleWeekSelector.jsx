import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsHorizontal, CaretDown, Check, Plus, X } from "@phosphor-icons/react";
import { gameTotalPoints, TeamLogo } from "./teamLogos.jsx";

const CARD_WIDTH = 96;
const CARD_GAP = 6;
const CARD_STEP = CARD_WIDTH + CARD_GAP;

function selectionLabel(start, end, extras) {
  const range = start === end ? `W${start}` : `W${start}–${end}`;
  if (!extras.length) return `${range} · ${end - start + 1} selected`;
  return `${range} + ${extras.map((week) => `W${week}`).join(", ")}`;
}

function fallbackSchedule(min, max) {
  return Array.from({ length: max - min + 1 }, (_, index) => ({
    week: min + index,
    opponent: null,
    seasonType: min + index > 18 ? "POST" : "REG",
  }));
}

function matchupDate(item) {
  if (!item.gameday) return "";
  const parsed = new Date(`${item.gameday}T${item.gametime || "12:00"}:00-04:00`);
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ScheduleWeekSelector({
  team,
  schedule = [],
  start,
  end,
  extras = [],
  min = 1,
  max = 22,
  onRangeChange,
  onExtrasChange,
  onOpenGame,
}) {
  const [open, setOpen] = useState(false);
  const [extraMode, setExtraMode] = useState(false);
  const [drag, setDrag] = useState(null);
  const trackRef = useRef(null);
  const triggerRef = useRef(null);
  const items = useMemo(() => {
    const scheduleByWeek = new Map(schedule.map((item) => [Number(item.week), item]));
    return fallbackSchedule(min, max).map((item) => ({ ...item, ...scheduleByWeek.get(item.week) }));
  }, [schedule, min, max]);
  const cleanExtras = useMemo(
    () => [...new Set(extras)].filter((week) => week < start || week > end).sort((a, b) => a - b),
    [extras, start, end],
  );

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!drag) return undefined;
    const onPointerMove = (event) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const weekAtPointer = Math.max(min, Math.min(max, min + Math.floor((event.clientX - rect.left + trackRef.current.scrollLeft) / CARD_STEP)));
      if (drag.type === "start") onRangeChange(Math.min(weekAtPointer, end), end);
      if (drag.type === "end") onRangeChange(start, Math.max(weekAtPointer, start));
      if (drag.type === "move") {
        const length = drag.end - drag.start;
        const nextStart = Math.max(min, Math.min(max - length, weekAtPointer - drag.offset));
        onRangeChange(nextStart, nextStart + length);
      }
    };
    const onPointerUp = () => setDrag(null);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp, { once: true });
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [drag, min, max, start, end, onRangeChange]);

  const startDrag = (event, type) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = trackRef.current?.getBoundingClientRect();
    const weekAtPointer = rect
      ? Math.max(min, Math.min(max, min + Math.floor((event.clientX - rect.left + trackRef.current.scrollLeft) / CARD_STEP)))
      : start;
    setDrag({ type, start, end, offset: Math.max(0, weekAtPointer - start) });
  };

  const toggleExtra = (week) => {
    if (week >= start && week <= end) return;
    onExtrasChange(cleanExtras.includes(week) ? cleanExtras.filter((value) => value !== week) : [...cleanExtras, week]);
  };

  const setRange = (nextStart, nextEnd) => {
    onRangeChange(nextStart, nextEnd);
    onExtrasChange(cleanExtras.filter((week) => week < nextStart || week > nextEnd));
  };

  return (
    <section className={`schedule-selector${open ? " open" : ""}`} aria-label={`${team} schedule week selector`}>
      <button
        ref={triggerRef}
        type="button"
        className="schedule-selector-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="schedule-week-filmstrip"
      >
        <span className="schedule-trigger-copy">
          <strong>{team} schedule</strong>
          <small>{selectionLabel(start, end, cleanExtras)}</small>
        </span>
        <span className="schedule-trigger-action">{open ? "Hide matchups" : "Choose weeks & matchups"}</span>
        <CaretDown weight="bold" aria-hidden="true" />
      </button>

      {open ? (
        <div id="schedule-week-filmstrip" className="schedule-selector-body">
          <div className="schedule-selector-heading">
            <div>
              <strong>{team} 2025 schedule</strong>
              <span>Drag the mint selection to move it, or resize either edge.</span>
            </div>
            <div className="schedule-mode-actions">
              <button
                type="button"
                className={extraMode ? "active" : ""}
                onClick={() => setExtraMode((current) => !current)}
                aria-pressed={extraMode}
              >
                {extraMode ? <Check weight="bold" /> : <Plus weight="bold" />}
                {extraMode ? "Adding individual weeks" : "Add individual weeks"}
              </button>
              {cleanExtras.length ? (
                <button type="button" onClick={() => onExtrasChange([])}><X weight="bold" /> Clear extras</button>
              ) : null}
            </div>
          </div>

          <div className="schedule-filmstrip-scroll" ref={trackRef}>
            <div className="schedule-filmstrip" style={{ "--schedule-card-count": items.length }}>
              {items.map((item) => {
                const inRange = item.week >= start && item.week <= end;
                const isExtra = cleanExtras.includes(item.week);
                const hasMatchup = Boolean(item.gameId);
                const date = matchupDate(item);
                const totalPoints = gameTotalPoints(item);
                return (
                  <div className="schedule-card-wrap" key={item.week}>
                    <button
                      type="button"
                      className={`schedule-card${inRange ? " in-range" : ""}${isExtra ? " extra" : ""}${item.seasonType === "POST" ? " postseason" : ""}${!hasMatchup ? " no-matchup" : ""}`}
                      onClick={() => extraMode ? toggleExtra(item.week) : setRange(item.week, item.week)}
                      disabled={extraMode && !hasMatchup}
                      aria-pressed={inRange || isExtra}
                      aria-label={`${inRange ? "Selected" : isExtra ? "Additional selected" : "Select"} week ${item.week}${item.opponent ? ` against ${item.opponent}` : hasMatchup ? "" : ", no matchup"}`}
                    >
                      <span className="schedule-week-label">W{item.week}</span>
                      <span className="schedule-opponent"><TeamLogo team={item.opponent} className="schedule-opponent-logo" decorative /><strong>{item.opponent ? `${item.homeAway === "away" ? "@" : "vs"} ${item.opponent}` : item.seasonType === "POST" ? "Did not advance" : "BYE"}</strong></span>
                      <small>{item.scoreLabel || (isExtra ? "Added week" : hasMatchup ? "Scheduled" : "No game")}</small>
                      {totalPoints !== null ? <span className="schedule-total" title="Total points scored">{totalPoints} PTS</span> : null}
                      {date ? <time>{date}</time> : null}
                    </button>
                    {item.gameId ? (
                      <button
                        type="button"
                        className="schedule-game-open"
                        onClick={() => onOpenGame?.(item)}
                        aria-label={`Open Week ${item.week}${item.opponent ? ` against ${item.opponent}` : ""} game breakdown`}
                      >Open</button>
                    ) : null}
                  </div>
                );
              })}

              <div
                className="schedule-brush"
                style={{
                  left: (start - min) * CARD_STEP,
                  width: (end - start + 1) * CARD_STEP - CARD_GAP,
                }}
              >
                <button type="button" className="brush-handle start" onPointerDown={(event) => startDrag(event, "start")} aria-label="Resize first selected week" />
                <button type="button" className="brush-move" onPointerDown={(event) => startDrag(event, "move")} aria-label="Move selected week range">
                  <ArrowsHorizontal weight="bold" aria-hidden="true" />
                </button>
                <button type="button" className="brush-handle end" onPointerDown={(event) => startDrag(event, "end")} aria-label="Resize last selected week" />
              </div>
            </div>
          </div>

          <div className="schedule-selector-footer">
            <span aria-live="polite"><strong>{end - start + 1 + cleanExtras.length}</strong> weeks selected · {selectionLabel(start, end, cleanExtras)}</span>
            <span>{extraMode ? "Click any matchup outside the range to add or remove it. Bye and unplayed postseason weeks stay unavailable." : "Turn on Add individual weeks for custom gaps."}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
