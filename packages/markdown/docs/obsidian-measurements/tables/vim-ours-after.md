
Running 96 tests using 1 worker


### A-down-into-table-goalcol-0
start: `1:0`

```
start        normal  src=1:0 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=0
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
j            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
```
(node:271869) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓   1 test/browser/vim-table-probe.spec.ts:39:7 › A-down-into-table-goalcol-0 (2.0s)

### A-down-into-table-goalcol-3
start: `1:3`

```
start        normal  src=1:3 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=1
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
j            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
```
  ✓   2 test/browser/vim-table-probe.spec.ts:39:7 › A-down-into-table-goalcol-3 (2.1s)

### A-down-into-table-goalcol-8
start: `1:8`

```
start        normal  src=1:8 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=5
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
j            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
```
  ✓   3 test/browser/vim-table-probe.spec.ts:39:7 › A-down-into-table-goalcol-8 (1.9s)

### A-down-into-table-goalcol-14
start: `1:14`

```
start        normal  src=1:14 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=4
j            normal  src=5:10 | IN-CELL Table cell 2, 2 "delta" head=0
j            normal  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=0
```
  ✓   4 test/browser/vim-table-probe.spec.ts:39:7 › A-down-into-table-goalcol-14 (1.9s)

### B-up-into-table-goalcol-0
start: `9:0`

```
start        normal  src=9:0 | outer active=DIV.cm-content
k            normal  src=8:0 | outer active=DIV.cm-content
k            normal  src=7:0 | outer active=DIV.cm-content
k            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
k            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
```
  ✓   5 test/browser/vim-table-probe.spec.ts:39:7 › B-up-into-table-goalcol-0 (2.0s)

### B-up-into-table-goalcol-3
start: `9:3`

```
start        normal  src=9:3 | outer active=DIV.cm-content
k            normal  src=8:3 | outer active=DIV.cm-content
k            normal  src=7:0 | outer active=DIV.cm-content
k            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=1
k            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
```
  ✓   6 test/browser/vim-table-probe.spec.ts:39:7 › B-up-into-table-goalcol-3 (2.0s)

### B-up-into-table-goalcol-8
start: `9:8`

```
start        normal  src=9:8 | outer active=DIV.cm-content
k            normal  src=8:8 | outer active=DIV.cm-content
k            normal  src=7:0 | outer active=DIV.cm-content
k            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=3
k            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
```
  ✓   7 test/browser/vim-table-probe.spec.ts:39:7 › B-up-into-table-goalcol-8 (2.0s)

### B-up-into-table-goalcol-14
start: `9:14`

```
start        normal  src=9:14 | outer active=DIV.cm-content
k            normal  src=8:14 | outer active=DIV.cm-content
k            normal  src=7:0 | outer active=DIV.cm-content
k            normal  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=4
k            normal  src=5:10 | IN-CELL Table cell 2, 2 "delta" head=0
```
  ✓   8 test/browser/vim-table-probe.spec.ts:39:7 › B-up-into-table-goalcol-14 (2.0s)

### C-rows-in-column-1
start: `5:10`

```
start        normal  src=5:10 | IN-CELL Table cell 2, 2 "delta" head=0
j            normal  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=0
k            normal  src=5:10 | IN-CELL Table cell 2, 2 "delta" head=0
k            normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=0
j            normal  src=5:10 | IN-CELL Table cell 2, 2 "delta" head=0
j            normal  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=0
```
  ✓   9 test/browser/vim-table-probe.spec.ts:39:7 › C-rows-in-column-1 (2.2s)

### C2-goal-column-across-cells
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
l            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=3
l            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=4
j            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
k            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
k            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=0
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
```
  ✓  10 test/browser/vim-table-probe.spec.ts:39:7 › C2-goal-column-across-cells (2.3s)

### D-horizontal-l
start: `3:2`

```
start        normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=0
l            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=1
l            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=2
l            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=3
l            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=4
l            normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=0
l            normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=1
l            normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=2
l            normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=3
```
  ✓  11 test/browser/vim-table-probe.spec.ts:39:7 › D-horizontal-l (2.5s)

### D-horizontal-h
start: `3:10`

```
start        normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=0
h            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=5
h            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=4
h            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=3
h            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=2
h            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=1
h            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=0
h            normal  src=2:0 | outer active=DIV.cm-content
h            normal  src=2:0 | outer active=DIV.cm-content
h            normal  src=2:0 | outer active=DIV.cm-content
```
  ✓  12 test/browser/vim-table-probe.spec.ts:39:7 › D-horizontal-h (2.8s)

### D-horizontal-row-end-next-row
start: `3:13`

```
start        normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=3
l            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
l            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=1
l            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
l            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=3
l            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=4
l            normal  src=5:10 | IN-CELL Table cell 2, 2 "delta" head=0
```
  ✓  13 test/browser/vim-table-probe.spec.ts:39:7 › D-horizontal-row-end-next-row (2.3s)

### D-horizontal-w-b
start: `5:2`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
w            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=4
w            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=4
w            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=4
b            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
b            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
```
  ✓  14 test/browser/vim-table-probe.spec.ts:39:7 › D-horizontal-w-b (2.1s)

