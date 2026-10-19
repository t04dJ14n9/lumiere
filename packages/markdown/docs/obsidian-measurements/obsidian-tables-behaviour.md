# Obsidian 1.14.4 tables in Live Preview: measured behaviour

Measured 2026-10-10 with real key and mouse events (`/workspace/obsidian-probe/tb1-tb4.mjs`).

- A table is always a widget (`div.cm-table-widget` > `.table-wrapper` > `table.table-editor`). Raw table source is never shown in Live Preview; the caret in a table gives the table `has-focus`, and a cell in focus shows its raw inline Markdown (`**b**`, `[[x]]`) only for that cell.
- Each cell is `td/th` > `.table-cell-wrapper`; header cell has `.table-col-drag-handle` and the first column has `.table-row-drag-handle`; `align` attributes mirror the delimiter row. `.table-row-btn` ("Add row below") and `.table-col-btn` ("Add column to the right") sit under and beside the table.
- Navigation:
  - click puts the caret in the cell;
  - **Tab** = next cell; at row end it moves to the first cell of the next row; **Tab in the last cell appends a new row** and moves into it;
  - **Shift+Tab** = previous cell (wraps to the previous row's last cell);
  - **Enter** = same column, next row; **Enter on the last row appends a row**;
  - **ArrowDown on the last row leaves the table** into the document; ArrowUp from below re-enters the last row; Left/Right move between cells only at cell edges.
- Writing: every edit rewrites the table source **aligned**: cells padded to the widest cell, the delimiter row expanded (`| --- | :-: | --: |`), alignment kept; padding follows alignment (center/right). A new empty row is `|     |     |     |`.
- Pipes: typing `|` inside a cell is stored as `\|`; a typed backslash stays `\`.
- Right-click on a cell menu: `Add link`, `Add external link`, `Format`, `Paragraph`, `Insert`, `Cut`, `Copy`, `Paste`, `Paste as plain text`, `Select all`, **`Row >`** (`Add row above`, `Add row below`, `Move row up`, `Move row down`, `Duplicate row`, `Delete row`), **`Column >`** (`Add column to the left`, `Add column to the right`, `Move column left`, `Move column right`, `Align left`, `Align center`, `Align right`, `Duplicate column`, `Delete column`), `Sort by column (A to Z)`, `Sort by column (Z to A)`.
- Handles: the drag handles drag-reorder rows/columns; a plain click does not open a menu in the automation (the menu is on the cell context menu).
- Hover: the add-row button is visible when the table is focused, the add-column button appears on hover.
- Not verified: Shift+Enter inside a cell (a line break is stored as `<br>`), clicking the add buttons (the automated click did not add a row).
