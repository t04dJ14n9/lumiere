## What and why

<!-- What changes for the user, and why. Link the issue or phase. -->

## Checks

- [ ] Unit tests added or updated (a bug fix gets its own commit and a unit
      test)
- [ ] `pnpm check` passes (format, lint, typecheck, unit tests,
      contributions)
- [ ] `pnpm test:browser` passes (webview changes)
- [ ] `pnpm test:vscode` passes locally before the push (native wiring and
      packaging); CI does not run the real-VS Code specs. On a headless Linux
      box: `xvfb-run -a pnpm check:full`
- [ ] No limit raised, no lint exception added and no test weakened
      (`test/unit/lint-rules.test.ts`)
- [ ] AGENTS.md code norms followed; every capability stays a plugin, the
      webview stays untrusted and validated
- [ ] Screenshots attached for UI changes (Obsidian is a behaviour reference
      only: no copied code, CSS or assets)
- [ ] No secrets, API keys (for example `DEEPSEEK_API_KEY`), tokens or the
      owner's vaults in the diff, fixtures or VSIX
- [ ] IMPLEMENTATION_PLAN.md, docs/HANDOVER.md or CHANGELOG.md updated where
      relevant

## Screenshots

<!-- Before and after, for UI changes. -->
