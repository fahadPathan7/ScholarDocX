# Fix Stuck Research Expert Papers

Your paper is stuck in "processing" state. Here are **three options** to fix it:

---

## Option 1: Run Python Script (RECOMMENDED)

This is the easiest and safest option.

```bash
cd /Users/fahadpathan/Documents/ScholarDocX
python fix_stuck_papers.py
```

The script will:
- Show current paper states
- Delete chunks for stuck papers
- Set stuck papers to 'error' status (allowing retry)
- Verify vector dimensions
- Show final status

After running, refresh the Research Expert page and click the retry button.

---

## Option 2: Run SQL Script via Supabase Dashboard

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy and paste the contents of `fix_stuck_papers.sql`
4. Execute the script step by step (or all at once)

---

## Option 3: Direct SQL Commands

If you have direct database access, run these commands:

```sql
-- Delete chunks for stuck papers
DELETE FROM research_paper_chunks 
WHERE paper_id IN (
    SELECT id FROM research_papers WHERE status = 'processing'
);

-- Fix stuck papers
UPDATE research_papers 
SET status = 'error', chunk_count = 0 
WHERE status = 'processing';

-- Verify
SELECT id, title, status, chunk_count 
FROM research_papers 
ORDER BY created_at DESC;
```

---

## Option 4: Complete Reset (Nuclear Option)

⚠️ **WARNING**: This deletes ALL papers and starts fresh!

```sql
DELETE FROM research_paper_chunks;
DELETE FROM research_papers;
DELETE FROM static_files WHERE file_type = 'research_paper';
```

---

## After Cleanup

1. **Restart backend server** (if not already running)
2. **Refresh Research Expert page** in browser
3. **Paper should show 'error' status** with a retry button
4. **Click retry** to regenerate embeddings with Jina AI

---

## What Was Fixed

The issue was caused by a migration from 768-dim (Gemini) to 2048-dim (Jina) embeddings. Papers uploaded during this transition got stuck in "processing" state.

The cleanup:
- Removes incomplete chunks
- Sets papers to 'error' so retry is enabled
- Allows fresh processing with correct 2048-dim Jina embeddings

---

## Need Help?

If issues persist after cleanup:
1. Check backend logs for errors
2. Verify `JINA_API_KEY` is set in `.env`
3. Ensure vector column is 2048 dimensions (last query in SQL script)