### D-line-motions
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
$            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=4
0            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
^            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
$            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=4
l            normal  src=5:10 | IN-CELL Table cell 2, 2 "delta" head=0
```
  ✓  15 test/browser/vim-table-probe.spec.ts:39:7 › D-line-motions (2.2s)

### E-insert-i-before-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
i            insert  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
X            insert  src=5:2 | IN-CELL Table cell 2, 1 "gaXmma" head=3 [doc rewritten]
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gaXmma" head=2 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha  | beta  |\n| ------ | ----- |\n| gaXmma | delta |\n| eps    | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  16 test/browser/vim-table-probe.spec.ts:39:7 › E-insert-i-before-in-cell (1.8s)

### E-insert-a-after-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
a            insert  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=3
X            insert  src=5:2 | IN-CELL Table cell 2, 1 "gamXma" head=4 [doc rewritten]
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gamXma" head=3 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha  | beta  |\n| ------ | ----- |\n| gamXma | delta |\n| eps    | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  17 test/browser/vim-table-probe.spec.ts:39:7 › E-insert-a-after-in-cell (1.8s)

### E-insert-A-end-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
A            insert  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=5
X            insert  src=5:2 | IN-CELL Table cell 2, 1 "gammaX" head=6 [doc rewritten]
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gammaX" head=5 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha  | beta  |\n| ------ | ----- |\n| gammaX | delta |\n| eps    | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  18 test/browser/vim-table-probe.spec.ts:39:7 › E-insert-A-end-in-cell (1.8s)

### E-insert-I-start-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
I            insert  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
X            insert  src=5:2 | IN-CELL Table cell 2, 1 "Xgamma" head=1 [doc rewritten]
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "Xgamma" head=0 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha  | beta  |\n| ------ | ----- |\n| Xgamma | delta |\n| eps    | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  19 test/browser/vim-table-probe.spec.ts:39:7 › E-insert-I-start-in-cell (1.8s)

### E-insert-o-below-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
o            insert  src=5:2 | IN-CELL Table cell 2, 1 "gamma<br>" head=9 [doc rewritten]
X            insert  src=5:2 | IN-CELL Table cell 2, 1 "gamma<br>X" head=10 [doc rewritten]
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma<br>X" head=9 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha      | beta  |\n| ---------- | ----- |\n| gamma<br>X | delta |\n| eps        | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  20 test/browser/vim-table-probe.spec.ts:39:7 › E-insert-o-below-in-cell (1.7s)

### E-insert-O-above-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
O            insert  src=5:2 | IN-CELL Table cell 2, 1 "<br>gamma" head=0 [doc rewritten]
X            insert  src=5:2 | IN-CELL Table cell 2, 1 "X<br>gamma" head=1 [doc rewritten]
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "X<br>gamma" head=0 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha      | beta  |\n| ---------- | ----- |\n| X<br>gamma | delta |\n| eps        | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  21 test/browser/vim-table-probe.spec.ts:39:7 › E-insert-O-above-in-cell (1.7s)

### E-insert-s-char-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
s            insert  src=5:2 | IN-CELL Table cell 2, 1 "gama" head=2 [doc rewritten]
X            insert  src=5:2 | IN-CELL Table cell 2, 1 "gaXma" head=3 [doc rewritten]
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gaXma" head=2 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha | beta  |\n| ----- | ----- |\n| gaXma | delta |\n| eps   | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  22 test/browser/vim-table-probe.spec.ts:39:7 › E-insert-s-char-in-cell (1.8s)

### E-insert-cc-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
c            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
c            insert  src=5:2 | IN-CELL Table cell 2, 1 "" head=0 [doc rewritten]
X            insert  src=5:2 | IN-CELL Table cell 2, 1 "X" head=1 [doc rewritten]
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "X" head=0 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha | beta  |\n| ----- | ----- |\n| X     | delta |\n| eps   | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  23 test/browser/vim-table-probe.spec.ts:39:7 › E-insert-cc-in-cell (1.9s)

### E-insert-S-line-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
S            insert  src=5:2 | IN-CELL Table cell 2, 1 "" head=0 [doc rewritten]
X            insert  src=5:2 | IN-CELL Table cell 2, 1 "X" head=1 [doc rewritten]
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "X" head=0 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha | beta  |\n| ----- | ----- |\n| X     | delta |\n| eps   | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  24 test/browser/vim-table-probe.spec.ts:39:7 › E-insert-S-line-in-cell (1.8s)

### E-insert-arrows
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
i            insert  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
ArrowDown    insert  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
ArrowDown    insert  src=7:0 | outer active=DIV.cm-content
ArrowUp      insert  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=3 anchor=0
ArrowRight   insert  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=3
ArrowRight   insert  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=0
ArrowRight   insert  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=1
ArrowRight   insert  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=2
ArrowRight   insert  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=3
ArrowRight   insert  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=4
Escape       normal  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=3
```
  ✓  25 test/browser/vim-table-probe.spec.ts:39:7 › E-insert-arrows (3.1s)

