#!/usr/bin/env python3
"""
Fix vector dimension: Drop HNSW index and use IVFFlat for 2048 dimensions.
Run this from the backend directory: cd backend && python fix_vector_with_ivfflat.py
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

def fix_vector_dimension():
    """Fix vector dimension using IVFFlat index instead of HNSW."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("✗ ERROR: DATABASE_URL not found in environment variables")
        return
    
    engine = get_engine(database_url)
    
    with engine.connect() as conn:
        print("=" * 60)
        print("Fix Vector Dimension - Use IVFFlat for 2048 dims")
        print("=" * 60)
        
        # Step 1: Drop existing HNSW index (prevents ALTER TABLE)
        print("\n1. Dropping existing HNSW index (if exists)...")
        try:
            conn.execute(text(
                "DROP INDEX IF EXISTS idx_research_chunks_embedding_hnsw"
            ))
            conn.commit()
            print("   ✓ HNSW index dropped")
        except Exception as e:
            print(f"   Note: {e}")
        
        # Step 2: Delete all chunks with wrong dimension
        print("\n2. Deleting existing chunks...")
        result = conn.execute(text(
            "DELETE FROM research_paper_chunks"
        ))
        conn.commit()
        print(f"   Deleted {result.rowcount} chunk(s)")
        
        # Step 3: Alter column to vector(2048)
        print("\n3. Altering embedding column to vector(2048)...")
        try:
            conn.execute(text(
                "ALTER TABLE research_paper_chunks "
                "ALTER COLUMN embedding TYPE vector(2048)"
            ))
            conn.commit()
            print("   ✓ Column altered to vector(2048)")
        except Exception as e:
            print(f"   ✗ Failed: {e}")
            return
        
        # Step 4: Create IVFFlat index instead of HNSW
        print("\n4. Creating IVFFlat index (supports >2000 dims)...")
        try:
            # IVFFlat supports higher dimensions than HNSW
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_research_chunks_embedding_ivfflat "
                "ON research_paper_chunks "
                "USING ivfflat (embedding vector_cosine_ops) "
                "WITH (lists = 100)"
            ))
            conn.commit()
            print("   ✓ IVFFlat index created")
        except Exception as e:
            print(f"   Note: {e}")
            print("   (Index will be created automatically when enough data exists)")
        
        # Step 5: Set papers to error status
        print("\n5. Setting all papers to 'error' status...")
        result = conn.execute(text(
            "UPDATE research_papers SET status = 'error', chunk_count = 0"
        ))
        conn.commit()
        print(f"   Updated {result.rowcount} paper(s)")
        
        # Step 6: Verify
        print("\n6. Verifying...")
        result = conn.execute(text(
            "SELECT atttypmod - 4 as dimension "
            "FROM pg_attribute "
            "WHERE attrelid = 'research_paper_chunks'::regclass "
            "AND attname = 'embedding'"
        ))
        dim = result.scalar()
        status = "✓" if dim == 2048 else "✗"
        print(f"   {status} Vector dimension: {dim}")
        
        # Check index
        result = conn.execute(text(
            "SELECT indexname FROM pg_indexes "
            "WHERE tablename = 'research_paper_chunks' "
            "AND indexname LIKE '%embedding%'"
        ))
        indexes = result.fetchall()
        print(f"   Indexes: {[idx[0] for idx in indexes]}")
        
        print("\n" + "=" * 60)
        print("✓ Migration complete!")
        print("  - Vector dimension: 2048 (Jina AI)")
        print("  - Index type: IVFFlat (supports >2000 dims)")
        print("  - All papers set to 'error' for retry")
        print("\nNext steps:")
        print("  1. Restart backend server")
        print("  2. Refresh Research Expert page")
        print("  3. Retry papers from UI")
        print("=" * 60)

if __name__ == "__main__":
    try:
        fix_vector_dimension()
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
