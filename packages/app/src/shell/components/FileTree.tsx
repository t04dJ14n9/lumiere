/**
 * The open vault's files as folders and notes; a note opens in a tab.
 * Folders start closed, and the way to the shown note opens (folders.ts).
 */
import { useEffect, useMemo, useRef } from "react";
import type { FileKind } from "../../shared/file-kind";
import type { FileEntry } from "../api";
import { useOpenFolders } from "../folders";
import { buildTree, type Folder } from "../tree";
import type { OpenFolders } from "../tree-state";
import type { UiStateHandle } from "../ui-state";

export interface FileTreeProps {
  readonly vault: string;
  readonly files: readonly FileEntry[];
  readonly activePath: string | undefined;
  /** The kinds of file that open in a tab; the others are listed greyed. */
  readonly opens: readonly FileKind[];
  /** The saved layout, which keeps the open folders. */
  readonly ui: UiStateHandle;
  readonly onOpen: (path: string) => void;
}

export function FileTree({
  vault,
  files,
  activePath,
  opens,
  ui,
  onOpen,
}: FileTreeProps) {
  const root = useMemo(() => buildTree(files), [files]);
  const folders = useOpenFolders(ui, vault, activePath);
  return (
    <nav className="file-tree" aria-label="Files">
      <FolderItems
        folder={root}
        open={folders.open}
        toggle={folders.toggle}
        activePath={activePath}
        opens={opens}
        onOpen={onOpen}
      />
    </nav>
  );
}

interface FolderItemsProps extends Pick<
  FileTreeProps,
  "activePath" | "opens" | "onOpen"
> {
  readonly folder: Folder;
  readonly open: OpenFolders;
  readonly toggle: (path: string) => void;
}

function FolderItems({
  folder,
  open,
  toggle,
  activePath,
  opens,
  onOpen,
}: FolderItemsProps) {
  return (
    <ul role="group">
      {[...folder.folders.values()].map((child) => (
        <li key={child.path}>
          <button
            type="button"
            className="tree-folder"
            aria-expanded={open.has(child.path)}
            onClick={() => toggle(child.path)}
          >
            {child.name}
          </button>
          {open.has(child.path) && (
            <FolderItems
              folder={child}
              open={open}
              toggle={toggle}
              activePath={activePath}
              opens={opens}
              onOpen={onOpen}
            />
          )}
        </li>
      ))}
      {folder.files.map((file) => (
        <li key={file.path}>
          <FileItem
            file={file}
            isShown={file.path === activePath}
            opens={opens}
            onOpen={onOpen}
          />
        </li>
      ))}
    </ul>
  );
}

function FileItem({
  file,
  isShown,
  opens,
  onOpen,
}: Pick<FileTreeProps, "opens" | "onOpen"> & {
  readonly file: FileEntry;
  readonly isShown: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  // The shown note scrolls into view when it becomes shown or appears (its
  // folders opened, the list shown), but not when other folders open or close.
  useEffect(() => {
    if (isShown) {
      button.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isShown]);
  return (
    <button
      ref={button}
      type="button"
      className="tree-file"
      data-kind={file.kind}
      aria-current={isShown ? "page" : undefined}
      disabled={!opens.includes(file.kind)}
      onClick={() => onOpen(file.path)}
    >
      {file.path.slice(file.path.lastIndexOf("/") + 1)}
    </button>
  );
}
