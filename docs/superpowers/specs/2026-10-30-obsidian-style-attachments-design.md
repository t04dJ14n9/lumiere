# Obsidian-style attachments (design)

**Date:** 2026-10-30  
**Status:** Approved for implementation planning (design locked with user)  
**Repo:** t04dJ14n9/lumiere  
**Scope:** Design only in this PR — no runtime implementation here.

## Goal

Match Obsidian Attachments behavior in Lumière: drag-drop or paste an image (including clipboard screenshots and images embedded in rich HTML paste) into a note → file lands in the vault attachment folder → note gets a correct relative Markdown / WikiLink embed.

## Current state (survey)

- **Import Asset** (`packages/markdown/src/plugins/assets`) is command-only: picker → copy into `assets.path` (wiki-style layout) → portable Markdown link. No DnD / clipboard / HTML-image import.
- **`files.attachmentFolder`** is settable and Obsidian-mapped; used by sketch placement (`sketch/placement.ts`) with wikilink / `newLinkFormat` embeds. Not wired for general paste/drop.
- **`pasteHtml`** explicitly does not download or save images (remote / `file://` / data URIs stay as-is).
- No open issue/PR for Obsidian-style attachment DnD/paste at survey time.

## Locked decisions

| Topic | Decision |
| --- | --- |
| Folder | `files.attachmentFolder` (Obsidian / sketch semantics; docs default toward `assets`) |
| Links | Existing `links.useWikilinks` + `links.newLinkFormat` (same rules as sketch) |
| Filenames | Always `YYYY-MM-DD HH.mm.ext` + collision suffix; no filename-template setting in v1 |
| Entry points (v1) | DnD, clipboard image/screenshot, rich HTML paste image download/save, sketch via shared core |
| Architecture | Approach A — shared attachment core |
| Import Asset / `plugins/assets` | **Remove** the plugin; Import Asset command goes away |

## Architecture

One shared module (preferred location: `packages/markdown/src/attachments/`, or co-located next to sketch if that fits package layout better) owns:

1. Resolve attachment directory from `files.attachmentFolder` for the active note / vault.
2. Build a unique timestamp filename `YYYY-MM-DD HH.mm.ext` (add a collision suffix when the path already exists).
3. Write bytes into the vault.
4. Build the embed string using sketch’s wikilink / `newLinkFormat` rules.
5. Insert at the cursor or drop position.

**Callers:**

- Editor drag-and-drop
- Clipboard binary image / screenshot paste
- Rich HTML paste (download or decode images, then rewrite embeds)
- Sketch placement (refactor to call this core instead of a private attachment path)

**Removal:**

- Delete `packages/markdown/src/plugins/assets` entirely (host / run / plan / link / manifest / README, and any registration).
- Update PARITY, settings docs, and any copy that describes Import Asset or `assets.path` for that flow.
- `assets.path` is no longer the attachment destination for this feature; attachment destination is only `files.attachmentFolder`.

## Entry points and data flow

1. **DnD** — User drops one or more files on the editor → each file is copied into the attachment folder under a timestamp name → embed(s) inserted at the drop position.
2. **Clipboard image / screenshot** — User pastes a binary image → same write + insert at the cursor.
3. **Rich HTML paste** — For each `<img>` with `http(s)` or data URI: download or decode → save the same way → rewrite that image’s representation in the pasted content to the new relative / wikilink embed. Non-image HTML paste behavior stays unchanged otherwise.
4. **Sketch** — Placement uses the same folder resolution, naming, and embed helpers (no separate attachment path).

### Errors

For a given item, if the vault write fails, the download fails, or the clipboard has no usable image: leave the note unchanged for that item, surface a short error, and do not insert a broken link. Other items in a multi-drop / multi-image paste may still succeed.

## Core API (document for implementers; not implemented in this PR)

Suggested surface (names may adjust to match package conventions):

- `resolveAttachmentDir(note)` — absolute or vault-relative directory from `files.attachmentFolder`
- `uniqueTimestampName(ext)` — `YYYY-MM-DD HH.mm.ext` with collision suffix
- `saveAttachment({ bytes, ext, note })` — write file; return saved path
- `embedFor(path)` — Markdown or wikilink embed per `useWikilinks` / `newLinkFormat`
- `insertEmbed` — insert at cursor or drop position

Sketch’s existing folder / embed helpers should be refactored to call into this module (or thin wrappers over it) so there is a single folder and link story.

## Settings

- **Folder:** `files.attachmentFolder` only.
- **Links:** existing links settings; no new link-style setting.
- **Filename:** fixed timestamp scheme; no template setting in v1.
- Docs should continue to steer the default attachment folder toward `assets` where they recommend a value.

## Tests (expected coverage when implemented)

- **Unit:** naming collisions; folder resolve for typical `files.attachmentFolder` values; embed output under both link modes (wikilinks on/off and `newLinkFormat` variants used by sketch).
- **Integration-ish:** rich HTML with `<img>` → file written under attachment folder + link rewritten in pasted content.
- **Regression:** sketch placement still lands files in the same attachment folder and uses the same embed rules.

## Out of scope (v1 / this design)

- Filename templates or user-configurable name patterns
- Keeping or migrating `plugins/assets` / Import Asset as a parallel path
- Changing non-image HTML paste semantics beyond image download/save + rewrite
- Full Obsidian attachment-folder “per note” exotic layouts beyond what `files.attachmentFolder` already supports (unless already implemented for sketch — match sketch)

## Implementation follow-up

After this design is reviewed and accepted in-repo, create an implementation plan (`writing-plans` / `docs/superpowers/plans/…`) then implement: shared core, wire DnD / paste / HTML / sketch, delete `plugins/assets`, update docs/PARITY, add tests. Coordinate UI verification with Slave; orchestrate with Grok Bot. Do not use ChatGPT / Codex.

## Approval record

- Approach A (shared core) chosen by user.
- Architecture, entry points/data flow, and components/settings/removal/tests sections approved in chat 2026-10-30 (Asia/Singapore).
- Explicit user direction: remove `plugins/assets` (do not keep Import Asset as a thin UI).
