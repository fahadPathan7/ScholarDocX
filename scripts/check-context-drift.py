"""Guard: living AI-Context must not name code that does not exist.

AI-DLC context rots in one specific way. It starts as a description of intent,
accumulates prescriptive API detail ("call `charge_ai_tokens(...)` at
`NewsService.search`"), and then the code moves. Nothing checks the context, so
the wrong names sit there being read as instructions.

SCHOLARDOCX-0205 found `charge_ai_tokens` named 21 times across AI-Context and
AGENTS.md. It has never existed — the real function is `charge`. Three of the
four "enforcement locations" the context named were fictional too. An agent
following that context writes code that cannot run; a reviewer checking code
against it reaches the wrong conclusion.

SCOPE — living context only:

  business/, functional/, technical/, workflows/, README.md, CODE_RULES.md,
  AGENTS.md, CLAUDE.md

`jira-tasks/` and `planbook/` are deliberately NOT checked. A completed task that
names a file later deleted is not drift — it is an accurate record of what was
true when the work shipped, and "fixing" it would falsify history. Living
context describes the present and must track it; task files describe a moment and
must not be edited to match a later present.

This covers the mechanical half of a context audit. Judgment questions — is this
section stale, does it contradict that one, is it duplicated — belong to the
`scholardocx-context-audit` skill, which runs this script first.

Run from the repo root:  python3 scripts/check-context-drift.py
"""
import ast
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIVING = [
    ROOT / "AI-Context" / "business",
    ROOT / "AI-Context" / "functional",
    ROOT / "AI-Context" / "technical",
    ROOT / "AI-Context" / "workflows",
    ROOT / "AI-Context" / "README.md",
    ROOT / "AI-Context" / "CODE_RULES.md",
    ROOT / "AGENTS.md",
    ROOT / "CLAUDE.md",
]
PY_ROOTS = [ROOT / "backend" / "app", ROOT / "scripts"]
WEB_ROOTS = [ROOT / "frontend" / "src"]

SOURCE_EXT = ("py", "ts", "tsx", "css", "md", "sql", "json", "yaml", "yml")
# CSS/prose that looks like a call. Every entry is a symbol we stop verifying,
# so add deliberately.
NOT_SYMBOLS = {
    "e.g", "i.e", "etc", "rgba", "rgb", "calc", "var", "clamp", "translate",
    "json", "sql", "css", "html", "url", "uri", "api", "utc", "uuid",
    "min", "max", "blur", "scale", "rotate", "cubic-bezier",
}
# Not ours to verify: language builtins, stdlib, and third-party surfaces.
VENDOR = {
    "Promise", "React", "Object", "Array", "Math", "JSON", "Date", "Number",
    "String", "Webhook", "Error", "Map", "Set", "window", "document",
    "defaultdict", "dataclass", "datetime", "timedelta", "getattr", "setattr",
    "isinstance", "createPortal", "useState", "useEffect", "useMemo",
    "useCallback", "useRef", "sessionStorage", "localStorage",
}


def py_symbols():
    """def/class/module-const names, plus `self.x = ...` attributes."""
    found = set()
    for root in PY_ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            try:
                tree = ast.parse(path.read_text())
            except (SyntaxError, UnicodeDecodeError):
                continue
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef,
                                     ast.ClassDef)):
                    found.add(node.name)
                elif isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            found.add(target.id)
                        # self.openalex_api_key = ... — Settings exposes most of
                        # its surface this way, so attribute assignment counts.
                        elif isinstance(target, ast.Attribute):
                            found.add(target.attr)
                elif isinstance(node, ast.AnnAssign):
                    if isinstance(node.target, ast.Attribute):
                        found.add(node.target.attr)
                    elif isinstance(node.target, ast.Name):
                        found.add(node.target.id)
    return found


def web_symbols():
    """Declared names and component filenames from the frontend.

    Deliberately indexes *all* declarations, not just exports: context often
    names an internal handler (`setActiveTab`) to explain how a screen behaves,
    and that reference is still worth verifying.
    """
    found = set()
    decl_re = re.compile(
        r"(?:function|const|let|class|interface|type|enum)\s+([A-Za-z_]\w*)"
    )
    # `const [activeTab, setActiveTab] = useState(...)` and `const {a, b} = ...`
    destructure_re = re.compile(r"(?:const|let)\s*[\[{]([^\]}]+)[\]}]\s*=")
    prop_re = re.compile(r"^\s*(\w+)\s*[?:]", re.M)
    for root in WEB_ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.suffix not in (".ts", ".tsx"):
                continue
            found.add(path.stem)
            try:
                text = path.read_text()
            except UnicodeDecodeError:
                continue
            found.update(decl_re.findall(text))
            for group in destructure_re.findall(text):
                found.update(
                    part.strip().split(":")[-1].strip()
                    for part in group.split(",")
                    if part.strip()
                )
            # Interface/type members, so `SomeType.someField` resolves.
            found.update(prop_re.findall(text))
    return found


