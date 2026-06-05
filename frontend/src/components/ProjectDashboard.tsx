import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Section } from "./Section";
import { CalendarMonthView } from "./CalendarMonthView";
import { RecordMap } from "../lib/api";

export function ProjectDashboard({
  summary,
  onEventClick
}: {
  summary: RecordMap | null;
  onEventClick: (event: RecordMap) => void;
}) {
  const calendarItems = summary?.calendar_items || [];
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const upcomingItems = upcomingProjectItems(calendarItems);
  const nextItem = upcomingItems[0];

  return (
    <div className="project-dashboard">
      <Section title="Project Dashboard" eyebrow="Dates and next moves">
        <div className="metric-grid compact-grid">
          <article className="metric-card"><span>Sheets</span><strong>{summary?.sheet_count ?? 0}</strong></article>
          <article className="metric-card"><span>Rows</span><strong>{summary?.row_count ?? 0}</strong></article>
          <article className="metric-card"><span>Upcoming dates</span><strong>{calendarItems.length}</strong></article>
        </div>
      </Section>
      <Section title="Calendar" eyebrow="Compact">
        <button className="project-calendar-summary" type="button" onClick={() => setIsCalendarOpen(true)}>
          <CalendarDays size={22} />
          <div>
            <strong>{calendarItems.length}</strong>
            <span>row date{calendarItems.length === 1 ? "" : "s"}</span>
          </div>
          <small>{nextItem ? `Next: ${formatShortDate(nextItem.date_key || nextItem.date)} · ${nextItem.title || "Untitled row"}` : "Open full calendar"}</small>
        </button>
      </Section>

      {isCalendarOpen ? (
        <div className="modal-backdrop" onClick={() => setIsCalendarOpen(false)}>
          <div className="modal-panel calendar-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Project Calendar</h2>
              <button className="icon-button" type="button" onClick={() => setIsCalendarOpen(false)} title="Close calendar">
                <X size={20} />
              </button>
            </div>
            <div className="modal-content">
              <CalendarMonthView
                events={calendarItems}
                empty="Add dates in sheet rows to build the project calendar."
                focusDate={nextItem?.date_key || nextItem?.date || null}
                scopeLabel="This project"
                onEventClick={(event) => {
                  setIsCalendarOpen(false);
                  onEventClick(event);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function upcomingProjectItems(items: RecordMap[]) {
  const today = startOfDay(new Date());
  return items
    .filter((item) => {
      const date = parseDate(item.date_key || item.date);
      return date ? date >= today : false;
    })
    .sort((first, second) => {
      const firstDate = parseDate(first.date_key || first.date)?.getTime() || 0;
      const secondDate = parseDate(second.date_key || second.date)?.getTime() || 0;
      return firstDate - secondDate;
    });
}

function parseDate(value: unknown) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return startOfDay(new Date(year, month - 1, day));
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatShortDate(value: unknown) {
  const date = parseDate(value);
  if (!date) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
