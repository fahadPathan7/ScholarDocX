# Feature Specification: Research Expert Workspace (SCHOLARDOCX-0174)

## Overview

ScholarDocX Research Expert is a privacy-first, vector-search augmented research paper analysis workspace designed for academic applicants (Master's, PhD, and research-focused candidates). It allows users to upload PDF research papers, extract text, generate 768-dimension vector embeddings using Gemini `text-embedding-004`, perform pgvector cosine similarity search, and analyze papers using 13 predefined analytical prompts or custom questions.

## Access & Role Limits

- **Role Gate**: `can_use_research_reader` (Pro: 1, Max: 1, Free: 0, General: 0).
- **Upload Quota**: `research_papers_per_month` (Pro: 30, Max: 100, Free/General: 0).
- **Billing Enforcement**:
  - Embedding generation calls Gemini REST API `text-embedding-004:batchEmbedContents` and meters tokens via `ai_tokens.charge(..., source="research_paper_embedding")`.
  - Paper analysis queries pass through `AiService.chat(...)` with vector-retrieved chunk context and system prompt instruction, metering input/output tokens via `AiService.charge_tokens`.
  - Both embedding generation and paper analysis require pre-flight credit checks (`ensure_can_spend`) and fail with HTTP 402 if credits are zero.

## Key Workflows & Features

1. **PDF Upload & Text Extraction**:
   - Accepts PDF files up to 10 MB.
   - Extracts plain text and Author metadata page-by-page using `pdfplumber`.
   - Stores binary PDF in Supabase Storage via `save_upload` (`research_papers` category) and creates a tracking row in `static_files`.

2. **Semantic Chunking & Embedding Generation**:
   - Splits document text into overlapping semantic chunks (~1100 characters per chunk, ~150 characters overlap). Smaller chunks give tighter similarity matches and keep unrelated/garbled math out of a single retrieved section.
   - Every chunk is stamped with the page it starts on (`--- Page N ---`) even when it falls entirely between two page markers, so page-based "View in PDF" jump/highlight always resolves a page.
   - Analysis retrieves a larger top-k (default 10) to compensate for the smaller chunk size.
   - Generates 768-dimension float vectors via Gemini `text-embedding-004` API in batches.
   - Stores chunks and vector embeddings in PostgreSQL `research_paper_chunks` table (`embedding` column type `Vector(768)`).
   - Uses HNSW index with `vector_cosine_ops` for fast nearest-neighbour queries.

3. **Vector Similarity Search**:
   - Generates single 768-dimension query embedding for user prompts.
   - Executes pgvector SQL cosine distance query: `SELECT id, chunk_index, chunk_text, token_count, 1 - (embedding <=> :query_vec) AS similarity FROM research_paper_chunks WHERE paper_id = :pid ORDER BY embedding <=> :query_vec ASC LIMIT :k`.
   - Retrieves top-k (default 5) most relevant chunks with similarity scores.

4. **Predefined & Custom AI Analysis**:
   - **13 Predefined Prompts**, tuned for technically-literate readers (they embrace domain terminology and go for analytical depth rather than beginner hand-holding) and ordered most-analytical-first. Each prompt is engineered for rigorous, structured output; kept in sync between `frontend/src/lib/researchPrompts.ts` and backend `PREDEFINED_PROMPTS`.
     1. *Executive Summary*: Precise, decision-ready synopsis for a technical reader.
     2. *Contributions & Novelty*: Core contributions and what is truly novel vs prior art (novelty vs. increment).
     3. *Methodology Analysis*: In-depth dissection of pipeline, data, model/algorithm, and evaluation.
     4. *Theoretical Foundations & Formulation*: Problem formulation, objectives/losses, assumptions, and guarantees.
     5. *Key Findings & Results*: Quantitative results, deltas over baselines, and whether evidence justifies claims.
     6. *Benchmark & Baseline Comparison*: SOTA positioning, fairness of comparison, and significance of gains.
     7. *Results & Figures Deep-Dive*: Technical interpretation of key figures, tables, and observed trends.
     8. *Critical Peer Review*: Reviewer-grade critique of novelty, soundness, evidence, and an overall verdict.
     9. *Limitations & Threats to Validity*: Failure modes, biases, assumptions, and threats to validity.
     10. *Reproducibility & Implementation Blueprint*: Actionable recipe to re-implement, with missing details flagged.
     11. *Background & Related Work*: Research lineage, the gap targeted, and key references.
     12. *Practical Applications & Deployment*: Real-world use, integration needs, and operational constraints.
     13. *Future Work & Open Problems*: Open problems and concrete next directions.
   - **Custom Q&A**: Allows users to type arbitrary questions about the paper.
   - **Citations**: Displays retrieved paper section chunks with chunk numbers, similarity scores (%), and text snippets.

5. **Paper Management**:
   - Library view listing uploaded papers with status badges (`processing`, `ready`, `error`), chunk count, and upload date.
   - Paper deletion removes paper record, chunk embeddings, and Supabase Storage binary file (`delete_file`).

6. **Source-to-PDF Review**:
   - Each cited paper section includes a Research Expert-owned "View in PDF" action.
   - The action opens the uploaded paper through `/api/research/papers/{paper_id}/pdf` and renders it client-side with **PDF.js** (`ResearchPdfViewer.tsx`, lazy-loaded so the PDF.js bundle only downloads on demand; worker bundled locally, no CDN).
   - The **whole PDF** is rendered so the user can scroll through the entire document. Pages are painted lazily (canvas + transparent PDF.js **text layer**) via an `IntersectionObserver` as they approach the viewport, so large papers stay responsive. Correctly-sized placeholders are laid out for every page up front so scroll offsets are accurate before painting.
   - On open, the cited page(s) are rendered eagerly and the viewer highlights the cited passage **directly on the real PDF text** — like a text selection — by matching the section's meaningful tokens against the text-layer spans and highlighting the contiguous run, then **auto-scrolls to focus that passage** (the user can freely scroll away from there). There is no longer a separate re-rendered copy of the (possibly garbled) chunk text beside the PDF.
   - Includes zoom controls and a legend indicating whether the passage was auto-located. If the exact passage cannot be matched, the correct page is still shown without a highlight.
   - Research Expert PDFs remain separate from the Documents workspace lists and picker flows. They still count toward the shared storage quota, but they are opened, reviewed, retried, and deleted only inside Research Expert.

7. **Output Readability**:
   - PDF text extraction preserves honest spacing rather than gluing single glyphs into fake words, avoiding fabricated garbled tokens from math/equation layouts.
   - Author/metadata parsing runs on a superscript-cleaned copy of the header page(s): isolated small-font glyphs (affiliation superscripts like `a`, `b`, `1`) are dropped before parsing so they aren't glued onto surnames (e.g. `Das` → `Dasa`), while genuine small-font runs (DOI, year) are preserved. The main chunk/embedding text is unaffected.
   - The analysis system instruction directs the model to describe formulas/algorithms in plain English (or simple inline math) and to never copy raw scrambled equations, algorithm listings, or corrupted character sequences verbatim into the answer.

8. **Saved Analyses (max 10 per paper)**:
   - Each generated answer has a **Save output** button. Saved outputs persist in the `research_paper_analyses` table (prompt, answer, sources JSON, model, charged credits, timestamp) so users can revisit an answer later without re-running (and re-paying for) the query.
   - A per-paper cap of **10** is enforced server-side; saving an 11th returns HTTP 400 asking the user to delete one first. The Save button reflects `N/10`, disables when the current output is already saved (dedupe by prompt+answer), and disables at the cap.
   - A **Saved** button in the active-paper header (showing `N/10`) opens a **modal** listing saved outputs (newest first). Each item expands to show the rendered answer plus source chips that open the PDF viewer, and can be deleted; the modal shows an empty state until the first save. Rows are removed automatically via `ON DELETE CASCADE` when the paper (or user) is deleted.
   - Endpoints: `GET/POST /api/research/papers/{paper_id}/analyses`, `DELETE /api/research/papers/{paper_id}/analyses/{analysis_id}`.

9. **Workspace Layout**:
   - The library sidebar is **collapsible** (collapses to a slim rail with an expand control) to give the analysis workspace more room.
   - The 13-card predefined-prompts section is **collapsible** and **auto-collapses when an analysis runs**, and the fresh answer **auto-scrolls into view**, so the output is never buried at the very bottom below the prompt grid.

## Data Boundaries & Security

- **User Isolation**: All paper records and chunk embeddings have foreign keys to `users.id` with `CASCADE` delete rules. Users cannot access or query papers belonging to other users.
- **Privacy**: Paper text extraction is local-first server-side. Text chunks are transmitted to AI providers only during explicit user embedding and analysis requests.
- **Workspace Separation**: `static_files` rows with `file_type='research_paper'` are storage-tracking records for Research Expert, not Documents records. Generic document file lists and category counts exclude them.
