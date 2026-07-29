# SCHOLARDOCX-0200: Brain Games gameplay polish — notes, undo, chording, reveal feedback

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-29

## Summary

A focused polish pass over the six games shipped in SCHOLARDOCX-0198/0199. No
new games, no new permissions, no server surface — the additions are the moves
a player expects to be able to make and the feedback that tells them a move
landed.

Four changes, chosen because each removes a real friction rather than adding
decoration:

1. **Sudoku: pencil notes and undo.** Hard and Expert are close to unplayable
   without candidates — the technique the difficulty assumes is "write the
   possibilities in the corner", and there was nowhere to write them. Undo
   pairs with it: a wrong digit currently has to be re-derived by hand.
2. **2048: undo one move, and animation on merge/spawn.** A single mis-swipe
   ends a good run, and with a static grid there is no way to see *what* just
   happened — which tiles merged and where the new one appeared.
3. **Minesweeper: chording.** Opening the remaining neighbours of a number
   whose flags are all placed is the standard mid-game move; without it the
   late game is hundreds of individual clicks.
4. **Word puzzle and tic-tac-toe: reveal feedback.** The word row changed
   colour instantly, which reads as a state jump rather than a result; the
   winning line was marked but not announced visually.

## Business Context

Links:
- Business context: `AI-Context/README.md`

Business value: retention of an existing zero-cost break surface. Nothing here
touches AI credits, the database, or any external service.

## Functional Context

Links:
- `AI-Context/jira-tasks/Epic-UIThemeAndPolish/SCHOLARDOCX-0198-brain-games.md`
- `AI-Context/jira-tasks/Epic-UIThemeAndPolish/SCHOLARDOCX-0199-pattern-memory-game.md`

Requirements:

**Sudoku**
- A Notes toggle. With it on, a digit adds/removes a small candidate mark in
  the selected square instead of filling it.
- Placing a real digit clears that square's notes and removes the digit from
  the notes of every peer (row, column, box). This is the bookkeeping a player
  would otherwise do by hand and get wrong.
- Undo steps back through value *and* note changes, restoring the selection.
- Notes survive a reload alongside the grid.
- Given squares accept neither values nor notes.

**2048**
- Undo restores the board and score from before the last move. One step only,
  and it is spent once used — a rewindable game is a different game.
- Merged tiles and the newly spawned tile are visually distinguished for the
  duration of one animation.

**Minesweeper**
- Double-click (or middle-click) a revealed number whose adjacent flag count
  equals its number opens all its unflagged neighbours.
- A chord on a mis-flagged number loses the game, exactly as a manual click on
  the same square would. It is a shortcut, not a safety net.
- Chording does nothing on an unrevealed square, a zero, or a number whose flag
  count does not match.

**Word puzzle / tic-tac-toe**
- The most recently submitted word row flips its tiles left to right as the
  marks appear.
- The winning tic-tac-toe line pulses once.

All motion respects `prefers-reduced-motion`.

## Technical Context

Links:
- `AI-Context/technical/frontend-visual-system.md`
- `AI-Context/technical/project-structure.md`

Technical notes:
- The 0198 split holds: every rule added here is a pure function in
  `lib/games/`, and the components keep only rendering and input. This is what
  makes the logic testable in a repo with no DOM test harness.
- `move()` in `game2048.ts` now reports *where* merges happened. The four
  directions are still one implementation applied to a transformed board, so
  merge coordinates come back in the oriented frame and are mapped to board
  coordinates by the inverse of that transform — one mapper per direction,
  next to the transforms they invert.
- `spawnAt()` returns the cell it filled; `spawn()` stays as the thin wrapper
  so existing callers and tests are untouched.
- Sudoku notes are `Set<number>[]`, serialized as one comma-joined digit run
  per cell so a saved game restores its candidates.

## Scope

In scope:
- `frontend/src/lib/games/{sudoku,game2048,minesweeper}.ts`
- `frontend/src/components/games/{SudokuGame,Game2048,MinesweeperGame,WordPuzzleGame}.tsx`
- `frontend/src/components/games/{gameRules.ts,BrainGamesView.tsx,brain-games.css}`
- `frontend/src/lib/games/__tests__/{sudoku,game2048,minesweeper}.test.ts`

