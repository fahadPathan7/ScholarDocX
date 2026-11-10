# SCHOLARDOCX-0232: Admin Users — collapsible filters, bigger table

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

The five filter groups (Role, Plan, Join Method, Status, Plan Source) always
took ~400px, leaving the user table room for about one row.

## Changes (`components/admin/UsersTab.tsx`)

- Filters are collapsed by default behind a **Filters** toggle bar that shows an
  active-filter count, chips for each active filter (while collapsed), a
  **Clear filters** action, and the live user count.
- Table card now has `min-h-[440px]`; the tab root scrolls (`overflow-y-auto`)
  when the screen is shorter, instead of squashing or clipping the table.

## Verification

Playwright with 12 mocked users at 1440x800 and 1920x1100: table viewport grew
from ~1 row to 5+ rows (438px / 688px); filter by "Google Linked" shows chip,
count 1, count 6 users, and Clear filters.

## Follow-up

`UsersTab.tsx` is ~1460 lines (over the 1150 cap before this change). Split the
filter bar, the user table and the three modals into components next time this
file is touched.
