/**
 * Where a note's vault starts (DESIGN §12.1): the nearest folder, from the
 * note's own folder up to its workspace folder, that contains one of the
 * root markers (`.obsidian` by default). With no marker, the workspace folder
 * is the vault.
 *
 * `folders` lists folder URIs from the note's folder up to and including the
 * workspace folder.
 */
export async function findVaultRoot(
  folders: readonly string[],
  hasMarker: (folder: string) => Promise<boolean>,
): Promise<string | undefined> {
  const results = await Promise.all(folders.map((folder) => hasMarker(folder)));
  const index = results.indexOf(true);
  return index >= 0 ? folders[index] : folders.at(-1);
}

/** The folders between a note and its workspace folder, nearest first. */
export function foldersUpTo(noteUri: string, workspaceUri: string): string[] {
  const base = workspaceUri.replace(/\/+$/, "");
  const folders: string[] = [];
  let folder = noteUri.slice(0, noteUri.lastIndexOf("/"));
  while (folder.length > base.length && folder.startsWith(base + "/")) {
    folders.push(folder);
    folder = folder.slice(0, folder.lastIndexOf("/"));
  }
  folders.push(base);
  return folders;
}
