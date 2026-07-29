# SCHOLARDOCX-0205: Context Audit Skill + AI-DLC Context Drift Cleanup

Status: Done

Owner: AI Agent

Epic: Epic-AIAgentPlatform

Created: 2026-07-29

## Summary

Built a repeatable audit for AI-DLC context (`scholardocx-context-audit` skill +
`scripts/check-context-drift.py`), then ran it and fixed what it found.

The headline defect: living context prescribed an API that does not exist.
`charge_ai_tokens` was named 28 times across AGENTS.md and AI-Context, alongside
`check_available_tokens` and `check_flat_fee_balance`. None has ever existed —
the real functions are `charge`, `charge_flat_fee`, and `ensure_can_spend`.
Three of the four "enforcement locations" the context told agents to use
(`NewsService.search`, `DeepHuntService.start_run`,
`AdvisorAtlasService.run_discovery`) were also fictional.

Separately, the three agent skill trees had drifted: `.claude/skills/` and
`.codex/skills/` held stale copies still describing the persistence layer as
SQLite, years into PostgreSQL. Claude and Codex sessions were being handed the
wrong stack while `.agents/skills/` was correct.

## Business Context

Links:

- Business file: [decisions.md](../../business/decisions.md) (BD-012)

Business value:

Context is read as instructions. A wrong function name does not sit harmlessly in
a doc — it propagates into code the next agent writes, and a reviewer checking
that code against the same context reaches the wrong conclusion. This class of
defect is invisible to reading, because the prose is confident and internally
consistent; only a mechanical check finds it.

## Functional Context

Links:

- Functional file: [feature-ai-token-economy.md](../../functional/feature-ai-token-economy.md)

No user-visible behaviour changed. This task touches context, skills, and
tooling only.

## Technical Context

Links:

- Technical file: [billing-contract.md](../../technical/billing-contract.md) (new)
- Technical file: [ai-integrations.md](../../technical/ai-integrations.md)
- Technical file: [ai-token-economy.md](../../technical/ai-token-economy.md)

### The seven rot classes found

| # | Class | Instance found |
|---|---|---|
| 1 | Phantom API | `charge_ai_tokens` ×28, plus 3 fictional enforcement locations |
| 2 | Duplicated normative rules | The billing contract stated 3×, each drifted differently |
| 3 | Fossilised removal | Tavily-for-Scholarship-Hunt, Hunt Profile, `advisor_atlas_searches_per_month`, per-run flat fee, `/news/search` |
| 4 | Aspirational-as-actual | `backend/app/integrations/{glm,gemini,tavily}/` tree — never built, written as structure |
| 5 | Unverified enforcement claim | "BILLING ENFORCEMENT: planner/filter/fallback are charged" — all false in code (SCHOLARDOCX-0204) |
| 6 | Cross-tree divergence | 4 skills + skills README differing across `.agents` / `.claude` / `.codex` |
| 7 | Orphaned context | none found |

### Living vs point-in-time

The audit's central design decision. `jira-tasks/` and `planbook/` are
**deliberately excluded** from the drift check: a completed task naming a file
later deleted is an accurate record of what shipped, and "fixing" it would
falsify the decision trail. Only living context tracks the present. An earlier
draft of the checker audited everything and produced ~90 findings, most of which
would have been damage to apply.

## Scope

In scope:

- The audit skill and its mechanical checker.
- Fixing living context: `AGENTS.md`, `AI-Context/README.md`,
  `technical/ai-integrations.md`, `technical/ai-token-economy.md`.
- Consolidating the billing contract into one file.
- De-duplicating the three skill trees.

Out of scope:

- Editing `jira-tasks/` or `planbook/` content (see above).
- Product code behaviour — no runtime change in this task.
- Rewriting skills whose content is correct.

## Acceptance Criteria

- [x] `make guard-context` passes; every path, link, and symbol in living context resolves.
- [x] No living context file names `charge_ai_tokens`, `check_available_tokens`, or `check_flat_fee_balance`.
- [x] The billing contract has exactly one home, and the other files link to it.
- [x] `.claude/skills` and `.codex/skills` cannot diverge from `.agents/skills`.
- [x] The audit is repeatable by a future agent without this conversation.
- [x] Task files and planbook are untouched.

## Implementation Plan

1. Write `scripts/check-context-drift.py` — verify paths, links, and symbols in living context only.
2. Tune to near-zero false positives by broadening the symbol index, not by weakening the check.
3. Consolidate the billing contract into `technical/billing-contract.md`; collapse the three copies to links.
4. Fix the remaining drift the script reports.
5. Fix the judgment-level staleness the script cannot see.
6. Write the `scholardocx-context-audit` skill.
7. Replace skill-tree copies with symlinks; retire the overlapping review skill.

