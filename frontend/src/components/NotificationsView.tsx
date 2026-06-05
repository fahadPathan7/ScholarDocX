import { Bell, CheckCheck, ExternalLink, Trash2 } from "lucide-react";
import { Section } from "./Section";
import { api, deleteRecord, RecordMap } from "../lib/api";
import "./notifications.css";

export function NotificationsView({
  calendarItems,
  notifications,
  projects,
  onChanged,
  onNavigateToEvent,
  onNavigateToProject,
  onToast
}: {
  calendarItems: RecordMap[];
  notifications: RecordMap[];
  projects: RecordMap[];
  onChanged: () => Promise<void>;
  onNavigateToEvent: (event: RecordMap) => void;
  onNavigateToProject: (projectId: number | string) => void;
  onToast: (message: string) => void;
}) {
  const unread = notifications.filter((item) => !item.read_at);
  const read = notifications.filter((item) => item.read_at);
  const projectName = (item: RecordMap) =>
    item.project_name || projects.find((project) => String(project.id) === String(item.project_id))?.name || "Global";

  const markAllRead = async () => {
    const timestamp = new Date().toISOString();
    await Promise.all(unread.map((item) => api.patch(`/notifications/${item.id}`, { data: { read_at: timestamp } })));
    await onChanged();
  };

  const deleteOne = async (id: number) => {
    await deleteRecord("notifications", id);
    await onChanged();
  };

  const deleteAllRead = async () => {
    await Promise.all(read.map((item) => deleteRecord("notifications", item.id)));
    await onChanged();
  };

  const openNotification = (item: RecordMap) => {
    const linkedEvent = findLinkedEvent(item, calendarItems);
    if (linkedEvent) {
      onNavigateToEvent(linkedEvent);
      return;
    }
    if (item.project_id && item.notification_type === "project") {
      onNavigateToProject(item.project_id);
      return;
    }
    onToast("This alert has no linked workspace item yet.");
  };

  return (
    <div className="page-grid single">
      <Section
        title="Notifications"
        eyebrow={`${unread.length} unread · ${read.length} read`}
        action={
          <div className="button-row no-margin">
            <button className="secondary" type="button" onClick={markAllRead} disabled={!unread.length}>
              <CheckCheck size={16} /> Read all
            </button>
            <button className="secondary danger" type="button" onClick={deleteAllRead} disabled={!read.length}>
              <Trash2 size={16} /> Delete read
            </button>
          </div>
        }
      >
        {notifications.length ? (
          <div className="alert-list">
            {notifications.map((item) => (
              <article className={item.read_at ? "alert-item read" : "alert-item"} key={item.id}>
                <button className="alert-main" type="button" onClick={() => openNotification(item)}>
                  <Bell size={16} />
                  <div>
                    <strong>{item.title || "Untitled alert"}</strong>
                    <span>{projectName(item)} · {item.notification_type || "general"} · {item.due_at || "No due date"}</span>
                    <p>{item.body || "No extra details were stored for this alert."}</p>
                  </div>
                  <ExternalLink size={16} />
                </button>
                <button className="icon-button compact danger" type="button" onClick={() => deleteOne(Number(item.id))} title="Delete alert">
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">No alerts.</p>
        )}
      </Section>
    </div>
  );
}

function findLinkedEvent(notification: RecordMap, calendarItems: RecordMap[]) {
  if (notification.notification_type !== "scheduled-email") return null;
  const dueKey = dateKey(notification.due_at);
  const titleTarget = String(notification.title || "").replace(/^Scheduled email:\s*/i, "").trim().toLowerCase();
  return calendarItems.find((event) => {
    if (String(event.project_id) !== String(notification.project_id)) return false;
    if (dateKey(event.date_key || event.date) !== dueKey) return false;
    if (!titleTarget) return true;
    return String(event.title || "").trim().toLowerCase() === titleTarget;
  }) || null;
}

function dateKey(value: unknown) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}
