import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { RecordMap } from "../lib/api";
import "./calendar.css";

type CalendarMonthViewProps = {
  events: RecordMap[];
  empty: string;
  focusDate?: string | null;
  scopeLabel?: string;
  onEventClick?: (event: RecordMap) => void;
  /** SCHOLARDOCX-0185: when provided, shows an "Add Reminder" button in the
   *  side panel, pre-filled with whichever date is currently selected. */
  onAddReminder?: (dateKey: string) => void;
  /** Edit/delete affordances shown only on manual reminders (event.type ===
   *  "manual-reminder") — sheet-row dates have neither. */
  onEditReminder?: (event: RecordMap) => void;
  onDeleteReminder?: (event: RecordMap) => void;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarMonthView({ events, empty, focusDate, scopeLabel, onEventClick, onAddReminder, onEditReminder, onDeleteReminder }: CalendarMonthViewProps) {
  const today = startOfDay(new Date());
  const focusedDate = parseCalendarDate(focusDate) || today;
  const [year, setYear] = useMonthState(focusedDate.getFullYear(), focusedDate.getMonth());
  const selectedKey = eventDateKey(focusedDate);
  const [selectedDate, setSelectedDate] = useSelectedDate(selectedKey);

  const monthStart = new Date(year.value, year.month, 1);
  const days = buildCalendarDays(monthStart);
  const eventsByDay = groupByDay(events);
  const selectedEvents = eventsByDay.get(selectedDate) || [];

  const changeMonth = (delta: number) => {
    const next = new Date(year.value, year.month + delta, 1);
    setYear(next.getFullYear(), next.getMonth());
  };

  return (
    <div className="calendar-layout">
      <div className="calendar-month">
        <div className="calendar-toolbar">
          <button className="icon-button" type="button" onClick={() => changeMonth(-1)} title="Previous month">
            <ChevronLeft size={18} />
          </button>
          <div>
            <strong>{monthStart.toLocaleString(undefined, { month: "long", year: "numeric" })}</strong>
            {scopeLabel ? <span>{scopeLabel}</span> : null}
          </div>
          <button className="icon-button" type="button" onClick={() => changeMonth(1)} title="Next month">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="calendar-grid calendar-weekdays">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {days.map((day) => {
            const key = eventDateKey(day.date);
            const count = eventsByDay.get(key)?.length || 0;
            const selected = key === selectedDate;
            const isToday = key === eventDateKey(today);
            return (
              <button
                className={[
                  "calendar-day",
                  day.inMonth ? "" : "muted",
                  isToday ? "today" : "",
                  selected ? "selected" : "",
                  count ? "has-events" : ""
                ].filter(Boolean).join(" ")}
                key={key}
                type="button"
                onClick={() => setSelectedDate(key)}
              >
                <span>{day.date.getDate()}</span>
                {count ? <strong>{count}</strong> : null}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="calendar-side-panel">
        <div className="calendar-side-head">
          <CalendarDays size={18} />
          <div>
            <strong>{formatDay(selectedDate)}</strong>
            <span>{selectedEvents.length} event{selectedEvents.length === 1 ? "" : "s"}</span>
          </div>
          {onAddReminder && (
            <button
              className="icon-button calendar-add-reminder"
              type="button"
              onClick={() => onAddReminder(selectedDate)}
              title="Add reminder for this day"
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        {selectedEvents.length ? (
          <div className="calendar-event-list">
            {selectedEvents.map((event, index) => {
              const isManual = event.type === "manual-reminder";
              return (
                <div className="calendar-event-row" key={`${event.id ?? `${event.page_id}-${event.row_index}-${event.date_field}`}-${index}`}>
                  <button
                    className="calendar-event"
                    type="button"
                    onClick={() => onEventClick?.(event)}
                  >
                    <strong>{event.title || "Untitled row"}</strong>
                    <span>{event.date_field || "Date"} · {event.source || event.project_name || "Sheet"}</span>
                    {event.project_name ? <small>{event.project_name}</small> : null}
                  </button>
                  {isManual && (onEditReminder || onDeleteReminder) && (
                    <div className="calendar-event-actions">
                      {onEditReminder && (
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => onEditReminder(event)}
                          title="Edit reminder"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {onDeleteReminder && (
                        <button
                          className="icon-button calendar-event-delete"
                          type="button"
                          onClick={() => onDeleteReminder(event)}
                          title="Delete reminder"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty">{events.length ? "No row dates on this day." : empty}</p>
        )}
      </aside>
    </div>
  );
}

function useMonthState(initialYear: number, initialMonth: number) {
  const [value, setValue] = useState({ value: initialYear, month: initialMonth });
  return [
    value,
    (nextYear: number, nextMonth: number) => setValue({ value: nextYear, month: nextMonth })
  ] as const;
}

function useSelectedDate(initialDate: string) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  return [selectedDate, setSelectedDate] as const;
}

function buildCalendarDays(monthStart: Date) {
  const start = new Date(monthStart);
  start.setDate(1 - monthStart.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, inMonth: date.getMonth() === monthStart.getMonth() };
  });
}

function groupByDay(events: RecordMap[]): Map<string, RecordMap[]> {
  return events.reduce<Map<string, RecordMap[]>>((map, event) => {
    const key = String(event.date_key || eventDateKey(eventDate(event) || new Date()));
    const current = map.get(key) || [];
    current.push(event);
    map.set(key, current);
    return map;
  }, new Map<string, RecordMap[]>());
}

function eventDate(event: RecordMap | null | undefined) {
  if (!event) return null;
  const raw = event.date_key || event.date;
  return parseCalendarDate(raw);
}

function parseCalendarDate(raw: unknown) {
  if (!raw) return null;
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function eventDateKey(date: Date) {
  const normalized = startOfDay(date);
  const year = normalized.getFullYear();
  const month = String(normalized.getMonth() + 1).padStart(2, "0");
  const day = String(normalized.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatDay(key: string) {
  const parsed = new Date(`${key}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return key;
  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}
