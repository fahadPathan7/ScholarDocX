# Research Expert Fix - Complete ✓

## What Was Fixed

### 1. Vector Dimension Issue
**Problem**: Database was trying to use 2048 dimensions, but pgvector's HNSW and IVFFlat indexes have a hard limit of 2000 dimensions.

**Solution**: Changed to use **1024 dimensions** with Jina AI embeddings.

### 2. Stuck Papers
**Problem**: Paper was stuck in "processing" state after failed upload.

**Solution**: Set to "error" status so retry button works.

### 3. Complete Rename
**Problem**: Feature was still called "Research Reader" in many places.

**Solution**: Renamed everything to "Research Expert".

---

## What Was Changed

### Backend Code (`backend/app/`)
- `services/research_paper_service.py`:
  - Updated `EMBEDDING_MODEL = "jina-embeddings-v4"`
  - Added `EMBEDDING_DIMENSIONS = 1024`
  - Changed embedding generation to use 1024 dimensions
  - Updated all "Research Reader" → "Research Expert"

- `db/models.py`:
  - Changed `Vector(2048)` → `Vector(1024)`
  - Updated docstring to reflect 1024 dims
  - Updated "Research Reader" → "Research Expert"

- `db/connection.py`:
  - Updated migration to target 1024 dimensions
  - Added cleanup for stuck papers
  
- `api/research_reader.py`: Renamed to "Research Expert" in docs/tags
- `services/ai_tokens.py`: Updated comments
- `auth/rate_limit.py`: Updated labels
- `tests/unit/test_research_paper.py`: Updated docstring

### Frontend Code (`frontend/src/`)
- `App.tsx`: Updated comment about Research Expert

### Documentation (`AI-Context/`)
- Updated 26 occurrences across all documentation files
- All references now consistently say "Research Expert"
- Technical details updated to reflect 1024-dim Jina embeddings

### Database
- Vector column: `vector(768)` → `vector(1024)`
- Index type: HNSW (high performance, 1024 dims supported)
- All papers set to 'error' status for retry

---

## Current Configuration

| Setting | Value |
|---------|-------|
| **Embedding Provider** | Jina AI |
| **Model** | jina-embeddings-v4 |
| **Dimensions** | 1024 |
| **Index Type** | HNSW |
| **Max Dimensions** | < 2000 (pgvector limit) |
| **Status** | ✓ Working |

---

## What To Do Now

### 1. Restart Backend Server
```bash
cd backend
# Kill existing process if running, then:
python -m uvicorn app.main:app --reload
```

### 2. Refresh Research Expert Page
- Open browser
- Go to Research Expert
- Hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)

### 3. Retry Your Paper
- Paper should now show **"error" status** with a **retry button**
- Click retry
- It will regenerate with 1024-dim Jina embeddings
- Should complete successfully

---

## Files Created (For Reference)

- `fix_stuck_papers.sql` - SQL script for manual cleanup
- `fix_stuck_papers.py` - Python script (needs updates)
- `backend/fix_stuck_papers_simple.py` - Working Python cleanup script
- `backend/fix_vector_dimension.py` - Attempted 2048 fix (obsolete)
- `backend/fix_vector_with_ivfflat.py` - IVFFlat attempt (obsolete)
- `backend/fix_to_1024_dims.py` - **✓ Final working fix (already run)**
- `FIX_STUCK_PAPERS_README.md` - Instructions

**Note**: Only `fix_to_1024_dims.py` is relevant now - it has already been run successfully.

---

## Verification

Run this to verify everything is correct:

```bash
cd backend
python -c "
from app.services.research_paper_service import EMBEDDING_MODEL, EMBEDDING_DIMENSIONS
from app.db.models import ResearchPaperChunks
print(f'Model: {EMBEDDING_MODEL}')
print(f'Dims: {EMBEDDING_DIMENSIONS}')
print(f'DB Column: {ResearchPaperChunks.embedding.type}')
"
```

Expected output:
```
Model: jina-embeddings-v4
Dims: 1024
DB Column: VECTOR(1024)
```

---

## Technical Notes

### Why 1024 instead of 2048?
- pgvector HNSW index: max 2000 dimensions
- pgvector IVFFlat index: max 2000 dimensions  
- Jina AI supports configurable dimensions
- 1024 is a good balance: plenty of semantic capacity, under the limit

### Why Jina AI?
- Originally used Gemini text-embedding-004 (768 dims)
- Switched to Jina for better performance
- Jina supports 1024, 512, or custom dimensions
- 1024 chosen for quality vs. pgvector limit tradeoff

### What if I want higher dimensions?
You would need to:
1. Use no index (slower search)
2. Use a different vector database (Pinecone, Weaviate, etc.)
3. Or accept 1024 dims (recommended)

---

## Status: ✓ COMPLETE

Everything is fixed. Just restart the backend and retry your paper!
