---
name: scholardock-ui-ux
description: Use for ScholarDock frontend UX, layout, visual design, accessibility, responsive behavior, interaction design, dialogs, forms, tables, dashboards, document UI, and browser screenshot verification. Requires ui-ux-pro-max as the primary UI style authority for ScholarDock UI/UX work.
---

# ScholarDock UI/UX

## Required Context

- Active project-local `ui-ux-pro-max` skill, such as `.codex/skills/ui-ux-pro-max/SKILL.md`, `.claude/skills/ui-ux-pro-max/SKILL.md`, or `.gemini/skills/ui-ux-pro-max/SKILL.md`.
- `CODE_RULES.md` UI/UX rules.
- `AI-Context/technical/frontend-visual-system.md`
- Relevant functional feature file.
- Active Jira task.

## Primary Style Rule

Use `ui-ux-pro-max` as the main UI style authority for every ScholarDock UI/UX task. Apply its accessibility, interaction, responsive layout, typography/color, motion, form feedback, navigation, and data readability checks before implementation and review.

If `ui-ux-pro-max` conflicts with ScholarDock-specific context, ScholarDock context wins: local-first, privacy-first, command-center app UX, compact workspace density, no marketing-page defaults, no external font/CDN dependency by default, and browser verification for rendered UI.

## Product Fit

- ScholarDock is an application workspace, not a marketing page.
- Prioritize scanability, calm density, readable tables/forms, and efficient repeated workflows.
- Keep dashboard/project/sheet navigation consistent: project screens stay high-level; sheet editing belongs in the sheet detail view.
- Use polished empty/loading/error states.

## Layout Rules

- Forms must fit the viewport and scroll internally when long.
- Keep modal headers and action bars visible.
- Prevent text overlap and button label overflow on desktop and mobile.
- Use stable dimensions for tables, boards, controls, counters, and toolbars.
- Avoid nested cards and decorative clutter.

## Interaction Rules

- Disable actions while saving/fetching.
- Support Escape for dismissing dialogs and common modal flows.
- Preserve user input on validation errors.
- Show clear success/error feedback.

## Verification

For UI work, run a build when practical and verify in browser. Capture or inspect desktop and mobile viewports for overflow, blank states, clipping, and incoherent overlap.
