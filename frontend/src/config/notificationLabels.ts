/**
 * Notification Settings Labels Configuration
 * 
 * This file maintains all notification setting labels and descriptions
 * for better maintainability and consistency across the application.
 */

export interface NotificationCategory {
  title: string;
  icon: string;
  settings: NotificationSetting[];
}

export interface NotificationSetting {
  key: string;
  label: string;
  description?: string;
}

export const notificationCategories: NotificationCategory[] = [
  {
    title: "Project Actions",
    icon: "Route",
    settings: [
      { key: "project_create", label: "Created" },
      { key: "project_delete", label: "Deleted" },
      { key: "project_pin", label: "Pin Status Changed" },
    ]
  },
  {
    title: "Sheet Actions",
    icon: "FileText",
    settings: [
      { key: "sheet_create", label: "Created" },
      { key: "sheet_delete", label: "Deleted" },
      { key: "sheet_pin", label: "Pin Status Changed" },
    ]
  },
  {
    title: "Record Actions",
    icon: "Database",
    settings: [
      { key: "record_create", label: "Created" },
      { key: "record_delete", label: "Deleted" },
    ]
  },
  {
    title: "Whiteboard Actions",
    icon: "PencilLine",
    settings: [
      { key: "whiteboard_create", label: "Created" },
      { key: "whiteboard_delete", label: "Deleted" },
    ]
  },
  {
    title: "Sticky Note Actions",
    icon: "MessageCircle",
    settings: [
      { key: "sticky_note_create", label: "Created" },
      { key: "sticky_note_update", label: "Updated" },
      { key: "sticky_note_delete", label: "Deleted" },
    ]
  },
  {
    title: "Outreach Actions",
    icon: "MessageCircle",
    settings: [
      { key: "scheduled_email", label: "Scheduled Email Reminder" },
    ]
  }
];

/**
 * Default notification settings
 * true = enabled by default, false = disabled by default
 */
export const defaultNotificationSettings: Record<string, boolean> = {
  // Project actions - important ones enabled
  project_create: true,
  project_delete: true,
  project_pin: false,
  
  // Sheet actions - important ones enabled
  sheet_create: true,
  sheet_delete: true,
  sheet_pin: false,
  
  // Record actions
  record_create: false,
  record_delete: true,
  
  // Whiteboard actions
  whiteboard_create: false,
  whiteboard_delete: true,

  // Sticky Note actions
  sticky_note_create: false,
  sticky_note_update: false,
  sticky_note_delete: true,

  // Outreach actions
  scheduled_email: true,
};

/**
 * Notification settings intro text
 */
export const notificationSettingsIntro = "Choose which events you want to be notified about.";

function parseBooleanLike(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  return undefined;
}

export function normalizeNotificationSettings(raw: unknown): Record<string, boolean> {
  const merged: Record<string, boolean> = { ...defaultNotificationSettings };
  if (!raw || typeof raw !== "object") return merged;
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const parsed = parseBooleanLike(value);
    if (typeof parsed === "boolean") {
      merged[key] = parsed;
    }
  });
  return merged;
}
