# Epic: Audit Remediation

Status: In Progress

Owner: AI Agent

Created: 2026-11-01

## Goal

Turn the findings of the 2026-11-01 full-repo improvement audit (frontend UX,
visual system, AI/billing UX, backend reliability) into shipped fixes. Work
lands in scoped batches; each batch is one story that groups findings by
effort/impact with a shared verification pass.

## Scope

In scope:
- Correctness bugs that degrade UX today (error handling, timer leaks, silent failures).
- Money/trust fixes: atomic credit charging, stale balance refresh, checkout product mapping, user-facing billing copy.
- Modal pattern migration + shared Modal accessibility (Escape, focus trap, dialog semantics).
- CSS token repair (undefined variables, dead selectors), dead CSS/file removal, reduced-motion guard.
- Small backend hardening: atomic counters, error differentiation, provider resolution, lazy plan-expiry fallback.
- UI copy compliance sweep (banned jargon removed from rendered strings).

Out of scope:
- New infrastructure (email provider, Redis, headless browser).
- Large architectural changes (URL routing, streaming chat, pagination overhaul, soft delete, dark mode) — these become their own stories.

## Success Metrics

- No silent failure paths in touched flows: every catch surfaces feedback or a retry affordance.
- Concurrent credit operations cannot under-deduct.
- No banned jargon in rendered copy in touched files.
- All touched modals use `<Modal>` from `Modal.tsx`.

## Stories

- [ ] SCHOLARDOCX-0217: Audit remediation batch 1 — trust, error handling, modal a11y, CSS tokens
- [ ] SCHOLARDOCX-0218: AI cost transparency + pre-flight ceilings (batch 2)
- [ ] SCHOLARDOCX-0219: Deadline notifications for saved opportunities (batch 3)
- [ ] SCHOLARDOCX-0220: Polish + feedback bundle (batch 4)
- [ ] SCHOLARDOCX-0221: File-size splits for over-cap modules (batch 5)