### E-insert-tab-enter
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
i            insert  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
Tab          insert  src=5:10 | IN-CELL Table cell 2, 2 "delta" head=5 anchor=0
Tab          insert  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=3 anchor=0
Enter        insert  src=7:8 | IN-CELL Table cell 4, 1 "" head=0 [doc rewritten]
Escape       normal  src=7:8 | IN-CELL Table cell 4, 1 "" head=0 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha | beta  |\n| ----- | ----- |\n| gamma | delta |\n| eps   | zeta  |\n|       |       |\n\nprose below one here\nprose below two\n"
```
  ✓  26 test/browser/vim-table-probe.spec.ts:39:7 › E-insert-tab-enter (2.1s)

### E-normal-tab-enter
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
Tab          normal  src=5:10 | IN-CELL Table cell 2, 2 "delta" head=5 anchor=0
Tab          normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=3 anchor=0
Enter        normal  src=7:8 | IN-CELL Table cell 4, 1 "" head=0 [doc rewritten]
Shift+Tab    normal  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=4 anchor=0 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha | beta  |\n| ----- | ----- |\n| gamma | delta |\n| eps   | zeta  |\n|       |       |\n\nprose below one here\nprose below two\n"
```
  ✓  27 test/browser/vim-table-probe.spec.ts:39:7 › E-normal-tab-enter (2.0s)

### F-escape-normal-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
```
  ✓  28 test/browser/vim-table-probe.spec.ts:39:7 › F-escape-normal-in-cell (1.6s)

### F-escape-insert-then-normal
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
i            insert  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=1
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=1
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=1
```
  ✓  29 test/browser/vim-table-probe.spec.ts:39:7 › F-escape-insert-then-normal (1.9s)

### F-escape-visual
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
v            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=3 anchor=2
l            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=4 anchor=2
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=4
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=4
```
  ✓  30 test/browser/vim-table-probe.spec.ts:39:7 › F-escape-visual (1.9s)

### G-exit-down-from-last-row
start: `6:3`

```
start        normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=1
j            normal  src=7:0 | outer active=DIV.cm-content
j            normal  src=8:0 | outer active=DIV.cm-content
j            normal  src=9:0 | outer active=DIV.cm-content
```
  ✓  31 test/browser/vim-table-probe.spec.ts:39:7 › G-exit-down-from-last-row (1.8s)

### G-exit-up-from-header
start: `3:3`

```
start        normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=1
k            normal  src=2:0 | outer active=DIV.cm-content
k            normal  src=1:0 | outer active=DIV.cm-content
k            normal  src=0:0 | outer active=DIV.cm-content
```
  ✓  32 test/browser/vim-table-probe.spec.ts:39:7 › G-exit-up-from-header (1.7s)

### G-exit-down-then-back
start: `6:3`

```
start        normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=1
j            normal  src=7:0 | outer active=DIV.cm-content
k            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
k            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
```
  ✓  33 test/browser/vim-table-probe.spec.ts:39:7 › G-exit-down-then-back (1.7s)

### H-count-3j-from-prose
start: `1:3`

```
start        normal  src=1:3 | outer active=DIV.cm-content
3            normal  src=1:3 | outer active=DIV.cm-content
j            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
```
  ✓  34 test/browser/vim-table-probe.spec.ts:39:7 › H-count-3j-from-prose (1.5s)

### H-count-2j-from-blank
start: `2:0`

```
start        normal  src=2:0 | outer active=DIV.cm-content
2            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
```
  ✓  35 test/browser/vim-table-probe.spec.ts:39:7 › H-count-2j-from-blank (1.5s)

### H-count-5j-from-prose
start: `0:3`

```
start        normal  src=0:3 | outer active=DIV.cm-content
5            normal  src=0:3 | outer active=DIV.cm-content
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=1
```
  ✓  36 test/browser/vim-table-probe.spec.ts:39:7 › H-count-5j-from-prose (1.6s)

### H-count-2k-from-prose-below
start: `8:3`

```
start        normal  src=8:3 | outer active=DIV.cm-content
2            normal  src=8:3 | outer active=DIV.cm-content
k            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=1
```
  ✓  37 test/browser/vim-table-probe.spec.ts:39:7 › H-count-2k-from-prose-below (1.5s)

### H-count-4k-from-prose-below
start: `8:3`

```
start        normal  src=8:3 | outer active=DIV.cm-content
4            normal  src=8:3 | outer active=DIV.cm-content
k            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
```
  ✓  38 test/browser/vim-table-probe.spec.ts:39:7 › H-count-4k-from-prose-below (1.6s)

### H-count-2j-in-table
start: `3:3`

```
start        normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=1
2            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=1
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
```
  ✓  39 test/browser/vim-table-probe.spec.ts:39:7 › H-count-2j-in-table (1.6s)

### H-count-3k-in-table
start: `6:3`

```
start        normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=1
3            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=1
k            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
```
  ✓  40 test/browser/vim-table-probe.spec.ts:39:7 › H-count-3k-in-table (1.6s)

### H-count-9j-in-table
start: `3:3`

```
start        normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=1
9            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=1
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
```
  ✓  41 test/browser/vim-table-probe.spec.ts:39:7 › H-count-9j-in-table (1.5s)

### H-count-9k-in-table
start: `6:3`

```
start        normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=1
9            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=1
k            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
```
  ✓  42 test/browser/vim-table-probe.spec.ts:39:7 › H-count-9k-in-table (1.6s)

### I-dj-from-prose
start: `1:3`

```
start        normal  src=1:3 | outer active=DIV.cm-content
d            normal  src=1:3 | outer active=DIV.cm-content
j            normal  src=1:0 | outer active=DIV.cm-content [doc rewritten]
doc after: "prose above one here\n| alpha | beta  |\n| ----- | ----- |\n| gamma | delta |\n| eps   | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  43 test/browser/vim-table-probe.spec.ts:39:7 › I-dj-from-prose (1.6s)

