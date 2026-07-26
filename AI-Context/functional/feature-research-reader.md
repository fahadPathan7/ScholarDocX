# Feature: Research Reader

## Overview

Research Reader is an AI-powered single-paper analysis workspace that helps students and researchers efficiently understand academic papers. Users upload one research paper at a time and use predefined analytical prompts or custom questions to extract insights about methodology, results, model structure, and key findings without manually reading the entire document.

**Premium Feature**: Research Reader is available exclusively to Pro and Max tier subscribers. All AI analysis operations consume credits from the user's token balance, following the existing AI token economy.

## User Value

- **Time Savings**: Quickly extract specific information from dense academic papers
- **Focused Analysis**: Predefined prompts guide users to ask the right research questions
- **Semantic Understanding**: Vector search finds relevant sections even when exact keywords don't match
- **Source Transparency**: AI responses cite specific paper sections for verification
- **Learning Aid**: Helps students understand complex research methodology and results
- **Research Efficiency**: Speeds up literature review and paper comprehension workflows
- **Cost-Effective**: Pay-as-you-go token consumption means users only pay for what they analyze
- **Premium Tool**: Exclusive feature that differentiates Pro/Max plans from lower tiers

## User Stories

### US-9.1: Upload Research Paper
**As a** researcher  
**I want to** upload a PDF research paper to Research Reader  
**So that** I can analyze it using AI-powered semantic search

**Acceptance Criteria**:
- Upload button accepts PDF files up to 10MB
- Drag-and-drop upload is supported
- Upload shows progress indicator
- System extracts text and generates embeddings automatically
- Paper appears in history after successful upload
- User receives error message if file is too large or wrong format

### US-9.2: Analyze Paper with Predefined Prompts
**As a** student reading a machine learning paper  
**I want to** click "Explain the methodology" prompt  
**So that** I can quickly understand the research methods without reading the full paper

**Acceptance Criteria**:
- 7 predefined prompts are displayed as clickable buttons
- Prompts include: Methodology, Results, Model Structure, Limitations, Contributions, Datasets, Related Work
- Clicking a prompt triggers AI analysis
- Response cites specific paper sections with similarity scores
- Response appears within 10 seconds for typical papers

### US-9.3: Ask Custom Questions
**As a** researcher  
**I want to** ask custom questions about the paper  
**So that** I can get specific information not covered by predefined prompts

**Acceptance Criteria**:
- Text input accepts custom questions
- Submit button triggers AI analysis
- AI searches paper using semantic similarity
- Response includes relevant sections and citations
- Response quality matches predefined prompt quality

### US-9.4: View Paper History
**As a** user with multiple research interests  
**I want to** see a list of papers I've uploaded  
**So that** I can return to previous analyses

**Acceptance Criteria**:
- History section shows all user's uploaded papers
- Each entry shows title, upload date, and chunk count
- User can click a paper to make it "active" for analysis
- Active paper is highlighted in history
- History is sorted by most recent first

### US-9.5: Delete Papers
**As a** user managing storage  
**I want to** delete papers I no longer need  
**So that** I can free up my quota and keep workspace organized

**Acceptance Criteria**:
- Delete button appears on each paper in history
- Delete requires confirmation
- Deleting removes paper file, embeddings, and analysis history
- Deleted paper disappears from history immediately
- Deleting active paper clears analysis view

### US-9.6: Switch Active Paper
**As a** researcher comparing multiple papers  
**I want to** switch between uploaded papers  
**So that** I can analyze different papers without re-uploading

**Acceptance Criteria**:
- Clicking a paper in history makes it active
- Active paper title appears in analysis section
- Prompts and questions apply to active paper only
- Switching is instant (no re-processing needed)

### US-9.7: Monitor AI Credit Usage
**As a** Pro user managing my budget  
**I want to** see how many credits each analysis costs  
**So that** I can track my spending and stay within budget

**Acceptance Criteria**:
- Current credit balance displayed prominently in Research Reader
- Each analysis response shows token cost (e.g., "Cost: 1,250 tokens")
- Upload process shows estimated embedding cost before proceeding
- Low credit warning appears when balance drops below threshold
- User can navigate to Buy Credits from warning message

