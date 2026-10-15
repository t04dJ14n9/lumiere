# macOS Look Up

Look Up shows the Dictionary entry of a word, as Preview does. It is the
plugin `pdfLookUp`, on by default on macOS only
(`pdfWorkshop.lookUp.enabled`; it does nothing on Windows and Linux).

## What works natively, and what is a fallback

| Gesture | Works? | How |
| --- | --- | --- |
| Three-finger tap, or a force click when the system Look Up gesture is "Force Click" | **No**, not natively | The system asks the web page for text under the pointer. This viewer draws the page as images (PDFium), and its selection is painted by EmbedPDF, so there is no text in the page for the system to find. Making the text selectable DOM text would need an invisible text layer over every page, which would intercept the clicks and drags of the text selection; it was left out. |
| Force click (hard press) | **Fallback**, unverified | The viewer listens for Safari's `webkitmouseforcedown` event, finds the word under the pointer from the PDF's glyph boxes, and the extension opens `dict://<word>` in the Dictionary app. Chromium (VS Code's engine) does not fire this event today, so it only helps in engines that do. |
| Right-click → **Look Up** | **Fallback**, works wherever the menu does | The menu is available when Look Up is enabled on macOS. Its command resolves the saved right-click point, then opens Dictionary for that word. Blank space does nothing. A later hover cannot replace the clicked word, and scrolling or new reader input cancels the old target. |

The Dictionary app opens at the word (`dict://`); the small system popover of
Preview is not reachable from an extension (Electron's
`webContents.showDefinitionForSelection()` is not exposed to extensions).

## Verifying on a Mac

Unit and browser tests cover the word finder (`wordGlyphRange`, `coreWord`),
the viewer's event wiring (force click and context menu messages) and the
plugin's on/off switch. Only a real Mac can show the Dictionary opening:

1. Open a PDF in VS Code on macOS, right-click a word, choose **Look Up**.
   The Dictionary app opens at that word.
2. Hard-press a word: if nothing happens, Chromium sent no force event (expected).
3. Set `pdfWorkshop.lookUp.enabled` to `false`: the menu entry disappears.

## Design

- `src/shared/look-up.ts`: pure word finding, URL and platform rule (unit tested).
- `src/webview/look-up.ts`: the events; off until the host sends `lookUp { enabled }`.
- `src/extension/plugins/pdfLookUp`: the plugin; stopping it switches every viewer's side off.