### I-d2j-from-prose
start: `1:3`

```
start        normal  src=1:3 | outer active=DIV.cm-content
d            normal  src=1:3 | outer active=DIV.cm-content
2            normal  src=1:3 | outer active=DIV.cm-content
j            normal  src=1:0 | outer active=DIV.cm-content [doc rewritten]
doc after: "prose above one here\n| ----- | ----- |\n| gamma | delta |\n| eps   | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  44 test/browser/vim-table-probe.spec.ts:39:7 › I-d2j-from-prose (1.8s)

### I-dj-from-blank
start: `2:0`

```
start        normal  src=2:0 | outer active=DIV.cm-content
d            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content [doc rewritten]
doc after: "prose above one here\nprose above two\n| ----- | ----- |\n| gamma | delta |\n| eps   | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  45 test/browser/vim-table-probe.spec.ts:39:7 › I-dj-from-blank (1.5s)

### I-dk-from-blank-below
start: `7:0`

```
start        normal  src=7:0 | outer active=DIV.cm-content
d            normal  src=7:0 | outer active=DIV.cm-content
k            normal  src=6:0 | outer active=DIV.cm-content [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha | beta  |\n| ----- | ----- |\n| gamma | delta |\nprose below one here\nprose below two\n"
```
  ✓  46 test/browser/vim-table-probe.spec.ts:39:7 › I-dk-from-blank-below (1.6s)

### I-yj-from-blank
start: `2:0`

```
start        normal  src=2:0 | outer active=DIV.cm-content
y            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
G            normal  src=10:0 | outer active=DIV.cm-content
p            normal  src=11:0 | outer active=DIV.cm-content [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha | beta  |\n| ----- | ----- |\n| gamma | delta |\n| eps   | zeta  |\n\nprose below one here\nprose below two\n\n\n| alpha | beta  |"
```
  ✓  47 test/browser/vim-table-probe.spec.ts:39:7 › I-yj-from-blank (1.9s)

### I-dj-in-cell
start: `5:3`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=1
d            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=1
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "" head=0 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha | beta  |\n| ----- | ----- |\n|       | delta |\n| eps   | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  48 test/browser/vim-table-probe.spec.ts:39:7 › I-dj-in-cell (1.5s)

### I-cj-from-blank
start: `2:0`

