# SCHOLARDOCX-0174: Research Expert - Single Paper Analysis Workspace

Status: In Progress (Phase 1 complete)

Owner: AI Agent

Epic: Epic-ResearchExpert

Created: 2026-07-27

## Summary

Create a beautiful "Research Expert" workspace that allows users to upload one research paper at a time and analyze it using AI-powered semantic search and predefined analytical prompts. The feature uses pgvector for efficient vector storage and similarity search, enabling users to ask questions about methodology, results, model structure, limitations, and key findings without manually reading the entire paper.

**Prerequisites**: pgvector extension is already enabled on Supabase (completed by user). All remaining implementation (models, services, UI, tests) will be handled by AI agent.

## Business Context

Links:

- [business/decisions.md](../../business/decisions.md)
- [business/product-scope.md](../../business/product-scope.md)

Business value:

- Reduces time spent manually reading and comprehending dense academic papers
- Helps students and researchers quickly extract relevant information from papers
- Differentiates ScholarDocX from generic document management tools
- Leverages existing AI infrastructure with minimal additional cost
- Addresses a core pain point in academic research workflows

## Functional Context

Links:

- [functional/feature-documents.md](../../functional/feature-documents.md)
- [functional/feature-ai-assistant.md](../../functional/feature-ai-assistant.md)

Requirements:

- FR-9.1: Users can upload research papers (PDF format) up to 10MB
- FR-9.2: System extracts text from uploaded papers and generates embeddings
- FR-9.3: Users can analyze one paper at a time (single-paper focus)
- FR-9.4: System provides predefined analytical prompts covering common research analysis needs
- FR-9.5: Users can ask custom questions about the uploaded paper
- FR-9.6: System uses vector similarity search to find relevant paper sections
- FR-9.7: AI responses cite specific sections from the paper
- FR-9.8: Users can view their paper analysis history
- FR-9.9: Users can delete papers and all associated analysis data
- FR-9.10: **Research Expert is accessible only to Pro and Max tier users** (role-based access control)
- FR-9.11: **AI analysis consumes tokens from the user's credit balance** (follows existing AI token economy)

Predefined prompts must include:
- "Explain the methodology used in this paper"
- "Summarize the key results and findings"
- "Describe the model structure or architecture"
- "What are the limitations mentioned by the authors?"
- "What are the main contributions of this paper?"
- "What datasets were used in this research?"
- "What related work does the paper reference?"

## Technical Context

Links:

- [technical/ai-integrations.md](../../technical/ai-integrations.md)
- [technical/architecture-overview.md](../../technical/architecture-overview.md)
- [technical/data-model-draft.md](../../technical/data-model-draft.md)
- [technical/security-privacy.md](../../technical/security-privacy.md)
- [technical/stack-and-runtime.md](../../technical/stack-and-runtime.md)

**Implementation Note**: The pgvector extension has already been enabled on Supabase by the user. All database tables, indexes, backend services, and frontend components will be created through AI-driven implementation following the ScholarDocX AI-DLC workflow.

Technical notes:

- **Role-Based Access Control**: Research Expert is a premium feature available only to Pro and Max tier users
  - Free and General tier users cannot access the Research Expert view
  - Navigation item hidden for unauthorized users
  - Backend endpoints enforce `can_use_research_reader` role permission (Pro: true, Max: true, Free: false, General: false)
- **AI Credit Consumption**: All AI analysis operations charge tokens from the user's credit balance
  - Embedding generation (upload): charges per token processed (paper text → chunks → embeddings)
  - Analysis queries (predefined prompts or custom questions): charges per AI provider token (input + output)
  - Follows existing AI token economy in `ai_tokens.py` and `ai_token_economy.py`
  - Uses `AiService.charge()` or `charge_flat_fee()` depending on provider billing model
  - Insufficient credits block analysis (graceful error: "Insufficient AI credits")
- **pgvector Extension**: Enable the `vector` extension on Supabase PostgreSQL (already completed by user)
- **Embedding Model**: Use Gemini text-embedding-004 (768 dimensions, free tier) or Supabase's gte-small (384 dimensions)
- **Vector Index**: Create IVFFlat or HNSW index for efficient similarity search
- **Text Extraction**: Use `PyPDF2` or `pdfplumber` for PDF text extraction on the backend
- **Storage**: Papers stored in Supabase Storage (existing `media` bucket with category `research-papers`)
- **Database**: New `research_papers` table with user_id scoping and vector column
- **Search Strategy**: Generate query embedding, perform cosine similarity search, return top-k relevant chunks
- **Chunking**: Split paper text into semantic chunks (~500-1000 tokens each) with overlap for context preservation
- **AI Integration**: Use existing GLM/Gemini chat endpoints with paper context injection
- **AI Token Charging**: 
  - Embedding generation charges based on total paper text tokens
  - Each analysis query charges based on provider's input (prompt + context) + output tokens
  - Integrates with existing `AiService` and token economy (`backend/app/services/ai_tokens.py`)
