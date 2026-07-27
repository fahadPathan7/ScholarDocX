-- Manual database cleanup for Research Expert papers stuck in 'processing' state
-- Run this script against your Supabase PostgreSQL database

-- Step 1: Check current state of papers
SELECT id, title, status, chunk_count, embedding_model, created_at 
FROM research_papers 
ORDER BY created_at DESC 
LIMIT 10;

-- Step 2: Delete all chunks for papers in 'processing' state
DELETE FROM research_paper_chunks 
WHERE paper_id IN (
    SELECT id FROM research_papers WHERE status = 'processing'
);

-- Step 3: Set all 'processing' papers to 'error' status so they can be retried
UPDATE research_papers 
SET status = 'error', chunk_count = 0 
WHERE status = 'processing';

-- Step 4: Verify the fix - should show all papers as 'error' or 'ready', none as 'processing'
SELECT id, title, status, chunk_count, embedding_model 
FROM research_papers 
ORDER BY created_at DESC;

-- Step 5: Check if vector column is correct dimension (should show 2048)
SELECT 
    attname as column_name,
    atttypmod - 4 as vector_dimension
FROM pg_attribute 
WHERE attrelid = 'research_paper_chunks'::regclass 
AND attname = 'embedding';

-- Optional: If you want to completely reset and delete all papers and start fresh:
-- UNCOMMENT THE LINES BELOW ONLY IF YOU WANT TO DELETE EVERYTHING

-- DELETE FROM research_paper_chunks;
-- DELETE FROM research_papers;
-- DELETE FROM static_files WHERE file_type = 'research_paper';
