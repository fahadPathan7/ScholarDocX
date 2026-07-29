import { FormEvent, useState } from "react";
import { X, CalendarPlus } from "lucide-react";
import { Modal } from "./Modal";
import { createRecord, updateRecord, RecordMap } from "../lib/api";

/**
 * Create or edit a manual calendar reminder (SCHOLARDOCX-0185) — a date that
 * isn't derived from a sheet row. Pass `projectId` when adding from within a
 * project (scopes the reminder to that project); omit it for a general
 * central-Dashboard reminder (no project link).
 *
 * Pass `editingReminder` (the existing calendar item, type "manual-reminder")
 * to switch into edit mode: fields prefill from it and submit calls
 * `updateRecord` instead of `createRecord`.
 */
export function AddReminderModal({
  projectId,
  initialDate,
  editingReminder,
  onClose,
  onCreated,
}: {
  projectId?: string | null;
  /** Pre-fill the date field, e.g. with whichever day is selected in the calendar. */
  initialDate?: string | null;
  editingReminder?: RecordMap | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const isEditing = !!editingReminder;
  const [title, setTitle] = useState(editingReminder?.title || "");
  const [date, setDate] = useState(editingReminder?.date_key || editingReminder?.date || initialDate || "");
  const [note, setNote] = useState(editingReminder?.note || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    setSubmitting(true);
    setError("");
    try {
      if (isEditing) {
        await updateRecord("calendar_reminders", String(editingReminder!.id), {
          title: title.trim(),
          reminder_date: date,
          note: note.trim() || null,
        });
      } else {
        await createRecord("calendar_reminders", {
          title: title.trim(),
          reminder_date: date,
          note: note.trim() || null,
          project_id: projectId || null,
        });
      }
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || `Failed to ${isEditing ? "update" : "add"} reminder.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <form className="modal-panel small-modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2>{isEditing ? "Edit Reminder" : "Add Reminder"}</h2>
          <button className="icon-button" type="button" onClick={onClose} title="Close form">
            <X size={20} />
          </button>
        </div>
        <div className="modal-content" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {error && <p className="empty" style={{ color: "#c0392b" }}>{error}</p>}
          <label className="field">
            <span>Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Renew passport"
              required
            />
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Note (optional)</span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className="modal-footer" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: "12px", flexWrap: "wrap" }}>
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={submitting}>
            <CalendarPlus size={16} /> {submitting ? (isEditing ? "Saving..." : "Adding...") : (isEditing ? "Save Changes" : "Add Reminder")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