### US-9.8: Access Premium Feature
**As a** Free tier user  
**I want to** understand why I can't access Research Reader  
**So that** I know what benefits I'll get by upgrading

**Acceptance Criteria**:
- Research Reader nav item shows "Pro" badge or lock icon
- Clicking nav item as Free/General user shows upgrade modal
- Modal explains feature benefits and pricing tiers
- Modal includes "Upgrade to Pro" CTA button
- Direct URL access (e.g., /research-reader) redirects to upgrade modal
- Pro/Max users see full feature without restrictions

## User Workflow

### First-Time Pro User Flow
1. User navigates to "Research Reader" from sidebar (sees Pro badge)
2. User sees empty state with upload prompt and credit balance
3. User drags PDF or clicks upload button
4. System shows estimated embedding cost (e.g., "~500 tokens")
5. User confirms upload
6. System processes paper (shows progress: "Extracting text... Generating embeddings...")
7. Upload completes, credits deducted, balance updates
8. Paper appears as active with title and metadata
9. 7 predefined prompts appear
10. User clicks "Summarize the key results" prompt
11. AI analyzes paper and returns response with citations
12. Response shows token cost at bottom (e.g., "Analysis used 1,250 tokens")
13. Credit balance updates in real-time
14. User asks custom question "What optimizer did they use?"
15. AI returns answer with relevant sections highlighted and cost

### Free User Blocked Flow
1. Free user sees "Research Reader 🔒 Pro" in sidebar
2. User clicks item out of curiosity
3. Upgrade modal appears: "Research Reader is a Pro feature"
4. Modal explains: "Upload research papers and get AI-powered analysis with semantic search. Available on Pro ($15/quarter) and Max ($40/quarter) plans."
5. User clicks "Upgrade to Pro" or "Maybe Later"
6. If upgrade, redirected to pricing/checkout

### Returning User Flow
1. User navigates to Research Reader
2. Last uploaded paper is active by default
3. Credit balance displayed (e.g., "15,430 credits remaining")
4. Credit balance displayed (e.g., "15,430 credits remaining")
5. User sees history sidebar with 5 previous papers
6. User clicks a different paper from history
7. That paper becomes active
8. User uses predefined prompts on new active paper (each costs tokens)
9. User monitors credit balance as it decreases with usage
5. Paper appears as active with title and metadata
6. 7 predefined prompts appear
7. User clicks "Summarize the key results" prompt
8. AI analyzes paper and returns response with citations
9. User asks custom question "What optimizer did they use?"
10. AI returns answer with relevant sections highlighted

### Returning User Flow
1. User navigates to Research Reader
2. Last uploaded paper is active by default
3. User sees history sidebar with 5 previous papers
4. User clicks a different paper from history
5. That paper becomes active
6. User uses predefined prompts on new active paper

## Predefined Prompt Catalog

The following 7 prompts are always available:

1. **Methodology** (🔬)
   - Prompt: "Explain the methodology used in this paper"
   - Focus: Research methods, experimental design, approach

2. **Results** (📊)
   - Prompt: "Summarize the key results and findings"
   - Focus: Outcomes, performance metrics, discoveries

3. **Model Structure** (🏗️)
   - Prompt: "Describe the model structure or architecture"
   - Focus: System design, algorithms, mathematical formulations

4. **Limitations** (⚠️)
   - Prompt: "What are the limitations mentioned by the authors?"
   - Focus: Acknowledged weaknesses, future work, constraints

5. **Contributions** (💡)
   - Prompt: "What are the main contributions of this paper?"
   - Focus: Novel ideas, improvements, theoretical advances

6. **Datasets** (🗂️)
   - Prompt: "What datasets were used in this research?"
   - Focus: Data sources, benchmarks, evaluation sets

7. **Related Work** (📚)
   - Prompt: "What related work does the paper reference?"
   - Focus: Prior research, comparisons, literature context

## UI Layout

### Research Reader View Structure

