# SCHOLARDOCX-0198: Brain Games tab (sudoku, tic-tac-toe) with a role-limit permission

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-28

## Summary

A break surface inside the workspace: sudoku (9×9) and tic-tac-toe, gated by a
new `can_use_brain_games` role limit that ships **enabled for every tier**.

Requested as "games", renamed to **Brain Games** mid-build. Nothing had been
written yet, so the permission key matches the feature name rather than
carrying the older one.

The feature is deliberately the cheapest thing in the product: no AI credits,
no external calls, no server state. Everything runs in the browser and puzzle
progress lives in `localStorage`, following Sticky Notes rather than adding
tables for a diversion.

## Permission

`can_use_brain_games` sits in `DEFAULT_ROLE_LIMITS` at `1` for `free_user`,
`general_user`, `pro_user` and `max_user`. `_seed_role_limits` runs on every
boot with `ON CONFLICT DO NOTHING`, so existing installs pick it up without a
migration and an admin's own value is never overwritten.

Two things it does **not** do, on purpose:

- **No plans-page upsell.** Every tier has it, so if it is off an admin turned
  it off. Routing that user to the pricing page would be telling them to buy
  something that would not change anything. The toast and the locked panel both
  say it is an account setting.
- **No optimistic lock.** The paid features assume locked until limits load;
  this assumes *unlocked*, because assuming otherwise flashes a lock on a tab
  no plan actually locks.

Documented in the admin Role Limits tab under its own "Brain Games" group with
the standard description/reset/example tooltip.

## Fixed on the way past: a dead `free_user` block

`DEFAULT_ROLE_LIMITS` defined `'free_user'` **twice**. Python keeps the last
definition, so the first block — 60 lines of limits at the top of the dict —
had no effect, and anyone editing free-tier limits there would have seen
nothing happen. The two were identical except the later one adds
`can_purchase_token_packs` and `can_use_purchased_tokens`, so the dead one was
a strict subset and removing it changes no behaviour. A comment now points at
where free-tier limits actually live.

## Games

**Tic-tac-toe.** Tic-tac-toe is solved — perfect play always draws — so an
always-perfect opponent is a wall, not a game. The three difficulties differ in
how often the engine is *allowed* to play its best move (`OPTIMAL_PLAY_RATE`:
25% / 75% / 100%), not in how well it calculates. Minimax subtracts depth from
a win and adds it to a loss so it prefers to win sooner and lose later —
without that it dawdles on forced wins, since every winning line scores alike.
`chooseMove` takes an injected `random` so the opponent is reproducible in
tests. On "Unbeatable" the UI says outright that a draw is the best available
result, so a player does not read the ceiling as a bug.

**Sudoku.** The entire difficulty of this game is one requirement: **exactly
one solution.** Shuffle-and-delete is the obvious approach and it is wrong —
past roughly 30 removals it starts yielding grids with several valid answers,
so a player can reason correctly to a complete grid and be told they are wrong.
So each removal is verified: the grid is re-solved counting solutions and the
removal is undone the moment a second appears. `countSolutions` stops at 2 —
"more than one" is the whole question, and enumerating the rest is far more
expensive. The solver picks the most constrained cell first, which is the
difference between instant and visibly hanging the tab.

`REMOVAL_TARGET` is a ceiling, not a promise: removal stops early when nothing
further can go, and the result reports what was actually removed. Measured
output: easy 41 clues (19 ms), medium 33 (31 ms), hard 27 (57 ms), expert 24
(671 ms) — expert is why generation yields a frame to paint "Dealing a new
grid…" before it blocks.

The board marks conflicts but never blocks a move; row/column/box and
same-value highlighting follow the selection; arrow keys move, digits fill,
Backspace clears.

## A bug the tests found

`countSolutions` only ever reasoned about **empty** cells, so a contradiction
among the *filled* ones was invisible to it: given two 5s in one row it
explored the whole tree before concluding nothing fit — seconds, not
milliseconds. It never surfaced in the app (every grid it sees derives from a
valid solution) but it is a real latent defect for any future caller. Now
rejects an illegal grid up front, 0 ms.

Worth recording that two *other* apparent failures in the same run were my test
expectations being wrong, not the code: the engine plays a winning move rather
than blocking a threat (correct — the threat never fires), and it rates all
nine openings equally (correct — tic-tac-toe's first move cannot change a
perfect-play result, and this is what gives "Unbeatable" a varied opening).

## Three more games (same session)

Added after the first two: **2048**, **Minesweeper**, and a **daily word
puzzle**. Same shape as before — all rules as pure functions in `lib/games/`,
components hold only rendering and input.

**2048.** All four directions reduce to "slide a row left"; up, down and right
are that function applied to a transposed or reversed board, so there is one
merge implementation to get right rather than four. The rule that catches naive
versions: a tile may merge **once per move** — `[2,2,2,2]` gives `[4,4]`, never
`[8]`. A move that shifts nothing must not spawn a tile, or pressing into a wall
slowly fills the board for free.

**Minesweeper.** Mines are laid *after* the first click, not before. Generating
up front lets a player lose on move one with no information and nothing they
could have done — that is a coin toss, not difficulty. The safe zone covers the
clicked cell *and its neighbours*, so the opening click always lands on a zero
and cascades. The flood fill is iterative: an expert board's first click can
cascade through hundreds of cells and a recursive flood is an avoidable way to
blow the stack. `layMines` caps the mine count at the number of legal cells,
so a bad config fails visibly instead of looping forever.

