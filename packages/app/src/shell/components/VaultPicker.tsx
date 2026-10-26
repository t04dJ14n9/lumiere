/**
 * Choosing a vault: a folder picker where the window has one (the desktop
 * app, the web app), a path field in a browser on a server, and the vaults
 * opened before.
 */
import { useState } from "react";
import { backend } from "../backend";

export interface VaultPickerProps {
  readonly recent: readonly string[];
  /** A folder path, or undefined to ask with the native picker. */
  readonly onOpen: (folder?: string) => void;
}

export function VaultPicker({ recent, onOpen }: VaultPickerProps) {
  const [typed, setTyped] = useState("");
  return (
    <section className="vault-picker" aria-label="Open a vault">
      <h1>Lumière</h1>
      <p>Open a folder of Markdown notes. An Obsidian vault works as it is.</p>
      {backend().pickFolder ? (
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
          />
          <button type="submit" className="primary">
            Open
          </button>
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
