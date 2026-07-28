import { ReactNode, useState } from "react";
import { CalendarDays, FileText, FolderOpen, X } from "lucide-react";
import { CalendarMonthView } from "./CalendarMonthView";
import { Section } from "./Section";
import { AddReminderModal } from "./AddReminderModal";
import { api, deleteRecord, updateRecord, RecordMap, API_BASE } from "../lib/api";
import { formatLongDate, formatShortDate, parseLocalDate, startOfLocalDay } from "../lib/date";
import { getToken } from "../lib/auth";
import type { Dashboard } from "../App";

export function DashboardView({
  dashboard,
  notificationCount,
  onCalendarEventClick,
  onProjectClick,
  onRefreshDashboard
}: {
  dashboard: Dashboard;
  notificationCount: number;
  onCalendarEventClick: (event: RecordMap) => void;
  onProjectClick?: (projectId: string) => void;
  onRefreshDashboard: () => void | Promise<void>;
}) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isAddReminderOpen, setIsAddReminderOpen] = useState(false);
  const [reminderDate, setReminderDate] = useState<string | null>(null);
  const [editingReminder, setEditingReminder] = useState<RecordMap | null>(null);
  const libraries = dashboard.feature_libraries || {};
  const cards: { label: string; value: number; max?: number | null }[] = [
    { label: "Projects", value: dashboard.counts.projects ?? 0 },
    { label: "Sheets", value: dashboard.counts.project_sheets ?? 0 },
    { label: "Documents", value: dashboard.counts.documents ?? 0 },
    { label: "Sticky notes", value: dashboard.counts.sticky_notes ?? 0 },
    { label: "White boards", value: dashboard.counts.whiteboards ?? 0 },
    { label: "Calendar dates", value: futureCalendarCount(dashboard.calendar_items || []) },
    // SCHOLARDOCX-0187: per-feature library counts, red when at/over cap.
    { label: "Advisor Atlas history", value: libraries.advisor_atlas_history?.count ?? 0, max: libraries.advisor_atlas_history?.max },
    { label: "Research Expert library", value: libraries.research_expert_library?.count ?? 0, max: libraries.research_expert_library?.max },
    { label: "Scholarship Hunt searches", value: libraries.scholarship_previous_searches?.count ?? 0, max: libraries.scholarship_previous_searches?.max },
    { label: "Opportunity Library", value: libraries.scholarship_opportunity_library?.count ?? 0, max: libraries.scholarship_opportunity_library?.max }
  ];
  // SCHOLARDOCX-0176: split into Today and Next 7 Days (tomorrow → +7).
  // SCHOLARDOCX-0185: both sections carry a done checkbox — dashboard-only
  // bookkeeping, sorted unchecked-first, checked items pushed to the bottom.
  const todaysEvents = sortByDone(todayEvents(dashboard.calendar_items || []));
  const followingEvents = sortByDone(upcomingEventsExcludingToday(dashboard.calendar_items || [], 7));
  const nextCalendarEvent = nextFeaturedEvent(dashboard.calendar_items || []);
  const pinnedProjects = dashboard.pinned_projects || [];
  const pinnedSheets = dashboard.pinned_sheets || [];
  const pinnedDocs = dashboard.pinned_docs || [];

  const handleToggleDone = async (event: RecordMap, done: boolean) => {
    try {
      if (event.type === "manual-reminder") {
        await updateRecord("calendar_reminders", String(event.id), { is_done: done });
      } else {
        await api.post("/calendar/sheet-item-marks", {
          page_id: event.page_id,
          row_index: event.row_index,
          date_field: event.date_field,
          is_done: done
        });
      }
    } finally {
      await onRefreshDashboard();
    }
  };

  const handleDeleteReminder = async (event: RecordMap) => {
    try {
      await deleteRecord("calendar_reminders", String(event.id));
    } finally {
      await onRefreshDashboard();
    }
  };

  const handleEditReminder = (event: RecordMap) => {
    setEditingReminder(event);
    setIsAddReminderOpen(true);
  };

  return (
    <div className="page-grid dashboard-grid">
      <Section title="Workspace Snapshot" eyebrow="Overview" className="dashboard-snapshot">
        <div className="metric-grid">
          {cards.map(({ label, value, max }) => {
            const atCap = typeof max === "number" && max > 0 && value >= max;
            return (
              <article className="metric-card" key={label}>
                <span>{label}</span>
                <strong className={atCap ? "metric-at-cap" : undefined}>
                  {value}
                </strong>
              </article>
            );
          })}
        </div>
      </Section>

      <Section title="Project Calendar" eyebrow="Upcoming dates" className="dashboard-calendar">
        <button className="project-calendar-summary" type="button" onClick={() => setIsCalendarOpen(true)}>
          <CalendarDays size={22} />
          <div>
            <strong>{futureCalendarCount(dashboard.calendar_items || [])}</strong>
            <span>upcoming date{futureCalendarCount(dashboard.calendar_items || []) === 1 ? "" : "s"}</span>
          </div>
          <small>
            {nextCalendarEvent
              ? `Next: ${formatShortDate(nextCalendarEvent.date_key || nextCalendarEvent.date)} · ${nextCalendarEvent.title || "Untitled row"}`
              : "Open full calendar"}
          </small>
        </button>

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
                  events={dashboard.calendar_items || []}
                  empty="Add dates in project sheet rows to build the central calendar."
                  focusDate={nextCalendarEvent?.date_key || nextCalendarEvent?.date || null}
                  scopeLabel="All projects"
                  onEventClick={(event) => {
                    setIsCalendarOpen(false);
                    onCalendarEventClick(event);
                  }}
                  onAddReminder={(dateKey) => {
                    setEditingReminder(null);
                    setReminderDate(dateKey);
                    setIsAddReminderOpen(true);
                  }}
                  onEditReminder={handleEditReminder}
                  onDeleteReminder={handleDeleteReminder}
                />
              </div>
            </div>
          </div>
        ) : null}
      </Section>

      {/* formatDegreeType helper ensures 'phd' is properly capitalized */}
      <Section title="Pinned Projects" eyebrow="Dashboard" className="dashboard-pinned-projects">
        <List
          items={pinnedProjects}
          empty="Pin projects to dashboard."
          onClick={(item) => onProjectClick?.(item.id)}
          render={(item) => (
            <>
              <FolderOpen size={14} />
              <div>
                <strong>{item.name}</strong>
                <span>{item.degree_type ? (item.degree_type.toLowerCase() === 'phd' ? 'PhD' : item.degree_type.charAt(0).toUpperCase() + item.degree_type.slice(1)) : "Degree TBD"} · {item.sheet_count} sheets</span>
              </div>
            </>
          )}
        />
      </Section>

      <Section title="Today" eyebrow="Dates due today" className="dashboard-today">
        {todaysEvents.length ? (
          <div className="upcoming-event-list">
            {todaysEvents.map((event, index) => (
              <EventRow
                key={`today-${event.id ?? `${event.page_id}-${event.row_index}-${event.date_field}`}-${index}`}
                event={event}
                onEventClick={onCalendarEventClick}
                onToggleDone={handleToggleDone}
              />
            ))}
          </div>
        ) : (
          <p className="empty">Nothing due today.</p>
        )}
      </Section>

      <Section title="Next 7 Days" eyebrow="From tomorrow onward" className="dashboard-upcoming">
        {followingEvents.length ? (
          <div className="upcoming-event-list">
            {followingEvents.map((event, index) => (
              <EventRow
                key={`${event.id ?? `${event.page_id}-${event.row_index}-${event.date_field}`}-${index}`}
                event={event}
                onEventClick={onCalendarEventClick}
                onToggleDone={handleToggleDone}
              />
            ))}
          </div>
        ) : (
          <p className="empty">No row dates in the next 7 days.</p>
        )}
      </Section>

      <Section title="Pinned Sheets" eyebrow="Dashboard" className="dashboard-pinned-sheets">
        <List
          items={pinnedSheets}
          empty="Pin sheets to dashboard."
          onClick={(item) => onCalendarEventClick({ project_id: item.project_id, sheet_id: item.sheet_id, page_id: item.id })}
          render={(item) => (
            <>
              <FileText size={14} />
              <div>
                <strong>{item.name}</strong>
                <span>{item.project_name || "Project"} · Created {formatLongDate(item.created_at)}</span>
              </div>
            </>
          )}
        />
      </Section>

      <Section title="Pinned Docs" eyebrow="Dashboard" className="dashboard-pinned-docs">
        <List
          items={pinnedDocs}
          empty="Pin docs to dashboard."
          onClick={(item) => {
            const token = getToken();
            const url = `${API_BASE}/files/${item.id}/content${token ? `?token=${encodeURIComponent(token)}` : ""}`;
            window.open(url, "_blank", "noopener,noreferrer");
          }}
          render={(item) => (
            <>
              <FileText size={14} />
              <div>
                <strong>{item.display_name}</strong>
                <span>{item.file_type || "Document"} · {formatLongDate(item.created_at)}</span>
              </div>
            </>
          )}
        />
      </Section>

      {isAddReminderOpen && (
        <AddReminderModal
          initialDate={reminderDate}
          editingReminder={editingReminder}
          onClose={() => {
            setIsAddReminderOpen(false);
            setEditingReminder(null);
          }}
          onCreated={() => onRefreshDashboard()}
        />
      )}
    </div>
  );
}

