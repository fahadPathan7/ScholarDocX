# SCHOLARDOCX-0080: Add GLM-5.2 model and make it the Advisor Atlas default

Status: Done

Owner: AI Agent

Created: 2026-06-26

## Summary

Register the new GLM-5.2 model so it is selectable in the AI assistant, and switch the Advisor Atlas analysis model default from GLM-5.1 to GLM-5.2.

## Business Context

Links:

- Business file: N/A (no product-scope change)

Business value:

- Keeps the assistant and Advisor Atlas on the latest GLM model the user now has access to.

## Functional Context

Links:

- Functional file: [AI-Context/functional/feature-ai-assistant.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-ai-assistant.md)
- Functional file: [AI-Context/functional/feature-advisor-atlas.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-advisor-atlas.md)

Requirements:

- GLM-5.2 must appear as a selectable model in the assistant model picker.
- Advisor Atlas must use GLM-5.2 by default for its GLM-based analysis passes.

## Technical Context

Links:

- Technical file: [AI-Context/technical/ai-integrations.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/ai-integrations.md)

Technical notes:

- The GLM model name is passed straight through to the GLM API by `AiService._parse_model_choice` (provider `glm`); `DEFAULT_GLM_MODELS` is a registry, not an allowlist. Model permission (`verify_model_permission`) is provider-based (`can_use_glm`), so no permission change is required for GLM-5.2.
- Advisor Atlas reads `settings.advisor_atlas_glm_model`, which defaults via `os.getenv("ADVISOR_ATLAS_GLM_MODEL", ...)`. `ADVISOR_ATLAS_GLM_MODEL` is not set in `.env`, so changing the code default takes effect.
- Frontend model list lives in `frontend/src/lib/assistantModels.ts` (`MODEL_DISPLAY_NAMES`, `MODEL_OPTIONS`); the chat/background fallback list is intentionally left as-is.

## Scope

In scope:

- Add GLM-5.2 to backend model registry and frontend model picker.
- Change Advisor Atlas default GLM model to GLM-5.2.
- Update technical + functional context and this task.

Out of scope:

- Changing the assistant chat/background fallback model (GLM-5.1 / GLM-5-Turbo).
- Adding GLM-5.2 to the static model-comparison table in ProfileView (cosmetic reference content; scores would be invented).
- New automated tests (config/registry change; verified by build + import).

## Acceptance Criteria

- GLM-5.2 is selectable in the assistant model picker.
- A fresh backend resolves `settings.advisor_atlas_glm_model` to `GLM-5.2`.
- Frontend build (tsc + vite) passes.

## Implementation Plan

- Update `backend/app/core/config.py`: `ADVISOR_ATLAS_GLM_MODEL` default `GLM-5.1` -> `GLM-5.2`.
- Update `backend/app/services/ai.py`: add `GLM-5.2` to `DEFAULT_GLM_MODELS`.
- Update `frontend/src/lib/assistantModels.ts`: add `GLM-5.2` to `MODEL_DISPLAY_NAMES` and `MODEL_OPTIONS`.
- Update `frontend/src/components/AdminView.tsx`: `can_use_glm` description lists GLM-5.2.

## Unit Test Plan

Unit tests needed:

- No

If no unit tests are needed, explain why:

- Model name is passed through to the provider; the change is a registry/config default. Covered by backend import + frontend build.

## File Size Check

Files expected to be edited:

- config.py, ai.py, assistantModels.ts, AdminView.tsx, ai-integrations.md, feature-advisor-atlas.md, feature-ai-assistant.md, this task file.

Line-count risk:

- Low

## Verification Plan

- Backend: from `backend/`, `python -c "import app.core.config as c; print(c.Settings().advisor_atlas_glm_model)"` -> `GLM-5.2`; `python -c "import app.main"`.
- Frontend: `npm --prefix frontend run build`.

## Completion Notes

Changed files:

- backend/app/core/config.py (ADVISOR_ATLAS_GLM_MODEL default -> GLM-5.2)
- backend/app/services/ai.py (DEFAULT_GLM_MODELS adds GLM-5.2)
- frontend/src/lib/assistantModels.ts (MODEL_DISPLAY_NAMES + MODEL_OPTIONS add GLM-5.2)
- frontend/src/components/AdminView.tsx (can_use_glm description lists GLM-5.2)
- AI-Context/technical/ai-integrations.md, AI-Context/functional/feature-advisor-atlas.md, AI-Context/functional/feature-ai-assistant.md (context)

Verification completed:

- Backend: Settings().advisor_atlas_glm_model == "GLM-5.2"; DEFAULT_GLM_MODELS includes GLM-5.2; `import app.main` OK (title "ScholarDocX API").
- Frontend: `npm run build` (tsc -b && vite build) succeeded.

Unit tests added or updated:

- None.

Follow-ups:

- Optionally switch the assistant chat fallback (`getFallbackModel`) from GLM-5.1 to GLM-5.2 if desired.