```
start        normal  src=2:0 | outer active=DIV.cm-content
c            normal  src=2:0 | outer active=DIV.cm-content
j            insert  src=2:0 | outer active=DIV.cm-content [doc rewritten]
X            insert  src=2:1 | outer active=DIV.cm-content [doc rewritten]
Escape       normal  src=2:0 | outer active=DIV.cm-content [doc rewritten]
doc after: "prose above one here\nprose above two\nX\n| ----- | ----- |\n| gamma | delta |\n| eps   | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  49 test/browser/vim-table-probe.spec.ts:39:7 › I-cj-from-blank (1.9s)

### J-v-j-from-prose
start: `1:3`

```
start        normal  src=1:3 | outer active=DIV.cm-content
v            visual  src=1:4 sel=1:3-1:4 | outer active=DIV.cm-content
j            visual  src=2:0 sel=1:3-2:0 | outer active=DIV.cm-content
j            visual  src=3:4 sel=1:3-3:4 | outer active=DIV.cm-content
j            visual  src=4:4 sel=1:3-4:4 | outer active=DIV.cm-content
```
  ✓  50 test/browser/vim-table-probe.spec.ts:39:7 › J-v-j-from-prose (1.9s)

### J-V-j-from-prose
start: `1:3`

```
start        normal  src=1:3 | outer active=DIV.cm-content
V            visual  src=1:15 sel=1:0-1:15 | outer active=DIV.cm-content
j            visual  src=2:0 sel=1:0-2:0 | outer active=DIV.cm-content
j            visual  src=3:17 sel=1:0-3:17 | outer active=DIV.cm-content
j            visual  src=4:17 sel=1:0-4:17 | outer active=DIV.cm-content
j            visual  src=5:17 sel=1:0-5:17 | outer active=DIV.cm-content
```
  ✓  51 test/browser/vim-table-probe.spec.ts:39:7 › J-V-j-from-prose (2.0s)

### J-V-k-from-below
start: `8:3`

```
start        normal  src=8:3 | outer active=DIV.cm-content
V            visual  src=8:20 sel=8:0-8:20 | outer active=DIV.cm-content
k            visual  src=7:0 sel=8:20-7:0 | outer active=DIV.cm-content
k            visual  src=6:0 sel=8:20-6:0 | outer active=DIV.cm-content
k            visual  src=5:0 sel=8:20-5:0 | outer active=DIV.cm-content
k            visual  src=4:0 sel=8:20-4:0 | outer active=DIV.cm-content
```
  ✓  52 test/browser/vim-table-probe.spec.ts:39:7 › J-V-k-from-below (2.1s)

### J-v-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
v            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=3 anchor=2
l            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=4 anchor=2
l            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=5 anchor=2
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=5
```
  ✓  53 test/browser/vim-table-probe.spec.ts:39:7 › J-v-in-cell (1.9s)

### J-ctrlv-from-prose
start: `1:3`

```
start        normal  src=1:3 | outer active=DIV.cm-content
Control+v    visual  src=1:3 sel=1:4-1:3 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
j            visual  src=3:3 sel=3:4-3:3 | outer active=DIV.cm-content
j            visual  src=4:3 sel=4:4-4:3 | outer active=DIV.cm-content
```
  ✓  54 test/browser/vim-table-probe.spec.ts:39:7 › J-ctrlv-from-prose (1.9s)

### K-gj-from-prose
start: `1:3`

```
start        normal  src=1:3 | outer active=DIV.cm-content
g            normal  src=1:3 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
g            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=0
g            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=0
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
```
  ✓  55 test/browser/vim-table-probe.spec.ts:39:7 › K-gj-from-prose (2.2s)

### K-gk-from-prose-below
start: `8:3`

```
start        normal  src=8:3 | outer active=DIV.cm-content
g            normal  src=8:3 | outer active=DIV.cm-content
k            normal  src=7:0 | outer active=DIV.cm-content
g            normal  src=7:0 | outer active=DIV.cm-content
k            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
g            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
k            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
```
  ✓  56 test/browser/vim-table-probe.spec.ts:39:7 › K-gk-from-prose-below (2.3s)

### L-braces
start: `1:3`

```
start        normal  src=1:3 | outer active=DIV.cm-content
}            normal  src=2:0 | outer active=DIV.cm-content
}            normal  src=7:0 | outer active=DIV.cm-content
{            normal  src=2:0 | outer active=DIV.cm-content
{            normal  src=0:0 | outer active=DIV.cm-content
```
  ✓  57 test/browser/vim-table-probe.spec.ts:39:7 › L-braces (1.9s)

### L-G-gg
start: `1:3`

```
start        normal  src=1:3 | outer active=DIV.cm-content
G            normal  src=10:0 | outer active=DIV.cm-content
g            normal  src=10:0 | outer active=DIV.cm-content
g            normal  src=0:0 | outer active=DIV.cm-content
```
  ✓  58 test/browser/vim-table-probe.spec.ts:39:7 › L-G-gg (1.8s)

### L-search
start: `1:3`

```
start        normal  src=1:3 | outer active=DIV.cm-content
/            normal  src=1:3 | outer active=INPUT.
d            normal  src=1:3 | outer active=INPUT.
e            normal  src=1:3 | outer active=INPUT.
l            normal  src=1:3 | outer active=INPUT.
t            normal  src=1:3 | outer active=INPUT.
a            normal  src=1:3 | outer active=INPUT.
Enter        normal  src=5:10 | IN-CELL Table cell 2, 2 "delta" head=0
```
  ✓  59 test/browser/vim-table-probe.spec.ts:39:7 › L-search (2.4s)

### L-ctrl-d
start: `1:3`

```
start        normal  src=1:3 | outer active=DIV.cm-content
Control+d    normal  src=10:0 | outer active=DIV.cm-content
Control+u    normal  src=0:0 | outer active=DIV.cm-content
```
  ✓  60 test/browser/vim-table-probe.spec.ts:39:7 › L-ctrl-d (1.7s)

