# Lumière PR #466 host GUI — Mermaid Obsidian host chrome (after, b7f2285b)

OVERALL: PASS

- after-small-flowchart-light.png: PASS — Live Preview, light theme; diagram flush under the paragraph (no large top pad), start-aligned in the column, Start/OK?/Done labels in the note face.
- after-wide-lr-start-light.png: PASS — wide LR start (玩家客户端 → 公网 CLB) sits inside the column; horizontal fence scrollbar present, diagram not clipped.
- after-wide-lr-scrolled-light.png: PASS — same note scrolled in the fence; shows gatewaysvr / activitysvr / dbsvr / gmsvr with scrollbar thumb moved.
- after-class-diagram-light.png: PASS — Animal/Dog class diagram start-aligned on the left, not centered in the column.
- after-guarded-failure-light.png: PASS — guard chrome visible; rounded host, title “Mermaid could not draw this diagram” and Allow readable, source retained.
- after-dark-invert.png: PASS — dark-theme-note.md on Default Dark Modern; CSS invert holds (dark node fills, light strokes/labels); Input → Process → Output readable.

Notes: Obsidian was minimized; shots are Cursor window captures (1920×1159). Harness `.vscode/settings.json` was set so `*.md` opens in Lumière and the workspace color theme could switch to Default Dark Modern (user settings also pin that theme). Note files were not edited. No git push.
