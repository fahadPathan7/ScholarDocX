# SCHOLARDOCX-0199: Add Pattern Memory brain game

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-29

## Summary

Add **Pattern Memory (Memory Matrix)** to Brain Games as the 6th playable game. A spatial working memory game where players memorize a pattern of illuminated tiles, then recall and tap them. Fully client-side, zero AI credits, zero server endpoints, with progress and high score stored in `localStorage`.

## Business Context

Links:
- Business context: `AI-Context/README.md`

Business value:
Provides researchers and graduate applicants with an engaging working-memory break in the workspace. Enhances user retention and daily interaction without incurring any server or external API costs.

## Functional Context

Links:
- Functional context: `AI-Context/jira-tasks/Epic-UIThemeAndPolish/SCHOLARDOCX-0198-brain-games.md`

Requirements:
- Add Pattern Memory as the 6th game entry in `BrainGamesView.tsx`.
- Show Level, Target Tile Count, Score, Lives, and High Score.
- Display a brief memorization phase (tiles glow teal), followed by a recall phase where the user clicks the target tiles.
- Provide clear visual feedback on correct (green) and incorrect (red) tile clicks.
- Progressively scale difficulty (grid size 3×3 → 4×4 → 5×5 and target tile counts) as levels increase.
- Include a "How to Play" modal mid-game via `gameRules.ts`.

## Technical Context

Links:
- Technical file: `frontend/src/components/games/BrainGamesView.tsx`

Technical notes:
- Game rules and pure state engine in `frontend/src/lib/games/patternMemory.ts`.
- Component in `frontend/src/components/games/PatternMemoryGame.tsx`.
- Rules data in `frontend/src/components/games/gameRules.ts`.
- Pure logic unit tests in `frontend/src/lib/games/__tests__/patternMemory.test.ts`.

## Scope

In scope:
- `frontend/src/lib/games/patternMemory.ts`
- `frontend/src/components/games/PatternMemoryGame.tsx`
- Updates to `frontend/src/components/games/gameRules.ts`
- Updates to `frontend/src/components/games/BrainGamesView.tsx`
- `frontend/src/components/games/brain-games.css`
- `frontend/src/lib/games/__tests__/patternMemory.test.ts`

Out of scope:
- Backend endpoints or remote database persistence.
- Audio engine or external asset dependencies.

## Acceptance Criteria

- Pattern Memory appears on the Brain Games selection screen with icon, blurb, and start screen instructions.
- Grid renders properly and scales smoothly across levels.
- Memorization phase flashes target tiles clearly, then hides them.
- User taps are validated: correct tiles highlight green, wrong tiles highlight red with life deduction.
- High score is saved locally and updated when exceeded.
- "How to Play" modal opens mid-game with clear steps.
- `npx tsc --noEmit` runs clean with zero type errors.
- Unit tests verify core game logic.

## Unit Test Plan

Unit tests needed: Yes

Planned tests:
- Level config calculation (grid size and target count scaling).
- Pattern generation with distinct cell indices.
- Tile selection validation (correct vs incorrect taps).
- Level progression and game over state handling.

## File Size Check

Files edited:
- `frontend/src/lib/games/patternMemory.ts` (148 lines)
- `frontend/src/components/games/PatternMemoryGame.tsx` (173 lines)
- `frontend/src/components/games/gameRules.ts` (+15 lines)
- `frontend/src/components/games/BrainGamesView.tsx` (+12 lines)
- `frontend/src/components/games/brain-games.css` (+150 lines)
- `frontend/src/lib/games/__tests__/patternMemory.test.ts` (101 lines)

Line-count risk: Low (all files under 200 lines)

## Verification Plan

- `npx tsc --noEmit` verified clean.
- Unit test suite verified (10 passed tests).

## Completion Notes

Changed files:
- `frontend/src/lib/games/patternMemory.ts` (new)
- `frontend/src/lib/games/__tests__/patternMemory.test.ts` (new)
- `frontend/src/components/games/PatternMemoryGame.tsx` (new)
- `frontend/src/components/games/gameRules.ts`
- `frontend/src/components/games/BrainGamesView.tsx`
- `frontend/src/components/games/brain-games.css`

Verification completed:
- `npx tsc --noEmit` executed with 0 errors.
- Logic test suite executed with 10 passing test cases.

Unit tests added:
- `frontend/src/lib/games/__tests__/patternMemory.test.ts` covering `getLevelConfig`, `generatePattern`, `createPatternGame`, level success, wrong tap life penalty, and `GAMEOVER` transition.