// SCHOLARDOCX-0185: one row in Today / Next 7 Days — a checkbox (dashboard-
// only "done" bookkeeping, never written back to the sheet row), the
// existing clickable event body (disabled once checked). Edit/delete for
// manual reminders live in the calendar view only, not here.
function EventRow({
  event,
  onEventClick,
  onToggleDone
}: {
  event: RecordMap;
  onEventClick: (event: RecordMap) => void;
  onToggleDone: (event: RecordMap, done: boolean) => void;
}) {
  const isDone = !!event.is_done;
  return (
    <div className={`upcoming-event-row${isDone ? " done" : ""}`}>
      <input
        type="checkbox"
        className="upcoming-event-checkbox"
        checked={isDone}
        onChange={(e) => onToggleDone(event, e.target.checked)}
        title={isDone ? "Mark as not done" : "Mark as done"}
      />
      <button
        className="upcoming-event"
        type="button"
        disabled={isDone}
        onClick={() => onEventClick(event)}
      >
        <span>{formatShortDate(event.date_key || event.date)}</span>
        <div>
          <strong>{event.title || "Untitled row"}</strong>
          <small>{event.date_field || "Date"} · {event.source || "Sheet"} · {event.project_name || "Project"}</small>
        </div>
      </button>
    </div>
  );
}

