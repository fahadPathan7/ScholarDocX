"""Calendar models kept out of models.py (SCHOLARDOCX-0185).

app/db/models.py is already over the project's 1150-line file-size hard cap,
so new tables live here instead and register on the same declarative Base —
Base.metadata.create_all() (in connection.py) picks them up as long as this
module is imported before create_all() runs, which connection.py does.
"""
import uuid
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models import Base


class CalendarReminders(Base):
    """User-created manual calendar entries — reminders or any other date
    that doesn't come from a sheet row.

    `project_id` is NULL for a general entry added from the central Dashboard
    (shows only on the central Dashboard) or set for an entry added from
    within a specific project (shows in that project's calendar and also
    rolls up into the central Dashboard's aggregated calendar).
    """
    __tablename__ = "calendar_reminders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    project_id: Mapped[Optional[str]] = mapped_column(ForeignKey("projects.id"), nullable=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)
    reminder_date: Mapped[str] = mapped_column(Text, nullable=False)  # YYYY-MM-DD
    is_done: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class SheetCalendarItemMarks(Base):
    """Dashboard-only 'done' bookkeeping for a sheet-row-derived calendar
    date (Today / Next 10 Days checkbox). Never written back to the sheet
    row itself. Identity is the specific date *cell* (page + row position +
    column), not the date value, so editing the date later does not reset a
    user's checked state.
    """
    __tablename__ = "sheet_calendar_item_marks"
    __table_args__ = (
        UniqueConstraint("user_id", "page_id", "row_index", "date_field", name="uq_sheet_calendar_mark"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    page_id: Mapped[str] = mapped_column(ForeignKey("project_pages.id"), nullable=False)
    row_index: Mapped[int] = mapped_column(Integer, nullable=False)
    date_field: Mapped[str] = mapped_column(Text, nullable=False)
    is_done: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