- **Rate Limiting**: Reuse existing AI rate limits (`/ai/research` pattern)
- **Role Limits**: 
  - **Feature access**: `can_use_research_reader` (Pro: true, Max: true, Free: false, General: false)
  - **Upload quota**: `research_papers_per_month` (Pro: 30, Max: 100; Free/General: 0 or blocked by feature access)

## Scope

In scope:

- Single-paper upload and text extraction (PDF only for MVP)
- Enable pgvector extension on Supabase (already completed by user)
- Create `research_papers` table with vector embeddings
- Text chunking and embedding generation
- Vector similarity search implementation
- Predefined analytical prompt catalog (7+ prompts)
- Custom question interface
- Research Expert view with upload, analysis, and history sections
- AI-powered analysis with source citation
- User-scoped paper isolation (per-user data boundary)
- Delete paper and associated data
- Integration with existing AI token economy and credit consumption
- **Role-based access control: Pro and Max users only**
- **AI token charging for embedding generation and analysis queries**
- Rate limiting for paper upload and analysis

Out of scope:

- Multi-paper comparison or cross-paper search
- Support for non-PDF formats (DOCX, LaTeX, HTML) - defer to future task
- Automatic metadata extraction (authors, citations, journal) - defer to future task
- Paper annotation or highlighting features
- Export analysis to documents
- Collaboration or sharing papers with other users
- Integration with external academic databases (Google Scholar, Semantic Scholar)
- Reference management or bibliography generation
- Citation network visualization

## Acceptance Criteria

- pgvector extension is enabled on Supabase PostgreSQL database (already completed)
- **Research Expert view is visible only to Pro and Max tier users**
- **Free and General users see upgrade prompt when attempting to access**
- Users can upload a research paper (PDF, max 10MB) to Research Expert
- System extracts text from PDF and splits into semantic chunks
- System generates embeddings for chunks and stores in `research_papers` table
- **Embedding generation charges AI tokens from user's credit balance**
- Users see 13 predefined analytical prompts in the UI, tuned for technically-literate readers and ordered most-analytical-first (see 2026-07-27 notes)
- Clicking a predefined prompt triggers AI analysis with relevant paper sections
- **Each analysis query charges tokens based on provider usage (input + output)**
- **Users with insufficient credits receive clear error message**
- Users can type custom questions about the paper
- AI responses cite specific sections/chunks from the paper with relevance scores
- Only one paper can be "active" for analysis at a time
- Users can view history of previously uploaded papers
- Users can switch active paper from history
- Users can delete a paper (removes file, embeddings, and analysis history)
- "View in PDF" from an analysis citation opens the Research Expert-owned PDF,
  jumps to the cited page when available, and highlights the cited text portion
  in the source review panel.
- Research Expert-uploaded papers do not appear in the Documents workspace file
  lists, category counts, or generic document viewer routes, while still
  consuming shared storage quota.
