"""Guard: don't reuse a global utility class name as a local modifier.

`styles.css` and `visual-refresh.css` define bare single-class utilities —
`.secondary`, `.primary`, `.compact` and friends — that carry real layout
(`display`, `justify-content`, `min-height`, padding...). Writing
`<div className="sticky-toolbar-row secondary">` picks all of that up, even
though the intent was only "the second row".

That is what centred the sticky-notes filter row: `.secondary` is the app's
secondary-BUTTON utility and sets `justify-content: center`. The row looked
fine until a "Clear filters" button appeared with `margin-left: auto`, which
overrode the centring — so the chips jumped left the moment a tag was picked.

Run from `frontend/`.
"""
import re, sys

GLOBAL = ["src/styles.css", "src/visual-refresh.css"]
LOCAL = ["src/components/sticky/sticky-controls.css",
         "src/components/sticky/sticky-notes.css",
         "src/components/sheet/sheet-chrome.css"]
LAYOUT = ("display", "position", "justify-content", "align-items", "margin",
          "padding", "min-height", "min-width", "width", "height",
          "border-radius", "flex")

def rules(path):
    try: css = open(path).read()
    except FileNotFoundError: return
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    yield from ((m.group(1), m.group(2)) for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', css))

utilities = {}
for f in GLOBAL:
    for sels, body in rules(f):
        for sel in sels.split(","):
            sel = sel.strip()
            if re.fullmatch(r'\.[\w-]+', sel):
                props = {p for p in LAYOUT if re.search(rf'(?:^|;)\s*{p}\s*:', body)}
                if props:
                    utilities.setdefault(sel[1:], set()).update(props)

problems = []
for f in LOCAL:
    for sels, _ in rules(f):
        for sel in sels.split(","):
            for compound in re.findall(r'\.[\w-]+(?:\.[\w-]+)+', sel):
                for part in compound.strip(".").split(".")[1:]:
                    if part in utilities:
                        problems.append(
                            f"  {f}: `.{part}` is a global utility "
                            f"(sets {', '.join(sorted(utilities[part]))}) — "
                            f"rename the modifier in `{sel.strip()}`")

if problems:
    print("CSS MODIFIER COLLISION GUARD FAILED:")
    print("\n".join(sorted(set(problems))))
    sys.exit(1)
print("css modifier guard: ok — no global utility names reused as modifiers")
