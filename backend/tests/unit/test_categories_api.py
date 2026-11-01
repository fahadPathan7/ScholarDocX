"""Route-level error mapping for document category endpoints (SCHOLARDOCX-0217).

Only a uniqueness (IntegrityError) violation may read as "Category already
exists"; any other failure must surface as itself rather than masquerading as
a user error (previously every exception on these routes produced the
duplicate-category 400, hiding real failures).
"""
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.api.routes import (
    CategoryPayload,
    create_document_category,
    rename_document_category,
)


def _integrity_error() -> IntegrityError:
    return IntegrityError("INSERT INTO document_categories", {}, Exception("UNIQUE constraint failed"))


def test_create_category_maps_integrity_error_to_duplicate_400():
    store = Mock()
    store.create_document_category.side_effect = _integrity_error()

    with pytest.raises(HTTPException) as exc:
        create_document_category(CategoryPayload(name="Duplicates"), store=store)

    assert exc.value.status_code == 400
    assert "already exists" in exc.value.detail


def test_create_category_does_not_disguise_other_failures():
    store = Mock()
    store.create_document_category.side_effect = RuntimeError("database unavailable")

    # A server-side failure must propagate (generic 500 path), not be
    # reported to the user as "Category already exists".
    with pytest.raises(RuntimeError):
        create_document_category(CategoryPayload(name="Anything"), store=store)


def test_rename_category_maps_integrity_error_to_duplicate_400():
    store = Mock()
    store.rename_document_category.side_effect = _integrity_error()

    with pytest.raises(HTTPException) as exc:
        rename_document_category("cat-id", CategoryPayload(name="Duplicates"), store=store)

    assert exc.value.status_code == 400
    assert "already exists" in exc.value.detail


def test_rename_category_does_not_disguise_other_failures():
    store = Mock()
    store.rename_document_category.side_effect = RuntimeError("database unavailable")

    with pytest.raises(RuntimeError):
        rename_document_category("cat-id", CategoryPayload(name="Anything"), store=store)
