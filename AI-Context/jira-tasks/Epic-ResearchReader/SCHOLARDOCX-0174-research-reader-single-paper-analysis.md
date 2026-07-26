# SCHOLARDOCX-0174: Research Reader - Single Paper Analysis Workspace

Status: Draft

Owner: AI Agent

Epic: Epic-ResearchReader

Created: 2026-07-27

## Summary

Create a beautiful "Research Reader" workspace that allows users to upload one research paper at a time and analyze it using AI-powered semantic search and predefined analytical prompts. The feature uses pgvector for efficient vector storage and similarity search, enabling users to ask questions about methodology, results, model structure, limitations, and key findings without manually reading the entire paper.

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
- FR-9.10: **Research Reader is accessible only to Pro and Max tier users** (role-based access control)
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

- **Role-Based Access Control**: Research Reader is a premium feature available only to Pro and Max tier users
  - Free and General tier users cannot access the Research Reader view
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
- Research Reader view with upload, analysis, and history sections
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
- **Research Reader view is visible only to Pro and Max tier users**
- **Free and General users see upgrade prompt when attempting to access**
- Users can upload a research paper (PDF, max 10MB) to Research Reader
- System extracts text from PDF and splits into semantic chunks
- System generates embeddings for chunks and stores in `research_papers` table
- **Embedding generation charges AI tokens from user's credit balance**
- Users see exactly 7 predefined analytical prompts in the UI
- Clicking a predefined prompt triggers AI analysis with relevant paper sections
- **Each analysis query charges tokens based on provider usage (input + output)**
- **Users with insufficient credits receive clear error message**
- Users can type custom questions about the paper
- AI responses cite specific sections/chunks from the paper with relevance scores
- Only one paper can be "active" for analysis at a time
- Users can view history of previously uploaded papers
- Users can switch active paper from history
- Users can delete a paper (removes file, embeddings, and analysis history)
- Research Reader view follows existing UI patterns (modal backdrop blur, responsive design)
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

1. **Research Reader view** (`frontend/src/components/ResearchReader.tsx`):
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
   - Add "Research Reader" to sidebar navigation
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
   - `technical/ai-integrations.md` - Document Research Reader analysis flow and AI token charging
   - `technical/ai-token-economy.md` - Add Research Reader to token consumption documentation
   - `technical/data-model-draft.md` - Add `research_papers` and `research_paper_chunks` tables
   - `technical/security-privacy.md` - Document paper text privacy (sent to AI provider)
   - `functional/requirements-index.md` - Add FR-9.x requirements (including FR-9.10 and FR-9.11)
   - `business/decisions.md` - Document Pro/Max-only feature decision and AI credit consumption model
   - Create `functional/feature-research-reader.md` - Full feature specification

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
   - **Check usage stats show Research Reader token consumption**
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
- `frontend/src/App.tsx` (add Research Reader route, ~5 lines)
- `frontend/src/components/Sidebar.tsx` (add Research Reader nav item, ~10 lines)
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

## Completion Notes

Changed files:

- (To be filled after implementation)

Verification completed:

- (To be filled after implementation)

Unit tests added or updated:

- (To be filled after implementation)

Follow-ups:

- DOCX and LaTeX paper support
- Automatic metadata extraction (authors, journal, year, DOI)
- Multi-paper comparison workspace
- Export analysis to documents
- Paper annotation and highlighting
- Integration with Google Scholar / Semantic Scholar
- Citation network visualization
- Paper recommendation based on reading history
