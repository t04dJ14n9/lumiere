/**
 * Workspace path checks for the Node host. The same rules as VS Code's
 * `contained`: a file URI is inside a root only after `..` and percent-encoding
 * are resolved, and an existing symlink must still land inside that root.
 * A string prefix is not enough: `file:///vault/../etc/passwd` starts with the
 * vault's URI and then leaves it.
 */
import { constants } from "node:fs";
import { mkdir, open, realpath, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export class OutsideWorkspace extends Error {
  constructor() {
    super("That path is outside the workspace");
    this.name = "OutsideWorkspace";
  }
}

/** Filesystem path of a `file:` URI, or undefined when it is not one. */
export function fileUriToPath(uri: string): string | undefined {
  try {
    const url = new URL(uri);
    if (url.protocol !== "file:") {
      return undefined;
    }
    // Throws on an encoded slash, which would hide a separator from a prefix check.
    return fileURLToPath(url);
  } catch {
    return undefined;
  }
}

/**
 * Whether `uri` is `root` or a file inside it. Dot segments are resolved, so
 * a path that only looks prefixed is outside.
 */
export function isInside(root: string, uri: string): boolean {
  const base = fileUriToPath(root);
  const target = fileUriToPath(uri);
  if (base === undefined || target === undefined) {
    return false;
  }
  const relative = path.relative(base, target);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

/** `/` on POSIX, or a drive root. Opening one would expose the whole disk. */
export function isFilesystemRoot(dir: string): boolean {
  const resolved = path.resolve(dir);
  return resolved === path.parse(resolved).root;
}

/**
 * Reject `uri` unless it stays inside `root` lexically and, once the nearest
 * existing ancestor is resolved, on disk. A missing final component is allowed
 * so a new note can be created; a symlink that leaves the root is not.
 */
export async function assertContained(
  rootUri: string,
  uri: string,
): Promise<void> {
  const base = fileUriToPath(rootUri);
  const target = fileUriToPath(uri);
  if (!base || !target || !isInside(rootUri, uri)) {
    throw new OutsideWorkspace();
  }
  const root = await realpath(base);
  const resolved = await nearestExisting(target);
  const relative = path.relative(root, resolved);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new OutsideWorkspace();
  }
}

/** The path to open for `uri` once it is inside one of `roots`. */
export async function pathInsideRoots(
  roots: readonly string[],
  uri: string,
): Promise<string> {
  const root = roots.find((item) => isInside(item, uri));
  const file = fileUriToPath(uri);
  if (!root || !file) {
    throw new OutsideWorkspace();
  }
  await assertContained(root, uri);
  return file;
}

export interface ResolvedNote {
  readonly note: string;
  readonly root: string;
}

/**
 * The note and workspace to open, both canonical. Undefined when the note is
 * missing, not a file, or not inside `root` — including through a symlink or
 * a workspace that is the filesystem root.
 */
export async function resolveContainedNote(
  note: string,
  root: string,
): Promise<ResolvedNote | undefined> {
  if (
    !path.isAbsolute(note) ||
    !path.isAbsolute(root) ||
    isFilesystemRoot(root)
  ) {
    return undefined;
  }
  let realRoot: string;
  let realNote: string;
  try {
    realRoot = await realpath(root);
    realNote = await realpath(note);
  } catch {
    return undefined;
  }
  if (isFilesystemRoot(realRoot)) {
    return undefined;
  }
  try {
    await assertContained(
      pathToFileURL(realRoot).toString(),
      pathToFileURL(realNote).toString(),
    );
  } catch {
    return undefined;
  }
  return { note: realNote, root: realRoot };
}

/**
 * Replace a file without following a symlink at the final path. `writeFile`
 * would follow one planted after the containment check and write outside.
 */
export async function writeThroughFile(
  file: string,
  text: string,
): Promise<void> {
  const handle = await open(
    file,
    constants.O_WRONLY | constants.O_TRUNC | noFollow(),
  );
  try {
    await handle.writeFile(text, "utf8");
  } finally {
    await handle.close();
  }
}

/** Create an empty file, and leave an existing one untouched. */
export async function createEmptyFile(file: string): Promise<void> {
  try {
    const handle = await open(
      file,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow(),
    );
    await handle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

/** Write beside the destination, then rename, so a crash never leaves half a file. */
export async function writeAtomic(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
}

const noFollow = (): number => constants.O_NOFOLLOW ?? 0;

/** `realpath` of `file`, or of the nearest ancestor that exists. */
async function nearestExisting(file: string): Promise<string> {
  let candidate = file;
  while (true) {
    try {
      return await realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = path.dirname(candidate);
      if (parent === candidate) {
        throw error;
      }
      candidate = parent;
    }
  }
}
