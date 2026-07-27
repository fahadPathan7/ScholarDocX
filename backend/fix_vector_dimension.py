#!/usr/bin/env python3
"""
Fix vector dimension from 768 to 2048 for Jina AI embeddings.
Run this from the backend directory: cd backend && python fix_vector_dimension.py
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
    """Fix vector dimension from 768 to 2048."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("✗ ERROR: DATABASE_URL not found in environment variables")
        return
    
    engine = get_engine(database_url)
    
    with engine.connect() as conn:
        print("=" * 60)
        print("Fix Vector Dimension for Jina AI Embeddings")
        print("=" * 60)
        
        # Step 1: Check current dimension
        print("\n1. Checking current vector dimension...")
        result = conn.execute(text(
            "SELECT atttypmod - 4 as dimension "
            "FROM pg_attribute "
            "WHERE attrelid = 'research_paper_chunks'::regclass "
            "AND attname = 'embedding'"
        ))
        current_dim = result.scalar()
        print(f"   Current dimension: {current_dim}")
        
        if current_dim == 2048:
            print("\n✓ Vector dimension is already correct (2048). No action needed.")
            return
        
        # Step 2: Count existing chunks
        result = conn.execute(text(
            "SELECT COUNT(*) FROM research_paper_chunks WHERE embedding IS NOT NULL"
        ))
        chunk_count = result.scalar()
        print(f"\n2. Found {chunk_count} chunk(s) with embeddings")
        
        if chunk_count > 0:
            print("   ⚠️  Deleting existing chunks (wrong dimension)...")
            conn.execute(text("DELETE FROM research_paper_chunks"))
            conn.commit()
            print("   ✓ Deleted all chunks")
        
        # Step 3: Alter column type
        print("\n3. Altering embedding column to vector(2048)...")
        try:
            conn.execute(text(
                "ALTER TABLE research_paper_chunks "
                "ALTER COLUMN embedding TYPE vector(2048)"
            ))
            conn.commit()
            print("   ✓ Column altered successfully")
        except Exception as e:
            print(f"   ✗ Failed to alter column: {e}")
            return
        
        # Step 4: Set all papers to error so they can be retried
        print("\n4. Setting papers to 'error' status for re-processing...")
        result = conn.execute(text(
            "UPDATE research_papers SET status = 'error', chunk_count = 0"
        ))
        conn.commit()
        print(f"   Updated {result.rowcount} paper(s)")
        
        # Step 5: Verify
        print("\n5. Verifying fix...")
        result = conn.execute(text(
            "SELECT atttypmod - 4 as dimension "
            "FROM pg_attribute "
            "WHERE attrelid = 'research_paper_chunks'::regclass "
            "AND attname = 'embedding'"
        ))
        new_dim = result.scalar()
        status = "✓" if new_dim == 2048 else "✗"
        print(f"   {status} New dimension: {new_dim}")
        
        print("\n" + "=" * 60)
        print("✓ Fix complete!")
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