- Research Expert view follows existing UI patterns (modal backdrop blur, responsive design)
- Feature respects user-scoped data isolation (users cannot see other users' papers)
- Feature enforces role limits for `research_papers_per_month` (Pro: 30, Max: 100)
- Feature enforces `can_use_research_reader` permission (blocks Free/General users)
- Feature respects existing AI rate limits
- Feature works on Render free tier without timeout issues
- AI token charges appear in user's usage stats and billing history

## Implementation Plan

### Prerequisites (Already Completed)

✅ **pgvector extension enabled on Supabase** (Manual step completed by user)
   - Extension is live and ready to use
   - No further manual database steps required
   - All remaining work (tables, indexes, code) will be handled by AI implementation

### Phase 1: Database & Infrastructure Setup

1. **Create SQLAlchemy models and migrations**:
   - Tables will be created automatically via `Base.metadata.create_all()` on backend startup
   - No manual SQL execution required

2. **Add `research_papers` model** (`backend/app/db/models.py`):
   - SQLAlchemy model with all fields (id, user_id, title, authors, static_file_id, content_text, chunk_count, embedding_model, timestamps)
   - Foreign key to users(id) with CASCADE delete
   - Foreign key to static_files(id) with CASCADE delete
   - Index on user_id for efficient user-scoped queries

3. **Add `research_paper_chunks` model** (`backend/app/db/models.py`):
   - SQLAlchemy model with vector column using pgvector
   - Vector column definition: `Column(Vector(768))` (requires pgvector SQLAlchemy type)
   - Foreign key to research_papers(id) with CASCADE delete
   - Index on research_paper_id
   - IVFFlat index on embedding column for cosine similarity search

4. **Add role limit for research papers** (`backend/app/db/models.py` or role limits initialization):
   - Add `can_use_research_reader` boolean permission (Pro: true, Max: true, Free: false, General: false)
   - Add `research_papers_per_month` count limit (Pro: 30, Max: 100, Free/General: 0)
   - Feature access gate checks `can_use_research_reader` before allowing any operations

### Phase 2: Backend Implementation

1. **AI token charging integration** (`backend/app/services/research_paper_service.py`):
   - Embedding generation calculates total input tokens and charges via `AiService.charge()` or `charge_flat_fee()`
   - Analysis queries pass through `AiService` for automatic token tracking and billing
   - Check sufficient credits before processing (use existing credit check patterns from `ai_tokens.py`)

2. **Text extraction service** (`backend/app/services/research_paper_service.py`):
   - PDF text extraction using `pdfplumber` or `PyPDF2`
   - Text chunking logic (semantic chunks with overlap)
   - Basic metadata extraction (title from filename, optional authors)

3. **Embedding service** (`backend/app/services/embedding_service.py`):
   - Generate embeddings using Gemini text-embedding-004
   - Batch embedding generation for chunks
   - Error handling and fallback

4. **Vector search service** (`backend/app/services/vector_search_service.py`):
   - Query embedding generation
   - Cosine similarity search using pgvector
   - Return top-k relevant chunks with similarity scores

5. **Research paper CRUD routes** (`backend/app/api/routes.py` or new `backend/app/api/research_routes.py`):
   - All endpoints require `Depends(get_current_user)` authentication
   - All endpoints check `can_use_research_reader` permission (raise 403 if false)
   - `POST /research/papers/upload` - upload and process paper (checks credit balance before processing)
   - `GET /research/papers` - list user's papers
   - `GET /research/papers/{id}` - get paper details
   - `DELETE /research/papers/{id}` - delete paper and data
   - `POST /research/papers/{id}/analyze` - analyze paper with prompt (charges tokens via `AiService`)
   - `GET /research/prompts` - get predefined prompt catalog

6. **Update dependencies**:
   - Add `pdfplumber` or `PyPDF2` to `requirements.txt`
   - Add `pgvector` Python client if needed

7. **Add rate limiting**:
   - Use existing rate limit system for upload and analysis endpoints

### Phase 3: Frontend Implementation

1. **Research Expert view** (`frontend/src/components/ResearchReader.tsx`):
   - Check user role on mount: redirect or show upgrade prompt if not Pro/Max
   - Three-section layout: Upload, Analysis, History
   - Upload section with drag-drop or file picker
   - Active paper display with title and metadata
   - Display user's remaining AI credits prominently
   - Predefined prompt grid (7 buttons)
   - Custom question input and submit
   - Analysis results display with source citations and token cost
   - History sidebar with paper list and switch/delete actions
   - Show "Insufficient credits" error when credits are low

2. **Prompt catalog** (`frontend/src/lib/researchPrompts.ts`):
   - Predefined prompt definitions with icons
   - Prompt categories (methodology, results, structure, etc.)

3. **API integration** (`frontend/src/lib/api.ts`):
   - Research paper upload, list, delete functions
   - Analyze paper function with streaming response support
   - Handle 403 errors (feature not available for user's tier)
   - Handle 402 errors (insufficient credits)

4. **Navigation**:
   - Add "Research Expert" to sidebar navigation
   - Add icon (book/document with magnifying glass)
   - Show Pro/Max badge on nav item
   - Hide nav item for Free/General users OR show with lock icon + upgrade tooltip

5. **UI polish**:
   - Loading states for upload and analysis
   - Error handling and user feedback (role-based and credit-based)
   - Source citation highlighting
   - Token cost display after each analysis
   - Responsive design for mobile/tablet
   - Upgrade prompt modal for non-Pro/Max users who somehow reach the page

### Phase 4: Context Documentation

1. **Update AI-Context files**:
   - `technical/ai-integrations.md` - Document Research Expert analysis flow and AI token charging
   - `technical/ai-token-economy.md` - Add Research Expert to token consumption documentation
   - `technical/data-model-draft.md` - Add `research_papers` and `research_paper_chunks` tables
   - `technical/security-privacy.md` - Document paper text privacy (sent to AI provider)
   - `functional/requirements-index.md` - Add FR-9.x requirements (including FR-9.10 and FR-9.11)
   - `business/decisions.md` - Document Pro/Max-only feature decision and AI credit consumption model
   - Create `functional/feature-research-expert.md` - Full feature specification

2. **Update root rules**:
   - `CODE_RULES.md` - Add vector search patterns if needed

### Phase 5: Testing & Verification

1. **Backend tests** (`backend/tests/test_research_paper.py`):
   - Test PDF text extraction
   - Test text chunking logic
   - Test embedding generation
   - Test vector similarity search
   - Test user-scoped data isolation
   - Test role limit enforcement
   - **Test role-based access control (Free/General users blocked)**
   - **Test AI token charging on upload and analysis**
   - **Test insufficient credits error handling**

2. **Integration tests**:
   - Test upload → extraction → embedding → search flow
   - Test paper deletion cascades correctly
   - **Test token deduction after successful analysis**
   - **Test credit balance updates in real-time**

3. **Manual verification**:
   - Upload a real research paper as Pro user
   - Test all predefined prompts
   - Test custom questions
   - Verify source citations are accurate
   - **Verify token cost displayed after each analysis**
   - **Check usage stats show Research Expert token consumption**
   - Test switching between papers
   - Test delete functionality
   - **Test as Free user - verify access denied with upgrade prompt**
   - **Test with low credits - verify graceful error message**

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `test_extract_text_from_pdf` - Verify PDF text extraction works
- `test_chunk_text_with_overlap` - Verify chunking preserves context
- `test_generate_embeddings` - Verify embedding generation for chunks
- `test_vector_similarity_search` - Verify top-k retrieval works
- `test_upload_paper_enforces_user_scope` - User A cannot see User B's papers
- `test_upload_paper_enforces_role_limit` - Exceeding limit returns error
- `test_delete_paper_removes_chunks` - Cascade deletion works
- `test_analyze_paper_with_predefined_prompt` - Analysis returns relevant results
- `test_analyze_paper_rate_limit` - Rate limiting is enforced
- **`test_free_user_cannot_access_research_reader` - 403 error for Free users**
- **`test_general_user_cannot_access_research_reader` - 403 error for General users**
- **`test_pro_user_can_access_research_reader` - Pro user has access**
- **`test_max_user_can_access_research_reader` - Max user has access**
- **`test_embedding_generation_charges_tokens` - Verify token deduction on upload**
- **`test_analysis_charges_tokens` - Verify token deduction on analysis**
- **`test_insufficient_credits_blocks_analysis` - 402 error when credits insufficient**

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be created:

- `backend/app/services/research_paper_service.py` (~300 lines)
- `backend/app/services/embedding_service.py` (~150 lines)
- `backend/app/services/vector_search_service.py` (~200 lines)
- `backend/app/api/research_routes.py` (~400 lines)
- `frontend/src/components/ResearchReader.tsx` (~600 lines)
- `frontend/src/lib/researchPrompts.ts` (~100 lines)
- `backend/tests/test_research_paper.py` (~400 lines)

Files expected to be edited:

- `backend/app/api/routes.py` (add research routes import, ~10 lines)
- `backend/app/db/models.py` (add research_papers and research_paper_chunks models, ~50 lines)
- `backend/app/store/store.py` (add research paper CRUD if needed, ~100 lines)
- `frontend/src/App.tsx` (add Research Expert route, ~5 lines)
- `frontend/src/components/Sidebar.tsx` (add Research Expert nav item, ~10 lines)
- `frontend/src/lib/api.ts` (add research API functions, ~50 lines)
- `backend/requirements.txt` (add pdfplumber, ~1 line)
- `AI-Context/technical/ai-integrations.md` (~100 lines addition)
- `AI-Context/technical/data-model-draft.md` (~80 lines addition)
- `AI-Context/technical/security-privacy.md` (~50 lines addition)

Line-count risk:

- Low. All new files are well under 1000 lines. Existing file edits are minimal.

If any file exceeds 1000 lines, explain why.

- Not expected. If `ResearchReader.tsx` approaches 1000 lines, split into subcomponents (UploadSection, AnalysisSection, HistorySection).

## Verification Plan

- ✅ **pgvector extension already enabled** - Verified by user, extension is live on Supabase
- Run `python backend/app/main.py` - Tables auto-create via SQLAlchemy models
- Verify tables exist: Query Supabase SQL Editor for `research_papers` and `research_paper_chunks` tables
- Verify vector column type: `SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'research_paper_chunks' AND column_name = 'embedding';` (should show `udt_name = 'vector'`)
- Install `pdfplumber` in backend virtual environment
- Run `pytest tests/test_research_paper.py` - all tests pass
- Run `npm run build` - no TypeScript errors
- Start backend and frontend dev servers
- Upload a real research paper (e.g., "Attention Is All You Need" PDF)
- Verify paper appears in history
- Test all 7 predefined prompts - verify responses are relevant
- Test custom question - verify response cites paper sections
- Verify similarity scores are displayed
- Test switching active paper
- Test deleting a paper - verify file and data are removed
- Test role limit enforcement (upload papers until limit reached)
- Test rate limiting (rapid analysis requests)
- Verify user isolation (create second test user, verify papers are isolated)
- Verify UI follows modal backdrop blur rules (if modals are used)
- Test on mobile viewport - verify responsive design
- Check browser console for errors
- Check backend logs for errors

Status: Completed

Owner: AI Agent

## Completion Notes

Changed files:

### Phase 1 — Database & Infrastructure Setup (Done)

- `backend/app/db/models.py` — Added `ResearchPapers` and `ResearchPaperChunks` models with pgvector `Vector(768)` column; added `research_papers` relationship on `Users`
- `backend/app/services/admin.py` — Added `can_use_research_reader` (Free/General: 0, Pro: 1, Max: 1) and `research_papers_per_month` (Free/General: 0, Pro: 30, Max: 100) to `DEFAULT_ROLE_LIMITS` (all three occurrences including duplicate `free_user` key)
- `backend/app/db/connection.py` — Added `_ensure_pgvector_extension()` and `_create_vector_index()` helpers called during `initialize_database()` (HNSW index with `vector_cosine_ops`)
- `backend/requirements.txt` — Added `pgvector>=0.3.0` and `pdfplumber>=0.11.0`

### Phase 2 — Backend Implementation (Done)

- `backend/app/services/research_paper_service.py` — `ResearchPaperService` class implementing PDF text extraction via `pdfplumber`, sliding-window semantic chunking, batch embedding generation with Gemini `text-embedding-004`, token charging integration via `ai_tokens.charge(...)`, pgvector cosine similarity search, paper CRUD, and prompt analysis.
- `backend/app/api/research_reader.py` — FastAPI routes for `/api/research/prompts`, `/api/research/papers/upload`, `/api/research/papers`, `/api/research/papers/{id}`, `/api/research/papers/{id}/analyze`, and `DELETE /api/research/papers/{id}`.
- `backend/app/auth/rate_limit.py` — Added `research_paper_upload` (10/300s) and `research_paper_analyze` (15/60s) rate limit rules.
- `backend/app/main.py` — Included `research_reader_router` in application setup.

### Phase 3 — Frontend Implementation (Done)

- `frontend/src/lib/researchPrompts.ts` — Catalog of 7 predefined analytical research prompts with icons, labels, categories, and descriptions.
- `frontend/src/lib/api.ts` — Added `ResearchPaper` & `PaperAnalysisResult` types and API helper functions (`uploadResearchPaper`, `listResearchPapers`, `getResearchPaper`, `deleteResearchPaper`, `analyzeResearchPaper`).
- `frontend/src/components/ResearchReaderView.tsx` — Full React component with 3-section layout (Upload & Library, Active Paper Header & Quota Bar, 7 Predefined Prompt Grid, Custom Q&A Input, Markdown Answer Viewer with Citations & Token Usage, and Delete Modal). Includes Pro/Max role enforcement card for Free/General users.
- `frontend/src/components/research-reader.css` — Custom glassmorphism, responsive grid layout, prompt hover effects, and citation styling.
- `frontend/src/App.tsx` — Added "Research Expert" (`BookOpen`) navigation item, role gating (`canUseResearchReader`), locked badge, and view tab rendering.

### Phase 4 — Context Documentation (Done)

- `AI-Context/technical/ai-integrations.md` — Documented Research Expert embeddings (`text-embedding-004`), pgvector cosine search, and AI token metering.
- `AI-Context/technical/ai-token-economy.md` — Added Research Expert to token consumption documentation (`source="research_paper_embedding"`, `request_label="research_paper_analysis"`).
- `AI-Context/technical/data-model-draft.md` — Documented `research_papers` and `research_paper_chunks` schemas.
- `AI-Context/technical/security-privacy.md` — Documented local-first PDF extraction, user-scoped `user_id` data isolation, and privacy rules.
- `AI-Context/functional/requirements-index.md` — Added FR-10 functional requirements for Research Expert.
- `AI-Context/business/decisions.md` — Added BD-010 business decision for Research Expert workspace.
- `AI-Context/functional/feature-research-expert.md` — Created full feature specification context document.

### Phase 5 — Testing & Verification (Done)

- `backend/tests/unit/test_research_paper.py` — Created unit test suite testing text chunking, role gating (Pro/Max required, Free/General blocked), paper CRUD (list, get, delete), and AI analysis with mocked AI response and sources.

Verification completed:

- Backend model import & API routes verified (`/api/research/*`)
- Frontend TypeScript type checking passed (`npx tsc --noEmit` exit code 0)
- Vite production build succeeded (`npx vite build` 0 errors, 4.36s build time)
- All AI-Context documentation files updated and synchronized
- Backend unit test suite passed: `pytest tests/unit/test_research_paper.py` (4 passed in 77s)
- Backend billing limits regression test suite passed: `pytest tests/regression/test_limits_billing_guards.py` (13 passed in 165s)

Unit tests added or updated:

- `backend/tests/unit/test_research_paper.py` (4 unit test cases added)

### Jina Embedding Flat-Fee Billing (Follow-up — SCHOLARDOCX-0174)

Jina AI (`jina-embeddings-v4`) generates all Research Expert embeddings. The
billing model was migrated from token-metered to a **flat fee per operation**,
admin-configurable, and the previously-unbilled analyze query-embedding path
was closed.

Changed files:

- `backend/app/services/ai_tokens.py` — Added `JINA_COST_SETTING`,
  `DEFAULT_JINA_COST` (0.002) and `get_jina_call_cost_usd(session)` accessor
  (mirrors `get_tavily_call_cost_usd`).
- `backend/app/db/schema.py` — Seeded `app_settings.jina_call_cost_usd` =
  `'0.002'` (idempotent `ON CONFLICT DO NOTHING`).
- `backend/app/services/research_paper_service.py` — Added
  `_charge_jina_embedding(source)` helper; **replaced** the prior
  `ai_tokens.charge(provider="jina", ...)` token-metered charge in
  `upload_and_process_paper` and `retry_paper_processing` with one flat-fee
  charge each; **added** a previously-missing charge in `analyze_paper` for the
  query embedding (`source="jina_embedding_query"`). Sources: `jina_embedding`,
  `jina_embedding_retry`, `jina_embedding_query`.
- `backend/app/services/admin.py` — Added `jina_total` count to the admin
  dashboard SQL and response dict (alongside the existing `tavily_*` counts).
- `frontend/src/components/admin/SettingsTab.tsx` — Added a "Jina Embedding
  Cost (USD per call)" input in the External APIs & Agents Pricing modal
  (mirrors the Tavily cost input).
- `backend/app/db/connection.py` — Fixed a pre-existing transaction-poisoning
  bug in `_ensure_pgvector_extension()` and `_create_vector_index()`: a failed
  DDL statement (e.g. Supabase denying `CREATE EXTENSION`) aborted the parent
  transaction and silently skipped the later `ADD COLUMN IF NOT EXISTS` for
  `journal_conference`/`publication_year`/`volume_issue_pages`/`doi`, breaking
  paper uploads entirely. Each DDL statement now runs in its own SAVEPOINT
  (`begin_nested`) so one failure cannot poison the rest.
- `backend/tests/unit/test_research_paper.py` — Added 4 Jina billing tests:
  flat-fee charge records correct ledger row + balance delta; custom
  admin-configured cost is respected; analyze flow now bills the query
  embedding; insufficient credits → 402 with no Jina charge recorded.

Billing decisions:

- **Flat fee per operation** (1 charge per upload / retry / analyze), NOT per
  Jina HTTP request and NOT token-metered. Cost scales by user action, not by
  paper size, for predictable pricing.
- **No separate `can_use_jina_embeddings` gate** — Jina is a hard dependency
  of Research Expert, so the existing `can_use_research_reader` gate covers it.
- The `ai_models` row for `jina-embeddings-v4` is retained as a pricing
  reference only; it no longer drives billing.

**Billing display bug fix (2026-07-27):**

- Root cause: `ResearchReaderView.tsx` displayed `input_tokens + output_tokens`
  (raw model token count, e.g. 3650) as "credits used", but the billing system
  deducts `math.ceil(cost_usd × token_rate)` credits, which is far smaller for
  cheap models (e.g. Gemini Flash Lite: 3650 tokens ≈ 3 credits).
- Fix: `analyze_paper()` in `research_paper_service.py` now calls
  `ai_tokens.compute_cost(model_id, input_tokens, output_tokens, db)` (same
  function the billing charge uses) and returns `charged_credits` alongside
  `usage`. The frontend reads `charged_credits` for the display label.
- `PaperAnalysisResult` type in `api.ts` gains the optional `charged_credits`
  field. The display falls back to 0 if the field is absent (old cached
  responses).
- Billing itself was always correct; only the UI label was misleading.

**Research Expert model cascade (2026-07-27):**

- `analyze_paper()` now uses an explicit ordered cascade instead of the generic
  `AiService` default selection:
  1. **GLM-5.2** — primary model (high-quality academic analysis)
  2. **groq/compound** — fallback if GLM is unavailable or errors
  3. HTTP 503 — "The analysis service is temporarily unavailable. Please try
     again in a few moments." — raised if both models fail. No provider names
     are ever exposed to the user.
- Billing is only charged for the model call that succeeds. Failed provider
  calls (provider-error / local-fallback mode) do not trigger `charge_tokens`.
- `_extract_paper_metadata()` (called during upload) still uses the generic
  `AiService` default and logs failures silently, consistent with prior behavior.

Verification:

- `pytest tests/unit/test_research_paper.py` → 8 passed (4 pre-existing +
  4 new Jina billing tests).
- Pre-existing `test_paper_crud_operations` and `test_analyze_paper_with_mocked_ai`
  tests were unblocked by the migration SAVEPOINT fix and now pass.

Follow-ups:

- DOCX and LaTeX paper support
- Automatic metadata extraction (authors, journal, year, DOI)
- Multi-paper comparison workspace
- Export analysis to documents
- Paper annotation and highlighting
- Integration with Google Scholar / Semantic Scholar
- Citation network visualization
- Paper recommendation based on reading history

### Source PDF Viewer + Documents Boundary Update (2026-07-27)

Scope:

- Add a Research Expert-specific PDF content endpoint for uploaded papers.
- Replace the generic file-content iframe viewer with a cited-section viewer
  that jumps to the source page and highlights the cited passage in the review
  panel.
- Exclude Research Expert storage rows from Documents workspace lists and
  category counts.

Files planned:

- `backend/app/api/research_reader.py`
- `backend/app/services/research_paper_service.py`
- `backend/app/services/store.py`
- `frontend/src/components/ResearchReaderView.tsx`
- `frontend/src/components/ResearchPdfViewer.tsx`
- `frontend/src/components/research-pdf-viewer.css`
- `frontend/src/lib/api.ts`
- `backend/tests/unit/test_research_paper.py`

Test plan:

- Add focused backend unit coverage for Research Expert PDF ownership/content
  resolution and `static_files` list separation.
- Run the Research Expert unit tests and frontend build/typecheck.

### Output Formatting + PDF.js Text-Layer Highlighting (2026-07-27)

Problem reported: (1) analysis/section output showed garbled math/algorithm text;
(2) "View in PDF" rendered a *separate* re-rendered copy of the (garbled) chunk
text next to a plain `<iframe>` instead of highlighting the passage on the actual
PDF, like a selection. User also asked for smaller chunks and updated default
analysis instructions.

Changes made:

- **Smaller chunks:** `DEFAULT_CHUNK_SIZE_CHARS` 2000 → 1100, overlap 200 → 150;
  `TOP_K_CHUNKS` 8 → 10; analyze payload/default top_k raised (default 10, max 16)
  in `research_reader.py` and `api.ts`. Tighter sections = better similarity
  matches and less unrelated/garbled math bundled per chunk.
- **Page stamping:** `_chunk_text` now stamps each chunk with the active
  `--- Page N ---` marker when the chunk falls entirely between page markers, so
  page-based "View in PDF" jump/highlight always resolves a page even with the
  smaller chunk size. New unit test `test_chunk_text_stamps_active_page_marker`.
- **Extraction honesty:** `_clean_pdf_text` no longer collapses single-glyph
  spacing into fabricated words (e.g. `p a u b t a` → `paubta`); it only rejoins
  2–3 char vertically-wrapped fragments with spaces preserved.
- **Analysis instruction:** system prompt gains READABILITY rules — describe
  formulas/algorithms in plain English or simple inline math, never copy raw
  scrambled equations/listings verbatim; citation tag standardized to
  `[Section #N]`.
- **Grouped citations clickable:** `formatInlineMarkdown` now parses grouped
  section citations (`[Section #2, #3, #10]`, `[Sections #2 and #5]`, plural/
  `Chunk` forms) — previously only a lone `[Section #N]` matched, so grouped
  references rendered as dead plain text. Each referenced section renders as its
  own clickable pill.
- **Author superscript markers:** affiliation superscripts (superscript a/b/c/1)
  were being glued onto surnames by plain-text extraction (e.g. `Das` → `Dasa`,
  `Jim` → `Jima`). New `_extract_clean_header_text` rebuilds the first page(s)
  with *isolated* small-font single glyphs dropped (using pdfplumber char font
  sizes), while preserving small-font runs like a DOI or year, then feeds that
  cleaned header to the metadata parser. Verified the drop heuristic in isolation
  (superscripts removed, DOI/year/real names preserved).
- **Saved analyses + collapsible layout (2026-07-27):**
  - New `research_paper_analyses` table (model in `models.py`, auto-created via
    `create_all`) storing saved outputs; service methods `save_analysis` /
    `list_saved_analyses` / `delete_saved_analysis` enforce a **10-per-paper cap**;
    endpoints `GET/POST /research/papers/{id}/analyses` and
    `DELETE .../analyses/{analysis_id}` (+ `research_paper_save_analysis` rate rule).
    Saving is pure persistence — no AI/billing call. Rows cascade-delete with the
    paper/user. Unit test `test_saved_analyses_crud_and_limit` (passes).
  - Frontend: `Save output` button on each answer (shows `N/10`, disables when
    already saved or at cap) + a collapsible **Saved Analyses** section (expand to
    view the rendered answer and source chips that open the PDF viewer; delete).
  - **Collapsible library sidebar** (collapses to a slim rail) and **collapsible
    predefined-prompts** section that **auto-collapses when an analysis runs**;
    the fresh answer **auto-scrolls into view** so the output is no longer buried
    beneath the (now 13-card) prompt grid.
  - Files: `backend/app/db/models.py`, `backend/app/services/research_paper_service.py`,
    `backend/app/api/research_reader.py`, `backend/app/auth/rate_limit.py`,
    `frontend/src/lib/api.ts`, `frontend/src/components/ResearchReaderView.tsx`,
    `frontend/src/components/research-reader.css`,
    `backend/tests/unit/test_research_paper.py`.
- **Predefined prompts overhaul (7 → 12):** rewrote all prompts as
  prompt-engineered, coverage-specific instructions for richer/structured output,
  and added 5 beginner-focused reading aids so a first-time reader gets a complete
  package: *Beginner's Explainer (ELI5)*, *Key Terms & Concepts*, *Background &
  Related Work*, *Results & Figures Explained*, *Critical Review & Reproducibility*.
  Prompts are ordered as a reading journey (overview → basics → context → how →
  results → critique → application). Kept `researchPrompts.ts` and backend
  `PREDEFINED_PROMPTS` in sync (same 12 ids/order); added 5 lucide icons to
  `ICON_MAP` (`GraduationCap`, `Book`, `Library`, `BarChart3`, `ClipboardCheck`);
  clamped the echoed prompt in the result header to 2 lines. All prompts ≤ 463
  chars (well under the 1000-char API limit).
- **Saved analyses → header button + modal; prompt-card & rail polish (2026-07-27):**
  moved saved analyses out of the bottom collapsible section into a **Saved (N/10)
  button** in the active-paper header that opens a **modal** (reuses the saved-card
  list with expand/answer/source-chips/delete + an empty state). Redesigned the
  predefined-prompt cards (white cards, gradient icon badges, consistent
  `min-height`, wider 4-col grid, refined hover/shadow) and the **collapsed library
  rail** (rounded expand button + gradient library badge with a count bubble +
  subtle vertical label, replacing the awkward rotated text).
- **Main-panel horizontal overflow fix + section polish (2026-07-27):** the
  analysis workspace was overflowing horizontally (answer paragraphs and the
  echoed prompt ran off the right edge, cut off) because CSS grid/flex items
  default to `min-width: auto`, letting wide content blow the `1fr` track past the
  container. Pinned `min-width: 0` on `.reader-workspace-grid`, `.reader-main-panel`
  (+ `overflow-x: clip`), and `.result-body-markdown` (+ `overflow-wrap: anywhere`
  on p/li) so content wraps within the panel. Also: `.result-header` now
  `flex-wrap`s and the echoed prompt is smaller/shrinkable; the collapsible
  prompts + saved-analyses headers are styled as clear clickable bars with a
  pill "Show N / Hide" affordance so a collapsed section reads as intentional
  rather than an empty stranded title.
- **Prompts re-tuned for a technical audience (12 → 13):** the product targets
  readers with existing domain knowledge, so the beginner prompts were removed
  (*Beginner's Explainer (ELI5)*, *Key Terms & Concepts*) and 3 deeper analytical
  prompts added: *Theoretical Foundations & Formulation*, *Benchmark & Baseline
  Comparison*, *Reproducibility & Implementation Blueprint*. Remaining prompts were
  rewritten to embrace domain terminology (no "define every term" hand-holding) and
  reordered **most-analytical-first**; *Contributions* → *Contributions & Novelty*,
  *Critical Review & Reproducibility* → *Critical Peer Review* (reproducibility now
  owned by the Blueprint prompt), *Results & Figures Explained* → *…Deep-Dive*.
  `ICON_MAP` swapped (`GraduationCap`/`Book` removed; `Sigma`/`GitCompare`/
  `FlaskConical` added). Frontend/backend kept in sync (13 ids); all prompts ≤ 438
  chars.
- **PDF.js viewer rewrite:** `ResearchPdfViewer.tsx` now renders the **whole PDF**
  with `pdfjs-dist` (canvas + transparent text layer), lazily painting pages via
  `IntersectionObserver` for responsiveness. It highlights the cited passage
  directly on the real PDF text via token-run matching and **auto-scrolls to focus
  it on open**, while letting the user scroll the full document freely. Added zoom
  controls and a status legend; `scrollbar-gutter: stable` avoids a spurious
  horizontal scrollbar once the document is tall. Removed the separate garbled
  side panel.
  Worker bundled locally (`pdf.worker.min.mjs?url`, no CDN). Viewer is
  `React.lazy` + `Suspense` loaded so the ~480 KB PDF.js chunk only downloads on
  demand (main bundle dropped ~485 KB). Minimal `.textLayer` CSS inlined in
  `research-pdf-viewer.css`.

Files changed:

- `backend/app/services/research_paper_service.py` (chunk size/overlap, page
  stamping, `_clean_pdf_text`, analysis system instruction)
- `backend/app/api/research_reader.py` (top_k defaults)
- `backend/tests/unit/test_research_paper.py` (page-stamp test)
- `frontend/src/components/ResearchPdfViewer.tsx` (full PDF.js rewrite)
- `frontend/src/components/research-pdf-viewer.css` (new viewer + text-layer CSS)
- `frontend/src/components/ResearchReaderView.tsx` (lazy-load viewer)
- `frontend/src/lib/api.ts` (default topK 10)
- `frontend/package.json` / lockfile (`pdfjs-dist` dependency)
- `AI-Context/functional/feature-research-expert.md`,
  `AI-Context/technical/frontend-visual-system.md`

Verification:

- Frontend `tsc --noEmit` clean; `vite build` succeeds and code-splits PDF.js
  into its own chunk + separate worker asset.
- Research Expert unit tests: chunking/CRUD/analyze/access/role-gating pass
  (7 passed). Two Jina *billing* tests fail, but these are pre-existing in the
  untracked WIP test file and unrelated to this change: one asserts an admin cost
  under key `jina_call_cost_usd` while `_charge_jina_embedding` reads
  `research_paper_jina_cost_usd`; the other mocks out `search_relevant_chunks`
  (where the query-embedding charge is issued) so the charge never fires.

Known limitations / follow-ups:

- Highlighting matches the section's tokens against the PDF text layer; for very
  short or heavily-garbled sections the auto-locate may find no contiguous run —
  the correct page is still shown, just without a highlight.
- Extraction of dense two-column math/algorithm blocks remains imperfect at the
  source; smaller chunks + instruction changes mitigate but do not fully repair
  scanned/complex layouts.
- Pre-existing Jina billing key mismatch (`jina_call_cost_usd` vs
  `research_paper_jina_cost_usd`) should be reconciled separately.
