# SCHOLARDOCX-0194: All ten sections listed when three were used; body passages labelled "Reference list"

Status: Completed

Owner: AI Agent

Epic: Epic-ResearchExpert

Created: 2026-07-28

## Summary

The document-wide scan from SCHOLARDOCX-0192 worked — "how many papers were
cited here" now answers "48 distinct cited works, numbered [1] through [48]".
The user then asked why the answer listed ten sections when it cited three.

Reviewing that same screenshot surfaced a second defect they had not asked
about: sections **#9, #22, #23, #53, #54, #75** were all badged
**"Reference list"**. #53 is a precision/recall table. #23 is a comparison
table. #9 is body prose. Only #80, #81 and #91 are actually bibliography.

### 1. Everything retrieved was presented as if it had been used

The sources list rendered all ten retrieved passages under every answer. That
reads as "the answer rests on all of this", when in fact seven were read and
set aside — and it buries the three that carry the claim among seven that do
not.

The model already cites its passages inline as `[Section #N]`, so the
information was there and simply unused. `cited_section_numbers` parses those
tags out of the answer, each source is marked `cited_in_answer`, and the panel
now leads with "Sections used in this answer (3)" and puts the rest behind
"7 more sections were read but not cited in the answer".

Nothing is hidden — the coverage stays auditable, which matters for trusting
the answer — it is just no longer presented as evidence when it is not.

The parser distinguishes `[Section #48]` (a passage we showed the model) from
`[48]` (a work the paper cites), which appear in the same sentence of the
reported answer.

### 2. "Four citation markers" is not a bibliography

`is_reference_chunk` classified any passage with four or more `[n]` markers as
part of the reference list. That was tolerable while the classification was
only used internally to *reserve* passages. SCHOLARDOCX-0192 put it on screen
as a badge, and the looseness became visible: a related-work paragraph cites
four works in two sentences, and a results table comparing prior methods
carries `[35]`, `[36]`, `[37]`, `[38]` down the rows.

Replaced a raw count with three signals a real reference list has and body
content does not:

- **Density.** Entries are short, so markers come every few hundred characters
  (`MAX_CHARS_PER_REFERENCE_ENTRY`). Prose puts far more text between them.
- **Order.** A numbered bibliography ascends. Prose cites in whatever order the
  argument needs and repeats earlier works. One break is tolerated, since a
  chunk boundary can land mid-entry.
- **Entry-initial position.** Every marker in a bibliography *opens* an entry,
  so it follows a line break or a space. The comparison table writes
  `Sanidaetal.[35]` — dense and ascending, but attached to the author name.
  That table was the last thing still misclassified, and this is what separates
  it.

A DOI or URL confirms the classification; without one, the ascending run must
be clean rather than merely mostly clean. An explicit `REFERENCES` /
`BIBLIOGRAPHY` / `WORKS CITED` heading still settles it outright.

`CITATION_MARKER` gained a capture group, since the classifier now reads the
numbers themselves rather than counting matches.

## Technical Context

- `research_paper_retrieval.py`: `ANSWER_CITATION`, `cited_section_numbers`;
  rewritten `is_reference_chunk` with `MAX_CHARS_PER_REFERENCE_ENTRY` and
  `BIBLIOGRAPHIC_MARKERS`; `CITATION_MARKER` now capturing.
- `research_paper_service.py`: `analyze_paper` marks each source
  `cited_in_answer` (and now names the answer once instead of reading it out of
  the response dict twice).
- `api.ts`, `ResearchExpertView.tsx`, `research-expert.css`: cited/also-read
  split, `.sources-also-read`, `.source-citation-card.muted`.

## Scope

In scope: the files above plus the extended
`backend/tests/unit/test_research_paper_retrieval.py`.

Out of scope:
- Making the model cite more consistently. It cites well when it has something
  specific to point at; a general summary legitimately cites nothing, which is
  why the UI falls back to the old flat list when no tags are present.

## Verification Plan

- Direct execution of the classifier against six passage shapes taken from the
  reported screenshot — bibliography with heading, mid-bibliography without
  one, newline-separated entries, related-work prose, the results table
  comparing prior methods, the metrics table, and the dataset paragraph. All
  seven classify correctly; four of them were wrong before this change.
- Direct execution of `cited_section_numbers` on the reported answer text:
  extracts {75, 80, 91}, and does **not** pick up `[1]`/`[48]` from the same
  sentence.
- `npx tsc --noEmit` clean; backend compiles.
- Tests extended, not run: `test_research_paper_retrieval.py`.

## Completion Notes

Changed files: as listed under Technical Context.

Follow-up: the badge on a genuine bibliography passage reads "Reference list"
while the others read "Top match" / "Close match" / "Weak match" — one is a
kind, the others are a degree. It is honest but slightly mixed; worth a single
vocabulary if this area is revisited.
