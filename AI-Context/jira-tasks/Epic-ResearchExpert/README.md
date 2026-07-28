# Epic-ResearchExpert

Status: Draft

Owner: AI Agent

Created: 2026-07-27

## Goal

Enable students and researchers to efficiently analyze academic research papers through an AI-powered single-paper analysis workspace. Users can upload one paper at a time and use predefined analytical prompts to understand methodology, results, model structure, and key findings without manually reading dense academic text.

**Prerequisites**: The pgvector PostgreSQL extension has been enabled on Supabase (completed by user). All implementation work will be handled by AI agents following the AI-DLC workflow.

## Scope

In scope:
- Single-paper upload and text extraction
- Vector-based semantic search within the paper
- Predefined analytical prompts (methodology, results, model structure, limitations, key findings)
- AI-powered paper analysis using GLM/Gemini
- Per-user paper storage and history
- Integration with existing AI token economy

Out of scope:
- Multi-paper comparison or batch analysis
- Citation network analysis
- Automatic reference management
- Paper recommendation system
- External academic database integration (Google Scholar, arXiv, etc.)
- Collaborative annotation features

## Success Metrics

How do we know this Epic is completed successfully?
- Users can upload a research paper and receive analysis within 30 seconds
- Vector search returns relevant sections with >80% accuracy
- At least 5 predefined prompts cover common research analysis needs
- Feature respects existing 10MB file upload limit
- Feature follows user-scoped data isolation rules
- pgvector extension successfully enabled on Supabase

## Stories

List the individual Jira stories (features) that belong to this Epic.
- [ ] SCHOLARDOCX-0174: Research Expert - Single Paper Analysis Workspace
