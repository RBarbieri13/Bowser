import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarBlank, CaretDown, Check } from "@phosphor-icons/react";

const POSTSEASON_LABELS = new Map([
  [19, "WC"],
  [20, "DIV"],
  [21, "CONF"],
  [22, "SB"],
]);

function rangeLabel(start, end) {
  if (start === 1 && end === 18) return "Regular · W1–18";
  if (start === 19 && end === 22) return "Postseason · W19–22";
  if (start === 1 && end === 22) return "Full season · W1–22";
  return start === end ? `Week ${start}` : `Weeks ${start}–${end}`;
}

export function WeekRangePicker({ start, end, min = 1, max = 22, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const weeks = useMemo(() => Array.from({ length: max - min + 1 }, (_, index) => min + index), [min, max]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const setStart = (value) => onChange(Math.min(value, end), end);
  const setEnd = (value) => onChange(start, Math.max(value, start));
  const selectSingleWeek = (week) => onChange(week, week);
  const presets = [
    { label: "Regular", start: 1, end: 18 },
    { label: "Postseason", start: 19, end: 22 },
    { label: "Full season", start: 1, end: 22 },
  ];

  return (
    <div className="field week-range-field" ref={rootRef}>
      <span className="field-label">Week(s)</span>
      <button
        type="button"
        className={`week-range-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <CalendarBlank aria-hidden="true" />
        <span>{rangeLabel(start, end)}</span>
        <CaretDown weight="bold" aria-hidden="true" />
      </button>

      {open ? (
        <div className="week-picker" role="dialog" aria-label="Select NFL week range">
          <div className="week-picker-heading">
            <div>
              <strong>Select week range</strong>
              <span>Totals update automatically</span>
            </div>
            <span className="week-selection-summary" aria-live="polite">{rangeLabel(start, end)}</span>
          </div>

          <div className="week-presets" aria-label="Week range presets">
            {presets.map((preset) => {
              const active = start === preset.start && end === preset.end;
              return (
                <button key={preset.label} type="button" className={active ? "active" : ""} onClick={() => onChange(preset.start, preset.end)}>
                  {active ? <Check weight="bold" aria-hidden="true" /> : null}
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="range-selectors">
            <label>
              <span>From</span>
              <select value={start} onChange={(event) => setStart(Number(event.target.value))}>
                {weeks.map((week) => <option key={week} value={week}>Week {week}{POSTSEASON_LABELS.has(week) ? ` · ${POSTSEASON_LABELS.get(week)}` : ""}</option>)}
              </select>
            </label>
            <span className="range-arrow" aria-hidden="true">through</span>
            <label>
              <span>To</span>
              <select value={end} onChange={(event) => setEnd(Number(event.target.value))}>
                {weeks.map((week) => <option key={week} value={week}>Week {week}{POSTSEASON_LABELS.has(week) ? ` · ${POSTSEASON_LABELS.get(week)}` : ""}</option>)}
              </select>
            </label>
          </div>

          <div className="dual-range" aria-label="Dynamic week range sliders">
            <label>
              <span className="sr-only">First selected week</span>
              <input type="range" min={min} max={max} value={start} onChange={(event) => setStart(Number(event.target.value))} />
            </label>
            <label>
              <span className="sr-only">Last selected week</span>
              <input type="range" min={min} max={max} value={end} onChange={(event) => setEnd(Number(event.target.value))} />
            </label>
          </div>

          <div className="week-phase-labels" aria-hidden="true"><span>Regular season · 1–18</span><span>Postseason · 19–22</span></div>
          <div className="week-grid" aria-label="Select one individual week">
            {weeks.map((week) => {
              const active = week >= start && week <= end;
              return (
                <button
                  type="button"
                  key={week}
                  className={`${active ? "in-range " : ""}${start === end && start === week ? "single" : ""}${week >= 19 ? " postseason" : ""}`}
                  onClick={() => selectSingleWeek(week)}
                  aria-label={`Show only week ${week}${POSTSEASON_LABELS.has(week) ? `, ${POSTSEASON_LABELS.get(week)}` : ""}`}
                >
                  <span>{week}</span>
                  {POSTSEASON_LABELS.has(week) ? <small>{POSTSEASON_LABELS.get(week)}</small> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
