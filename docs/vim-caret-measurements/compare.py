#!/usr/bin/env python3
"""Compares this extension's Vim caret with VSCodeVim's, per scenario (results/*.json from vscodevim.mjs and ours.mjs)."""
import json, sys
blink = sys.argv[1] if len(sys.argv) > 1 else "solid"
v = json.load(open(f"results/vscodevim-{blink}-off.json"))["modes"]
o = json.load(open(f"results/ours-{blink}-off.json"))["modes"]
V0 = None
def origin(modes, key):
    c = modes["normal-line-start"]["cursors"]
    c = [x for x in c if x["h"] > 0][0]
    return c["x"], c["y"]
vx0, vy0 = origin(v, "x"); ox0, oy0 = origin(o, "x")
def vshapes(m):
    out = []
    for c in m["cursors"]:
        if c["h"] <= 0 or "secondary" in c["cls"] and False: continue
        # native underline styles are 2px boxes whose bottom border is the visible line
        out.append(("caret", c["x"] - vx0, c["y"] - vy0, c["w"], c["h"], c["bg"]))
    for d in m.get("decorations", []):
        if d["bg"] != "rgb(174, 175, 173)": continue  # find matches and word highlights are not the caret
        out.append(("block", d["x"] - vx0, d["y"] - vy0, d["w"], d["h"], d["bg"]))
    for p in m.get("pseudo", []):
        out.append(("half", p["x"] - vx0, round((p["y"] - vy0) / 24) * 24 + 12, 10, 12, p["bg"]))
    return out
def oshapes(m):
    if m.get("style") == "half-block":
        return [("half", c["x"] - ox0, c["y"] + 12 - oy0, c["w"], 12, "rgb(174, 175, 173)") for c in m["cursors"]]
    return [("caret", c["x"] - ox0, c["y"] - oy0, c["w"], c["h"], c["bg"]) for c in m["cursors"] if c["w"] > 0]
bad = 0
for name in v:
    if name not in o: continue
    a, b = vshapes(v[name]), oshapes(o[name])
    def key(s): return (round(s[2], 0), round(s[1], 0))
    a.sort(key=key); b.sort(key=key)
    # normalise: VSCodeVim's visual block is a decoration + a 1px caret; the half block hides the underline
    if name.startswith("operator-pending"):
        a = [s for s in a if s[0] == "half"]
    summary = lambda xs: " + ".join(f"{s[0]}@{s[1]:.0f},{s[2]:.0f} {s[3]:.0f}x{s[4]:.0f}" for xs_ in [xs] for s in xs_)
    same = len(a) == len(b) and all(abs(p[1]-q[1])<=1.1 and abs(p[2]-q[2])<=1.1 and abs(p[3]-q[3])<=1.1 and abs(p[4]-q[4])<=1.1 for p, q in zip(a, b))
    if not same: bad += 1
    print(("ok   " if same else "DIFF ") + f"{name:30s} vsvim: {summary(a)}\n" + " " * 36 + f"ours : {summary(b)}")
print("differences:", bad)
