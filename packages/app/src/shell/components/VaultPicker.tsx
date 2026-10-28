/**
 * Choosing a vault: the native folder picker in the desktop app, a path
 * field in a browser, and the vaults opened before.
 */
import { useState } from "react";
import { inDesktopApp } from "../tauri";

export interface VaultPickerProps {
  readonly recent: readonly string[];
  /** A folder path, or undefined to ask with the native picker. */
  readonly onOpen: (folder?: string) => void;
  /** Dismiss the picker when a workspace is already open. */
  readonly onCancel?: (() => void) | undefined;
}

export function VaultPicker({ recent, onOpen, onCancel }: VaultPickerProps) {
  const [typed, setTyped] = useState("");
  return (
    <section className="vault-picker" aria-label="Open a vault">
      <h1>Lumière</h1>
      <p>Open a folder of Markdown notes. An Obsidian vault works as it is.</p>
      {inDesktopApp() ? (
        <button type="button" className="primary" onClick={() => onOpen()}>
          Open Folder…
        </button>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (typed.trim()) {
              onOpen(typed.trim());
            }
          }}
        >
          <input
            aria-label="Folder path"
            placeholder="/path/to/notes"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && onCancel) {
                event.preventDefault();
                onCancel();
              }
            }}
          />
          <button type="submit" className="primary">
            Open
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          )}
        </form>
      )}
      {recent.length > 0 && (
        <>
          <h2>Recent</h2>
          <ul className="recent">
            {recent.map((folder) => (
              <li key={folder}>
                <button type="button" onClick={() => onOpen(folder)}>
                  {folder}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
