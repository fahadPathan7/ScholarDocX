import { Bell, CheckCheck, ExternalLink, Trash2, X } from "lucide-react";
import { api, deleteRecord, RecordMap } from "../lib/api";
import { getNotificationSettingLabel } from "../config/notificationLabels";

export function FloatingNotifications({
  calendarItems,
  notifications,
  projects,
  isOpen,
  onClose,
  onChanged,
  onNavigateToEvent,
  onNavigateToProject,
  onToast
}: {
  calendarItems: RecordMap[];
  notifications: RecordMap[];
  projects: RecordMap[];
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onNavigateToEvent: (event: RecordMap) => void;
  onNavigateToProject: (projectId: string) => void;
  onToast: (message: string) => void;
}) {
  if (!isOpen) return null;

  const unread = notifications.filter((item) => !item.read_at);
  const read = notifications.filter((item) => item.read_at);
  const projectName = (item: RecordMap) =>
    item.project_name || projects.find((project) => String(project.id) === String(item.project_id))?.name || "Global";
  const notificationLabel = (item: RecordMap) =>
    item.preference_key ? getNotificationSettingLabel(String(item.preference_key)) : (item.notification_type || "general");

  const markAllRead = async () => {
    const timestamp = new Date().toISOString();
    await Promise.all(unread.map((item) => api.patch(`/notifications/${item.id}`, { data: { read_at: timestamp } })));
    await onChanged();
  };

  const deleteOne = async (id: string) => {
    await deleteRecord("notifications", id);
    await onChanged();
  };

  const deleteAllRead = async () => {
    await Promise.all(read.map((item) => deleteRecord("notifications", item.id)));
    await onChanged();
  };

  const openNotification = async (item: RecordMap) => {
    // Mark as read if unread
    if (!item.read_at) {
      const timestamp = new Date().toISOString();
      await api.patch(`/notifications/${item.id}`, { data: { read_at: timestamp } });
      await onChanged();
    }

    const linkedEvent = findLinkedEvent(item, calendarItems);
    if (linkedEvent) {
      onClose();
      onNavigateToEvent(linkedEvent);
      return;
    }
    if (item.project_id && item.notification_type === "project") {
      onClose();
      onNavigateToProject(item.project_id);
      return;
    }
    onToast("This notification has no linked workspace item yet.");
  };

  return (
    <div className="notification-panel">
      <div className="notification-panel-header">
        <div>
          <h2>Notifications</h2>
          <span className="notification-panel-count">
            {unread.length} unread · {read.length} read
          </span>
        </div>
        <button className="icon-button" onClick={onClose} title="Close notifications">
          <X size={20} />
        </button>
      </div>

      <div className="notification-panel-actions">
        <button className="secondary" type="button" onClick={markAllRead} disabled={!unread.length}>
          <CheckCheck size={16} /> Read all
        </button>
        <button className="secondary danger" type="button" onClick={deleteAllRead} disabled={!read.length}>
          <Trash2 size={16} /> Delete read
        </button>
      </div>

      <div className="notification-panel-content">
        {notifications.length ? (
          <div className="notification-list">
            {[...unread, ...read].map((item) => (
              <article className={item.read_at ? "notification-item read" : "notification-item"} key={item.id}>
                <button className="notification-main" type="button" onClick={() => openNotification(item)}>
                  <div className="notification-content">
                    <strong>{item.title || "Untitled notification"}</strong>
                    {item.body && <p>{item.body}</p>}
                    <div className="notification-meta">
                      <span className="notification-project">{projectName(item)}</span>
                      <span className="notification-separator">·</span>
                      <span className="notification-type">{notificationLabel(item)}</span>
                      {item.due_at && (
                        <>
                          <span className="notification-separator">·</span>
                          <span className="notification-date">{item.due_at}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ExternalLink size={16} className="notification-link-icon" />
                </button>
                <button className="notification-delete" type="button" onClick={() => deleteOne(String(item.id))} title="Delete notification">
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">No notifications.</p>
        )}
      </div>
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
