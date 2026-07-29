"""Guard: a function that calls an external provider must also charge the user.

SCHOLARDOCX-0204 found eight billing leaks. Not one was "somebody forgot to
bill" — every single one had a charge helper that existed, was documented in
AI-Context, and never ran:

  - `plan(ai_service=None)` with the charge behind `if ai_service is not None`,
    and the one call site omitting the argument (L1, L2).
  - A fallback provider call added next to a billed primary, with no charge of
    its own (L3).
  - A price lookup that missed and returned $0, so a charge was "raised", a
    ledger row written, and nothing deducted (L4).
  - A helper whose entire purpose was to record a call at $0 (L5).

Code review kept missing these because the billing code was *present* — just
never on the path taken. This guard reads the path instead of the prose: if a
function talks to a provider, something in that function must take the user's
money, or it must be listed in EXEMPT with a reason.

Per BD-011 there is no category of provider call the user does not pay for, so
"background", "free tier", "fallback", and "internal" are not reasons to exempt.
The only legitimate exemptions are functions that make the call but delegate
billing to a caller that owns it.

Run from the repo root:  python3 scripts/check-provider-call-billing.py
"""
import ast
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / "backend" / "app"

# A function touching any of these is talking to somebody who bills us.
PROVIDER_HOSTS = (
    "api.tavily.com", "openrouter.ai", "api.openalex.org", "api.jina.ai",
    "generativelanguage.googleapis.com", "api.groq.com", "api.mistral.ai",
    "api.z.ai", "api.search.brave.com",
)
PROVIDER_SETTINGS_SUFFIXES = ("_api_key", "_base_url")

# Anything here means the user's balance was actually touched.
BILLING_CALLS = {
    "charge", "charge_flat_fee", "charge_tokens", "charge_external_call",
    "_charge_jina_embedding", "_ledger",
}
# Delegating the whole call to a billed funnel counts too.
BILLING_DELEGATES = {
    "chat", "research", "summarize_memory", "extract", "analyze_visual_source",
}

# Reviewed and deliberately unbilled *here* because a caller owns the charge, or
# because the function only reads configuration and makes no call at all.
# Adding a line to this dict is a decision — write down who bills instead. An
# entry that stops matching is reported as stale, so the list cannot quietly rot
# into a blanket exemption after a rename.
EXEMPT = {
    "ai.py:_chat_with_glm": "billed by AiService.chat() after the call returns",
    "ai.py:_chat_with_groq": "billed by AiService.chat()",
    "ai.py:_chat_with_gemini": "billed by AiService.chat()",
    "ai.py:_chat_with_mistral": "billed by AiService.chat()",
    "ai.py:_tavily_search": "billed by AiService.research() at the call site",
    "ai.py:_candidate_models": "reads key presence only; makes no call",
    "ai.py:_default_fast_model": "reads key presence only; makes no call",
    "ai.py:_provider_configured": "reads key presence only; makes no call",
    "config.py:__init__": "defines the settings",
    "config.py:ai_configured": "reads key presence only; makes no call",
    "config.py:chat_provider_configured": "reads key presence only; makes no call",
    "routes.py:_default_provider": "reads key presence only; makes no call",
    "workspace.py:workspace_status": "reports which keys are configured",
    "brave_search_service.py:search": "billed per hit by the Deep Hunt run loop",
    "brave_search_service.py:api_key": "property; makes no call",
    "brave_search_service.py:configured": "property; makes no call",
}


def marker_names(node):
    """Provider markers and billing markers used anywhere inside `node`."""
    provider = False
    billing = False
    for sub in ast.walk(node):
        if isinstance(sub, ast.Constant) and isinstance(sub.value, str):
            if any(host in sub.value for host in PROVIDER_HOSTS):
                provider = True
        elif isinstance(sub, ast.Attribute):
            if sub.attr.endswith(PROVIDER_SETTINGS_SUFFIXES):
                provider = True
        if isinstance(sub, ast.Call):
            fn = sub.func
            name = fn.attr if isinstance(fn, ast.Attribute) else getattr(fn, "id", "")
            if name in BILLING_CALLS or name in BILLING_DELEGATES:
                billing = True
    return provider, billing


def optional_billing_context(node):
    """An `ai_service`/`user`/`session` parameter defaulting to None.

    This is leak shape #1 (L1/L2) in its pure form: the charge sits behind a
    truthiness check on a parameter nobody is obliged to pass, so a single
    forgetful call site turns billing off with no error anywhere.
    """
    args = node.args
    named = args.args + args.kwonlyargs
    defaults = ([None] * (len(args.args) - len(args.defaults)) + list(args.defaults)
                + list(args.kw_defaults))
    for arg, default in zip(named, defaults):
        if arg.arg != "ai_service":
            continue
        if isinstance(default, ast.Constant) and default.value is None:
            return True
    return False


problems = []
used_exemptions = set()
for path in sorted(ROOT.rglob("*.py")):
    try:
        tree = ast.parse(path.read_text())
    except SyntaxError as exc:
        problems.append(f"  {path.name}: could not parse ({exc})")
        continue
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        key = f"{path.name}:{node.name}"
        if optional_billing_context(node):
            problems.append(
                f"  {key}: `ai_service` defaults to None. Make it required — an "
                f"optional billing context is how SCHOLARDOCX-0204 L1/L2 happened"
            )
        provider, billing = marker_names(node)
        if not provider or billing:
            continue
        if key in EXEMPT:
            used_exemptions.add(key)
            continue
        problems.append(
            f"  {key}: talks to a provider but never charges. Add a charge, "
            f"or add it to EXEMPT naming the caller that bills instead"
        )

# A stale exemption is a live risk, not tidiness: the function it covered was
# renamed or deleted, so whatever occupies that name next inherits a pass it was
# never reviewed for.
for key in sorted(set(EXEMPT) - used_exemptions):
    problems.append(
        f"  EXEMPT['{key}'] no longer matches anything — the function was "
        f"renamed or removed. Drop the entry or point it at the new name"
    )

if problems:
    print("PROVIDER CALL BILLING GUARD FAILED:")
    print("\n".join(sorted(set(problems))))
    print("\n  Every provider call is charged to the user who caused it (BD-011).")
    print("  'Background', 'free tier', and 'fallback' are not exemptions.")
    sys.exit(1)
print(
    f"provider call billing guard: ok — every provider call charges, "
    f"{len(used_exemptions)} reviewed exemptions"
)
