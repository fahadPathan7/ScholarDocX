"""Database connection layer (PostgreSQL only).

SCHOLARDOCX-0139: SQLite support was removed in favor of a single PostgreSQL
dialect (hosted Supabase for the app and the test suite). This module owns
engine creation, session management, raw-connection access for the legacy
SQL callers, schema creation, and seeding.

Historical note: a ~580-line ``migrate_database`` function repaired old SQLite
files column-by-column via PRAGMA introspection. It is gone — a fresh Postgres
DB gets its authoritative schema from ``Base.metadata.create_all`` plus the
ON CONFLICT-based SEED_SQL, so there is no schema history to migrate.
"""

import secrets

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from app.db.schema import SEED_SQL
from app.db.models import Base


def _resolve_database_url(database_url: str) -> str:
    """Normalize the Postgres URL so SQLAlchemy uses psycopg3.

    A bare ``postgresql://`` is converted to ``postgresql+psycopg://`` so
    SQLAlchemy binds psycopg3 (the driver we install; psycopg2 has no Python
    3.13 wheel). ``postgresql+psycopg://`` and other explicit ``postgresql+``
    schemes are returned untouched.
    """
    value = str(database_url)
    if value.startswith("postgresql://"):
        return "postgresql+psycopg://" + value[len("postgresql://"):]
    if value.startswith("postgresql+"):
        return value
    raise ValueError(
        f"DATABASE_URL must be a PostgreSQL connection string, got: {value!r}"
    )


def get_engine(database_url: str) -> Engine:
    """Create the SQLAlchemy engine for the Postgres URL.

    ``pool_pre_ping`` keeps connections healthy across Supabase's idle
    timeouts; the default QueuePool is correct for a server process.
    """
    return create_engine(_resolve_database_url(database_url), pool_pre_ping=True)


