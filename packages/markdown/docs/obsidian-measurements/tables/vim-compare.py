#!/usr/bin/env python3
"""Compare vim-probe.mjs output (Obsidian) with test/browser/zz-vim-table-probe.spec.ts output (ours).

usage: vim-compare.py obsidian-raw.md ours.md
Inside a cell only (mode, row, column, caret offset in the cell) are compared; our outer
`src` is the projected cell start, which is not a behavioural difference. Outside a cell
the mode, the source position and any selection are compared.
Visual line/block modes are reported as 'visual' by our probe, so all visual modes compare equal.
"""
import re, sys

def parse(path):
    cases, cur = {}, None
    for line in open(path):
        line = line.rstrip("\n")
        m = re.match(r"### (\S+)", line)
        if m:
            cur = m.group(1)
            cases.setdefault(cur, [])
            continue
        if cur is None:
            continue
        m = re.match(r"(\S+(?: \S+)?)\s+(normal|insert|visual|visual-line|visual-block)\s+src=(\d+:\d+)(?: sel=(\S+))? \| (IN-CELL|outer)(.*)", line)
        if not m:
            continue
        key, mode, src, sel, where, rest = m.groups()
        mode = "visual" if mode.startswith("visual") else mode
        if where == "IN-CELL":
            rc = re.search(r"r(\d+)c(\d+)", rest)
            if rc:
                row, col = int(rc.group(1)), int(rc.group(2))
            else:
                rc = re.search(r"Table cell (\d+), (\d+)", rest)
                row, col = (int(rc.group(1)) - 1, int(rc.group(2)) - 1) if rc else (None, None)
            head = re.search(r"head=(\d+)", rest)
            state = (mode, "cell", row, col, head.group(1) if head else None)
        else:
            state = (mode, "outer", src, sel)
        cases[cur].append((key.strip(), state))
    return cases

a, b = parse(sys.argv[1]), parse(sys.argv[2])
bad_cases = 0
for name, steps in a.items():
    other = b.get(name)
    if other is None:
        continue
    bad = [(i, s, t) for i, (s, t) in enumerate(zip(steps, other)) if s[1] != t[1]]
    if len(steps) != len(other):
        bad.append(("length", len(steps), len(other)))
    if bad:
        bad_cases += 1
        print("##", name)
        for item in bad[:3]:
            print("  ", item)
print(f"cases differing: {bad_cases} of {len(a)}")
