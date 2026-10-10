## What and why

<!-- What changes for the user, and why. Link the issue if there is one. -->

## Checks

- [ ] Tests added or updated for the change (unit tests in `test/unit`, browser
      or VS Code tests for viewer behaviour)
- [ ] `pnpm check` passes (lint, typecheck, unit tests)
- [ ] `pnpm test:browser` passes (webview changes)
- [ ] `pnpm test:vscode` passes locally before the push (extension host,
      commands, packaging); CI does not run the real-VS Code specs. On a
      headless Linux box: `xvfb-run -a pnpm check:full`
- [ ] Screenshots or a short recording attached for UI changes
- [ ] No secrets, API keys, tokens or personal files in the diff, fixtures or
      VSIX
- [ ] AGENTS.md rules kept: `src/shared` stays platform free, webview messages
      go through `parseViewerMessage`, editors are tracked per panel
- [ ] CHANGELOG.md updated for user-visible changes

## Screenshots

<!-- Before and after, for UI changes. -->