**Word of the day.** One puzzle a day, chosen deterministically from the local
calendar date — the limit is the point, since a break should end on its own.
The word is picked with a stride coprime to the pool size so consecutive days
are not adjacent entries (`day % length` marches alphabetically, which is
guessable once noticed) and every word is used before any repeats: 260 answers,
over seven months.

Scoring is the interesting part, and it is where most implementations are
wrong. Two passes: take all greens and decrement a tally of the answer's
letters, then hand out ambers only while that tally still has the letter. So
`allot` against `apple` gives `GA...` — the answer holds one `l`, the first
takes it, the second gets nothing.

**Guesses are validated on shape only, not against a dictionary.** A break
puzzle that argues about whether a word counts is worse than one that lets a
bad guess burn a row, and a bundled word list large enough to avoid false
rejections is a real payload for a diversion.

## Games no longer auto-start

Reported after the five were in: choosing a game dropped you straight into it.
Selecting from a list is browsing, not a decision to play — and sudoku's
generator is real work (up to ~670 ms on expert) to fire off just from clicking
along the row.

`BrainGamesView` now holds a `playing` flag. Picking a game shows a start panel
with its name, how to play, and a Start button; the component does not mount
until Start is pressed, so nothing generates, no timer runs and no keyboard
listener binds. Switching games returns to that panel.

Two details:

- **Re-clicking the game you are already playing does nothing.** Treating it as
  a switch would throw away the board you are in the middle of.
- **The controls text moved to the start screen.** It was a footnote under the
  board, i.e. read after you needed it. Each game now carries a `howTo` line
  shown before it starts.

Gating lives entirely in the parent, so none of the five game components
changed.

### My test expectations were wrong three times; the code was right each time

Worth recording, because it is the argument for testing this kind of logic
rather than eyeballing it:

- Tic-tac-toe "blocks the loss" — the engine played a *winning* move instead.
  Correct: the opponent's threat never gets to fire.
- Tic-tac-toe "opening should be a corner or centre" — it rates all nine
  openings equally. Correct: with perfect play the first move cannot change the
  result, and that is what gives Unbeatable a varied opening.
- Word puzzle `geese`/`those` — I predicted `....G` and forgot the `s` also
  aligns, and `sassy`/`basic`, where I expected an amber `s` that cannot exist
  because the answer's only `s` is already green.

Duplicate-letter scoring is subtle enough that I mis-predicted it twice by
hand. The tests now pin the four cases explicitly.

## Technical Context

- `services/admin.py`: `can_use_brain_games` in all four user tiers; dead
  duplicate `free_user` block removed.
- `lib/games/{ticTacToe,sudoku,game2048,minesweeper,wordPuzzle}.ts` (**new**):
  all rules, search and generation as pure functions, so the logic is testable
  in a project whose test setup has no renderer.
- `components/games/{BrainGamesView,SudokuGame,TicTacToeGame,Game2048,
  MinesweeperGame,WordPuzzleGame}.tsx`, `brain-games.css` (**new**). The picker
  is data-driven, so a sixth game is one entry in `GAMES`.
- `App.tsx`: `Brain Games` nav item, `canUseBrainGames`, locked handling, tab
  container, and `games` added to the no-plan redirect list.
- `admin/RoleLimitsTab.tsx`: feature group and tooltip.

## Scope

In scope: the files above plus five test files under `lib/games/__tests__/`.

Out of scope:
- A dictionary for the word puzzle — see the reasoning above.
- Persisted stats across sessions. Tic-tac-toe, 2048 and Minesweeper scores are
  per-visit; only the sudoku grid and today's word guesses survive a reload.
- Server-side enforcement. There are no game endpoints, so the role limit is
  enforced in the client. That is the whole enforcement surface — nothing is
  gated behind it that a determined user could otherwise reach, because there
  is nothing on the server to reach.

## Verification Plan

- Direct execution of both modules via `node --experimental-strip-types`
  (`vitest` cannot run in this environment — `node_modules` holds the macOS
  rollup binary):
  - Tic-tac-toe, 8 checks: winning line reporting, win-over-block preference,
    blocking when nothing better, all openings equal, null on a full board,
    easy steered on and off its best move by an injected `random`, and
    **30 of 30 perfect games drawn** — the property that proves the search is
    actually solving the game.
  - Sudoku, 18 checks: peer count, illegal grid rejected in 0 ms, counting
    capped at the limit, conflict marking, `canPlace` across row/column/box,
    and for all four difficulties a genuinely unique solution with blanks
    matching the reported removal count.
  - 2048, 20 checks: merge cap, leading-pair preference, all four directions,
    the `moved` flag, spawn odds, locked-board detection, no mutation of input.
  - Minesweeper, 27 checks: exact mine counts and a safe, zero-adjacency first
    click at all three sizes, adjacency correctness across the whole board,
    flood behaviour, flag rules, win/loss detection, and the over-ask cap.
  - Word puzzle, 25 checks: the four duplicate-letter cases, daily determinism,
    non-alphabetical stride, full-cycle coverage, pre-epoch safety, local
    midnight rollover, keyboard never downgrading a mark.
- `npx tsc --noEmit` clean.
- Tests added, not run: five files under `lib/games/__tests__/`.

## Completion Notes

Changed files: as listed under Technical Context.

Follow-ups:
- Expert generation is ~670 ms on this machine and blocks the main thread. It
  paints a building state first, so it reads as deliberate, but a Web Worker
  would keep the tab fully responsive if more difficulties are added.
- The rendered components have no tests, for the same reason as everywhere else
  in this repo: no DOM testing library. The game *logic* is fully covered
  because it was deliberately kept out of the components.