## Unit Test Plan

Unit tests needed:

- No — and the reason matters.

The deliverable is itself a checker. `make guard-context` is executable and runs
against real repository content on every `make check`; a unit test asserting the
checker works would restate it against fixtures. Verification was done by
running it, and by confirming it fails on reintroduced defects (below).

## File Size Check

Files expected to be edited:

- `scripts/check-context-drift.py` (~230 lines, new)
- `.agents/skills/scholardocx-context-audit/SKILL.md` (~120 lines, new)
- `AI-Context/technical/billing-contract.md` (~130 lines, new)
- `AGENTS.md` (271 → 200)
- `AI-Context/README.md` (98 → 95, fully rewritten)
- `AI-Context/technical/ai-integrations.md` (942 → ~890)

Line-count risk:

- Low. Net reduction across context; no file approaches the 1000-line policy.

## Verification Plan

- `make guard-context` green.
- `make guards` green (billing guard unaffected).
- Every function name in `billing-contract.md` traced to its definition.
- Skill trees confirmed to contain no non-symlink entries.

## Completion Notes

Changed files:

*New*

- `scripts/check-context-drift.py` — mechanical drift checker, living context only.
- `.agents/skills/scholardocx-context-audit/SKILL.md` — the audit skill, symlinked into `.claude/skills/` and `.codex/skills/`.
- `AI-Context/technical/billing-contract.md` — the single normative billing source.

*Rewritten*

- `AI-Context/README.md` — now a map, not a brain. The ~55 lines of billing
  detail it carried (naming four functions that never existed) are gone,
  replaced by a "where the rules live" table. Adds the living vs point-in-time
  distinction.
- `.agents/skills/README.md` — corrected skill map, single-source rule.

*Corrected*

- `AGENTS.md` — two billing fossils (97 + 11 lines) collapsed to a rule plus a
  link. Removed the phantom API, the fictional enforcement locations, the
  deleted endpoints (`/news/search`, `/news/query-preview`), and five removed
  role limits.
- `AI-Context/technical/ai-integrations.md` — third billing copy collapsed to a
  link; Advisor Atlas billing block corrected (per-call metering, not a flat run
  fee or monthly quota); the never-built `integrations/` tree replaced with the
  real layout; Tavily/OpenRouter roles corrected; the dead `computeFitScore` /
  `huntProfile.ts` claim replaced with what actually happens.
- `AI-Context/technical/ai-token-economy.md` — stale `record_external_search`
  reference corrected.
- `AI-Context/business/decisions.md` — BD-012.
- `Makefile` — `guard-context` and a `guards` aggregate; `check` now runs both.

*Removed*

- `scholardocx-context-review` skill (all three trees) — folded into
  `scholardocx-context-audit`, which covers everything it did plus the
  mechanical pass. Two skills with near-identical trigger descriptions compete
  for the same request. Its unique content (product-constraint conflicts, Jira
  task hygiene) was carried into the new skill before deletion; the original is
  backed up in this session's scratchpad.
- Stale skill copies in `.claude/skills/` and `.codex/skills/` — replaced with
  symlinks to `.agents/skills/`, so divergence is now structurally impossible
  rather than merely discouraged.

Verification completed:

- `make guards` passes: billing guard (16 reviewed exemptions) and context drift
  guard (6,743 symbols indexed, zero unresolved references).
- **The checker was verified to fail, not just to pass.** During development it
  reported 34 → 20 → 17 → 4 → 1 → 0 findings as each was fixed; each reduction
  was traced to the specific correction that caused it.
- Every function name in `billing-contract.md` was read out of
  `backend/app/services/ai_tokens.py` and `ai.py` rather than recalled.
- Role-limit names verified by parsing `DEFAULT_ROLE_LIMITS`; endpoint paths
  verified by grepping router decorators and prefixes.
- Skill trees: no non-symlink entries remain outside `.agents/skills/`.
- No tests were run, per project convention.

Follow-ups:

- The skills READMEs in `.agents` reference `SKILL.md` paths relatively; those
  resolve through the symlinks, but a future agent adding a skill must add it to
  `.agents/skills/` and symlink it, not copy it. Stated in the README.
- `make check` still has no CI workflow behind it (`.github/workflows/ci.yml` is
  referenced by the Makefile comment but does not exist), so both guards are
  local-only. Carried over from SCHOLARDOCX-0204.
- Consider extending the drift checker to API route paths (`/ai/chat`,
  `/scholarship-deep-hunt/runs`), which are currently verified by hand. Three
  fossilised endpoints were found this way and a checker would have caught them.
