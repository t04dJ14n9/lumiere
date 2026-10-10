#!/usr/bin/env python3
"""Side-by-side crops of VSCodeVim (top) and this extension (bottom), one column per caret state."""
import json, sys
from PIL import Image, ImageDraw
blink = "solid"
V = json.load(open(f"results/vscodevim-{blink}-off.json"))["modes"]
O = json.load(open(f"results/ours-{blink}-off.json"))["modes"]
OFF = json.load(open(f"results/ours-{blink}-off.json"))["offset"]
def first(m, who):
    c = dict([c for c in m["cursors"] if c["h"] > 0][0])
    if who == "o":
        c["x"] += OFF["x"]; c["y"] += OFF["y"]
        c["y"] = int((c["y"] - (31.5 + OFF["y"])) // 24) * 24 + 31.5 + OFF["y"]
    else:
        c["y"] = int((c["y"] - 91) // 24) * 24 + 91
    return c
ZOOM = 4
CW, CH = 120, 34  # crop size in px (about 11 characters, 1.4 lines)
def crop(name, who):
    shot = Image.open(f"results/{'vscodevim' if who == 'v' else 'ours'}-{blink}-{name}.png").convert("RGB")
    c = first((V if who == 'v' else O)[name], who)
    x, y = c["x"], c["y"]
    if name.startswith(("visual", "search")) or True:
        x = max(0, x - 40)
    box = (int(x - 4), int(y - 5), int(x - 4) + CW, int(y - 5) + CH)
    return shot.crop(box).resize((CW * ZOOM, CH * ZOOM), Image.NEAREST)
def sheet(names, out, title):
    pad = 6; label = 16
    W = len(names) * (CW * ZOOM + pad); H = 2 * (CH * ZOOM + label) + 24
    img = Image.new("RGB", (W, H), (20, 20, 20)); d = ImageDraw.Draw(img)
    d.text((6, 4), title, fill=(255, 255, 255))
    for i, n in enumerate(names):
        for row, who in enumerate("vo"):
            x = i * (CW * ZOOM + pad); y = 24 + row * (CH * ZOOM + label)
            d.text((x + 2, y + 1), f"{'VSCodeVim' if who == 'v' else 'ours'}: {n}", fill=(255, 220, 90))
            img.paste(crop(n, who), (x, y + label))
    img.save(out)
    print(out, img.size)
groups = {
  "normal": ["normal-line-start", "normal-line-end", "normal-empty-line", "normal-cjk", "normal-emoji", "normal-combining"],
  "insert-replace": ["insert", "insert-at-line-end", "normal-after-esc-from-insert", "replace", "pending-r"],
  "visual": ["visual-empty", "visual-forward", "visual-backward", "visual-line"],
  "pending-prompt": ["operator-pending", "search-in-progress", "commandline"],
}
import os
os.makedirs("../screenshots/vim-caret-vs-vscodevim", exist_ok=True)
for g, names in groups.items():
    sheet(names, f"../screenshots/vim-caret-vs-vscodevim/{g}.png", f"{g} (solid blinking, 4x)")
