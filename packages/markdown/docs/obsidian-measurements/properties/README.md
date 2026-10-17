# Properties: where the caret and focus go (Obsidian 1.14.4)

`caret-and-properties.mjs` drives a real Obsidian 1.14.4 (Electron,
`--remote-debugging-port=9333 --no-sandbox --disable-gpu`, visible X display)
with real key and mouse events over the DevTools protocol, in the disposable
vault `/tmp/obsidian-test-vault`. Note under test:
`---\ntitle: T\ntags:\n  - a\n---\nFirst body line\nSecond line\n` (the body
starts at line 5, `5:0`). Raw output: `results.md`.

| Action | Obsidian 1.14.4 | Ours |
| --- | --- | --- |
| Open the note | Caret at `5:0`, never inside the frontmatter. | Caret is moved to the body start. |
| `ArrowLeft`, `Ctrl+Home`, `PageUp`, `Ctrl+ArrowUp`, `Alt+ArrowUp` at `5:0` | Caret stays `5:0`, focus stays in the editor, nothing changes. | Same. (Was: caret at `0:0` / `4:3`, `Alt+Up` could move the line over the block.) |
| `Shift+ArrowUp`, `Shift+Ctrl+Home` | Selection extends to `5:0` and no further. | Same. |
| `Ctrl+A` | Selects the body only (`5:0` to the end). | Same. (Was: the whole file including the frontmatter.) |
| `Backspace` at `5:0` | Nothing happens; the closing `---` is untouched. | Same. (Was: it joined the body onto the `---` line and broke the frontmatter.) |
| Move the selection into the frontmatter (`setCursor(1,3)`, closing `---` line), then type | Selection is moved to `5:0`; typed text goes into the body. | Same. |
| `ArrowUp` on the first body line, at any column | Focus moves to the **Add property** button (caret recorded at `5:0`). Further `ArrowUp`: last row, previous rows, the Properties heading, then the inline title. | Same up to the heading (the title step already existed). |
| `ArrowUp` from a later line | Moves within the text. A blank line after the block is a body line: it takes two `ArrowUp`s. | Same. |
| From the Add property button: `ArrowDown`, `Tab` | Back into the text, caret `5:0` (`ArrowDown` first moves to the editor; the caret is then at `5:0`). | Same, plus `Escape`. |
| From the Add property button: `Shift+Tab` | Last row. | Same, plus `ArrowUp`. |
| `Escape` on a focused row | Back into the text at `5:0`; the next `ArrowDown` moves to line 6. | Same (existing). |
| Click the block's padding | The block container takes focus; no caret. | The widget ignores editor mouse events (existing). |
| Note with only properties | Caret after the block (`3:0`); `ArrowDown`, `Ctrl+End`, `Ctrl+Home` keep it there. | Same. |

Not measured: `Hidden` and `Source` property display (our guard applies only to
the visible widget), Vim motions into the block, drag selection from the body
upward into the block.

Specs: `test/browser/properties-caret.spec.ts` (Chromium) and
`test/vscode/properties-caret.spec.ts` (real VS Code, screenshot
`docs/screenshots/properties-arrowup-vscode.png`).