```
┌─────────────────────────────────────────────────────┐
│ 🏠 Research Reader                                   │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌──────────────────┐  ┌───────────────────────┐   │
│  │  History (Left)  │  │  Main Analysis (Right)│   │
│  │                  │  │                        │   │
│  │  📄 Paper 1*     │  │  📄 Active Paper       │   │
│  │  📄 Paper 2      │  │  Title: "Attention..." │   │
│  │  📄 Paper 3      │  │  Author: Vaswani et al │   │
│  │                  │  │  Chunks: 45            │   │
│  │                  │  │                        │   │
│  │  [Upload New]    │  │  ┌─────┬─────┬─────┐  │   │
│  │                  │  │  │ 🔬  │ 📊  │ 🏗️  │  │   │
│  │                  │  │  └─────┴─────┴─────┘  │   │
│  │                  │  │  ┌─────┬─────┬─────┐  │   │
│  │                  │  │  │ ⚠️  │ 💡  │ 🗂️  │  │   │
│  │                  │  │  └─────┴─────┴─────┘  │   │
│  │                  │  │  ┌─────┐              │   │
│  │                  │  │  │ 📚  │              │   │
│  │                  │  │  └─────┘              │   │
│  │                  │  │                        │   │
│  │                  │  │  Custom Question:      │   │
│  │                  │  │  [________________]    │   │
│  │                  │  │  [Ask]                 │   │
│  │                  │  │                        │   │
│  │                  │  │  Analysis Results:     │   │
│  │                  │  │  ┌─────────────────┐  │   │
│  │                  │  │  │ AI Response     │  │   │
│  │                  │  │  │ with citations  │  │   │
│  │                  │  │  └─────────────────┘  │   │
│  └──────────────────┘  └───────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Technical Behavior

### Text Extraction
- PDF text is extracted using `pdfplumber` or `PyPDF2`
- Text is cleaned (remove headers, footers, page numbers)
- Special characters and equations are preserved where possible

### Chunking Strategy
- Text is split into semantic chunks (~500-1000 tokens each)
- 100-token overlap between chunks preserves context
- Chunk boundaries respect paragraph breaks when possible
- Each chunk is indexed with its position in the document

### Embedding Generation
- Use Gemini text-embedding-004 (768 dimensions) or Supabase gte-small (384 dimensions)
- Generate embeddings for all chunks in batch
- Store embeddings in `research_paper_chunks.embedding` column (pgvector)
- Embedding generation happens asynchronously during upload

### Vector Search
- User question is converted to query embedding
- Cosine similarity search finds top-5 most relevant chunks
- Results are ranked by similarity score (0.0 to 1.0)
- Threshold of 0.6 filters out irrelevant chunks

### AI Analysis
- Top-5 relevant chunks are injected into AI prompt
- System prompt instructs AI to cite sources
- AI response includes chunk references (e.g., "[Section 3.2, Chunk 12]")
- If no relevant chunks found (all below threshold), AI responds "Information not found in paper"

### Privacy & Security
- Papers are user-scoped (user_id foreign key)
- Users cannot access other users' papers
- Paper text is sent to AI provider (Gemini/GLM) for analysis
- Privacy notice displayed on first upload: "Paper content will be sent to AI provider for analysis"

### Role-Based Access Control
- **Feature Access**: `can_use_research_reader` permission
  - Free: false (blocked)
  - General: false (blocked)
  - Pro: true (full access)
  - Max: true (full access)
- Unauthorized users receive 403 Forbidden error
- Frontend hides or locks navigation item for Free/General users
- Upgrade modal explains Pro/Max benefits

### AI Token Consumption
- **Embedding Generation** (during upload):
  - Charges based on total paper text tokens processed
  - Typical 10-page paper: ~3,000-5,000 input tokens (~500-800 credits depending on provider)
  - Cost estimated and shown before upload confirmation
- **Analysis Queries** (predefined prompts or custom questions):
  - Charges based on provider's input (prompt + top-5 chunk context) + output tokens
  - Typical analysis: ~1,000-2,000 input + 500-1,000 output = 1,500-3,000 tokens total
  - Cost displayed after each analysis completes
- **Credit Balance Check**:
  - Before processing, system checks user has sufficient credits
  - Insufficient credits returns 402 Payment Required error
  - User sees clear message: "Insufficient AI credits. [Buy Credits]"
- **Token Tracking**:
  - All charges go through `AiService.charge()` or `charge_flat_fee()`
  - Usage appears in user's stats (`user_usage_stats` table)
  - Billing history shows Research Reader consumption

### Role Limits
- **Feature Access**: `can_use_research_reader` (boolean permission, Pro/Max only)
- **Upload Quota**: `research_papers_per_month` limits uploads per calendar month
  - Free: 0 (feature blocked)
  - General: 0 (feature blocked)
  - Pro: 30 papers/month  
  - Max: 100 papers/month
- Existing papers can be re-analyzed unlimited times (each analysis costs tokens)
- Monthly quota resets on the 1st of each month

### Rate Limiting
- Upload endpoint: 5 uploads per 5 minutes per user
- Analysis endpoint: reuses `/ai/research` rate limit (10 requests per minute per user)

## Error Handling

### Upload Errors
- **File too large**: "Paper must be under 10MB. Please compress or split the document."
- **Wrong format**: "Only PDF files are supported. Please convert DOCX/LaTeX to PDF first."
- **Text extraction failed**: "Unable to extract text from PDF. The file may be an image-only scan."
- **Quota exceeded**: "Monthly upload limit reached (30/30 papers). Resets on [date]."
- **Insufficient credits**: "Insufficient AI credits for embedding generation (need ~500 credits). [Buy Credits]"
- **Feature access denied**: "Research Reader is a Pro feature. [Upgrade to Pro]"

### Analysis Errors
- **No active paper**: "Please upload or select a paper first."
- **Empty question**: "Please enter a question about the paper."
- **AI provider error**: "Analysis service temporarily unavailable. Please try again."
- **No relevant sections**: "No relevant information found for this question. Try rephrasing or use a different prompt."
- **Rate limit**: "Too many requests. Please wait 30 seconds."
- **Insufficient credits**: "Insufficient AI credits (need ~1,500 credits). [Buy Credits]"
- **Feature access denied**: "Research Reader is a Pro feature. [Upgrade to Pro]"

## Future Enhancements (Out of Scope for MVP)

- **Multi-paper comparison**: Analyze multiple papers side-by-side
- **DOCX/LaTeX support**: Accept non-PDF formats
- **Citation network**: Visualize paper references
- **Annotation**: Highlight and comment on paper sections
- **Export**: Save analysis to documents
- **Metadata extraction**: Auto-detect authors, journal, DOI
- **Google Scholar integration**: Import papers directly
- **Collaboration**: Share papers and analyses with team
- **Paper recommendations**: Suggest related papers

## Acceptance Testing Checklist

Manual testing steps before marking task complete:

- [ ] Upload a 10-page research paper (PDF)
- [ ] Verify upload progress indicator appears
- [ ] Verify paper appears in history with title and date
- [ ] Click "Explain the methodology" prompt
- [ ] Verify AI response cites specific paper sections
- [ ] Verify response appears within 10 seconds
- [ ] Test all 7 predefined prompts
- [ ] Ask custom question "What is the learning rate?"
- [ ] Verify custom question returns relevant answer
- [ ] Upload a second paper
- [ ] Verify second paper becomes active
- [ ] Click first paper in history
- [ ] Verify first paper becomes active
- [ ] Delete second paper
- [ ] Verify paper removed from history
- [ ] Verify deleted paper's file and data are gone
- [ ] Test with 15MB paper (should fail with error)
- [ ] Test with DOCX file (should fail with error)
- [ ] Test uploading papers until quota reached
- [ ] Verify quota error message is clear
- [ ] Test on mobile viewport (responsive design)
- [ ] Verify no modal backdrop blur issues
- [ ] Create second test user
- [ ] Verify User A cannot see User B's papers

## Related Features

- [Feature: AI Assistant](feature-ai-assistant.md) - Shares AI provider and token economy
- [Feature: Documents](feature-documents.md) - Uses similar upload and storage patterns
- [Feature: Advisor Atlas](feature-advisor-atlas.md) - Another AI-powered research feature

## Requirements Index

- FR-9.1: Upload research papers (PDF, max 10MB)
- FR-9.2: Extract text and generate embeddings
- FR-9.3: Single-paper analysis focus
- FR-9.4: Predefined analytical prompts (7+)
- FR-9.5: Custom question support
- FR-9.6: Vector similarity search
- FR-9.7: Source citation in responses
- FR-9.8: Paper analysis history
- FR-9.9: Delete papers and data
- FR-9.10: **Role-based access control (Pro and Max users only)**
- FR-9.11: **AI token consumption and credit charging for all analysis operations**
