"""Database connection layer (PostgreSQL only).

SCHOLARDOCX-0139: this module owns engine creation, session management,
raw-connection access for the legacy SQL callers, schema creation, and seeding.

Historical note: the original codebase used SQLite with a ~580-line
``migrate_database`` function that repaired schema column-by-column via PRAGMA
introspection. That was removed — a fresh Postgres DB gets its authoritative
schema from ``Base.metadata.create_all`` plus the ON CONFLICT-based SEED_SQL,
so there is no schema history to migrate.
"""
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


# SCHOLARDOCX-0139: engine cache. Engines are expensive — each one opens its own
# connection pool. Creating one per request exhausts Supabase's pool_size: 15
# session-mode limit instantly (EMAXCONNSESSION). This cache ensures exactly one
# engine per database URL for the whole process.
_engine_cache: dict[str, Engine] = {}


def get_engine(database_url: str) -> Engine:
    """Return the singleton SQLAlchemy engine for the Postgres URL.

    The engine is created once and reused for the life of the process. The pool
    is sized to stay under Supabase's limits: pool_size=5 with max_overflow=3
    gives 8 max connections. ``pool_pre_ping`` keeps connections healthy across
    Supabase's idle timeouts.

    ``statement_cache_size=0`` disables psycopg3 prepared statements — required
    because Supabase's transaction-mode pooler (port 6543) routes each query to
    a different backend connection, so a prepared statement created on one
    connection is absent on the next (InvalidSqlStatementName).
    """
    resolved = _resolve_database_url(database_url)
    if resolved not in _engine_cache:
        _engine_cache[resolved] = create_engine(
            resolved,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=10,
            pool_timeout=30,
            connect_args={"prepare_threshold": None},
        )
    return _engine_cache[resolved]


# Cache session factories alongside engines — one sessionmaker per engine.
_SessionLocal_cache: dict[str, sessionmaker] = {}


def get_db(database_url: str):
    """FastAPI dependency yielding a SQLAlchemy Session."""
    resolved = _resolve_database_url(database_url)
    if resolved not in _SessionLocal_cache:
        _SessionLocal_cache[resolved] = sessionmaker(
            autocommit=False, autoflush=False, bind=get_engine(database_url)
        )
    db = _SessionLocal_cache[resolved]()
    try:
        yield db
    finally:
        db.close()


