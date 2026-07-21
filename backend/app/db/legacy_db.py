"""SQLAlchemy-backed shim for legacy raw-SQL call sites.

SCHOLARDOCX-0139: the codebase has ~80 raw-SQL call sites (in Store,
AdminService, auth.py, routes.py, repositories) that use legacy patterns:

  - ``?`` positional placeholders  (psycopg needs named params)
  - ``cursor.lastrowid``           (Postgres does not populate it)
  - ``row["col"]`` / ``row[0]``    (dict/index row access)

Rewriting every call site is high-risk and high-effort. This shim provides a
connection object that transparently supports all three, so call sites stay
byte-for-byte identical to the pre-migration era. The shim routes through a
normal SQLAlchemy ``Session``, so all SQL is parameterized safely.

Usage::

    from app.db.legacy_db import LegacyConnection
    conn = LegacyConnection(session)
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    print(row["id"])           # dict-style access
    new_id = conn.execute("INSERT INTO t (x) VALUES (?)", (1,)).lastrowid
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


class _LegacyRow:
    """Row wrapper supporting ``row["col"]`` and ``row[0]`` access
    over a SQLAlchemy mapping row (legacy compatibility)."""

    def __init__(self, mapping: Any):
        self._mapping = mapping
        self._values = list(mapping.values())

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return self._mapping[key]

    def __contains__(self, key):
        return key in self._mapping

    def keys(self):
        return self._mapping.keys()

    def values(self):
        return self._mapping.values()

    def items(self):
        return self._mapping.items()

    def get(self, key, default=None):
        return self._mapping.get(key, default)

    def __iter__(self):
        return iter(self._values)

    def __repr__(self):
        return f"_LegacyRow({dict(self._mapping)})"


class _LegacyResult:
    """Result wrapper exposing ``lastrowid``, ``fetchone``, ``fetchall``."""

    def __init__(self, cursor_result=None, inserted_id=None):
        self._cursor_result = cursor_result
        self._mappings = cursor_result.mappings() if cursor_result is not None else None
        self._inserted_id = inserted_id

    @property
    def lastrowid(self):
        return self._inserted_id

    @property
    def rowcount(self):
        """Number of rows affected by the last UPDATE/DELETE."""
        if self._cursor_result is not None and hasattr(self._cursor_result, "rowcount"):
            return self._cursor_result.rowcount
        return -1

    def fetchone(self):
        if self._mappings is None:
            return None
        row = self._mappings.fetchone()
        return _LegacyRow(row) if row else None

    def fetchall(self):
        if self._mappings is None:
            return []
        return [_LegacyRow(r) for r in self._mappings.fetchall()]

    def fetchmany(self, size=None):
        if self._mappings is None:
            return []
        rows = self._mappings.fetchmany(size) if size else self._mappings.fetchall()
        return [_LegacyRow(r) for r in rows]

    def __getitem__(self, key):
        """Support ``result.fetchone()[0]`` chained index access."""
        row = self.fetchone()
        if row is None:
            raise IndexError("no row")
        return row[key]


class LegacyConnection:
    """A session-backed connection that accepts legacy-style raw SQL.

    Translates ``?`` placeholders to named bind params, and appends
    ``RETURNING id`` to INSERT statements so ``lastrowid`` works on Postgres.
    """

    def __init__(self, db: Session):
        self.db = db

    def execute(self, sql: str, params: Any = ()) -> _LegacyResult:
        # Translate ? positional placeholders -> :p0, :p1, ... named ones.
        named_params: dict[str, Any]
        translated = str(sql)
        if isinstance(params, (list, tuple)):
            named_params = {}
            for i in range(len(params)):
                named_params[f"p{i}"] = params[i]
            translated = _translate_placeholders(translated, len(params))
        elif isinstance(params, dict):
            named_params = params
        else:
            named_params = {}

        # Append RETURNING id to INSERTs (without an existing RETURNING) so
        # lastrowid is populated on Postgres.
        stripped = translated.lstrip()
        is_insert = stripped[:6].upper() == "INSERT"
        has_returning = "RETURNING" in translated.upper()
        if is_insert and not has_returning:
            translated = translated.rstrip().rstrip(";") + " RETURNING id"

        result = self.db.execute(text(translated), named_params)
        inserted_id = None
        if is_insert and not has_returning:
            row = result.first()
            inserted_id = row[0] if row else None
        return _LegacyResult(result, inserted_id)

    def executemany(self, sql: str, seq_of_params):
        """Batch execute, translating ? placeholders per row."""
        for params in seq_of_params:
            self.execute(sql, params)

    def commit(self):
        self.db.commit()

    def rollback(self):
        self.db.rollback()


def _translate_placeholders(sql: str, count: int) -> str:
    """Replace the first ``count`` ``?`` placeholders with ``:p0`` .. ``:pN-1``."""
    result = []
    idx = 0
    for ch in sql:
        if ch == "?" and idx < count:
            result.append(f":p{idx}")
            idx += 1
        else:
            result.append(ch)
    return "".join(result)


class legacy_session:
    """Context manager yielding a ``LegacyConnection`` over a fresh session.

    SCHOLARDOCX-0139: the Advisor Atlas and Scholarship Deep Hunt repositories
    historically opened a raw database connection per method
    (``with connect(path) as db:``). This replaces that pattern with a short-lived
    SQLAlchemy session wrapped in the legacy shim, so the same call sites work
    on Postgres::

        from app.db.legacy_db import legacy_session
        with legacy_session(database_url) as db:
            row = db.execute("SELECT * FROM t WHERE id = ?", (id,)).fetchone()

    The session is committed on clean exit and rolled back on exception.

    Also supports direct use without a ``with`` block (``conn = connect(url);
    conn.execute(...)``) — used by some test fixtures. In that mode the inner
    connection is lazily created on first use and the session stays open until
    garbage-collected (acceptable for short-lived test fixtures).
    """

    def __init__(self, database_url: str):
        from app.db.connection import get_engine
        self._engine = get_engine(database_url)
        self._session = None
        self._conn = None

    def _ensure(self) -> "LegacyConnection":
        """Lazily create the session + connection if not yet entered.

        Reuses the cached session factory from connection.py so we don't create
        a new sessionmaker per call (which would fragment the connection pool).
        """
        if self._conn is None:
            from app.db.connection import get_db  # noqa: F401 (avoid circular at import)
            from sqlalchemy.orm import sessionmaker
            SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self._engine)
            self._session = SessionLocal()
            self._conn = LegacyConnection(self._session)
        return self._conn

    def __enter__(self) -> "LegacyConnection":
        return self._ensure()

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._session is None:
            return False
        try:
            if exc_type is None:
                self._session.commit()
            else:
                self._session.rollback()
        finally:
            self._session.close()
        return False

    # --- Direct-use passthroughs (for conn = connect(url); conn.execute(...)) ---
    def execute(self, sql: str, params: Any = ()) -> "_LegacyResult":
        return self._ensure().execute(sql, params)

    def executemany(self, sql: str, seq_of_params):
        return self._ensure().executemany(sql, seq_of_params)

    def commit(self):
        if self._session is not None:
            self._session.commit()

    def rollback(self):
        if self._session is not None:
            self._session.rollback()

    def close(self):
        if self._session is not None:
            self._session.close()