### M-x-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
x            normal  src=5:2 | IN-CELL Table cell 2, 1 "gama" head=2 [doc rewritten]
x            normal  src=5:2 | IN-CELL Table cell 2, 1 "gaa" head=2 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha | beta  |\n| ----- | ----- |\n| gaa   | delta |\n| eps   | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  61 test/browser/vim-table-probe.spec.ts:39:7 › M-x-in-cell (1.6s)

### M-dd-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
d            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
d            normal  src=5:2 | IN-CELL Table cell 2, 1 "" head=0 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha | beta  |\n| ----- | ----- |\n|       | delta |\n| eps   | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  62 test/browser/vim-table-probe.spec.ts:39:7 › M-dd-in-cell (1.6s)

### M-p-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
y            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
y            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
p            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma<br>gamma" head=14 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha          | beta  |\n| -------------- | ----- |\n| gamma<br>gamma | delta |\n| eps            | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  63 test/browser/vim-table-probe.spec.ts:39:7 › M-p-in-cell (1.8s)

### M-u-undo
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
i            insert  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
X            insert  src=5:2 | IN-CELL Table cell 2, 1 "gaXmma" head=3 [doc rewritten]
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gaXmma" head=2 [doc rewritten]
u            normal  src=3:8 | IN-CELL Table cell 2, 1 "gamma" head=2
```
  ✓  64 test/browser/vim-table-probe.spec.ts:39:7 › M-u-undo (1.9s)

### M-r-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
r            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
Q            normal  src=5:2 | IN-CELL Table cell 2, 1 "gaQma" head=2 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha | beta  |\n| ----- | ----- |\n| gaQma | delta |\n| eps   | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  65 test/browser/vim-table-probe.spec.ts:39:7 › M-r-in-cell (1.5s)

### M-dot-repeat
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
x            normal  src=5:2 | IN-CELL Table cell 2, 1 "gama" head=2 [doc rewritten]
l            normal  src=5:2 | IN-CELL Table cell 2, 1 "gama" head=3 [doc rewritten]
.            normal  src=5:2 | IN-CELL Table cell 2, 1 "gam" head=2 [doc rewritten]
l            normal  src=5:10 | IN-CELL Table cell 2, 2 "delta" head=0 [doc rewritten]
.            normal  src=5:10 | IN-CELL Table cell 2, 2 "delta" head=0 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha | beta  |\n| ----- | ----- |\n| gam   | delta |\n| eps   | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  66 test/browser/vim-table-probe.spec.ts:39:7 › M-dot-repeat (2.1s)

### M-colon-w
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
:            normal  src=5:2 | IN-CELL Markdown content "undefined" head=undefined
w            normal  src=5:2 | IN-CELL Markdown content "undefined" head=undefined
Enter        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
```
  ✓  67 test/browser/vim-table-probe.spec.ts:39:7 › M-colon-w (1.7s)

### N-l-at-last-cell-last-row
start: `6:14`

```
start        normal  src=7:0 | outer active=DIV.cm-content
l            normal  src=7:0 | outer active=DIV.cm-content
l            normal  src=7:0 | outer active=DIV.cm-content
l            normal  src=7:0 | outer active=DIV.cm-content
```
  ✓  68 test/browser/vim-table-probe.spec.ts:39:7 › N-l-at-last-cell-last-row (1.8s)

### N-h-first-cell-second-row
start: `5:2`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
h            normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=4
h            normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=3
```
  ✓  69 test/browser/vim-table-probe.spec.ts:39:7 › N-h-first-cell-second-row (1.6s)

### N-v-j-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
v            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=3 anchor=2
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=5 anchor=2
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=5 anchor=2
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=5
```
  ✓  70 test/browser/vim-table-probe.spec.ts:39:7 › N-v-j-in-cell (1.9s)

### N-V-j-in-cell
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
V            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=5 anchor=0
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=5 anchor=0
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=5 anchor=0
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=5
```
  ✓  71 test/browser/vim-table-probe.spec.ts:39:7 › N-V-j-in-cell (1.9s)

### N-v-from-cell-k
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
v            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=3 anchor=2
k            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0 anchor=3
k            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0 anchor=3
k            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0 anchor=3
```
  ✓  72 test/browser/vim-table-probe.spec.ts:39:7 › N-v-from-cell-k (1.9s)

### N-insert-j-k-not-motion
start: `5:4`

```
start        normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
i            insert  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=2
j            insert  src=5:2 | IN-CELL Table cell 2, 1 "gajmma" head=3 [doc rewritten]
k            insert  src=5:2 | IN-CELL Table cell 2, 1 "gajkmma" head=4 [doc rewritten]
Escape       normal  src=5:2 | IN-CELL Table cell 2, 1 "gajkmma" head=3 [doc rewritten]
doc after: "prose above one here\nprose above two\n\n| alpha   | beta  |\n| ------- | ----- |\n| gajkmma | delta |\n| eps     | zeta  |\n\nprose below one here\nprose below two\n"
```
  ✓  73 test/browser/vim-table-probe.spec.ts:39:7 › N-insert-j-k-not-motion (1.9s)

