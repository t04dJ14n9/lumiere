/** The open vault's files as folders and notes; a note opens in a tab. */
import { useMemo, useState } from "react";
import type { FileEntry } from "../api";
import { buildTree, type Folder } from "../tree";

export interface FileTreeProps {
  readonly files: readonly FileEntry[];
  readonly activePath: string | undefined;
  readonly onOpen: (path: string) => void;
}

export function FileTree({ files, activePath, onOpen }: FileTreeProps) {
  const root = useMemo(() => buildTree(files), [files]);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (path: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });
  return (
    <nav className="file-tree" aria-label="Files">
      <FolderItems
        folder={root}
        closed={closed}
        toggle={toggle}
        activePath={activePath}
        onOpen={onOpen}
      />
    </nav>
  );
}

interface FolderItemsProps extends Omit<FileTreeProps, "files"> {
  readonly folder: Folder;
  readonly closed: ReadonlySet<string>;
  readonly toggle: (path: string) => void;
}

function FolderItems({
  folder,
  closed,
  toggle,
  activePath,
  onOpen,
}: FolderItemsProps) {
  return (
    <ul role="group">
      {[...folder.folders.values()].map((child) => (
        <li key={child.path}>
          <button
            type="button"
            className="tree-folder"
            aria-expanded={!closed.has(child.path)}
            onClick={() => toggle(child.path)}
          >
            {child.name}
          </button>
          {!closed.has(child.path) && (
            <FolderItems
              folder={child}
              closed={closed}
              toggle={toggle}
              activePath={activePath}
              onOpen={onOpen}
            />
          )}
        </li>
      ))}
      {folder.files.map((file) => (
        <li key={file.path}>
          <button
            type="button"
            className="tree-file"
            data-kind={file.kind}
            aria-current={file.path === activePath ? "page" : undefined}
            // Only notes open for now; PDFs come with the PDF reader (HOSTS_PLAN M5).
            disabled={file.kind !== "note"}
            onClick={() => onOpen(file.path)}
          >
            {file.path.slice(file.path.lastIndexOf("/") + 1)}
          </button>
        </li>
      ))}
    </ul>
  );
}
