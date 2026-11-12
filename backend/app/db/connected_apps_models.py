"""Connected-apps tables, kept out of models.py (SCHOLARDOCX-0258).

app/db/models.py is over the project's file-size cap, so new tables live in a
side module and register on the same declarative Base, like calendar_models.py.
``Base.metadata.create_all()`` (connection.py) creates them as long as this
module is imported first, which connection.py does. They are new tables, so no
``_add_*`` migration is needed. Foreign keys cascade at the column level (the
advisor_atlas_* precedent) so deleting a user removes their keys and suggestions.
"""
import uuid
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models import Base


class ConnectedApps(Base):
    """One access key a user created for an external AI app.

    Only the SHA-256 hash of the key is stored (the key is high-entropy random),
    plus a short prefix for display. ``token_version`` snapshots the user's
    session version so password change, admin reset, suspension and admin
    revocation invalidate the key exactly like a session token.
    """
    __tablename__ = "connected_apps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    scope: Mapped[str] = mapped_column(String(20), nullable=False)  # read | read_suggest
    token_version: Mapped[int] = mapped_column(nullable=False, server_default=text("1"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("idx_connected_apps_user", "user_id"),)


class ConnectedAppSuggestions(Base):
    """A change an external app proposed; nothing runs until the user confirms.

    ``plan_json`` is the server-normalized plan. Confirming loads it by id, so
    the client never resends (and cannot alter) what will run.
    Status: pending | running | confirmed | dismissed | failed | expired.
    """
    __tablename__ = "connected_app_suggestions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    connected_app_id: Mapped[str] = mapped_column(ForeignKey("connected_apps.id", ondelete="CASCADE"), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    plan_json: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, server_default=text("'pending'"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False)
    decided_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    result_message: Mapped[Optional[str]] = mapped_column(Text)

    __table_args__ = (Index("idx_connected_app_suggestions_user_status", "user_id", "status"),)
