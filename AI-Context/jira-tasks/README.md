# Jira Tasks

This folder stores task files for AI-DLC execution.

## Purpose

Each coding task should have a Jira-style Markdown file before implementation starts.

The task file gives future AI agents:

- Scope
- Context links
- Acceptance criteria
- Implementation notes
- File-size considerations
- Verification steps
- Completion notes

## Files

- [task-template.md](task-template.md): template for new tasks.
- [epic-template.md](epic-template.md): template for new Epic README files.
- `Epic-*/README.md`: Epic summaries.
- `Epic-*/SCHOLARDOCX-####-slug.md`: story files. New work must use this nested shape.
- [Epic-ProjectFoundation/backlog.md](Epic-ProjectFoundation/backlog.md): initial task backlog.

## Task Statuses

- Draft
- Ready
- In Progress
- Blocked
- Review
- Done

## Required Rule

For new features or feature modifications:

1. Update context first.
2. Create or update a Jira task file.
3. Execute code from the Jira task.
4. Update the task when complete.

Do not create new story files directly in `AI-Context/jira-tasks/`; only templates and this index belong at the root.
