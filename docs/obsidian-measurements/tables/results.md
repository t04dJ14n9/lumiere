# Raw output (Obsidian 1.14.4, 2026-10-10)

## buttons-and-shift-enter.mjs
```text
page.click row-btn box             {"x":376,"y":309.015625,"width":165.71875,"height":16}
page.click row-btn focus           "TD r2TBODY c0 text=\"\" active=DIV.cm-content cm-lineWrapping"
page.click row-btn source          "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| 4   |  5  |   6 |\n|     |     |     |\n\nafter"
mouse down/up row-btn box          {"x":376,"y":309.015625,"width":165.71875,"height":16}
mouse down/up row-btn focus        "TD r2TBODY c0 text=\"\" active=DIV.cm-content cm-lineWrapping"
mouse down/up row-btn source       "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| 4   |  5  |   6 |\n|     |     |     |\n\nafter"
dispatch click row-btn box         {"x":376,"y":309.015625,"width":165.71875,"height":16}
dispatch click row-btn focus       "TD r2TBODY c0 text=\"\" active=DIV.cm-content cm-lineWrapping"
dispatch click row-btn source      "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| 4   |  5  |   6 |\n|     |     |     |\n\nafter"
page.click col-btn box             {"x":541.71875,"y":218.625,"width":16,"height":90.390625}
page.click col-btn focus           "TH r0THEAD c3 text=\"\" active=DIV.cm-content cm-lineWrapping"
page.click col-btn source          "| a   |  b  |   c |     |\n| --- | :-: | --: | --- |\n| 1   |  2  |   3 |     |\n| 4   |  5  |   6 |     |\n\nafter\n"
mouse down/up col-btn box          {"x":541.71875,"y":218.625,"width":16,"height":90.390625}
mouse down/up col-btn focus        "TH r0THEAD c3 text=\"\" active=DIV.cm-content cm-lineWrapping"
mouse down/up col-btn source       "| a   |  b  |   c |     |\n| --- | :-: | --: | --- |\n| 1   |  2  |   3 |     |\n| 4   |  5  |   6 |     |\n\nafter\n"
dispatch click col-btn box         {"x":541.71875,"y":218.625,"width":16,"height":90.390625}
dispatch click col-btn focus       "TH r0THEAD c3 text=\"\" active=DIV.cm-content cm-lineWrapping"
dispatch click col-btn source      "| a   |  b  |   c |     |\n| --- | :-: | --: | --- |\n| 1   |  2  |   3 |     |\n| 4   |  5  |   6 |     |\n\nafter\n"
shift+enter source                 "| a      |  b  |   c |\n| ------ | :-: | --: |\n| 1<br>x |  2  |   3 |\n| 4      |  5  |   6 |\n"
shift+enter focus                  "TD r0TBODY c0 text=\"11x\" active=DIV.cm-content cm-lineWrapping"
```

## drag-undo-width.mjs
```text
drag row1 -> row2 source           "| a   |  b  |   c |\n| --- | :-: | --: |\n| 4   |  5  |   6 |\n| 1   |  2  |   3 |"
drag row focus                     "TD r1TBODY c0 text=\"11\" active=DIV.cm-content cm-lineWrapping"
drag col a -> c source             "|  b  |   c | a   |\n| :-: | --: | --- |\n|  2  |   3 | 1   |\n|  5  |   6 | 4   |"
drag col focus                     "TH r0THEAD c2 text=\"aa\" active=DIV.cm-content cm-lineWrapping"
col grip click: focus              "TH r0THEAD c1 text=\"bb\" active=DIV.cm-content cm-lineWrapping"
col grip click: selected classes   ["TH.mod-active-row-handle","TH.mod-active-col-handle is-selected mod-dragging start end top","DIV.cm-editor cm-focused ͼ1 ͼ2 ","DIV.cm-line cm-active","DIV.cm-layer cm-selectionLayer","TD.is-selected mod-dragging start end","TD.is-selected mod-dragging start end
col grip click: selection          ["",1]
typed abc                          "| a    |  b  |   c |\n| ---- | :-: | --: |\n| 1abc |  2  |   3 |"
undo 1                             "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |"
undo 2                             "| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |"
redo 1                             "| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |"
A tab B                            "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1A  |  B  |   3 |"
undo ->                            "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1A  |  2  |   3 |"
focus                              "TD r0TBODY c1 text=\"22\" active=DIV.cm-content cm-lineWrapping"
undo ->                            "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |"
focus                              "TD r0TBODY c0 text=\"11\" active=DIV.cm-content cm-lineWrapping"
undo add row                       "| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n"
focus                              "BODY.mod-linux is-frameless is-hidden-frameless obsidian-app styled-scrollbars theme-light show-inline-title is-floating-nav auto-full-screen show-ribbon show-view-header is-focused"
cell text "中文"                     "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| 中文  |  5  |   6 |"
cell text "😀"                     "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| 😀  |  5  |   6 |"
cell text "é"                     "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| é  |  5  |   6 |"
cell text "👨‍👩‍👧"               "| a        |  b  |   c |\n| -------- | :-: | --: |\n| 1        |  2  |   3 |\n| 👨‍👩‍👧 |  5  |   6 |"
cell text "a\tb"                   "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| a\tb |  5  |   6 |"
```

## ime.mjs
```text
composing n: source                "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| 4n  |  5  |   6 |"
composing n: focus                 "TD r1TBODY c0 text=\"44n\" active=DIV.cm-content cm-lineWrapping"
composing ni: source               "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| 4ni |  5  |   6 |"
committed: source                  "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| 4你  |  5  |   6 |"
committed: focus                   "TD r1TBODY c0 text=\"44你\" active=DIV.cm-content cm-lineWrapping"
```

## format-on-focus-undo.mjs
```text
initial                            "| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |"
after click                        "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| 4   |  5  |   6 |"
after Tab                          "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| 4   |  5  |   6 |"
after typing Z                     "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  Z  |   3 |\n| 4   |  5  |   6 |"
undo1                              "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| 4   |  5  |   6 |"
undo2                              "| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |"
typed 11 chars, undo1              "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| 4   |  5  |   6 |"
```

