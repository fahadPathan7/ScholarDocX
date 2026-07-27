#!/usr/bin/env python3
"""
Final fix: Use 1024 dimensions for Jina AI embeddings (under pgvector's 2000 limit).
Run this from the backend directory: cd backend && python fix_to_1024_dims.py
"""

import os
from pathlib import Path

# Load environment variables
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

from sqlalchemy import text
from app.db.connection import get_engine

def fix_to_1024_dimensions():
    """Fix vector dimension to 1024 (under pgvector's 2000 limit)."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("✗ ERROR: DATABASE_URL not found in environment variables")
        return
    
    engine = get_engine(database_url)
    
    print("=" * 60)
    print("Final Fix: Set Vector Dimension to 1024")
    print("=" * 60)
    print("\nReason: pgvector indexes (HNSW/IVFFlat) support max 2000 dims")
    print("Solution: Use Jina AI with 1024 dimensions\n")
    
    with engine.begin() as conn:  # Use transaction
        # Step 1: Drop any existing indexes
        print("1. Dropping existing vector indexes...")
        conn.execute(text(
            "DROP INDEX IF EXISTS idx_research_chunks_embedding_hnsw CASCADE"
        ))
        conn.execute(text(
            "DROP INDEX IF EXISTS idx_research_chunks_embedding_ivfflat CASCADE"
        ))
        print("   ✓ Indexes dropped")
        
        # Step 2: Delete all chunks
        print("\n2. Deleting all chunks...")
        result = conn.execute(text("DELETE FROM research_paper_chunks"))
        print(f"   Deleted {result.rowcount} chunk(s)")
        
        # Step 3: Alter column to vector(1024)
        print("\n3. Altering embedding column to vector(1024)...")
        conn.execute(text(
            "ALTER TABLE research_paper_chunks "
            "ALTER COLUMN embedding TYPE vector(1024)"
        ))
        print("   ✓ Column set to vector(1024)")
        
        # Step 4: Create HNSW index (now it will work!)
        print("\n4. Creating HNSW index for 1024 dims...")
        conn.execute(text(
            "CREATE INDEX idx_research_chunks_embedding_hnsw "
            "ON research_paper_chunks "
            "USING hnsw (embedding vector_cosine_ops)"
        ))
        print("   ✓ HNSW index created")
        
        # Step 5: Set all papers to error status
        print("\n5. Setting papers to 'error' status...")
        result = conn.execute(text(
            "UPDATE research_papers SET status = 'error', chunk_count = 0"
        ))
        print(f"   Updated {result.rowcount} paper(s)")
    
    # Verify (outside transaction to get fresh data)
    with engine.connect() as conn:
        print("\n6. Verification:")
        
        # Check dimension
        result = conn.execute(text(
            "SELECT atttypmod - 4 as dimension "
            "FROM pg_attribute "
            "WHERE attrelid = 'research_paper_chunks'::regclass "
            "AND attname = 'embedding'"
        ))
        dim = result.scalar()
        print(f"   ✓ Vector dimension: {dim}")
        
        # Check indexes
        result = conn.execute(text(
            "SELECT indexname FROM pg_indexes "
            "WHERE tablename = 'research_paper_chunks' "
            "AND indexname LIKE '%embedding%'"
        ))
        indexes = [row[0] for row in result.fetchall()]
        print(f"   ✓ Indexes: {indexes}")
        
        # Check paper statuses
        result = conn.execute(text(
            "SELECT status, COUNT(*) FROM research_papers GROUP BY status"
        ))
        statuses = {row[0]: row[1] for row in result.fetchall()}
        print(f"   ✓ Paper statuses: {statuses}")
    
    print("\n" + "=" * 60)
    print("✓ Migration complete!")
    print("\nConfiguration:")
    print("  - Embedding model: Jina AI jina-embeddings-v4")
    print("  - Dimensions: 1024 (under pgvector 2000 limit)")
    print("  - Index type: HNSW (high performance)")
    print("\nNext steps:")
    print("  1. Restart backend server")
    print("  2. Refresh Research Expert page")
    print("  3. Retry papers - they will use 1024-dim embeddings")
    print("=" * 60)

if __name__ == "__main__":
    try:
        fix_to_1024_dimensions()
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
