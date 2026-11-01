-- SCHOLARDOCX-0209/0222: the pgvector image ships the extension but does not
-- enable it in the created database; the schema (Vector(1024)) needs it.
CREATE EXTENSION IF NOT EXISTS vector;