### O-eof-table-j-from-last-row
start: `4:3`

```
start        normal  src=4:2 | IN-CELL Table cell 2, 1 "gamma" head=1
j            normal  src=6:0 | outer active=DIV.cm-content [doc rewritten]
j            normal  src=6:0 | outer active=DIV.cm-content [doc rewritten]
j            normal  src=6:0 | outer active=DIV.cm-content [doc rewritten]
doc after: "prose before\n\n| alpha | beta  |\n| ----- | ----- |\n| gamma | delta |\n\n"
```
  ✓  74 test/browser/vim-table-probe.spec.ts:39:7 › O-eof-table-j-from-last-row (1.7s)

### O-eof-table-enter-from-above
start: `0:3`

```
start        normal  src=0:3 | outer active=DIV.cm-content
j            normal  src=1:0 | outer active=DIV.cm-content
j            normal  src=2:2 | IN-CELL Table cell 1, 1 "alpha" head=1
j            normal  src=4:2 | IN-CELL Table cell 2, 1 "gamma" head=0
j            normal  src=6:0 | outer active=DIV.cm-content [doc rewritten]
j            normal  src=6:0 | outer active=DIV.cm-content [doc rewritten]
doc after: "prose before\n\n| alpha | beta  |\n| ----- | ----- |\n| gamma | delta |\n\n"
```
  ✓  75 test/browser/vim-table-probe.spec.ts:39:7 › O-eof-table-enter-from-above (2.0s)

### O-sof-table-k-from-header
start: `0:3`

```
start        normal  src=0:2 | IN-CELL Table cell 1, 1 "alpha" head=1
k            normal  src=0:0 | outer active=DIV.cm-content [doc rewritten]
k            normal  src=0:0 | outer active=DIV.cm-content [doc rewritten]
doc after: "\n\n| alpha | beta  |\n| ----- | ----- |\n| gamma | delta |\n\nprose after\n"
```
  ✓  76 test/browser/vim-table-probe.spec.ts:39:7 › O-sof-table-k-from-header (1.6s)

### O-sof-table-enter-from-below
start: `4:3`

```
start        normal  src=4:3 | outer active=DIV.cm-content
k            normal  src=3:0 | outer active=DIV.cm-content
k            normal  src=2:2 | IN-CELL Table cell 2, 1 "gamma" head=1
k            normal  src=0:2 | IN-CELL Table cell 1, 1 "alpha" head=0
k            normal  src=0:0 | outer active=DIV.cm-content [doc rewritten]
doc after: "\n\n| alpha | beta  |\n| ----- | ----- |\n| gamma | delta |\n\nprose after\n"
```
  ✓  77 test/browser/vim-table-probe.spec.ts:39:7 › O-sof-table-enter-from-below (1.9s)

### O-only-table-j-k
start: `0:3`

```
start        normal  src=0:2 | IN-CELL Table cell 1, 1 "alpha" head=1
j            normal  src=2:2 | IN-CELL Table cell 2, 1 "gamma" head=0
j            normal  src=4:0 | outer active=DIV.cm-content [doc rewritten]
j            normal  src=4:0 | outer active=DIV.cm-content [doc rewritten]
k            normal  src=3:0 | outer active=DIV.cm-content [doc rewritten]
doc after: "| alpha | beta  |\n| ----- | ----- |\n| gamma | delta |\n\n"
```
  ✓  78 test/browser/vim-table-probe.spec.ts:39:7 › O-only-table-j-k (1.9s)

### P-down-into-header-goalcol-1
start: `1:1`

```
start        normal  src=1:1 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=0
```
  ✓  79 test/browser/vim-table-probe.spec.ts:39:7 › P-down-into-header-goalcol-1 (1.7s)

### P-down-into-header-goalcol-6
start: `1:6`

```
start        normal  src=1:6 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=4
```
  ✓  80 test/browser/vim-table-probe.spec.ts:39:7 › P-down-into-header-goalcol-6 (1.7s)

### P-down-into-header-goalcol-7
start: `1:7`

```
start        normal  src=1:7 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=5
```
  ✓  81 test/browser/vim-table-probe.spec.ts:39:7 › P-down-into-header-goalcol-7 (1.6s)

### P-down-into-header-goalcol-9
start: `1:9`

```
start        normal  src=1:9 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=0
```
  ✓  82 test/browser/vim-table-probe.spec.ts:39:7 › P-down-into-header-goalcol-9 (1.6s)

### P-down-into-header-goalcol-10
start: `1:10`

```
start        normal  src=1:10 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=0
```
  ✓  83 test/browser/vim-table-probe.spec.ts:39:7 › P-down-into-header-goalcol-10 (1.7s)

### P-down-into-header-goalcol-12
start: `1:12`

```
start        normal  src=1:12 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=2
```
  ✓  84 test/browser/vim-table-probe.spec.ts:39:7 › P-down-into-header-goalcol-12 (1.7s)

