"""Guard: nothing may strip the sticky row-number column's background or seam.

The row-number column is `position: sticky`. A sticky cell whose opaque
background is overridden becomes a window — the horizontally scrolling rows
show straight through it, so cell text appears to bleed across the row
numbers. Its `box-shadow` draws the seam against the scrolling cells, so
replacing that erases the column boundary.

Both regressions shipped from selectors written as `> td` / `td:first-child`,
which match the row header as well as the data cells and out-rank
`.sheet-table td.row-header`.
"""
import re, sys

def spec(sel):
    return (len(re.findall(r'#[\w-]+', sel)),
            len(re.findall(r'\.[\w-]+', sel)) + len(re.findall(r':(?!:)[\w-]+', sel)),
            len(re.findall(r'(?:^|[\s>+~])([a-zA-Z][\w-]*)', sel)))

BASE = spec(".sheet-table td.row-header")
FILES = ["src/sheet-table-polish.css", "src/components/sheet/sheet-chrome.css",
         "src/styles.css", "src/visual-refresh.css"]
GUARDED = ("background", "background-color", "box-shadow")

def hits_row_header(sel):
    last = re.split(r'\s+', sel.strip())[-1]
    if ".row-header" in last:
        return False                      # explicitly targeting it is fine
    if ".data-cell" in last or ".is-first-data-col" in last:
        return False                      # explicitly excluding it
    return bool(re.match(r'^td\b', last) or last.startswith("td:") or last == "td")

# The column defends itself with `!important` in sheet-chrome.css; this
# confirms that defence is present rather than policing every rule that
# could otherwise override it.
chrome = open("src/components/sheet/sheet-chrome.css").read()
missing = [prop for prop in ("background", "box-shadow")
           if not re.search(rf'\.sheet-table td\.row-header\s*\{{[^}}]*{prop}\s*:[^;}}]*!important', chrome, re.S)]
if missing:
    print("STICKY COLUMN GUARD FAILED:")
    print(f"  .sheet-table td.row-header must set {' and '.join(missing)} with !important")
    print("  in sheet-chrome.css, or a `... td` rule elsewhere will strip it and the")
    print("  sticky row-number column will render see-through.")
    sys.exit(1)

problems = []
for f in FILES:
    try: css = open(f).read()
    except FileNotFoundError: continue
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', css):
        for sel in m.group(1).split(","):
            sel = sel.strip()
            if not sel or "sheet-table" not in sel or not hits_row_header(sel):
                continue
            if f != "src/components/sheet/sheet-chrome.css":
                continue          # older files are covered by the !important defence
            for prop in GUARDED:
                d = re.search(rf'(?:^|;)\s*{prop}\s*:', m.group(2))
                if d and spec(sel) > BASE and "!important" not in m.group(2):
                    problems.append(f"  {f}: `{sel}` sets `{prop}` and out-ranks .sheet-table td.row-header")

if problems:
    print("STICKY COLUMN GUARD FAILED:")
    print("\n".join(sorted(set(problems))))
    sys.exit(1)
print("sticky column guard: ok — nothing overrides the row-header background or seam")
