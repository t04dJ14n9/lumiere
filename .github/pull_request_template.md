## What and why

<!-- What changes for the user, and why. Link the issue or phase. -->

## Risk

<!-- Low | Medium | High — one line why (see REVIEW.md). -->

## Testing

<!-- Commands run and outcome. Link CI. Host GUI result if UI. -->

## How to revert

<!-- Revert commit / disable setting / feature flag. -->

## Checks

- [ ] Unit tests added or updated (a bug fix gets its own commit and a unit
      test)
- [ ] `pnpm check` passes (format, lint, typecheck, unit tests,
      contributions)
- [ ] `pnpm test:browser` passes locally before the push
- [ ] `pnpm test:vscode` passes locally before the push, regardless of which
      files changed; CI does not run the real-VS Code specs. On a headless Linux
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
