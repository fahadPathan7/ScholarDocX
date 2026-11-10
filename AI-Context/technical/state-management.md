# State Management and Data Refresh

## Header Refresh: refresh the whole tab group, in place

The top-bar **Refresh data** button (`refreshActiveTab` in `frontend/src/App.tsx`) refreshes everything that belongs to the
sidebar group you are on, while leaving you where you are: same open sheet, paper, dossier, sub-tab, or admin tab, with scroll
position, open modals, and unsaved edits intact (SCHOLARDOCX-0237).

**Never use React `key` manipulation to force a remount for a data refresh.** It destroys the DOM tree and the user's place.

### How it works

1. **One counter per group.** `App.tsx` keeps `refreshTriggers: Record<group, number>`; `triggerFor(group)` reads it and
   `bumpRefresh(...groups)` increments it. A group is the tab key, except `plans` and `buy-credits`, which belong to `profile`
   (`groupOfTab`). Every tab stays mounted, so a single shared counter would reload every hidden view; per-group counters wake only the
   group in front.
2. **Views reload themselves.** Each top-level view (and every sub-component that loads its own data) takes `refreshTrigger?: number`
   and reloads in a `useEffect` guarded by `refreshTrigger > 0`.
3. **App-level data is refetched by `refreshActiveTab`** for every group, with `Promise.allSettled` (one failure must not abort the
   rest or leave the spinner on): notifications (bell), the dashboard summary (counts), the user (`refreshUser`), usage limits,
   and the credit balance; plus files and categories for Projects and Documents. The spinner lasts at least 500 ms.
4. Other places that change data bump the groups they affect, for example Lumi's workspace changes bump `projects`, `sticky`,
   `whiteboard`, and `documents`, and clicking Projects in the sidebar bumps `projects`.

### Rules for a view's refresh effect

- Reload **in place**: do not reset selection, scroll, filters, typed text, or drafts. Replace a local draft only when it has no
  unsaved changes (for example the Profile form, the dossier notes). Prefer a silent reload (no full-page spinner).
- Keep the open item open: Projects reloads the list, sheet counts, the open project's meta, and the open sheet's rows (the
  `useSheetPage` content-signature guard skips an identical payload so our own save echo never clobbers local edits); Research Expert
  also re-reads the open paper and its saved analyses; Advisor Atlas reloads runs, the active run, saved professors, and the open
  dossier; Scholarship Hunt reloads the run list and open run, re-reads the plan gate, and the Library when mounted; Admin passes the
  counter to every tab, and editors that keep drafts (pricing, packs, models) refresh silently.
- **Whiteboard** saves what is on screen first, refreshes only the board list, and stays on the open board (it moves only if that
  board was deleted elsewhere). Do not call a loader that switches boards from the refresh path.
- Sub-tabs that are not mounted (for example the Scholarship Hunt Library while Search is showing) load fresh when opened.
- Views with nothing to reload (About, Brain Games) ignore it; Profile reloads the saved profile and preferences.

### When creating a new tab or a sub-component that loads data

1. Accept `refreshTrigger?: number` and implement the guarded `useEffect`.
2. Add its group to `refreshTriggers` use in `App.tsx` (pass `triggerFor("<group>")`); a sub-component receives the parent's value.
3. Add a unit test for the pure reload logic when there is any (see CODE_RULES.md).

```tsx
export function MyView({ refreshTrigger }: { refreshTrigger?: number }) {
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) void reloadInPlace();
  }, [refreshTrigger]);
}
```

For very simple groups (Dashboard, Documents) the data is fetched centrally in `refreshActiveTab` and passed down as props.