def connect(database_url: str):
    """Return a legacy-compatible connection for raw-SQL callers (mainly tests).

    SCHOLARDOCX-0139: test helpers and a few services historically used
    ``with connect(path) as db:`` with ``?``-params, ``lastrowid``, and
    ``row["col"]`` access. This returns a ``legacy_session`` context manager
    (see app.db.legacy_db) that transparently supports all three. Call sites
    stay byte-for-byte identical to the pre-Postgres era.

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
        # string in one execute call, so split on ';'. SEED_SQL contains no
        # triggers/function bodies/embedded ';', so naive split is safe.
        try:
            for stmt in _split_sql_script(SEED_SQL):
                if stmt.strip():
                    conn.execute(text(stmt))
        except Exception as e:
            print("Seed execution warning:", e)
        conn.execute(text("DELETE FROM app_settings WHERE key = 'jwt_secret_key'"))
        _seed_role_limits(conn)
        _seed_ai_token_defaults(conn)
        _migrate_yearly_to_quarterly(conn)
        _drop_legacy_ai_tokens_role_limit(conn)
        _add_pending_payment_column(conn)
        _add_signup_method_column(conn)
        _add_scholarship_fields_of_study_columns(conn)
        _seed_registration_mode_default(conn)
        _ensure_pgvector_extension(conn)
        _create_vector_index(conn)


def _migrate_yearly_to_quarterly(conn) -> None:
    """Rename the legacy 'yearly' billing cycle to 'quarterly' (SCHOLARDOCX-0154).

    The user-facing billing cycle changed from yearly to quarterly. Old installs
    still carry plan_price_*_yearly app_settings keys and plan_upgrade_requests
    rows with billing_cycle='yearly'. This idempotent block, run on every
    initialize_database(), drops the stale keys (the updated SEED_SQL inserts the
    *_quarterly replacements) and backfills stored request rows. Safe to repeat:
    both statements are no-ops once nothing matches.
    """
    conn.execute(
        text(
            "DELETE FROM app_settings WHERE key IN ("
            "'plan_price_general_yearly', 'plan_price_pro_yearly', 'plan_price_max_yearly'"
            ")"
        )
    )
    conn.execute(
        text("UPDATE plan_upgrade_requests SET billing_cycle = 'quarterly' WHERE billing_cycle = 'yearly'")
    )


def _drop_legacy_ai_tokens_role_limit(conn) -> None:
    """Remove the legacy ai_tokens_per_month role_limits rows (SCHOLARDOCX-0154).

    SCHOLARDOCX-0140 moved the monthly AI credit allowance from role_limits
    (feature 'ai_tokens_per_month') to app_settings keys plan_ai_credits_<tier>,
    managed in the admin Settings -> Plan Pricing table. DEFAULT_ROLE_LIMITS no
    longer seeds this feature, but upgraded installs still carry the stale row.
    This idempotent block, run on every initialize_database(), deletes it so it
    no longer appears in Role Limits. Safe to repeat: no-op once the row is gone.
    """
    conn.execute(text("DELETE FROM role_limits WHERE feature = 'ai_tokens_per_month'"))


def _add_pending_payment_column(conn) -> None:
    """Add users.pending_payment_since if missing (SCHOLARDOCX-0162).

    ``Base.metadata.create_all`` creates missing tables but does NOT add
    columns to existing tables, so upgraded Postgres installs need this ALTER.
    ``ADD COLUMN IF NOT EXISTS`` makes it safe to run on every boot. Fresh
    installs get the column from create_all and this is a no-op.
    """
    conn.execute(
        text(
            "ALTER TABLE users "
            "ADD COLUMN IF NOT EXISTS pending_payment_since TIMESTAMP"
        )
    )


def _add_signup_method_column(conn) -> None:
    """Add users.signup_method if missing (SCHOLARDOCX-0167).

    signup_method is an immutable origin fact: 'invite' | 'purchase' | 'admin'.
    Unlike roles / polar_subscription_id (mutable current-state fields), it is
    written exactly once at INSERT time and never updated afterwards. See
    Users.signup_method in models.py for the full rationale.

    Backfills existing rows: any pre-column user is assigned a value based on
    the strongest origin signal available at the time of this migration:
      - registered_with_invite_id NOT NULL  -> 'invite'
      - polar_customer_id NOT NULL          -> 'purchase'
      - otherwise                           -> 'admin'
    This matches what list_users was *trying* to compute before; running it
    once here then freezes it as a fact. New users get the column set at their
    respective INSERT site (auth.register / auth.register_paid /
    AdminService.create_user).

    ``ADD COLUMN IF NOT EXISTS`` makes this safe to run on every boot. The
    backfill UPDATE is a no-op once every row has a non-NULL value (the WHERE
    clause filters them out).
    """
    conn.execute(
        text(
            "ALTER TABLE users "
            "ADD COLUMN IF NOT EXISTS signup_method TEXT"
        )
    )
    # Backfill rows that pre-date the column. Order matters: invite is the
    # strongest signal, then polar_customer_id, then default to admin (covers
    # admin-panel-created users who have neither field set).
    conn.execute(
        text(
            "UPDATE users SET signup_method = 'invite' "
            "WHERE signup_method IS NULL AND registered_with_invite_id IS NOT NULL"
        )
    )
    conn.execute(
        text(
            "UPDATE users SET signup_method = 'purchase' "
            "WHERE signup_method IS NULL AND polar_customer_id IS NOT NULL"
        )
    )
    conn.execute(
        text(
            "UPDATE users SET signup_method = 'admin' "
            "WHERE signup_method IS NULL"
        )
    )


def _add_scholarship_fields_of_study_columns(conn) -> None:
    """Add field-of-study + relevance columns (SCHOLARDOCX-0173).

    Deep Hunt now surfaces field-of-study end-to-end so results actually match
    the user's goal (e.g. "cse background") instead of returning generic pages.
    Three columns across two tables:

    - ``scholarship_opportunities.fields_of_study_json`` — extracted fields
      (array of strings, default ``'[]'``).
    - ``scholarship_opportunities.relevance_score`` — 0..1 score from the Deep
      Hunt intent filter (default ``0``; legacy rows stay neutral).
    - ``scholarship_deep_hunt_runs.fields_of_study`` — free-text field captured
      from the Hunt Profile so the planner/filter can match against it
      (nullable; legacy runs had no field).

    ``ADD COLUMN IF NOT EXISTS`` makes this safe on every boot: fresh installs
    get the columns from ``create_all`` and this is a no-op.
    """
    conn.execute(
        text(
            "ALTER TABLE scholarship_opportunities "
            "ADD COLUMN IF NOT EXISTS fields_of_study_json TEXT NOT NULL DEFAULT '[]'"
        )
    )
    conn.execute(
        text(
            "ALTER TABLE scholarship_opportunities "
            "ADD COLUMN IF NOT EXISTS relevance_score DOUBLE PRECISION NOT NULL DEFAULT 0"
        )
    )
    conn.execute(
        text(
            "ALTER TABLE scholarship_deep_hunt_runs "
            "ADD COLUMN IF NOT EXISTS fields_of_study TEXT"
        )
    )


def _seed_registration_mode_default(conn) -> None:
    """Seed the default registration_mode app setting (SCHOLARDOCX-0162).

    Controls which registration paths are open: ``invite_only`` (legacy),
    ``invite_or_paid`` (default — both paths open), or ``paid_only`` (invite
    disabled). Idempotent: ON CONFLICT preserves any admin-chosen value.
    """
    conn.execute(
        text(
            "INSERT INTO app_settings (key, value) "
            "VALUES ('registration_mode', 'invite_or_paid') "
            "ON CONFLICT (key) DO NOTHING"
        )
    )


def _seed_role_limits(conn) -> None:
    """Seed role_limits from DEFAULT_ROLE_LIMITS (the single source of truth).

    SCHOLARDOCX-0140: role-limit defaults previously lived in two places — the
    SEED_SQL string in schema.py and DEFAULT_ROLE_LIMITS in admin.py — and they
    drifted (the schema seed was missing admin_view_dashboard,
    admin_manage_invite_requests, and others). DEFAULT_ROLE_LIMITS is now the
    authoritative source; the schema.py role_limits block was removed and this
    helper seeds every role/feature idempotently on init. ON CONFLICT DO NOTHING
    preserves any limit an admin has already customized.

    SCHOLARDOCX-0149: batched into a single executemany round-trip (was one
    INSERT per role/feature row — ~140 round-trips to Supabase's pooler).
    psycopg3 applies the ON CONFLICT clause per row within the batch.
    """
    from app.services.admin import DEFAULT_ROLE_LIMITS

    stmt = text(
        "INSERT INTO role_limits (role, feature, limit_count, reset_period) "
        "VALUES (:role, :feature, :limit_count, :reset_period) "
        "ON CONFLICT (role, feature) DO NOTHING"
    )
    rows = [
        {
            "role": role,
            "feature": feature,
            "limit_count": limit_count,
            "reset_period": reset_period,
        }
        for role, features in DEFAULT_ROLE_LIMITS.items()
        for feature, limit_count, reset_period in features
    ]
    if rows:
        conn.execute(stmt, rows)


def _split_sql_script(script: str) -> list[str]:
    """Split a multi-statement SQL script on ';' terminators."""
    return [s.strip() for s in script.split(";") if s.strip()]


# A previously-shipped, committed placeholder secret. Any install still using it
# (or a value derived from it) must be treated as publicly known and rotated.
COMPROMISED_JWT_SECRET_PREFIX = "scholar-docx-secure personal workspace"


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
        "jina-embeddings-v4": (0.02, 0.00),
    }

    model_stmt = text(
        "INSERT INTO ai_models "
        "(provider, model_id, display_name, input_price_per_1m, "
        "output_price_per_1m, is_active, sort_order) "
        "VALUES (:provider, :model_id, :display_name, :in_price, :out_price, 1, :order) "
        "ON CONFLICT (provider, model_id) DO NOTHING"
    )
    # SCHOLARDOCX-0149: collect all model rows then one batched executemany
    # (was one INSERT per model — ~17 round-trips). sort_order keeps the
    # provider/model ordering stable across the flattened list.
    model_rows = []
    order = 0
    for provider, model_ids in (
        ("glm", DEFAULT_GLM_MODELS),
        ("gemini", DEFAULT_GEMINI_MODELS),
        ("groq", DEFAULT_GROQ_MODELS),
        ("mistral", DEFAULT_MISTRAL_MODELS),
        ("openrouter", ["openrouter"]),
        ("jina", ["jina-embeddings-v4"]),
    ):
        for model_id in model_ids:
            in_price, out_price = prices.get(model_id, (0.0, 0.0))
            model_rows.append(
                {
                    "provider": provider,
                    "model_id": model_id,
                    "display_name": model_id,
                    "in_price": in_price,
                    "out_price": out_price,
                    "order": order,
                }
            )
            order += 1
    if model_rows:
        conn.execute(model_stmt, model_rows)

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
    pack_rows = [
        {
            "code": code,
            "display_name": display_name,
            "token_amount": token_amount,
            "price_usd": price_usd,
            "sort_order": sort_order,
        }
        for code, display_name, token_amount, price_usd, sort_order in packs
    ]
    if pack_rows:
        conn.execute(pack_stmt, pack_rows)


def _ensure_pgvector_extension(conn) -> None:
    """Ensure the pgvector extension is enabled (SCHOLARDOCX-0174).

    The user has already enabled this manually on Supabase. This is a safety net
    for fresh installs or test environments. ``CREATE EXTENSION IF NOT EXISTS``
    is idempotent. On Supabase (where only the dashboard can manage extensions),
    a permission error is caught and logged — the extension is already live.

    Runs inside a SAVEPOINT so a permission failure does not abort the parent
    transaction (which would cause every later DDL/seed statement to no-op).
    """
    try:
        with conn.begin_nested():
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    except Exception as e:
        # Supabase free tier may not allow CREATE EXTENSION from SQL;
        # the user enables it through the dashboard instead.
        print(f"pgvector extension note: {e} (expected on Supabase — enable via dashboard)")


def _create_vector_index(conn) -> None:
    """Create HNSW index and ensure schema columns for research_papers (SCHOLARDOCX-0174).

    Each DDL statement runs in its own SAVEPOINT so a failure on one (e.g. the
    embedding type already being vector(2048), or a missing pgvector extension)
    cannot abort the parent transaction and silently skip the later ADD COLUMN
    statements — which previously left journal_conference / publication_year /
    volume_issue_pages / doi un-created and broke paper uploads entirely.
    """
    # Migration strategy: Use 1024 dimensions for Jina AI embeddings to stay under
    # pgvector's 2000-dim limit for HNSW and IVFFlat indexes.
    # Only migrate if dimension is wrong (768 or 2048), not on every startup.
    try:
        with conn.begin_nested():
            # Check current vector dimension
            result = conn.execute(text(
                "SELECT atttypmod FROM pg_attribute "
                "WHERE attrelid = 'research_paper_chunks'::regclass "
                "AND attname = 'embedding'"
            )).scalar()
            
            # atttypmod for vector(N) is N + 4 (pgvector internal representation)
            # If the column exists and is significantly wrong, migrate
            if result is not None:
                current_dim = result - 4 if result > 4 else 768
                # Only migrate if dimension is 768 or 2048 (old configs)
                # Don't migrate for 1020-1024 range (pgvector internal variance)
                if current_dim < 1000 or current_dim > 1500:
                    print(f"Migrating research_paper_chunks embedding from vector({current_dim}) to vector(1024)...")
                    # Delete all existing chunks with wrong-dimension embeddings
                    conn.execute(text("DELETE FROM research_paper_chunks WHERE embedding IS NOT NULL"))
                    # Update all papers (both 'ready' and 'processing') to 'error' status so they can be retried
                    conn.execute(text(
                        "UPDATE research_papers SET status = 'error', chunk_count = 0 "
                        "WHERE status IN ('ready', 'processing')"
                    ))
                    # Now alter the column type to 1024 dims
                    conn.execute(text("ALTER TABLE research_paper_chunks ALTER COLUMN embedding TYPE vector(1024)"))
                    print("Migration complete: All papers set to 'error' status and must be retried with Jina 1024-dim embeddings.")
    except Exception as e:
        print(f"Vector dimension migration note: {e}")
    
    # Removed: One-time cleanup for stuck papers (now use fix_paper_status_once.py)

    for col in ["journal_conference", "publication_year", "volume_issue_pages", "doi"]:
        try:
            with conn.begin_nested():
                conn.execute(text(f"ALTER TABLE research_papers ADD COLUMN IF NOT EXISTS {col} TEXT"))
        except Exception:
            pass

    try:
        with conn.begin_nested():
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_research_chunks_embedding_hnsw "
                    "ON research_paper_chunks "
                    "USING hnsw (embedding vector_cosine_ops)"
                )
            )
    except Exception as e:
        print(f"Vector index creation note: {e}")
