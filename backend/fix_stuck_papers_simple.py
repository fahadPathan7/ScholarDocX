#!/usr/bin/env python3
"""
Manual database cleanup script for Research Expert papers stuck in 'processing' state.
Run this from the backend directory: cd backend && python fix_stuck_papers_simple.py
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

def fix_stuck_papers():
    """Fix papers stuck in processing state."""
    # Get database URL from environment
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("✗ ERROR: DATABASE_URL not found in environment variables")
        print("  Make sure .env file exists with DATABASE_URL set")
        return
    
    engine = get_engine(database_url)
    
    with engine.connect() as conn:
        print("=" * 60)
        print("Research Expert Database Cleanup")
        print("=" * 60)
        
        # Step 1: Check current state
        print("\n1. Current papers state:")
        result = conn.execute(text(
            "SELECT id, title, status, chunk_count, embedding_model "
            "FROM research_papers ORDER BY created_at DESC LIMIT 10"
        ))
        papers = result.fetchall()
        for paper in papers:
            print(f"  - {paper[1][:50]}: status={paper[2]}, chunks={paper[3]}")
        
        # Step 2: Count stuck papers
        result = conn.execute(text(
            "SELECT COUNT(*) as count FROM research_papers WHERE status = 'processing'"
        ))
        stuck_count = result.scalar()
        print(f"\n2. Found {stuck_count} paper(s) stuck in 'processing' state")
        
        if stuck_count == 0:
            print("\n✓ No stuck papers found. Database is clean.")
            
            # Check for papers in error state
            result = conn.execute(text(
                "SELECT COUNT(*) as count FROM research_papers WHERE status = 'error'"
            ))
            error_count = result.scalar()
            if error_count > 0:
                print(f"\n  Note: {error_count} paper(s) in 'error' state can be retried from the UI.")
            return
        
        # Step 3: Delete chunks for stuck papers
        print("\n3. Deleting chunks for stuck papers...")
        result = conn.execute(text(
            "DELETE FROM research_paper_chunks "
            "WHERE paper_id IN (SELECT id FROM research_papers WHERE status = 'processing')"
        ))
        print(f"   Deleted {result.rowcount} chunk(s)")
        
        # Step 4: Set stuck papers to error status
        print("\n4. Setting stuck papers to 'error' status...")
        result = conn.execute(text(
            "UPDATE research_papers "
            "SET status = 'error', chunk_count = 0 "
            "WHERE status = 'processing'"
        ))
        updated_count = result.rowcount
        print(f"   Updated {updated_count} paper(s)")
        
        # Commit changes
        conn.commit()
        
        # Step 5: Verify vector dimension
        print("\n5. Checking vector dimension...")
        result = conn.execute(text(
            "SELECT atttypmod - 4 as dimension "
            "FROM pg_attribute "
            "WHERE attrelid = 'research_paper_chunks'::regclass "
            "AND attname = 'embedding'"
        ))
        dimension = result.scalar()
        if dimension:
            status = "✓" if dimension == 2048 else "✗"
            print(f"   {status} Vector dimension: {dimension} (expected: 2048)")
        else:
            print("   ! Could not determine vector dimension")
        
        # Step 6: Final state
        print("\n6. Final papers state:")
        result = conn.execute(text(
            "SELECT status, COUNT(*) as count "
            "FROM research_papers "
            "GROUP BY status"
        ))
        statuses = result.fetchall()
        for status in statuses:
            print(f"   - {status[0]}: {status[1]} paper(s)")
        
        print("\n" + "=" * 60)
        print("✓ Cleanup complete! Refresh the Research Expert page.")
        print("  Papers in 'error' state can now be retried.")
        print("=" * 60)

if __name__ == "__main__":
    try:
        fix_stuck_papers()
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
