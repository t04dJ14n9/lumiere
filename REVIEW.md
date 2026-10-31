# REVIEW.md — what reviewers (human or bot) must catch

Failure modes that matter in this repo (not style nits):

- **It lies** — docs, PR body, or comments claim behaviour the code does not do.
- **It misroutes** — wrong host/plugin layer (see AGENTS.md + docs/HOSTS_PLAN.md); Markdown fix in a host; cross-product settings/commands.
- **Trust boundary** — webview messages without schema/validation; path escape; secrets in diff/fixtures/VSIX.
- **Plugin graph** — importing another plugin’s internals; side effects not tied to plugin context lifecycle.
- **Obsidian copy** — any copied Obsidian code/CSS/assets (behaviour reference only).
- **Merge-gate cheat** — weakened tests, raised quality budgets, or new eslint exceptions without owner approval + list update.
- **Editor/host breakage** — vscode/webview/contribution changes without Host GUI or `pnpm test:vscode` evidence when required.

Caps: prefer Important findings with file+line evidence. Cap nits. Skip generated lockfile noise unless the change is the lockfile.

Risk tiers (also in Grok Bot skill lumiere-pr-review):
- Low: docs/copy → CI + clean review
- Medium: product/UI → CI + review + screenshots; Host GUI if UI
- High: trust/CI/installer/schema → CI + review + Host GUI + user reads evidence

Every Important finding: fix or dismiss with a reason. Max 3 bot review rounds; then ask user.
Never treat a bot approval as a human. Never merge without user.
