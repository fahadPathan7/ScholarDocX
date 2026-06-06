import React, { useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

interface DateRangeCalendarProps {
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  onChange: (start: string, end: string) => void;
}

type NavMode = "days" | "months" | "years";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(str: string): Date | null {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function inRange(d: Date, start: Date | null, end: Date | null) {
  if (!start || !end) return false;
  const t = d.getTime();
  return t > start.getTime() && t < end.getTime();
}

function buildCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

// ─── Day grid for a single month ────────────────────────────────────────────
function MonthGrid({
  year, month, startDate, endDate, hoverDate,
  onDayClick, onDayHover, onDayLeave,
}: {
  year: number;
  month: number;
  startDate: Date | null;
  endDate: Date | null;
  hoverDate: Date | null;
  onDayClick: (d: Date) => void;
  onDayHover: (d: Date) => void;
  onDayLeave: () => void;
}) {
  const cells = buildCalendarDays(year, month);
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const previewEnd = !endDate && hoverDate ? hoverDate : endDate;

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-indigo-400 py-1 select-none">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;

          const isStart = !!(startDate && isSameDay(day, startDate));
          const isEnd = !!(endDate && isSameDay(day, endDate));
          const isInRange = inRange(day, startDate, previewEnd);
          const isPreviewEnd = !!(!endDate && hoverDate && isSameDay(day, hoverDate) && startDate);
          const isToday = isSameDay(day, today);
          const isPast = day.getTime() < todayMidnight.getTime();

          let cls =
            "relative flex items-center justify-center text-xs h-8 cursor-pointer select-none transition-colors duration-100 ";

          if (isStart || isEnd) {
            cls += "bg-indigo-600 text-white font-semibold rounded-full shadow-sm z-10 ";
          } else if (isPreviewEnd) {
            cls += "bg-indigo-400 text-white font-medium rounded-full z-10 ";
          } else if (isInRange) {
            cls += "bg-indigo-100 text-indigo-800 ";
          } else if (isToday) {
            cls += "text-indigo-600 font-semibold ring-1 ring-inset ring-indigo-300 rounded-full ";
          } else if (isPast) {
            cls += "text-slate-300 cursor-default rounded-full ";
          } else {
            cls += "text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-full ";
          }

          // half-bar behind start / end pill
          let rangeBar = "";
          if (isStart && (endDate || isPreviewEnd)) {
            rangeBar =
              "after:absolute after:inset-y-0 after:left-1/2 after:right-0 after:bg-indigo-100 after:-z-10 after:content-['']";
          } else if (isEnd && startDate) {
            rangeBar =
              "after:absolute after:inset-y-0 after:right-1/2 after:left-0 after:bg-indigo-100 after:-z-10 after:content-['']";
          }

          return (
            <div
              key={toLocalDateStr(day)}
              className={`${cls} ${rangeBar}`}
              onClick={() => !isPast && onDayClick(day)}
              onMouseEnter={() => !isPast && onDayHover(day)}
              onMouseLeave={onDayLeave}
            >
              {day.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Month picker (12 tiles) ─────────────────────────────────────────────────
function MonthPicker({
  year, currentMonth, onSelect, onYearChange,
}: {
  year: number;
  currentMonth: number;
  onSelect: (m: number) => void;
  onYearChange: (delta: number) => void;
}) {
  return (
    <div className="px-4 pb-4 pt-2">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => onYearChange(-1)}
          className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-sm font-bold text-slate-700">{year}</span>
        <button
          type="button"
          onClick={() => onYearChange(1)}
          className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {MONTHS_SHORT.map((m, i) => (
          <button
            key={m}
            type="button"
            onClick={() => onSelect(i)}
            className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
              i === currentMonth
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Year picker (decade + navigation) ──────────────────────────────────────
function YearPicker({
  currentYear, onSelect,
}: {
  currentYear: number;
  onSelect: (y: number) => void;
}) {
  // Show a 12-year window centred on currentYear
  const [decadeStart, setDecadeStart] = useState(Math.floor(currentYear / 12) * 12);
  const years = Array.from({ length: 12 }, (_, i) => decadeStart + i);

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setDecadeStart(d => d - 12)}
          className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-xs font-semibold text-slate-500">
          {decadeStart} – {decadeStart + 11}
        </span>
        <button
          type="button"
          onClick={() => setDecadeStart(d => d + 12)}
          className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {years.map(y => (
          <button
            key={y}
            type="button"
            onClick={() => onSelect(y)}
            className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
              y === currentYear
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
            }`}
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function DateRangeCalendar({ startDate, endDate, onChange }: DateRangeCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [navMode, setNavMode] = useState<NavMode>("days");

  const start = parseDate(startDate);
  const end = parseDate(endDate);

  const month2 = viewMonth === 11 ? 0 : viewMonth + 1;
  const year2 = viewMonth === 11 ? viewYear + 1 : viewYear;

  // ── month-by-month prev/next ──────────────────────────────────────────────
  const prev = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }, [viewMonth]);

  const next = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }, [viewMonth]);

  // ── month-picker callbacks ────────────────────────────────────────────────
  const handleMonthSelect = (m: number) => {
    setViewMonth(m);
    setNavMode("days");
  };
  const handleMonthYearChange = (delta: number) => setViewYear(y => y + delta);

  // ── year-picker callback ──────────────────────────────────────────────────
  const handleYearSelect = (y: number) => {
    setViewYear(y);
    setNavMode("months"); // drop into month picker next
  };

  // ── day selection ─────────────────────────────────────────────────────────
  const handleDayClick = useCallback((day: Date) => {
    const str = toLocalDateStr(day);
    if (!pickingEnd) {
      onChange(str, "");
      setPickingEnd(true);
    } else {
      if (start && day < start) {
        onChange(str, "");
        setPickingEnd(true);
      } else {
        onChange(startDate, str);
        setPickingEnd(false);
      }
    }
  }, [pickingEnd, start, startDate, onChange]);

  const handleHover = useCallback((day: Date) => {
    if (pickingEnd) setHoverDate(day);
  }, [pickingEnd]);

  const handleLeave = useCallback(() => setHoverDate(null), []);

  const fmt = (str: string) => {
    const d = parseDate(str);
    if (!d) return "—";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  // ── Header label: clickable month & year ─────────────────────────────────
  const HeaderLabel = ({ month, year, side }: { month: number; year: number; side: "left" | "right" }) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title="Pick month"
        onClick={() => setNavMode(navMode === "months" ? "days" : "months")}
        className="text-sm font-bold text-slate-700 hover:text-indigo-600 transition-colors px-0.5 rounded hover:bg-indigo-50"
      >
        {MONTHS_FULL[month]}
      </button>
      <button
        type="button"
        title="Pick year"
        onClick={() => setNavMode(navMode === "years" ? "days" : "years")}
        className="text-sm font-bold text-slateigo-600 hover:text-indigo-600 transition-colors px-0.5 rounded hover:bg-indigo-50"
      >
        {year}
      </button>
      {side === "left" && navMode !== "days" && (
        <span className="ml-0.5 text-[9px] text-indigo-400">▲</span>
      )}
    </div>
  );

  return (
    <div className="mt-3 rounded-xl border border-indigo-200 bg-white shadow-lg overflow-hidden">

      {/* ── Selected range bar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50/80 border-b border-indigo-100">
        <div className="flex-1 text-center">
          <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wide mb-0.5">Start</p>
          <p className={`text-sm font-semibold ${startDate ? "text-indigo-700" : "text-slate-400"}`}>
            {startDate ? fmt(startDate) : "Click a day"}
          </p>
        </div>
        <div className="w-px h-8 bg-indigo-200" />
        <div className="flex-1 text-center">
          <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wide mb-0.5">End</p>
          <p className={`text-sm font-semibold ${endDate ? "text-indigo-700" : "text-slate-400"}`}>
            {endDate ? fmt(endDate) : pickingEnd ? "Pick end date…" : "—"}
          </p>
        </div>
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={() => { onChange("", ""); setPickingEnd(false); }}
            className="ml-1 text-[10px] text-indigo-400 hover:text-rose-500 transition-colors font-medium px-2 py-1 rounded-md hover:bg-rose-50"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Navigation header ── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 border-b border-slate-100">
        <button
          type="button"
          onClick={navMode === "days" ? prev : () => setNavMode("days")}
          className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors"
          title={navMode === "days" ? "Previous month" : "Back to day view"}
        >
          {navMode === "days" ? <ChevronLeft size={16} /> : <ChevronUp size={16} />}
        </button>

        <div className="flex gap-6">
          <HeaderLabel month={viewMonth} year={viewYear} side="left" />
          {navMode === "days" && (
            <HeaderLabel month={month2} year={year2} side="right" />
          )}
        </div>

        <button
          type="button"
          onClick={navMode === "days" ? next : () => setNavMode("days")}
          className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors"
          title={navMode === "days" ? "Next month" : "Back to day view"}
        >
          {navMode === "days" ? <ChevronRight size={16} /> : <ChevronUp size={16} className="rotate-180" />}
        </button>
      </div>

      {/* ── Body: day grids / month picker / year picker ── */}
      {navMode === "days" && (
        <div className="grid grid-cols-2 gap-4 px-4 pb-4 pt-2">
          <MonthGrid
            year={viewYear} month={viewMonth}
            startDate={start} endDate={end} hoverDate={hoverDate}
            onDayClick={handleDayClick} onDayHover={handleHover} onDayLeave={handleLeave}
          />
          <MonthGrid
            year={year2} month={month2}
            startDate={start} endDate={end} hoverDate={hoverDate}
            onDayClick={handleDayClick} onDayHover={handleHover} onDayLeave={handleLeave}
          />
        </div>
      )}

      {navMode === "months" && (
        <MonthPicker
          year={viewYear}
          currentMonth={viewMonth}
          onSelect={handleMonthSelect}
          onYearChange={handleMonthYearChange}
        />
      )}

      {navMode === "years" && (
        <YearPicker
          currentYear={viewYear}
          onSelect={handleYearSelect}
        />
      )}

      {/* ── Hint footer ── */}
      <div className="px-4 pb-3 text-center border-t border-slate-50">
        <p className="text-[10px] text-slate-400 pt-2">
          {navMode !== "days"
            ? "Click month or year in the header to jump · ↑ to go back"
            : !startDate
            ? "Click a day to set start · click month/year to jump"
            : pickingEnd
            ? "Now click a day to set the end date"
            : "Date range selected ✓"}
        </p>
      </div>
    </div>
  );
}
