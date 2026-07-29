"""SCHOLARDOCX-0193: asymmetric retrieval embeddings.

Every paper was indexed, and every question embedded, with Jina's
`text-matching` task — the *symmetric* one, built for "is sentence A like
sentence B". Search is asymmetric: a short question against a long passage.
Jina publishes `retrieval.query` / `retrieval.passage` for that case.

The risk in this change is not the new task, it is the mixture: a query
embedded with one adapter compared against passages embedded with another does
not error, it silently returns meaningless numbers. These tests pin the pairing
rules that prevent that.
"""

from __future__ import annotations

import pytest

from app.services.research_paper_service import (
    EMBEDDING_MODEL,
    EMBEDDING_TASK_LEGACY,
    EMBEDDING_TASK_PASSAGE,
    EMBEDDING_TASK_QUERY,
    QUERY_TASK_FOR_PASSAGE_TASK,
)


def test_the_task_names_are_the_ones_jina_publishes():
    """A wrong task string would 400 every upload, not degrade gracefully."""
    assert EMBEDDING_MODEL == "jina-embeddings-v4"
    assert EMBEDDING_TASK_PASSAGE == "retrieval.passage"
    assert EMBEDDING_TASK_QUERY == "retrieval.query"
    assert EMBEDDING_TASK_LEGACY == "text-matching"


def test_a_migrated_paper_is_searched_with_the_query_task():
    assert QUERY_TASK_FOR_PASSAGE_TASK[EMBEDDING_TASK_PASSAGE] == EMBEDDING_TASK_QUERY


def test_a_legacy_paper_is_still_searched_symmetrically():
    """The whole point of tracking the task per paper.

    Papers indexed before this change hold `text-matching` vectors. Pairing
    them with a `retrieval.query` vector would compare across adapters — no
    error, just nonsense — so they keep the old pairing until re-indexed.
    """
    assert QUERY_TASK_FOR_PASSAGE_TASK[EMBEDDING_TASK_LEGACY] == EMBEDDING_TASK_LEGACY


def test_the_two_sides_of_a_migrated_search_are_never_the_same_task():
    """Asymmetric means asymmetric — if these ever match, the switch is undone."""
    assert EMBEDDING_TASK_PASSAGE != EMBEDDING_TASK_QUERY


def test_every_known_passage_task_has_a_query_pairing():
    """An unmapped task falls back to legacy at the call site; nothing should
    be relying on that fallback silently."""
    assert set(QUERY_TASK_FOR_PASSAGE_TASK) == {
        EMBEDDING_TASK_PASSAGE,
        EMBEDDING_TASK_LEGACY,
    }


@pytest.mark.parametrize(
    "stored_task,expected_query_task",
    [
        ("retrieval.passage", "retrieval.query"),
        ("text-matching", "text-matching"),
        # An unrecognised value must not be assumed migrated — falling back to
        # the legacy task at worst searches an old paper the old way, while
        # assuming the new one would compare across adapters.
        ("something-unknown", "text-matching"),
    ],
)
def test_query_task_resolution_never_assumes_migration(stored_task, expected_query_task):
    resolved = QUERY_TASK_FOR_PASSAGE_TASK.get(stored_task, EMBEDDING_TASK_LEGACY)
    assert resolved == expected_query_task


def test_the_column_default_marks_existing_rows_as_legacy():
    """The migration's default is load-bearing.

    `ADD COLUMN ... DEFAULT 'text-matching'` labels every pre-existing paper
    correctly. Defaulting to the new task instead would mark the whole library
    as migrated without re-embedding anything, and every search would then
    compare a `retrieval.query` vector against `text-matching` passages.
    """
    from app.db.models import ResearchPapers

    default = ResearchPapers.__table__.c.embedding_task.server_default
    assert "text-matching" in str(default.arg)
