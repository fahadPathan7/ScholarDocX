# Configuration Files

This directory contains configuration files for various features of ScholarDocX.

## notificationLabels.ts

Centralized configuration for notification settings labels and defaults.

### Purpose
- Maintains all notification setting labels in one place for easy updates
- Defines default notification preferences
- Provides type-safe configuration for notification categories

### Structure

**NotificationCategory**: Groups related notification settings
- `title`: Display name for the category (e.g., "Project Actions")
- `icon`: Icon component name from lucide-react
- `settings`: Array of notification settings in this category

**NotificationSetting**: Individual notification preference
- `key`: Unique identifier for the setting (e.g., "project_create")
- `label`: User-facing label (e.g., "Project Created")
- `description`: Optional detailed description

### Available Notification Types

#### Project Actions
- `project_create` - Project Created
- `project_update` - Project Updated
- `project_delete` - Project Deleted
- `project_pin` - Project Pinned
- `project_unpin` - Project Unpinned
- `project_add_to_dashboard` - Project Added to Dashboard
- `project_remove_from_dashboard` - Project Removed from Dashboard

#### Sheet Actions
- `sheet_create` - Sheet Created
- `sheet_update` - Sheet Updated
- `sheet_delete` - Sheet Deleted
- `sheet_pin` - Sheet Pinned
- `sheet_unpin` - Sheet Unpinned
- `sheet_add_to_dashboard` - Sheet Added to Dashboard
- `sheet_remove_from_dashboard` - Sheet Removed from Dashboard

#### Record Actions
- `record_create` - Record Created
- `record_update` - Record Updated
- `record_delete` - Record Deleted

#### Whiteboard Actions
- `whiteboard_create` - Whiteboard Created
- `whiteboard_update` - Whiteboard Updated
- `whiteboard_delete` - Whiteboard Deleted

#### Sticky Note Actions
- `sticky_note_create` - Sticky Note Created
- `sticky_note_update` - Sticky Note Updated
- `sticky_note_delete` - Sticky Note Deleted

#### Document Actions
- `document_upload` - Document Uploaded
- `document_delete` - Document Deleted

### Default Settings

By default, the following notifications are **enabled**:
- Project/Sheet creation and deletion
- Record deletion
- Whiteboard deletion
- Document deletion

All other notifications are disabled by default to prevent notification fatigue.

### Usage

```typescript
import { 
  notificationCategories, 
  defaultNotificationSettings, 
  notificationSettingsIntro 
} from '../config/notificationLabels';

// Use in component
const [settings, setSettings] = useState(defaultNotificationSettings);

// Render categories dynamically
notificationCategories.map(category => {
  // Render category and its settings
});
```

### Adding New Notification Types

1. Add the new setting to the appropriate category in `notificationCategories`
2. Add the default value to `defaultNotificationSettings`
3. The UI will automatically update to show the new option

### Maintenance

When updating notification labels:
1. Edit `notificationLabels.ts` only
2. No need to modify component files
3. Changes propagate automatically to the UI
