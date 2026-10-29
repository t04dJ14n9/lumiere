/**
 * The window's Command Palette (⇧⌘P / Ctrl+Shift+P / F1): searches both the
 * shell's own window commands and Lumière's contributed editor commands from
 * `/lumiere/commands`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { PaletteCommand } from "../api";
import { backend } from "../backend";
import type { CommandHandlers } from "../commands";
import type { MenuCommand } from "../tauri";

export interface PaletteEntry {
  readonly id: string;
  readonly title: string;
  readonly category?: string;
  readonly shortcut?: string;
  readonly run: () => void;
}

const SHELL_SPECS: readonly [MenuCommand, string, string, string?][] = [
  ["open-vault", "Open Folder…", "File", "⌘O"],
  ["open-settings", "Open Settings", "Preferences", "⌘,"],
  ["toggle-sidebar", "Toggle Sidebar", "View", "⌘B"],
  ["toggle-outline", "Toggle Outline", "View", "⌥⌘B"],
  ["close-tab", "Close Tab", "View", "⌘W"],
  ["next-tab", "Show Next Tab", "Window", "⇧⌘]"],
  ["previous-tab", "Show Previous Tab", "Window", "⇧⌘["],
  ["last-tab", "Switch to Last Tab", "Window", "⌃⇥"],
  ["theme-system", "Color Theme: Follow System", "Preferences"],
  ["theme-light", "Color Theme: Light", "Preferences"],
  ["theme-dark", "Color Theme: Dark", "Preferences"],
];

export function shellPaletteEntries(
  handlers: CommandHandlers,
): readonly PaletteEntry[] {
  return SHELL_SPECS.map(([command, title, category, shortcut]) => ({
    id: `shell:${command}`,
    title,
    category,
    ...(shortcut ? { shortcut } : {}),
    run: handlers[command],
  }));
}

export function filterPaletteItems<
  T extends { readonly title: string; readonly category?: string },
>(items: readonly T[], query: string): readonly T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return items;
  }
  const terms = needle.split(/\s+/);
  return items.filter((item) => {
    const label = item.category
      ? `${item.category}: ${item.title}`.toLowerCase()
      : item.title.toLowerCase();
    return terms.every((term) => label.includes(term));
  });
}

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly handlers: CommandHandlers;
  readonly onClose: () => void;
  readonly report: (work: Promise<unknown>) => void;
}

export function CommandPalette({
  open,
  handlers,
  onClose,
  report,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const editorCommands = useEditorCommands(open, report);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      inputRef.current?.focus();
    }
  }, [open]);

  const entries = useMemo<readonly PaletteEntry[]>(() => {
    const contributed: PaletteEntry[] = editorCommands.map((item) => ({
      id: item.command,
      title: item.title,
      category: item.category ?? "Lumière",
      run: () =>
        report(backend().commands?.run(item.command) ?? Promise.resolve()),
    }));
    return [...contributed, ...shellPaletteEntries(handlers)];
  }, [editorCommands, handlers, report]);
  const filtered = useMemo(
    () => filterPaletteItems(entries, query),
    [entries, query],
  );
  if (!open) {
    return null;
  }
  const index =
    filtered.length === 0 ? -1 : Math.min(selected, filtered.length - 1);
  const choose = (entry: PaletteEntry | undefined) => {
    if (entry) {
      onClose();
      entry.run();
    }
  };
  return (
    <PaletteDialog
      inputRef={inputRef}
      query={query}
      filtered={filtered}
      index={index}
      onQuery={(value) => {
        setQuery(value);
        setSelected(0);
      }}
      onSelect={setSelected}
      onChoose={choose}
      onClose={onClose}
    />
  );
}

function useEditorCommands(
  open: boolean,
  report: (work: Promise<unknown>) => void,
): readonly PaletteCommand[] {
  const [commands, setCommands] = useState<readonly PaletteCommand[]>([]);
  useEffect(() => {
    if (!open) {
      return;
    }
    let live = true;
    report(
      (backend().commands?.list() ?? Promise.resolve([]))
        .then((listed) => live && setCommands(listed))
        .catch(() => live && setCommands([])),
    );
    return () => {
      live = false;
    };
  }, [open, report]);
  return commands;
}

interface PaletteDialogProps {
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly query: string;
  readonly filtered: readonly PaletteEntry[];
  readonly index: number;
  readonly onQuery: (value: string) => void;
  readonly onSelect: (index: number) => void;
  readonly onChoose: (entry: PaletteEntry | undefined) => void;
  readonly onClose: () => void;
}

function PaletteDialog(props: PaletteDialogProps) {
  const { inputRef, query, onQuery, onClose } = props;
  return (
    <div
      className="command-palette-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        onKeyDown={(event) => handlePaletteKey(event, props)}
      >
        <input
          ref={inputRef}
          aria-label="Type a command"
          placeholder="Type a command…"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        <PaletteList {...props} />
      </div>
    </div>
  );
}

function handlePaletteKey(
  event: React.KeyboardEvent,
  { filtered, index, onSelect, onChoose, onClose }: PaletteDialogProps,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
  } else if (event.key === "ArrowDown" && filtered.length > 0) {
    event.preventDefault();
    onSelect((index + 1) % filtered.length);
  } else if (event.key === "ArrowUp" && filtered.length > 0) {
    event.preventDefault();
    onSelect((index - 1 + filtered.length) % filtered.length);
  } else if (event.key === "Enter" && index >= 0) {
    event.preventDefault();
    onChoose(filtered[index]);
  }
}

function PaletteList({
  filtered,
  index,
  onSelect,
  onChoose,
}: PaletteDialogProps) {
  return (
    <ul role="listbox" aria-label="Commands">
      {filtered.map((item, i) => (
        <li key={item.id} role="option" aria-selected={i === index}>
          <button
            type="button"
            className="command-palette-item"
            data-active={i === index ? "" : undefined}
            onMouseEnter={() => onSelect(i)}
            onClick={() => onChoose(item)}
          >
            <span>
              {item.category ? `${item.category}: ${item.title}` : item.title}
            </span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        </li>
      ))}
      {filtered.length === 0 && (
        <li className="command-palette-empty">No matching commands</li>
      )}
    </ul>
  );
}