Out of scope:
- Multi-step undo in 2048 (see the requirement above — deliberate).
- A dictionary for the word puzzle (unchanged from 0198).
- Cross-session stats and streaks. Still per-visit except sudoku and the daily
  word, which already persist.
- Auto-flagging in Minesweeper. Chording is a shortcut for a decision the
  player has already made; auto-flag makes the decision for them.

## Acceptance Criteria

- Notes mode toggles; digits write candidates; placing a value clears the
  square's notes and that digit from peers; notes reload with the grid.
- Sudoku undo reverses the last value or note change, and is disabled when
  there is nothing to undo.
- 2048 undo restores board and score once per move, disabled otherwise.
- Merged and spawned 2048 tiles are visibly marked when they appear.
- Double-click and middle-click chord in Minesweeper under the rules above.
- The newest word row flips in sequence; the winning tic-tac-toe line pulses.
- No animation plays under `prefers-reduced-motion: reduce`.
- `npx tsc --noEmit` clean.

## Unit Test Plan

Unit tests needed: Yes

Planned tests:
- 2048: merge coordinates correct for all four directions (the transform
  inverse is the part that is easy to get wrong), empty when nothing merges,
  `spawnAt` reports a cell that was empty and is now filled.
- Minesweeper: chord opens neighbours only when flags match; is a no-op on
  unrevealed, zero, and under/over-flagged squares; never opens a flagged
  neighbour; detonates on a mis-flagged number.
- Sudoku: notes round-trip through serialization, including empty cells;
  peer-clearing removes the digit from row/column/box notes and nowhere else.

## File Size Check

Files edited, after the change:

- `lib/games/game2048.ts` 153 (+37)
- `lib/games/minesweeper.ts` 179 (+34)
- `lib/games/sudoku.ts` 273 (+50)
- `components/games/SudokuGame.tsx` 390 (+124)
- `components/games/Game2048.tsx` 186 (+56)
- `components/games/MinesweeperGame.tsx` 186 (+26)
- `components/games/WordPuzzleGame.tsx` 188 (+15)
- `components/games/BrainGamesView.tsx` 177 (+2)
- `components/games/gameRules.ts` 97 (+5)
- `components/games/brain-games.css` **1015** (+105)

`brain-games.css` is the one file over the 1000-line target. It is inside the
grace band in `CODE_RULES.md` and the added rules are cohesive with this
feature (per-game animation and the notes sub-grid), so it is not split here.
Recorded in `technical/frontend-visual-system.md`: a seventh game should split
it per-game rather than extend it again. Nothing else is close to a limit —
`SudokuGame.tsx` is the largest component at 390.

## Verification Plan

- Direct execution of the engine tests via `node --experimental-strip-types`
  (vitest cannot run in this environment — `node_modules` carries the macOS
  rollup binary).
- `npx tsc --noEmit`.

## Completion Notes

Changed files: as listed under File Size Check, plus the three test files
under `lib/games/__tests__/` and `technical/frontend-visual-system.md`.

### Verification

- `npx tsc --noEmit` — clean, exit 0.
- Engine tests, run directly on node with a small describe/it/expect shim
  (vitest still cannot start here — `@rollup/rollup-linux-arm64-gnu` is
  missing, `node_modules` carries the macOS binary):
  **89 passed, 0 failed** across 2048 (26), Minesweeper (30) and Sudoku (33).
  24 of those are new:
  - **2048 merge reporting (6).** One per direction plus the two-merge and
    multi-row cases. This is the part that was worth testing: merges are found
    in the oriented frame and mapped home, so a wrong inverse would light up
    the wrong tile — visible but easy to miss by eye, since `left` looks
    correct whichever way the mapping is written.
  - **`spawnAt` (3).** Reports a cell that was empty and is now filled, null
    on a full board, and agrees with what `spawn()` returns for the same seed
    — the last one is what keeps the thin wrapper honest.
  - **Chording (7).** No-op on unrevealed, under-flagged, over-flagged and
    zero squares; opens the rest when flags match; never opens the flagged
    neighbour; and **detonates on a mis-flagged number**, which is the
    behaviour a reader is most likely to think is a bug and "fix".
  - **Candidate notes (8).** Toggle, no mutation of the input, peer-striking
    hitting exactly 21 squares (20 peers + the square), other digits left
    alone, erase clearing only the square itself, serialization round-trip
    including blanks, and four malformed blobs rejected.

