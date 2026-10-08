# Tables

A rendered table owns a temporary cell EditorView. Every edit projects immediately
into the outer Markdown document; cells have no independent undo stack. Host save,
undo and redo operate on that document. Cell selection is projected back into
source offsets for Copy for Agent and API capture.

The controller owns state and rendering. `projection`, `selection`, `keyboard`,
`toolbar`, and `clipboard` operate on that explicitly typed controller; pointer
selection and row/column grips have separate cancellation lifetimes. Shared pure
model/operations preserve Markdown table syntax. Menus, rendering, formatting,
Vim transfer and input grouping arrive through services.

Plugin disposal removes cell views, passes, grips, menus and registrations. The
source action reveals Markdown table source until the caret leaves.
The owner must verify drag-with-scroll and split-panel editing in the manual plan.
