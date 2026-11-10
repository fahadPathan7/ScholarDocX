# SCHOLARDOCX-0244: Dashboard columns grow independently

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

Dashboard cards shared 3 grid rows, so a long Pinned Projects list stretched Workspace Snapshot and Next 7 Days with it.

## Changes

`DashboardView.tsx`: cards grouped into three `.dashboard-col` wrappers (no logic change). `dashboard-polish.css`: 3-column grid with `align-items: start`, flex-column stacks, and a mobile rule (<=1100px) that dissolves the columns and orders the cards. Also removed empty scrollbar tracks on card bodies and kept metric labels clear of the tile bar (earlier in this task series).

## Verification

Playwright (mocked data, 8 pinned projects) at 1440 and 1000 px: only the Pinned Projects column grows; narrow layout stacks in order. Not exercised: many pinned sheets/docs, many events, the calendar modal.
