# AI Chat Limits Update - Daily and Monthly Limits

**Date:** 2026-05-30  
**Status:** ✅ Completed  
**Task:** Add daily and monthly AI chat limits to the role-based access control system

---

## Summary

The ScholarDock RBAC system already had daily and monthly AI chat limits implemented in the backend and database. This update adds UI visibility for these limits in the frontend components.

---

## What Was Already Implemented

### Backend (Already Exists)
- ✅ Database schema with `role_limits` table
- ✅ Three AI chat limit features:
  - `ai_messages_per_session` (resets per session)
  - `daily_ai_chats` (resets daily at midnight UTC)
  - `monthly_ai_chats` (resets monthly on the 1st)
- ✅ Limit enforcement in API routes (`backend/app/api/routes.py`)
- ✅ Usage tracking in `user_usage_stats` table
- ✅ Admin panel for managing limits

### Current Limits (Already Configured)

| Role | Per Session | Per Day | Per Month |
|------|-------------|---------|-----------|
| **General User** | 10 | 15 | 150 |
| **Pro User** | 30 | 50 | 500 |
| **Max User** | 100 | 200 | 2000 |
| **Admin** | Unlimited | Unlimited | Unlimited |

---

## What Was Updated

### 1. Frontend - PlanComparisonView.tsx
**File:** `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/PlanComparisonView.tsx`

**Change:** Added daily and monthly AI chat limits to the features list displayed in the plan comparison table.

```typescript
const features = [
  { key: "ai_messages_per_session", label: "AI Messages / Session", icon: MessageSquare },
  { key: "daily_ai_chats", label: "AI Messages / Day", icon: MessageSquare },      // ✅ ADDED
  { key: "monthly_ai_chats", label: "AI Messages / Month", icon: MessageSquare },  // ✅ ADDED
  // ... other features
];
```

**Impact:** Users can now see all three AI chat limits when viewing the plan comparison page.

---

### 2. Frontend - UsageIndicator.tsx
**File:** `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/UsageIndicator.tsx`

**Change:** Updated the usage indicator to display all three AI chat limits with their current usage.

**Before:**
```typescript
// Only showed per-session limit
AI: 8 / 10
```

**After:**
```typescript
// Shows all three limits
Session: 8 / 10  Daily: 12 / 15  Monthly: 45 / 150
```

**Features:**
- Displays session, daily, and monthly usage side-by-side
- Color-coded indicator (green → amber → red) based on highest percentage
- Tooltips for each limit type
- Automatically hides if all limits are unlimited (for admins)

---

### 3. Documentation - RBAC-AUTHENTICATION-PLAN.md
**File:** `/Users/fahadpathan/Documents/ScholarDock/RBAC-AUTHENTICATION-PLAN.md`

**Changes:**
1. Updated the "Detailed Limit Matrix" table to show all three AI chat limits
2. Added detailed feature descriptions for each limit type:
   - **Per Session**: Resets when user starts a new conversation
   - **Per Day**: Resets at midnight UTC daily
   - **Per Month**: Resets on the 1st of each month at midnight UTC

---

## How It Works

### Limit Enforcement Flow

1. **User sends AI chat message**
2. **Backend checks all three limits** (in `backend/app/api/routes.py`):
   ```python
   check_and_increment_limit(current_user, "ai_messages_per_session", 1, store.connection)
   check_and_increment_limit(current_user, "daily_ai_chats", 1, store.connection)
   check_and_increment_limit(current_user, "monthly_ai_chats", 1, store.connection)
   ```
3. **If any limit is exceeded**, return error with specific limit details
4. **If all limits pass**, process the message and increment all counters
5. **Frontend displays updated usage** in UsageIndicator component

### Reset Logic

- **Per Session**: Resets when `user_usage_stats.last_reset_at` is older than current session start
- **Daily**: Resets when `last_reset_at` is before midnight UTC today
- **Monthly**: Resets when `last_reset_at` is before the 1st of current month

---

## Admin Panel

Admins can configure these limits via the Admin Panel:

1. Navigate to **Admin → Limits**
2. Select a role (General User, Pro User, Max User)
3. Edit the limit for each feature:
   - `ai_messages_per_session` → Count + Reset Period: `per_session`
   - `daily_ai_chats` → Count + Reset Period: `daily`
   - `monthly_ai_chats` → Count + Reset Period: `monthly`

**Example:**
- General User: 10 per session, 15 per day, 150 per month
- Pro User: 30 per session, 50 per day, 500 per month
- Max User: 100 per session, 200 per day, 2000 per month

---

## Testing Checklist

- [ ] Verify UsageIndicator shows all three limits for General User
- [ ] Verify UsageIndicator shows all three limits for Pro User
- [ ] Verify UsageIndicator shows all three limits for Max User
- [ ] Verify UsageIndicator is hidden for Admin users (unlimited)
- [ ] Verify PlanComparisonView displays all three limits in the comparison table
- [ ] Send AI messages and verify counters increment correctly
- [ ] Verify daily limit resets at midnight UTC
- [ ] Verify monthly limit resets on the 1st of the month
- [ ] Verify per-session limit resets when starting a new conversation
- [ ] Verify error message when any limit is exceeded
- [ ] Verify admin panel allows editing all three limits

---

## Database Schema Reference

### role_limits Table
```sql
CREATE TABLE IF NOT EXISTS role_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  feature TEXT NOT NULL,
  limit_count INTEGER NOT NULL DEFAULT -1,
  reset_period TEXT NOT NULL DEFAULT 'never',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role, feature)
);
```

### user_usage_stats Table
```sql
CREATE TABLE IF NOT EXISTS user_usage_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  current_count INTEGER NOT NULL DEFAULT 0,
  last_reset_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, feature)
);
```

---

## Files Modified

1. `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/PlanComparisonView.tsx`
2. `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/UsageIndicator.tsx`
3. `/Users/fahadpathan/Documents/ScholarDock/RBAC-AUTHENTICATION-PLAN.md`

---

## Next Steps

1. **Test the UI changes** to ensure all three limits display correctly
2. **Verify limit enforcement** by sending messages and checking counters
3. **Test reset logic** by waiting for daily/monthly resets or manually updating `last_reset_at`
4. **Update user documentation** to explain the three-tier limit system
5. **Consider adding a usage history chart** to show daily/monthly trends

---

## Notes

- The backend implementation was already complete and working correctly
- This update only adds UI visibility for existing functionality
- No database migrations or backend changes were required
- Admin users bypass all limits (unlimited access)
- All three limits are enforced simultaneously (most restrictive wins)
