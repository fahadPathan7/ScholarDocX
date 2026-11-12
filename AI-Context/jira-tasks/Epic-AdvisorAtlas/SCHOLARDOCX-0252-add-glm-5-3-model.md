# SCHOLARDOCX-0252: Add GLM-5.3 model and make it the Advisor Atlas default

Status: Done

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-11-12

## Summary

Register GLM-5.3 everywhere models are listed or chosen (backend registry, price
seed, assistant model picker, admin GLM permission description) and switch the
Advisor Atlas analysis default from GLM-5.2 to GLM-5.3. Follows the
SCHOLARDOCX-0080 pattern.

## Business Context

Links:

- Business file: N/A (no product-scope change)

Business value:

- Keeps the assistant and Advisor Atlas on the latest GLM model.

## Functional Context

Links:

- Functional file: [feature-ai-assistant.md](../../functional/feature-ai-assistant.md)
- Functional file: [feature-advisor-atlas.md](../../functional/feature-advisor-atlas.md)

Requirements:

- GLM-5.3 is selectable in the assistant model picker, listed first among GLM models.
- Advisor Atlas uses GLM-5.3 by default for its GLM text passes.

## Technical Context

Links:

- Technical file: [ai-integrations.md](../../technical/ai-integrations.md)
- Technical file: [billing-contract.md](../../technical/billing-contract.md)

Technical notes:

- The model name passes straight to the GLM API (`AiService._parse_model_choice`);
  permission is provider-based (`can_use_glm`), so no permission change.
- Billing contract: a model must have a price row or `compute_cost` resolves to
  $0. `seed_ai_models` inserts new `DEFAULT_GLM_MODELS` entries on startup
  (`ON CONFLICT DO NOTHING`), priced from its `prices` map.
- **Price is a placeholder**: GLM-5.3 is seeded at GLM-5.2's 2.00 / 4.00 USD per
  1M tokens (in / out). The real z.ai price was not available; a super_admin
  must confirm it in admin → AI models. Mirroring 5.2 can over-charge, never
  under-charge to $0.

## Scope

In scope:

- `config.py` default, `ai.py` registry, `connection.py` price seed,
  `assistantModels.ts` picker, `RoleLimitsTab.tsx` description, context docs.

Out of scope:

- Vision model (stays GLM-4.6V).
- Research Expert analysis cascade (`ANALYSIS_MODEL_CASCADE`, still GLM-5.2)
  and the assistant fast/background model (GLM-4.7) — separate decisions.

## Acceptance Criteria

- GLM-5.3 appears first in the GLM group of the assistant picker.
- A fresh backend resolves `settings.advisor_atlas_glm_model` to `GLM-5.3`.
- Startup seeds an `ai_models` row `glm / GLM-5.3` with non-zero prices.

## Implementation Plan

- As in scope.

## Unit Test Plan

Unit tests needed:

- No

If no unit tests are needed, explain why:

- Registry/config/default change; the model id is passed through to the
  provider. Billing guards already cover seeding non-zero prices.

## File Size Check

Files expected to be edited:

- config.py, ai.py, connection.py, assistantModels.ts, RoleLimitsTab.tsx, docs.

Line-count risk:

- Low

## Verification Plan

- Backend import resolves the new default; frontend type-check.

## Completion Notes

Changed files:

- backend/app/core/config.py, backend/app/services/ai.py,
  backend/app/db/connection.py, frontend/src/lib/assistantModels.ts,
  frontend/src/components/admin/RoleLimitsTab.tsx,
  frontend/src/components/AboutView.tsx (GLM-5.3 ranked #1 at score 96 — an
  owner-chosen illustrative score, not a benchmark; table renumbered),
  AI-Context/functional/feature-ai-assistant.md,
  AI-Context/functional/feature-advisor-atlas.md,
  AI-Context/technical/ai-integrations.md

Verification completed:

- See session notes; suites not run (backend venv broken, AGENTS.md).

Unit tests added or updated:

- None.

Follow-ups:

- Super_admin: set the real GLM-5.3 price in admin → AI models.
- Confirm `GLM-5.3` is the exact id z.ai accepts with one live call.
- Decide whether Research Expert's primary model should move to GLM-5.3.
