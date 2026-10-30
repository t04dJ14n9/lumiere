/**
 * The vault folder for a note's attachments, from Obsidian's setting
 * (`attachmentFolderPath` / `files.attachmentFolder`): empty or `/` for the
 * vault's root, `.` or `./` for the note's own folder, `./sub` for a folder
 * inside it, anything else a folder from the root. A setting that would leave
 * the vault reads as the root.
 */
import { folderOf, joinVaultPath } from "../shared/vault-path";
import { safeRelative } from "../shared/workspace-path";

export function resolveAttachmentDir(
  setting: string,
  notePath: string,
): string {
  const value = setting.trim();
  const noteFolder = folderOf(notePath);
  if (value === "." || value === "./") {
    return noteFolder;
  }
  if (value.startsWith("./")) {
    const inside = safeRelative(value.slice(2));
    return inside ? (joinVaultPath(noteFolder, inside) ?? noteFolder) : "";
  }
  return safeRelative(value.replace(/^\/+/, "")) ?? "";
}
