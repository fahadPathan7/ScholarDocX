export type NotificationSettingKey =
  | "project_create"
  | "project_delete"
  | "project_pin"
  | "sheet_create"
  | "sheet_delete"
  | "sheet_pin"
  | "record_create"
  | "record_delete"
  | "whiteboard_create"
  | "whiteboard_delete"
  | "sticky_note_create"
  | "sticky_note_update"
  | "sticky_note_delete"
  | "scheduled_email";

export type NotificationEventKey = NotificationSettingKey;

export type NotificationPayload = {
  project_id?: number;
  due_at?: string;
  title: string;
  body: string;
  notification_type: "project" | "general" | "scheduled-email";
};

type NotificationTemplateVars = {
  projectName?: string;
  projectId?: number;
  sheetName?: string;
  sheetId?: number;
  whiteboardName?: string;
  dueAt?: string;
  attachmentSummary?: string;
  actionLabel?: string;
};

type NotificationTemplateDef = {
  settingKey: NotificationSettingKey;
  notification_type: NotificationPayload["notification_type"];
  render: (vars: NotificationTemplateVars) => Pick<NotificationPayload, "title" | "body">;
};

export const notificationTemplates: Record<NotificationEventKey, NotificationTemplateDef> = {
  project_create: {
    settingKey: "project_create",
    notification_type: "project",
    render: (v) => ({
      title: `Project created: ${v.projectName || "Untitled"}`,
      body: "Open the project to create sheets and plan outreach."
    })
  },
  project_delete: {
    settingKey: "project_delete",
    notification_type: "general",
    render: (v) => ({
      title: "Project deleted",
      body: v.projectName ? `Project \"${v.projectName}\" was permanently deleted.` : `Project ID ${v.projectId ?? "unknown"} was permanently deleted.`
    })
  },
  project_pin: {
    settingKey: "project_pin",
    notification_type: "project",
    render: (v) => ({
      title: "Project pin updated",
      body: `${v.projectName || "Project"} ${v.actionLabel || "pin state changed"}.`
    })
  },
  sheet_create: {
    settingKey: "sheet_create",
    notification_type: "project",
    render: (v) => ({
      title: `Sheet created: ${v.sheetName || "Application sheet"}`,
      body: "A new sheet was added to the project."
    })
  },
  sheet_delete: {
    settingKey: "sheet_delete",
    notification_type: "general",
    render: (v) => ({
      title: "Sheet deleted",
      body: v.sheetName ? `Sheet \"${v.sheetName}\" was permanently deleted.` : `Sheet ID ${v.sheetId ?? "unknown"} was permanently deleted.`
    })
  },
  sheet_pin: {
    settingKey: "sheet_pin",
    notification_type: "project",
    render: (v) => ({
      title: "Sheet pin updated",
      body: `${v.sheetName || "Sheet"} ${v.actionLabel || "pin state changed"}.`
    })
  },
  record_create: {
    settingKey: "record_create",
    notification_type: "general",
    render: () => ({
      title: "Record added",
      body: "A new record was added to the sheet."
    })
  },
  record_delete: {
    settingKey: "record_delete",
    notification_type: "general",
    render: () => ({
      title: "Record deleted",
      body: "A record was deleted from the sheet."
    })
  },
  whiteboard_create: {
    settingKey: "whiteboard_create",
    notification_type: "general",
    render: (v) => ({
      title: "Whiteboard created",
      body: `Created whiteboard \"${v.whiteboardName || "Untitled"}\".`
    })
  },
  whiteboard_delete: {
    settingKey: "whiteboard_delete",
    notification_type: "general",
    render: (v) => ({
      title: "Whiteboard deleted",
      body: `Deleted whiteboard \"${v.whiteboardName || "Untitled"}\".`
    })
  },
  sticky_note_create: {
    settingKey: "sticky_note_create",
    notification_type: "general",
    render: (v) => ({
      title: "Sticky note created",
      body: `Created sticky note \"${v.sheetName || "Untitled note"}\".`
    })
  },
  sticky_note_update: {
    settingKey: "sticky_note_update",
    notification_type: "general",
    render: (v) => ({
      title: "Sticky note updated",
      body: `Updated sticky note \"${v.sheetName || "Untitled note"}\".`
    })
  },
  sticky_note_delete: {
    settingKey: "sticky_note_delete",
    notification_type: "general",
    render: (v) => ({
      title: "Sticky note deleted",
      body: `Deleted sticky note \"${v.sheetName || "Untitled note"}\".`
    })
  },
  scheduled_email: {
    settingKey: "scheduled_email",
    notification_type: "scheduled-email",
    render: (v) => ({
      title: `Scheduled email: ${v.sheetName || "Unknown"}`,
      body: `Attachment reminder: ${v.attachmentSummary || "No attachments listed"}`
    })
  }
};

export function buildNotification(eventKey: NotificationEventKey, vars: NotificationTemplateVars = {}, project_id?: number): NotificationPayload {
  const definition = notificationTemplates[eventKey];
  const rendered = definition.render(vars);
  return {
    project_id,
    due_at: vars.dueAt,
    title: rendered.title,
    body: rendered.body,
    notification_type: definition.notification_type
  };
}