def get_db(database_url: str):
    """FastAPI dependency yielding a SQLAlchemy Session."""
    engine = get_engine(database_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def connect(database_url: str):
    """Return a legacy-compatible connection for raw-SQL callers (mainly tests).

    SCHOLARDOCX-0139: test helpers and a few services historically used
    ``with connect(path) as db:`` expecting a stdlib ``sqlite3.Connection``
    with ``?``-params, ``lastrowid``, and ``row["col"]`` access. Postgres has
    no stdlib driver, so this returns a ``legacy_session`` context manager
    (see app.db.legacy_db) that transparently supports all three. Call sites
    stay byte-for-byte identical to the SQLite era.

    App-layer code now uses Store.legacy_connection / AdminService.connection /
    legacy_session directly; this entry point is retained for tests and scripts.
    """
    from app.db.legacy_db import legacy_session
    return legacy_session(database_url)


def initialize_database(database_url: str) -> None:
    """Create all tables and seed defaults on a fresh Postgres database.

    Order: create_all (authoritative schema) -> SEED_SQL (workspaces, role
    limits, app settings, admin user) -> JWT secret provisioning -> AI model
    and token-pack defaults. All inserts are idempotent via ON CONFLICT.
    """
    engine = get_engine(database_url)
    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        # SEED_SQL is multi-statement; psycopg cannot run a whole multi-statement
        # string the way sqlite3 executescript did, so split on ';'. SEED_SQL
        # contains no triggers/function bodies/embedded ';', so naive split is safe.
        try:
            for stmt in _split_sql_script(SEED_SQL):
                if stmt.strip():
                    conn.execute(text(stmt))
        except Exception as e:
            print("Seed execution warning:", e)
        _ensure_jwt_secret(conn)
        _seed_ai_token_defaults(conn)


def _split_sql_script(script: str) -> list[str]:
    """Split a multi-statement SQL script on ';' terminators."""
    return [s.strip() for s in script.split(";") if s.strip()]


# A previously-shipped, committed placeholder secret. Any install still using it
# (or a value derived from it) must be treated as publicly known and rotated.
COMPROMISED_JWT_SECRET_PREFIX = "scholar-docx-secure personal workspace"


def _ensure_jwt_secret(conn) -> None:
    """Guarantee a strong, unique JWT signing secret for this install.

    Generates a random secret on first init and stores it in app_settings. If a
    previous install was seeded with the committed placeholder constant, the
    secret is rotated so any token signed with the public value (including
    forged super_admin tokens) stops validating.
    """
    row = conn.execute(
        text("SELECT value FROM app_settings WHERE key = 'jwt_secret_key'")
    ).fetchone()
    current = row[0] if row else None
    if (
        not current
        or str(current).strip() == ""
        or str(current).startswith(COMPROMISED_JWT_SECRET_PREFIX)
    ):
        conn.execute(
            text(
                "INSERT INTO app_settings (key, value) VALUES ('jwt_secret_key', :secret) "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
            ),
            {"secret": secrets.token_hex(32)},
        )


def _seed_ai_token_defaults(conn) -> None:
    """Seed default AI models and token packs (idempotent).

    Models are seeded from the provider model lists in app.services.ai with $0
    pricing until a super_admin sets real values. ON CONFLICT DO NOTHING ensures
    admin edits are never clobbered. Runs during initialize_database alongside
    the other seeds.
    """
    from app.services.ai import (
        DEFAULT_GLM_MODELS,
        DEFAULT_GEMINI_MODELS,
        DEFAULT_GROQ_MODELS,
        DEFAULT_MISTRAL_MODELS,
    )

    prices = {
        "gemini-2.5-flash": (0.075, 0.30),
        "gemini-2.5-flash-lite": (0.0375, 0.15),
        "GLM-5.2": (2.00, 4.00),
        "GLM-5.1": (1.00, 2.00),
        "GLM-5": (1.00, 2.00),
        "GLM-5-Turbo": (0.50, 1.00),
        "GLM-4.7": (0.20, 0.40),
        "openai/gpt-oss-120b": (0.80, 0.80),
        "groq/compound": (0.50, 0.50),
        "llama-3.3-70b-versatile": (0.59, 0.79),
        "qwen/qwen3-32b": (0.70, 0.80),
        "meta-llama/llama-4-scout-17b-16e-instruct": (0.20, 0.20),
        "openai/gpt-oss-20b": (0.20, 0.20),
        "mistral-large-latest": (2.00, 6.00),
        "mistral-medium-3-5": (0.50, 1.50),
        "devstral-2512": (0.20, 0.60),
        "openrouter": (0.08, 0.20),
    }

    model_stmt = text(
        "INSERT INTO ai_models "
        "(provider, model_id, display_name, input_price_per_1m, "
        "output_price_per_1m, is_active, sort_order) "
        "VALUES (:provider, :model_id, :display_name, :in_price, :out_price, 1, :order) "
        "ON CONFLICT (provider, model_id) DO NOTHING"
    )
    order = 0
    for provider, model_ids in (
        ("glm", DEFAULT_GLM_MODELS),
        ("gemini", DEFAULT_GEMINI_MODELS),
        ("groq", DEFAULT_GROQ_MODELS),
        ("mistral", DEFAULT_MISTRAL_MODELS),
        ("openrouter", ["openrouter"]),
    ):
        for model_id in model_ids:
            in_price, out_price = prices.get(model_id, (0.0, 0.0))
            conn.execute(
                model_stmt,
                {
                    "provider": provider,
                    "model_id": model_id,
                    "display_name": model_id,
                    "in_price": in_price,
                    "out_price": out_price,
                    "order": order,
                },
            )
            order += 1

    pack_stmt = text(
        "INSERT INTO ai_token_packs "
        "(code, display_name, token_amount, price_usd, is_active, sort_order) "
        "VALUES (:code, :display_name, :token_amount, :price_usd, 1, :sort_order) "
        "ON CONFLICT (code) DO NOTHING"
    )
    packs = (
        ("small", "Small", 100000, 10, 1),
        ("medium", "Medium", 500000, 40, 2),
        ("large", "Large", 1500000, 100, 3),
        ("extra_large", "Extra Large", 5000000, 300, 4),
    )
    for code, display_name, token_amount, price_usd, sort_order in packs:
        conn.execute(
            pack_stmt,
            {
                "code": code,
                "display_name": display_name,
                "token_amount": token_amount,
                "price_usd": price_usd,
                "sort_order": sort_order,
            },
        )
