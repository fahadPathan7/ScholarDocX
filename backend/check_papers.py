#!/usr/bin/env python3
"""Check current paper status in database."""

import os
from pathlib import Path

from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

from sqlalchemy import text
from app.db.connection import get_engine

database_url = os.getenv("DATABASE_URL")
if not database_url:
    print("✗ ERROR: DATABASE_URL not found")
    exit(1)

engine = get_engine(database_url)

with engine.connect() as conn:
    print("=" * 70)
    print("Research Papers Status Check")
    print("=" * 70)
    
    # Get all papers with their actual chunk counts
    result = conn.execute(text("""
        SELECT 
            p.id,
            p.title,
            p.status,
            p.chunk_count as stored_count,
            COUNT(c.id) as actual_chunks
        FROM research_papers p
        LEFT JOIN research_paper_chunks c ON c.paper_id = p.id
        GROUP BY p.id, p.title, p.status, p.chunk_count
        ORDER BY p.created_at DESC
    """))
    
    papers = result.fetchall()
    
    if not papers:
        print("\nNo papers found.")
    else:
        print(f"\nFound {len(papers)} paper(s):\n")
        for p in papers:
            mismatch = "⚠️ MISMATCH" if p.stored_count != p.actual_chunks or (p.status == 'error' and p.actual_chunks > 0) else "✓"
            print(f"{mismatch} Paper: {p.title[:60]}")
            print(f"   ID: {p.id}")
            print(f"   Status: {p.status}")
            print(f"   Stored chunk_count: {p.stored_count}")
            print(f"   Actual chunks in DB: {p.actual_chunks}")
            print()
    
    print("=" * 70)
