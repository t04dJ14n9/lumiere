# Zen mode

**PDF: Enter Zen Mode** (`Ctrl+Alt+Z`, `Ctrl+Cmd+Z` on macOS, or *Zen Mode* in the viewer's right-click menu) reads
the PDF with nothing else on screen. It is VS Code's own Zen Mode, with the part a PDF needs added.

![A PDF in zen mode, with the floating bar](images/zen-mode.png)

## What it does

- VS Code's **Zen Mode** hides the side bar, panels and status bar and goes full screen, using your `zenMode.*`
  settings, and puts everything back when it ends. The extension does not close or reopen anything itself.
- The controls that live in VS Code's chrome (the editor title actions and the status bar) are hidden or unreliable
  in zen, so with `toolbar.mode` **chrome** or **slim** the viewer shows its **floating bar** for as long as zen lasts.
  The bar has an **Exit zen mode** button. This is a temporary look only: `vscodeEmbedPdf.toolbar.mode` is never
  changed, and the bar you chose comes back afterwards. **floating** stays as it is (with the button added), and
  **none** stays none: use the keys.
- **Exit**: `Ctrl+Alt+Z` again (`Ctrl+Cmd+Z`), `Escape Escape` with the PDF focused, the bar's button, **PDF: Exit
  Zen Mode**, or VS Code's own `Ctrl+K Z`.

All of the PDF shortcuts are turned off by `vscodeEmbedPdf.keyboardShortcuts`, these too.

## Settings that matter

- `zenMode.centerLayout` (VS Code's, default on) centres the editor and leaves wide margins, so the PDF is narrower
  than the screen. Turn it off to read edge to edge: `"zenMode.centerLayout": false`. The extension does not change
  it for you, because that would be a global setting changed behind your back.
- `zenMode.fullScreen`, `zenMode.hideStatusBar`, `zenMode.showTabs` as you like them.

## Limits

- VS Code has no API to ask whether zen is on. The extension uses two commands chosen by the `inZenMode` context key,
  and the viewer watches the window: when a full-screen zen ends some other way (`Ctrl+K Z`, the Command Palette),
  it drops the floating bar by itself. A windowed zen (`zenMode.fullScreen` off) ended that way keeps the floating
  bar until the next *Enter* or *Exit*; that is harmless.
- A web page inside VS Code cannot go full screen itself (VS Code does not allow it), which is why the extension
  builds on Zen Mode instead.
- **Not verified on macOS or in Cursor.** Tested in VS Code 1.141 on Linux. On macOS native full screen the title
  bar is hidden, so the floating bar should be the only controls; check that, and `Ctrl+Cmd+Z`, on a Mac. Cursor
  has its own panes in zen; they were not tried.
