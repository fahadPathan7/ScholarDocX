# New Limits Added - Web Search Monthly & Total Records

**Date:** 2026-05-30  
**Status:** ✅ Completed  
**Task:** Add monthly web search limit and total records limit

---

## Summary

Added two new limit features to the RBAC system:
1. **Web Search/Month** - Monthly limit for web search requests
2. **Total Records** - Cumulative limit for total records across all sheets

---

## New Limits

### 1. Web Search/Month (`web_searches_per_month`)

**Purpose:** Provide long-term usage control for web search API costs

**Reset Period:** Monthly (1st of each month at midnight UTC)

**Limits by Role:**
| Role | Daily Limit | Monthly Limit |
|------|-------------|---------------|
| General User | 0 | 0 |
| Pro User | 5 | 150 |
| Max User | 20 | 600 |
| Admin | Unlimited | Unlimited |

**Rationale:**
- Daily limits prevent burst usage
- Monthly limits provide long-term cost control
- Pro users: 5/day × 30 days = 150/month
- Max users: 20/day × 30 days = 600/month

---

### 2. Total Records (`total_records`)

**Purpose:** Prevent database bloat and ensure performance

**Reset Period:** Never (cumulative limit)

**Limits by Role:**
| Role | Total Records | Records per Sheet |
|------|---------------|-------------------|
| General User | 1,000 | 100 |
| Pro User | 25,000 | 500 |
| Max User | 400,000 | 2,000 |
| Admin | Unlimited | Unlimited |

**Rationale:**
- General User: 10 sheets × 100 records = 1,000 total
- Pro User: 50 sheets × 500 records = 25,000 total
- Max User: 200 sheets × 2,000 records = 400,000 total
- Deleting records frees up quota
- Prevents single user from consuming excessive database resources

**Difference from Records per Sheet:**
- **Records per Sheet**: Limit per individual sheet (e.g., 100 records in Sheet A)
- **Total Records**: Limit across ALL sheets (e.g., 1,000 records total across all sheets)
- Both limits are enforced simultaneously

---

## Changes Made

### 1. Database Schema (`backend/app/db/schema.py`)

Added two new features to `role_limits` seed data:

```sql
-- General User
('general_user', 'web_searches_per_month', 0, 'monthly'),
('general_user', 'total_records', 1000, 'never'),

-- Pro User
('pro_user', 'web_searches_per_month', 150, 'monthly'),
('pro_user', 'total_records', 25000, 'never'),

-- Max User
('max_user', 'web_searches_per_month', 600, 'monthly'),
('max_user', 'total_records', 400000, 'never'),
```

---

### 2. User Initialization

Updated feature lists in three files to include new features:

**Files Updated:**
1. `backend/app/api/auth.py` - User registration
2. `backend/app/db/connection.py` - Default user initialization
3. `backend/app/services/admin.py` - Admin user creation

**New Feature List:**
```python
features = [
    'ai_messages_per_session', 
    'daily_ai_chats', 
    'monthly_ai_chats', 
    'web_searches_per_day', 
    'web_searches_per_month',  # ✅ NEW
    'total_projects', 
    'total_sheets', 
    'total_records',           # ✅ NEW
    'sheets_per_project', 
    'records_per_sheet', 
    'total_documents_bytes', 
    'total_sticky_notes', 
    'total_whiteboards'
]
```

---

### 3. Admin Panel UI (`frontend/src/components/AdminView.tsx`)

Updated feature groups to include new limits:

**Web Search Group:**
```typescript
{
  name: "Web Search",
  features: [
    { key: "web_searches_per_day", label: "Daily Searches" },
    { key: "web_searches_per_month", label: "Monthly Searches" }  // ✅ NEW
  ]
}
```

**Projects & Sheets Group:**
```typescript
{
  name: "Projects & Sheets",
  features: [
    { key: "total_projects", label: "Total Projects" },
    { key: "total_sheets", label: "Total Sheets" },
    { key: "total_records", label: "Total Records (All Sheets)" },  // ✅ NEW
    { key: "sheets_per_project", label: "Sheets per Project" },
    { key: "records_per_sheet", label: "Records per Sheet" }
  ]
}
```

---

### 4. Plan Comparison View (`frontend/src/components/PlanComparisonView.tsx`)

Added new features to the comparison table:

```typescript
const features = [
  // ... existing features
  { key: "web_searches_per_day", label: "Web Searches / Day", icon: Globe },
  { key: "web_searches_per_month", label: "Web Searches / Month", icon: Globe },  // ✅ NEW
  { key: "total_sheets", label: "Total Sheets", icon: Table },
  { key: "total_records", label: "Total Records", icon: Database },  // ✅ NEW
  // ... more features
];
```

