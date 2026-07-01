---
name: jira-manager
description: Automatically triggers when creating, updating, or managing Jira tasks and Epics in ScholarDocX. Ensures the Epic/Story hierarchy is strictly maintained.
---

# Jira Manager Skill

ScholarDocX uses a strict **Epic > Story** hierarchy for its Jira tasks in the `AI-Context/jira-tasks/` directory.

## Core Rules

1. **No Flat Files**: Never create a `.md` task file directly in the root of `jira-tasks/` (except for special templates like `task-template.md` or `epic-template.md`).
2. **Find or Create an Epic**: Every Jira task (story) must belong to an Epic folder.
   - Example Epics: `Epic-SheetRecords`, `Epic-AuthAndRBAC`, `Epic-UIThemeAndPolish`.
   - If the feature aligns with an existing Epic, put the task there.
   - If the feature is entirely new, create a new folder `Epic-[Name]/` and instantiate an `epic-template.md` inside it, named `README.md`.
3. **Use the Template**: When creating a new story, you MUST copy and fill out `task-template.md`.
4. **Link the Epic**: The top of every story must contain `Epic: [Epic-Folder-Name]`.

## Process for Creating a New Task

1. Determine the Epic.
2. If Epic doesn't exist, create it:
   ```bash
   mkdir AI-Context/jira-tasks/Epic-NewFeature
   cp AI-Context/jira-tasks/epic-template.md AI-Context/jira-tasks/Epic-NewFeature/README.md
   ```
3. Create the task inside the Epic:
   ```bash
   cp AI-Context/jira-tasks/task-template.md AI-Context/jira-tasks/Epic-NewFeature/SCHOLARDOCX-XXXX-feature-name.md
   ```
4. Fill out the task details, ensuring the `Epic:` field is set correctly.

## Process for Updating a Task

- Remember to search inside the Epic folders for the task you need to update (`grep_search` is useful here).
- Keep completion notes, tests added, and verification results up-to-date in the active task file.
