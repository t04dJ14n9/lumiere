# Handoff: Markdown Workbench, PDF viewer and llm-wiki-okf (as of 2026-10-11 00:05 SGT)

Owner: 金扬 (GitHub `t04dJ14n9`, Asia/Shanghai). Written by Grok Bot for another agent (OpenAI Codex/ChatGPT) to take over.
All work so far ran on a shared Linux "box"; paths below are box paths. No credentials are in this file; ask the owner for access.

## 0. Rules from the owner (follow these)
- Nothing is published: breaking changes are free, no migrations, no legacy aliases.
- Never push to `main` or merge without checking CI. Merging PRs is authorised only when the review rounds report nothing blocking and CI is green (owner said so on Oct 9 for the first two PRs; ask again for new ones if unsure).
- Never touch the owner's vault (`~/WorkVault` on their CVM dev machine, reached via `ssh cvm` from their PC) or their computers without asking. Company-internal vault content must not be sent to outside services.
- Core llm-wiki skill stays simple and readable; extra features are plugins (tasks, inbox, output, codebase are plugins).
- Codex models: `gpt-6.1-sol` at `model_reasoning_effort=xhigh` for implementation (CLI only, no desktop app); `gpt-6-astra` only for very hard refactors. Codex subscription ends ~Oct 13 (maybe grace to ~Oct 16).
- Only AGENTS.md as instruction file (no CLAUDE.md, no .claude). Skills live in `.agents/skills/`.
- Real-VS Code (Playwright/Electron) specs must NOT run in CI any more (flaky); they stay a local pre-push check.
- Local precheck is mandatory before every push (see 3).

## 1. Repositories (all private, owner `t04dJ14n9`)
| Repo | Purpose | Box checkout |
|---|---|---|
| vscode-markdown-workbench | Obsidian-like Markdown editor extension (Cordis-style in-house kernel `src/kernel`, ~50 plugins, OKF/LLM-wiki aware) | /workspace/repos/ci-work/... and many worktrees under /workspace/repos/mdwb-* (see `git worktree list`) |
| vscode-embedPDF | PDF viewer extension (EmbedPDF + pdfium wasm) | /workspace/repos/ci-work/... and worktrees (pdf-view, pdf-settings, ...) |
| llm-wiki-okf | LLM-wiki skills (wiki-init/ingest/query/lint), plugins (tasks, codebase, inbox, output), okf-yaml library, okf-new-vault skill | /workspace/repos/llm-wiki-okf (+ worktrees llm-wiki-okf-wt-*) |
Design docs and running notes: /workspace/plans/ (TODO.md, queue-progress.md, wiki-progress.md, plugins-architecture.md, cross-extension-navigation.md, one-vs-two-extensions.md, pdf-annotations-feasibility.md, pdf-zen-mode-feasibility.md, llm-wiki-refinements-summary.md, codex-usage.md, chatgpt-*.md reviews). Newest installable builds: /workspace/vsix/.