---

### 5. Documentation (`RBAC-AUTHENTICATION-PLAN.md`)

Updated the limit matrix table and feature descriptions to include:
- Web Search/Day and Web Search/Month columns
- Total Records (All Sheets) row
- Detailed descriptions for both new features

---

## Implementation Notes

### Web Search Monthly Limit

**Enforcement:**
- Backend should check both daily and monthly limits
- If either limit is exceeded, deny the request
- Monthly counter resets on the 1st of each month

**Example Check:**
```python
# Check daily limit
check_and_increment_limit(user, "web_searches_per_day", 1, connection)

# Check monthly limit
check_and_increment_limit(user, "web_searches_per_month", 1, connection)
```

---

### Total Records Limit

**Enforcement:**
- Check when creating a new record
- Increment counter when record is created
- Decrement counter when record is deleted
- Count across all sheets for the user

**Example Check:**
```python
# Check per-sheet limit
check_and_increment_limit(user, "records_per_sheet", 1, connection)

# Check total records limit
check_and_increment_limit(user, "total_records", 1, connection)
```

**Decrement on Delete:**
```python
# When deleting a record
decrement_usage(user_id, "total_records", 1, connection)
```

---

## Database Migration

Since we're using `INSERT OR IGNORE`, existing databases will automatically get the new limits on next startup. No manual migration needed.

**For existing users:**
1. New limits will be added to `role_limits` table
2. New usage stats will be initialized in `user_usage_stats` table
3. Existing data remains intact

---

## Testing Checklist

### Web Search Monthly Limit
- [ ] Verify monthly limit is enforced
- [ ] Verify counter resets on 1st of month
- [ ] Verify both daily and monthly limits are checked
- [ ] Verify error message shows correct limit
- [ ] Verify admin panel displays monthly limit
- [ ] Verify plan comparison shows monthly limit

### Total Records Limit
- [ ] Verify total records limit is enforced on create
- [ ] Verify counter increments when record is created
- [ ] Verify counter decrements when record is deleted
- [ ] Verify limit is checked across all sheets
- [ ] Verify both per-sheet and total limits are enforced
- [ ] Verify admin panel displays total records limit
- [ ] Verify plan comparison shows total records limit

### UI Display
- [ ] Verify Web Search group shows both daily and monthly
- [ ] Verify Projects & Sheets group shows total records
- [ ] Verify limits are grouped correctly
- [ ] Verify labels are user-friendly
- [ ] Verify values display correctly

---

## Files Modified

1. `/Users/fahadpathan/Documents/ScholarDock/backend/app/db/schema.py`
2. `/Users/fahadpathan/Documents/ScholarDock/backend/app/api/auth.py`
3. `/Users/fahadpathan/Documents/ScholarDock/backend/app/db/connection.py`
4. `/Users/fahadpathan/Documents/ScholarDock/backend/app/services/admin.py`
5. `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/AdminView.tsx`
6. `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/PlanComparisonView.tsx`
7. `/Users/fahadpathan/Documents/ScholarDock/RBAC-AUTHENTICATION-PLAN.md`

---

## Next Steps

1. **Implement enforcement logic** in backend API routes:
   - Add monthly web search check to web search endpoint
   - Add total records check to record creation endpoint
   - Add decrement logic to record deletion endpoint

2. **Add usage indicators** in frontend:
   - Show monthly web search usage in UI
   - Show total records usage in UI
   - Add progress bars or warnings when approaching limits

3. **Test thoroughly**:
   - Test limit enforcement
   - Test counter reset logic
   - Test decrement on delete
   - Test admin panel editing

4. **Update user documentation**:
   - Explain the difference between daily and monthly limits
   - Explain the difference between per-sheet and total records
   - Provide examples of how limits work

---

## Summary Table

| Feature | General User | Pro User | Max User | Admin |
|---------|--------------|----------|----------|-------|
| **Web Search/Day** | 0 | 5 | 20 | ∞ |
| **Web Search/Month** | 0 | 150 | 600 | ∞ |
| **Records per Sheet** | 100 | 500 | 2,000 | ∞ |
| **Total Records** | 1,000 | 25,000 | 400,000 | ∞ |

---

## Notes

- Both limits are fully backward compatible
- No breaking changes to existing functionality
- Database schema automatically updates on startup
- Admin panel automatically shows new limits
- Plan comparison automatically includes new limits
