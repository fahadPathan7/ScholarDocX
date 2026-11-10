# AGENTS.md

Root rules for AI agents working in ScholarDocX. Keep this file short: rules with a
longer spec link to it instead of restating it.

## Mission

ScholarDocX is a privacy-first workspace for higher-education applicants: applications,
deadlines, uploaded documents, outreach emails, and AI-assisted research in one place.

**Stack and constraints** (SCHOLARDOCX-0139): React/Vite/TypeScript frontend, FastAPI
backend, PostgreSQL + object storage on Supabase, hosted on Render. Free tiers only; no
new paid infrastructure, analytics, or telemetry without explicit approval. AI/search
providers are optional, server-side keys, called only from backend services on explicit
user actions. Details: [technical/stack-and-runtime.md](AI-Context/technical/stack-and-runtime.md).

## Workflow (AI-DLC)

1. Read [AI-Context/README.md](AI-Context/README.md) and the relevant skill in `.claude/skills` (same set in `.agents/` and `.codex/`).
2. Read the business / functional / technical files the task touches, and its Jira task.
3. **Jira first**: major work needs a task file in [AI-Context/jira-tasks](AI-Context/jira-tasks) (inside an Epic) before code.
4. **Context first**: update context before coding new or changed behaviour, and again after (decisions, changed files, tests, follow-ups). Do not end a session with stale context.
5. Then implement. Keep changes scoped to the active task.

Do not start coding when the user asked for context, planning, or docs only.

Conflict order: user's latest instruction → root rules (this file, [CLAUDE.md](CLAUDE.md), [CODE_RULES.md](AI-Context/CODE_RULES.md)) → Jira task → AI-Context → existing code patterns.

## Hard rules

- **No infrastructure or algorithm jargon in user-facing copy.** Never show provider/infra names (Supabase, Render, PostgreSQL, FastAPI, Vite), model IDs, or pipeline terms (vector, embeddings, pgvector, chunks, similarity search, indexing, extraction, tokens consumed, raw HTTP codes) in UI text, toasts, errors, tooltips, or marketing copy. Describe the user outcome instead: "the paper's content", "sections", "credits used", "retrying", "Something went wrong. Please try again." Internal code (names, comments, logs, payloads) is exempt.
- **Every provider call is billed to the user**, gate checked first, no exemptions (background, fallback, retry, "free" models). Read [technical/billing-contract.md](AI-Context/technical/billing-contract.md) before touching provider code; `make guard-billing` and `make guard-context` enforce it. Update `backend/tests/regression/test_limits_billing_guards.py` with billing changes.
- **No summary `.md` files** anywhere unless the user asks. Context goes in `AI-Context/` or a new Jira task file.
- **No leftover one-off scripts** (`fix_*`, `patch_*`, `migrate_*`, scratch SQL, logs, DB dumps). Delete them when the fix is verified; durable parts become migrations, tests, or decisions. See [CODE_RULES.md](AI-Context/CODE_RULES.md).
- **File size**: target ≤ 1000 lines, grace 1150 during a feature; split an over-limit file before the next feature. See [CODE_RULES.md](AI-Context/CODE_RULES.md).
- **Tests**: add or update tests when behaviour, validation, persistence, or provider boundaries change. Do not run the suites unless the user asks.
- Never commit secrets or real API keys.

## UI rules

**Layout freedom (owner decision, 2026-11-10):** there are no mandated scroll, overflow, wrap, fixed-height, or single-row restrictions. Pages may scroll or fit the viewport as the design needs.

**Content must stay reachable (SCHOLARDOCX-0227):** never put `overflow: hidden` (with `min-height: 0`) on a page root that has no inner scroller. Content taller than the screen scrolls (tab container or the root), it is never cut off. Check new pages at ~1280×600 and 390×700.

### Modal backdrop blur (regressed 3+ times — read before touching modals)

**Intended look:** blur covers the `.main-content` work surface; the TopBar and Sidebar stay crisp.

**The only approved implementation is `<Modal>` from `Modal.tsx`** (default `scope="main"`). Do not use `scope="body"` for in-app modals (it blurs the TopBar and centers under the sidebar), and do not copy older files that still contain an inline `<div className="modal-backdrop modal-backdrop-main">`.

```tsx
import { Modal } from "./Modal"; // nested modals: <Modal zIndex={1060}>

export function MyModal({ onClose }) {
  return (
    <Modal onClose={onClose}>
      <form className="modal-panel" onClick={(e) => e.stopPropagation()}>…</form>
    </Modal>
  );
}
```

**Forbidden:** a hand-rolled backdrop div or `fixed inset-0` overlay in a modal; custom portals to `#sheet-work-surface` or `.section-body`; making `.modal-backdrop-main` `position: fixed` / `min-height: 100vh` (it must stay `position: absolute; inset: 0`); inline `position`/`backdropFilter` overrides. The only sanctioned non-`<Modal>` backdrop is `LoginPage.tsx`'s `auth-modal-backdrop` (pre-login).

**Before shipping modal work:** sidebar and TopBar are sharp; breadcrumbs and view header are blurred; the panel sits below the top of the work surface (80px offset; 20px on screens ≤ 760px tall) with its body scrolling inside and Cancel/Submit visible.

Full spec: [technical/frontend-visual-system.md](AI-Context/technical/frontend-visual-system.md) ("Modal backdrop blur scoping").