### Two things worth recording

**The word-row flip needed the colours in the keyframes, not just the
transform.** The first version animated `rotateX` with `animation-fill-mode:
backwards` and staggered each tile's `animation-delay`, which turns the tiles
over in sequence — but the mark classes are applied the moment the guess is
submitted, so all five tiles showed their answer immediately and *then* flipped
to reveal what the player had already read. `backwards` holds the 0% frame
during the delay, so the fix is to carry the unmarked border/background/colour
through to 49% and let go at the halfway point: the mark now lands while the
tile is edge-on, which is the entire point of the animation.

**Two updater functions were doing work that does not belong in an updater.**
`Game2048.push` computed the spawn inside `setBoard(current => …)` and reached
into `setScore` to read the score, and `WordPuzzleGame.submit` called
`setRevealing` inside `setGuesses`. React may invoke an updater twice and
discard the first result, so a random spawn inside one is a real hazard rather
than a style point. `push` now reads `board`/`score` directly and is keyed on
them — the key listener re-binds each move, which costs nothing — and board and
score moved into a single `Snapshot` state, because an undo that restored one
but not the other would hand back free points.

### Fixed on the way past: a toggled toolbar button vanished on hover

Reported once Notes shipped: hovering an active toolbar button made its label
almost invisible.

`.game-actions button.active` paints white text on a dark gradient, but the
generic `.game-actions button:hover:not(:disabled)` sets a near-white
background — and it is the *more* specific of the two, because `:hover` and
`:not(:disabled)` contribute two pseudo-classes against `.active`'s one. So
hover replaced the dark background and kept the white text.

Fixed with `.game-actions button.active:hover:not(:disabled)`, which
out-specifies it and hovers to a slightly lifted gradient instead.

This was pre-existing, not new: **Minesweeper's Flag mode button** has carried
the same `.active` class since 0198 and had the same defect. Notes is simply
the button people hovered.

Checked the other toggled surfaces while here: the game picker's `:hover` only
adjusts border-colour and `.active` is declared after it, and the word
keyboard's mark colours likewise win on source order — neither can produce the
same collision.

### Decisions

- **Undo in 2048 is one step and is spent when used.** Making it a stack turns
  2048 into a different game: the tension is entirely that a bad swipe costs
  you something. One step covers the mis-swipe, not the bad run.
- **Chording is not made safe.** If the player's flags are wrong the chord
  opens a mine, exactly as clicking those squares by hand would have. A chord
  that checked for real mines first would mean the board silently second-
  guessing the player's deductions, which is what makes flags mean anything.
- **Placing a digit strikes it from peer notes automatically.** This is the
  one piece of notes bookkeeping that is pure mechanism — twenty squares to
  update, no judgement involved — and the step people skip and then reason
  from stale candidates. Erasing a digit deliberately does *not* restore
  anything: nothing can be concluded about the peers.
- **Sudoku's key handler now ignores events from inputs, textareas,
  contenteditable, and while the rules modal is open.** The listener is on the
  window and "N" is a plain letter, so this was a live collision with any
  focused field elsewhere on the page rather than a hypothetical one.

## Follow-ups

- Sudoku still generates on the main thread (~670 ms on expert). Unchanged
  from 0198; a Web Worker remains the fix if more difficulties are added.
- Notes are not auto-filled and there is no "clear all notes" action. Both are
  reasonable additions; neither is needed to make the notes usable.
- The components still have no tests, for the same reason as everywhere else
  in this repo. The logic added here is fully covered because it was kept out
  of them.