### P-down-into-header-goalcol-15
start: `1:15`

```
start        normal  src=1:15 | outer active=DIV.cm-content
j            normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=3:10 | IN-CELL Table cell 1, 2 "beta" head=4
```
  ✓  85 test/browser/vim-table-probe.spec.ts:39:7 › P-down-into-header-goalcol-15 (1.7s)

### P-down-into-header-goalcol-16
start: `1:16`

```
start        normal  src=2:0 | outer active=DIV.cm-content
j            normal  src=3:2 | IN-CELL Table cell 1, 1 "alpha" head=0
j            normal  src=5:2 | IN-CELL Table cell 2, 1 "gamma" head=0
```
  ✓  86 test/browser/vim-table-probe.spec.ts:39:7 › P-down-into-header-goalcol-16 (1.7s)

### P-up-into-last-row-goalcol-1
start: `9:1`

```
start        normal  src=9:1 | outer active=DIV.cm-content
k            normal  src=8:1 | outer active=DIV.cm-content
k            normal  src=7:0 | outer active=DIV.cm-content
k            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
```
  ✓  87 test/browser/vim-table-probe.spec.ts:39:7 › P-up-into-last-row-goalcol-1 (1.7s)

### P-up-into-last-row-goalcol-6
start: `9:6`

```
start        normal  src=9:6 | outer active=DIV.cm-content
k            normal  src=8:6 | outer active=DIV.cm-content
k            normal  src=7:0 | outer active=DIV.cm-content
k            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=3
```
  ✓  88 test/browser/vim-table-probe.spec.ts:39:7 › P-up-into-last-row-goalcol-6 (1.8s)

### P-up-into-last-row-goalcol-7
start: `9:7`

```
start        normal  src=9:7 | outer active=DIV.cm-content
k            normal  src=8:7 | outer active=DIV.cm-content
k            normal  src=7:0 | outer active=DIV.cm-content
k            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=3
```
  ✓  89 test/browser/vim-table-probe.spec.ts:39:7 › P-up-into-last-row-goalcol-7 (1.8s)

### P-up-into-last-row-goalcol-9
start: `9:9`

```
start        normal  src=9:9 | outer active=DIV.cm-content
k            normal  src=8:9 | outer active=DIV.cm-content
k            normal  src=7:0 | outer active=DIV.cm-content
k            normal  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=0
```
  ✓  90 test/browser/vim-table-probe.spec.ts:39:7 › P-up-into-last-row-goalcol-9 (1.8s)

### P-up-into-last-row-goalcol-10
start: `9:10`

```
start        normal  src=9:10 | outer active=DIV.cm-content
k            normal  src=8:10 | outer active=DIV.cm-content
k            normal  src=7:0 | outer active=DIV.cm-content
k            normal  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=0
```
  ✓  91 test/browser/vim-table-probe.spec.ts:39:7 › P-up-into-last-row-goalcol-10 (1.9s)

### P-up-into-last-row-goalcol-15
start: `9:15`

```
start        normal  src=9:15 | outer active=DIV.cm-content
k            normal  src=8:15 | outer active=DIV.cm-content
k            normal  src=7:0 | outer active=DIV.cm-content
k            normal  src=6:10 | IN-CELL Table cell 3, 2 "zeta" head=4
```
  ✓  92 test/browser/vim-table-probe.spec.ts:39:7 › P-up-into-last-row-goalcol-15 (1.8s)

### P-up-into-last-row-goalcol-16
start: `9:16`

```
start        normal  src=10:0 | outer active=DIV.cm-content
k            normal  src=9:0 | outer active=DIV.cm-content
k            normal  src=8:0 | outer active=DIV.cm-content
k            normal  src=7:0 | outer active=DIV.cm-content
```
  ✓  93 test/browser/vim-table-probe.spec.ts:39:7 › P-up-into-last-row-goalcol-16 (1.8s)

### P-delimiter-down-goal14
start: `0:14`

```
start        normal  src=0:14 | outer active=DIV.cm-content
4            normal  src=0:14 | outer active=DIV.cm-content
j            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
```
  ✓  94 test/browser/vim-table-probe.spec.ts:39:7 › P-delimiter-down-goal14 (1.6s)

### P-delimiter-up-goal14
start: `8:14`

```
start        normal  src=8:14 | outer active=DIV.cm-content
4            normal  src=8:14 | outer active=DIV.cm-content
k            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
```
  ✓  95 test/browser/vim-table-probe.spec.ts:39:7 › P-delimiter-up-goal14 (1.6s)

### P-delimiter-down-goal3-row
start: `0:3`

```
start        normal  src=0:3 | outer active=DIV.cm-content
4            normal  src=0:3 | outer active=DIV.cm-content
j            normal  src=6:2 | IN-CELL Table cell 3, 1 "eps" head=0
```
  ✓  96 test/browser/vim-table-probe.spec.ts:39:7 › P-delimiter-down-goal3-row (1.6s)

  96 passed (3.0m)
