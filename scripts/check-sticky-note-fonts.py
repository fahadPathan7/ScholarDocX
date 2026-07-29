"""Guard: a sticky note's chosen font must reach every part of the note.

The font a user picks is applied by `.font-{caveat,sans,serif,mono} X` rules in
sticky-notes.css, where X is each themed element (`.check-item`, `.sticky-body`,
`.note-title`, ...). Those selectors are only (0,2,0).

Any later rule that sets `font-family` on one of those elements with higher
specificity silently wins and the note renders in the wrong font. That is
exactly what `font: inherit` did to `.check-item` when checklist items became
buttons: the shorthand includes `font-family`, so items showed the card's
Caveat default while the body honoured the user's choice.

Run from `frontend/`.
"""
import re, sys

THEMED = ["check-item", "sticky-body", "note-title", "sticky-title-input",
          "sticky-view-title", "sticky-check-row"]
FILES = ["src/components/sticky/sticky-notes.css",
         "src/components/sticky/sticky-controls.css"]
THEME_SPEC = (0, 2, 0)          # `.font-sans .check-item`

def spec(sel):
    return (len(re.findall(r'#[\w-]+', sel)),
            len(re.findall(r'\.[\w-]+', sel)) + len(re.findall(r':(?!:)[\w-]+', sel)),
            len(re.findall(r'(?:^|[\s>+~])([a-zA-Z][\w-]*)', sel)))

problems = []
for f in FILES:
    try: css = open(f).read()
    except FileNotFoundError: continue
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', css):
        body = m.group(2)
        # `font:` shorthand sets font-family too — that is the trap.
        decl = re.search(r'(?:^|;)\s*(font-family|font)\s*:', body)
        if not decl:
            continue
        for sel in m.group(1).split(","):
            sel = sel.strip()
            if ".font-" in sel:
                continue                      # this IS a theme rule
            last = re.split(r'\s+', sel)[-1] if sel else ""
            if not any(t in last for t in THEMED):
                continue
            if spec(sel) > THEME_SPEC:
                problems.append(
                    f"  {f}: `{sel}` sets `{decl.group(1)}` at {spec(sel)} and out-ranks "
                    f"the `.font-* ...` theme rules at {THEME_SPEC}")

if problems:
    print("STICKY NOTE FONT GUARD FAILED:")
    print("\n".join(sorted(set(problems))))
    print("\n  Reset everything EXCEPT font-family, and leave the family to the")
    print("  `.font-*` rules that own it.")
    sys.exit(1)
print("sticky note font guard: ok — the chosen font reaches every themed element")
