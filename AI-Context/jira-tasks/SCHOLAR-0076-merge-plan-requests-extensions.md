# SCHOLAR-0076: Merge Plan Requests and Plan Extensions

## Goal
Merge the Plan Requests and Plan Extensions tabs in the admin panel into a single tab. Remove the `admin_manage_plan_extensions` role feature entirely and rely solely on `admin_manage_plan_requests` for both upgrade and renewal/extension requests.

## Implementation Steps
1. **Database Schema & Seeding**:
   - Remove `admin_manage_plan_extensions` from `backend/app/db/schema.py`.
   - Remove `admin_manage_plan_extensions` from default admin roles in `backend/app/db/connection.py`.

2. **Backend API**:
   - Update `backend/app/api/admin.py` to use `admin_manage_plan_requests` for both `upgrade` and `extension` requests in `list_plan_requests` and `review_plan_request`.
   - Update `backend/app/services/admin.py` to remove `admin_manage_plan_extensions` from role limit reset templates.

3. **Backend Tests**:
   - Update `backend/tests/test_plan_requests.py` to remove references to `admin_manage_plan_extensions` and verify that `admin_manage_plan_requests` allows processing of both types of requests.

4. **Frontend UI**:
   - In `frontend/src/components/AdminView.tsx`:
     - Remove the `plan_extensions` tab.
     - Remove `admin_manage_plan_extensions` from feature descriptions and limit definitions.
     - Ensure the `plan_requests` tab renders the combined component.
   - In `frontend/src/components/admin/PlanRequestsTab.tsx`:
     - Modify the component to accept an optional `requestType` or fetch all types (upgrade + extension) if none provided. Remove the filtering by specific `requestType` to allow showing both upgrades and renewals in a single view.
     - Update table titles/descriptions.

## Context
Refines the admin panel to simplify management. By combining these tabs, administrators only need to grant one permission (`admin_manage_plan_requests`) to process all user plan-related requests.
