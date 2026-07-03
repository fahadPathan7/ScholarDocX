/**
 * Notification preferences and labels used by both the settings UI and
 * notification-related admin surfaces.
 */

export interface NotificationSetting {
  key: string;
  label: string;
  description?: string;
  locked?: boolean;
}

export interface NotificationCategory {
  title: string;
  icon: string;
  settings: NotificationSetting[];
}

export type NotificationPreferenceTabId = "workspace" | "admin";

export const workspaceNotificationCategories: NotificationCategory[] = [
  {
    title: "Project Actions",
    icon: "Route",
    settings: [
      { key: "project_create", label: "Created" },
      { key: "project_delete", label: "Deleted" },
      { key: "project_pin", label: "Pin Status Changed" },
    ],
  },
  {
    title: "Sheet Actions",
    icon: "FileText",
    settings: [
      { key: "sheet_create", label: "Created" },
      { key: "sheet_delete", label: "Deleted" },
      { key: "sheet_pin", label: "Pin Status Changed" },
    ],
  },
  {
    title: "Record Actions",
    icon: "Database",
    settings: [
      { key: "record_create", label: "Created" },
      { key: "record_delete", label: "Deleted" },
    ],
  },
  {
    title: "Whiteboard Actions",
    icon: "PencilLine",
    settings: [
      { key: "whiteboard_create", label: "Created" },
      { key: "whiteboard_delete", label: "Deleted" },
    ],
  },
  {
    title: "Sticky Note Actions",
    icon: "MessageCircle",
    settings: [
      { key: "sticky_note_create", label: "Created" },
      { key: "sticky_note_update", label: "Updated" },
      { key: "sticky_note_delete", label: "Deleted" },
    ],
  },
  {
    title: "Outreach Actions",
    icon: "MessageCircle",
    settings: [{ key: "scheduled_email", label: "Scheduled Email Reminder" }],
  },
  {
    title: "Scholarship Hunt",
    icon: "Compass",
    settings: [
      {
        key: "scholarship_deadline_approaching",
        label: "Deadline Approaching",
        description: "A tracked scholarship opportunity's deadline is within the radar window.",
      },
    ],
  },
];

export const adminNotificationCategories: NotificationCategory[] = [
  {
    title: "Administrative Notices",
    icon: "Bell",
    settings: [
      {
        key: "system",
        label: "System",
        description: "Critical access, security, and platform notices.",
        locked: true,
      },
      {
        key: "announcements",
        label: "Announcements",
        description: "General admin announcements and updates.",
      },
      {
        key: "billing",
        label: "Billing",
        description: "Plan, payment, and account billing updates.",
      },
      {
        key: "plans",
        label: "Plan Updates",
        description: "Plan approvals, renewals, and subscription guidance.",
      },
    ],
  },
];

export const notificationCategories = workspaceNotificationCategories;

export const notificationPreferenceTabs = [
  {
    id: "workspace" as const,
    label: "Workspace Activity",
    description: "Control notifications created by your own workspace actions.",
    categories: workspaceNotificationCategories,
  },
  {
    id: "admin" as const,
    label: "Admin Notices",
    description: "Control admin-sent notice categories. System notices always stay on.",
    categories: adminNotificationCategories,
  },
];

export const mandatoryNotificationSettingKeys = ["system"] as const;

export const defaultNotificationSettings: Record<string, boolean> = {
  project_create: true,
  project_delete: true,
  project_pin: false,
  sheet_create: true,
  sheet_delete: true,
  sheet_pin: false,
  record_create: false,
  record_delete: true,
  whiteboard_create: false,
  whiteboard_delete: true,
  sticky_note_create: false,
  sticky_note_update: false,
  sticky_note_delete: true,
  scheduled_email: true,
  scholarship_deadline_approaching: true,
  system: true,
  announcements: true,
  billing: true,
  plans: true,
};

export const notificationSettingsIntro =
  "Choose which workspace and admin notification categories you want to receive.";

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
  if (!raw || typeof raw !== "object") {
    mandatoryNotificationSettingKeys.forEach((key) => {
      merged[key] = true;
    });
    return merged;
  }
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const parsed = parseBooleanLike(value);
    if (typeof parsed === "boolean") {
      merged[key] = parsed;
    }
  });
  mandatoryNotificationSettingKeys.forEach((key) => {
    merged[key] = true;
  });
  return merged;
}

export function isNotificationSettingLocked(key: string): boolean {
  return mandatoryNotificationSettingKeys.includes(key as (typeof mandatoryNotificationSettingKeys)[number]);
}

export function getNotificationSettingLabel(key: string): string {
  const categories = [...workspaceNotificationCategories, ...adminNotificationCategories];
  for (const category of categories) {
    const match = category.settings.find((setting) => setting.key === key);
    if (match) return match.label;
  }
  return key;
}
