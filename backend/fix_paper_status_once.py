#!/usr/bin/env python3
"""
One-time fix for corrupted paper status.
This paper has chunks in 'ready' state but shows as 'error' with 0 sections.
Run once: cd backend && python fix_paper_status_once.py
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

def fix_paper_status():
    """Fix papers that have chunks but wrong status."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("✗ ERROR: DATABASE_URL not found")
        return
    
    engine = get_engine(database_url)
    
    with engine.begin() as conn:  # Use transaction
        print("=" * 60)
        print("Fix Corrupted Paper Status")
        print("=" * 60)
        
        # Find papers that have chunks but are marked as 'error' or have wrong chunk_count
        print("\n1. Checking for papers with status/chunk_count mismatch...")
        result = conn.execute(text("""
            SELECT 
                p.id,
                p.title,
                p.status,
                p.chunk_count as stored_count,
                COUNT(c.id) as actual_count
            FROM research_papers p
            LEFT JOIN research_paper_chunks c ON c.paper_id = p.id
            GROUP BY p.id, p.title, p.status, p.chunk_count
            HAVING 
                (p.status = 'error' AND COUNT(c.id) > 0) OR
                (p.chunk_count != COUNT(c.id))
        """))
        
        papers_to_fix = result.fetchall()
        
        if not papers_to_fix:
            print("   ✓ No corrupted papers found. All papers are consistent.")
            return
        
        print(f"\n   Found {len(papers_to_fix)} paper(s) with issues:")
        for paper in papers_to_fix:
            print(f"   - {paper.title[:50]}")
            print(f"     Stored: status={paper.status}, chunks={paper.stored_count}")
            print(f"     Actual: chunks={paper.actual_count}")
        
        # Fix each paper
        print("\n2. Fixing papers...")
        for paper in papers_to_fix:
            paper_id = paper.id
            actual_count = paper.actual_count
            
            if actual_count > 0:
                # Paper has chunks, set to 'ready'
                conn.execute(text(
                    "UPDATE research_papers "
                    "SET status = 'ready', chunk_count = :count "
                    "WHERE id = :id"
                ), {"count": actual_count, "id": paper_id})
                print(f"   ✓ Fixed: {paper.title[:50]} → ready, {actual_count} chunks")
            else:
                # Paper has no chunks, keep as 'error'
                conn.execute(text(
                    "UPDATE research_papers "
                    "SET chunk_count = 0 "
                    "WHERE id = :id"
                ), {"id": paper_id})
                print(f"   ✓ Fixed: {paper.title[:50]} → error, 0 chunks")
        
        print(f"\n3. Updated {len(papers_to_fix)} paper(s)")
    
    # Verify
    with engine.connect() as conn:
        print("\n4. Verification:")
        result = conn.execute(text(
            "SELECT id, title, status, chunk_count "
            "FROM research_papers "
            "ORDER BY created_at DESC "
            "LIMIT 5"
        ))
        papers = result.fetchall()
        for p in papers:
            print(f"   - {p.title[:50]}: status={p.status}, chunks={p.chunk_count}")
    
    print("\n" + "=" * 60)
    print("✓ Fix complete!")
    print("  Refresh Research Expert page to see updated status.")
    print("=" * 60)

if __name__ == "__main__":
    try:
        fix_paper_status()
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