def db_tables():
    """Table names, so `some_table(col, col)` in a schema note is not read as a
    function call."""
    found = set()
    for name in ("backend/app/db/models.py", "backend/app/db/schema.py"):
        path = ROOT / name
        if not path.exists():
            continue
        text = path.read_text()
        found.update(re.findall(r'__tablename__\s*=\s*["\'](\w+)["\']', text))
        found.update(re.findall(r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)", text))
    return found


def repo_paths():
    skip = {".git", "node_modules", "__pycache__", ".venv", "dist", "build"}
    return {
        str(p.relative_to(ROOT))
        for p in ROOT.rglob("*")
        if not any(part in skip for part in p.parts)
    }


def living_docs():
    for target in LIVING:
        if target.is_file():
            yield target
        elif target.is_dir():
            yield from sorted(target.rglob("*.md"))


SYMBOLS = py_symbols() | web_symbols() | db_tables() | VENDOR
PATHS = repo_paths()

CALL_RE = re.compile(r"`([a-z_][\w]*)\([^`]*\)`")
DOTTED_RE = re.compile(r"`([A-Z][\w]*)\.([a-z_][\w]*)(\(\))?`")
PATHY_RE = re.compile(r"`([\w./-]+/[\w./-]+\.(?:" + "|".join(SOURCE_EXT) + r"))`")
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)#]+?)(?:#[^)]*)?\)")

# Living context legitimately names things that no longer exist — "we deleted
# X", "Y superseded Z" — and those notes are valuable: they stop the next agent
# reinventing something that was removed on purpose. Such a line is not
# prescribing the symbol, so it is not drift. Requiring the sentence to say so
# in plain words means the guard rewards explaining the removal rather than
# fighting it.
REMOVED_MARKERS = (
    "deleted", "removed", "supersede", "no longer", "used to", "previously",
    "retired", "replaced", "~~", "does not exist", "never existed",
)


def is_removal_note(block: str) -> bool:
    return any(marker in block.lower() for marker in REMOVED_MARKERS)


problems = []
for doc in living_docs():
    rel = doc.relative_to(ROOT)
    text = doc.read_text()
    # Paragraph, not line. A removal note is usually a bullet or a struck-out
    # block spanning several lines ("~~old claim~~\nSUPERSEDED: ..."), so a
    # line-scoped check would miss the marker sitting one line away and force
    # the doc to be reworded worse. A reference is drift only if it appears in
    # at least one block that says nothing about being gone.
    blocks = re.split(r"\n\s*\n", text)

    def is_prescriptive(fragment: str) -> bool:
        hits = [b for b in blocks if fragment in b]
        return any(not is_removal_note(b) for b in hits) if hits else True

    for target in LINK_RE.findall(text):
        if target.startswith(("http://", "https://", "mailto:")):
            continue
        if not (doc.parent / target).resolve().exists():
            problems.append(f"  {rel}: broken link -> {target}")

    for candidate in PATHY_RE.findall(text):
        if any(p.endswith(candidate) for p in PATHS):
            continue
        if not is_prescriptive(candidate):
            continue
        problems.append(f"  {rel}: names a file that does not exist -> {candidate}")

    for cls, member, _parens in DOTTED_RE.findall(text):
        # `Foo.tsx` / `Foo.py` is a filename, not an attribute reference.
        if member in SOURCE_EXT:
            continue
        if cls in VENDOR:
            continue  # third-party surface; not ours to verify
        if not is_prescriptive(f"{cls}.{member}"):
            continue
        if cls not in SYMBOLS:
            problems.append(f"  {rel}: unknown symbol -> {cls}.{member}")
        elif member not in SYMBOLS:
            problems.append(f"  {rel}: {cls} has no member -> {member}")

    for name in CALL_RE.findall(text):
        if name in NOT_SYMBOLS or len(name) < 4:
            continue
        if name in SYMBOLS:
            continue
        if not is_prescriptive(f"{name}("):
            continue
        problems.append(f"  {rel}: unknown function -> {name}()")

if problems:
    unique = sorted(set(problems))
    print("CONTEXT DRIFT GUARD FAILED:")
    print("\n".join(unique))
    print(f"\n  {len(unique)} reference(s) in living context point at code or")
    print("  files that do not exist. Context is read as instructions — correct")
    print("  the reference, or delete the claim if the behaviour is gone.")
    sys.exit(1)
print(
    f"context drift guard: ok — every path, link, and symbol in living context "
    f"resolves ({len(SYMBOLS)} symbols indexed)"
)