function List({
  items,
  empty,
  onClick,
  render
}: {
  items: RecordMap[];
  empty: string;
  onClick?: (item: RecordMap) => void;
  render: (item: RecordMap) => ReactNode;
}) {
  if (!items.length) {
    return <p className="empty">{empty}</p>;
  }
  return (
    <div className="list">
      {items.map((item) => (
        <article
          key={item.id}
          onClick={onClick ? () => onClick(item) : undefined}
          style={onClick ? { cursor: 'pointer' } : undefined}
        >
          {render(item)}
        </article>
      ))}
    </div>
  );
}

function futureCalendarCount(events: RecordMap[]) {
  const today = startOfLocalDay(new Date());
  return events.filter((event) => {
    const date = parseLocalDate(event.date_key || event.date);
    return date ? date >= today : false;
  }).length;
}

function nextFeaturedEvent(events: RecordMap[]) {
  const today = startOfLocalDay(new Date());
  return [...events]
    .filter((event) => {
      const date = parseLocalDate(event.date_key || event.date);
      return date ? date >= today : false;
    })
    .sort((first, second) => {
      const firstDate = parseLocalDate(first.date_key || first.date)?.getTime() || 0;
      const secondDate = parseLocalDate(second.date_key || second.date)?.getTime() || 0;
      return firstDate - secondDate;
    })[0];
}

// SCHOLARDOCX-0176: split the dashboard "Next 7 Days" into two sections —
// events dated today, and events from tomorrow through +10 days.
function todayEvents(events: RecordMap[]) {
  const today = startOfLocalDay(new Date());
  return events
    .filter((event) => {
      const date = parseLocalDate(event.date_key || event.date);
      return date ? date.getTime() === today.getTime() : false;
    })
    .sort((first, second) => {
      const firstDate = parseLocalDate(first.date_key || first.date)?.getTime() || 0;
      const secondDate = parseLocalDate(second.date_key || second.date)?.getTime() || 0;
      return firstDate - secondDate;
    });
}

// Events from tomorrow (exclusive of today) through dayWindow days ahead.
function upcomingEventsExcludingToday(events: RecordMap[], dayWindow: number) {
  const today = startOfLocalDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const end = new Date(today);
  end.setDate(today.getDate() + dayWindow);
  return events
    .filter((event) => {
      const date = parseLocalDate(event.date_key || event.date);
      return date ? date >= tomorrow && date <= end : false;
    })
    .sort((first, second) => {
      const firstDate = parseLocalDate(first.date_key || first.date)?.getTime() || 0;
      const secondDate = parseLocalDate(second.date_key || second.date)?.getTime() || 0;
      return firstDate - secondDate;
    });
}

// SCHOLARDOCX-0185: checked items sink to the bottom; within each group the
// existing date-ascending order (applied by todayEvents/
// upcomingEventsExcludingToday above) is preserved via a stable sort.
function sortByDone(events: RecordMap[]) {
  return [...events].sort((first, second) => Number(!!first.is_done) - Number(!!second.is_done));
}