## 2. Current state
### vscode-markdown-workbench
Merged to main: #7 docs (moving to real Cordis is not mechanical; `waterfall` renamed `pipeline`), #8 Properties parity, #9 Tables parity, #10 Vim caret, #11 load-time optimisations, #12 centred heading navigation, #13 separate note font size/line height, #14 settings commands. Main CI green at last check.
In progress (uncommitted, branch `ci-drop-real-vscode`, worktree /workspace/repos/ci-drop-vscode-markdown-workbench): edits to `.github/workflows/ci.yml` and PR template to drop the real-VS Code job. Needs: update README/CONTRIBUTING/docs to say the real specs are a local pre-push check, full local checks, PR, green CI, merge.
### vscode-embedPDF
Merged: #7 load time, #8 view controls, #9 zen mode, #10 settings commands, #12 CI stabilisation, #13 progressive page rendering. Open: #14 "Declare limited Restricted Mode support (untrustedWorkspaces)" (not merged). In progress: same CI-drop change on branch `ci-drop-real-vscode` (worktree /workspace/repos/ci-drop-vscode-embedPDF, uncommitted). After #13, main CI went red once from flaky real-VS Code specs; the CI-drop change is the fix.
### llm-wiki-okf (nothing merged to main)
Stack of open PRs, merge bottom-up (each is based on the previous): #2 refine/base (draft, -> main), #3 core-layout-config, #4 agents-md-only, #5 index-mechanical, #6 trust-provenance, #8 plugins-tasks-inbox-output, #7 code-citation-rules, #9 scaffold-layout, #10 docs-plan. #1 (s1-foundations) is superseded by #2. CI (py3.9, py3.13, clean-box doctor) was green on #2-#9; #10 was running. Also branch `okf-yaml-and-new-vault` (already merged into refine/base).
Design decisions implemented (spec: plans/wiki-refine-spec.md, summary: plans/llm-wiki-refinements-summary.md):
1. WorkVault layout: `knowledge/{raw/{articles,code,transcripts},wiki/{concepts,entities,summaries,comparisons,queries},tasks/{ongoing,suspended,done},projects,playbooks,output}`; `assets/`, `inbox/`, `code/` outside the bundle; folder names configurable via `.wiki/layout.json`.
2. Task state = folder, not a frontmatter field; OKF `status` unchanged.
3. Codebase plugin enforces code-citation rules: HTTPS permalink pinned to full commit SHA, no branch/tag/local path, one `sources` entry per repo revision, dirty tree flagged.
4. `index.md` generated at every folder level; root index is short and carries `okf_version: "0.2"`; one root `log.md`; no `references/` convention.
5. Adopted from OKF v0.2: trust tiers, `stale_after`, source credibility fields, actor convention (`human:<id>`, `process:<id>`, `<tool>/<version>`). Held: Attested Computation.
6. `output/` reports inside the bundle; binaries/exports outside (`assets/`, `exports/`). `assets/` stays outside; lint flags unreferenced assets.
7. AGENTS.md only.
OKF spec: v0.2 is the latest official (https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md, validator pinned to commit 0b87c52c6ef999286c745e19998fdfcd03d5dbee). In OKF, `stale` means only `now >= stale_after`; a source change is NOT staleness in the spec (our own "source changed" lint, not called stale).
Not started, waiting on the owner's go: source-change plugin (`capture_policy: immutable|mutable`, hash/ETag change detection, "verified drift" lint, freeze on sign-off). Design and survey: /workspace/vault-review/survey_raw_updates.md. Decided so far: raw captures immutable by default; in-place update would be opt-in per source type; lint flags, does not auto-mark stale; a signed-off page loses its human-reviewed tier until re-reviewed.
Open items / ambiguities: see "Ambiguities / open items" in plans/llm-wiki-refinements-summary.md (projects/playbooks have no registered type; subfolder index entries lack descriptions; trust-mark text in index lines; no CLI for human sign-off; unverified: live Obsidian/Claude/Codex behaviour, git-lfs, Windows). Review of our skills vs. the owner's vault by ChatGPT: /workspace/vault-review/answerP_okf_review.md (condensed; treat as input).

### Pending product work (not started, designs exist)
- Cross-extension Back/Forward with one GLOBAL stack across Markdown and PDF, record agent jumps (setting), Windows/macOS/Ubuntu Wayland keys. Plan: plans/cross-extension-navigation.md (Stage 1: real opens with fragments + fix bugs B1-B4; Stage 2: shared stack). Nothing implemented.
- PDF annotation system (storage undecided: digest note `<name>.pdf.annotations.md` vs in-place; agent-added annotations via MCP, rendered in the Markdown workbench): plans/pdf-annotations-feasibility.md.
- One merged extension vs two: memo plans/one-vs-two-extensions.md (recommends two plus a shared package).
- Showcase: cloud VS Code demo (Codespaces/vscode.dev) with the extension preloaded and a sample notes/PDF repo.
- Naming: "Eureka" liked but may be taken; "vscodian" floated (plans/naming.md).
- Optional: move real Cordis later only if upstream goes stable (see DESIGN.md §5.9 and src/kernel/README.md; Cordis was 4.0.0-rc.10, README says API not stable).

## 3. How to verify (mandatory before every push)
- llm-wiki-okf: run `/workspace/plans/llm-wiki-precheck.sh` (doctor, 7 fixtures, 211 repo tests, 46 okf-new-vault tests, 111 okf-yaml tests, rules-catalog check; py3.9 and py3.13). Codex's sandbox cannot write `.agents/`: use the patch-and-sync approach (`/workspace/plans/sync-scaffold.sh`; tests find the skill via `OKF_NEW_VAULT_SKILL_DIR`).
- Extensions: `pnpm check`, unit, browser tests; real-VS Code specs locally under `xvfb-run` on a private display (kill leftover `server.mjs` first: Playwright's reuseExistingServer can serve another worktree's dist). Never run these in CI.
- Check main CI after every merge.

## 4. Environment notes
- The box is shared and noisy; run heavy tests one at a time. Chrome through the "route traffic through this computer" setting was slow; the owner turned it off.
- Codex logs and token counts: /workspace/plans/codex-usage.md (llm-wiki refinements runs 1-8 used 1,660,853 tokens at `max`; Codex weekly usage was ~62% used on Oct 10 afternoon, window reset Oct 14 16:15).
- ChatGPT Pro (web) was used for reviews; it may be routed to a faster model, so judge depth by thinking time. Transcripts: /workspace/plans/chatgpt-*.md.

## 5. Not part of this handoff (other bots)
Research ideas and GPU pilots (Research Scout, files in /workspace/paper-ideas/ and the owner's Ceph `paper_idea_scout/`), IBKR/finance (Finance Tracker), notification hooks (Agent Notifier). One personal deadline: the owner's ZA Bank investment account needs two confirmations in its app by 31 Oct.
