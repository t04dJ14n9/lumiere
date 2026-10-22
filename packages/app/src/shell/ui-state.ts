/**
 * The window's layout and theme as the window uses them: read from the
 * server once, changed here at once, and saved back (shared/ui-state.ts).
 */
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_UI_STATE,
  readUiState,
  type UiState,
} from "../shared/ui-state";

async function save(change: Partial<UiState>): Promise<UiState> {
  const response = await fetch("/api/ui", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(change),
  });
  if (!response.ok) {
    throw new Error(`Could not save the window's layout (${response.status})`);
  }
  return readUiState(await response.json());
}

export interface UiStateHandle {
  readonly state: UiState;
  /** Whether the saved state has been read; until then the defaults show. */
  readonly loaded: boolean;
  update(change: Partial<UiState>): void;
}

export function useUiState(
  report: (work: Promise<unknown>) => void,
): UiStateHandle {
  const [state, setState] = useState<UiState>(DEFAULT_UI_STATE);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    report(
      fetch("/api/ui")
        .then((response) => response.json())
        .then((saved: unknown) => {
          setState(readUiState(saved));
          setLoaded(true);
        }),
    );
  }, [report]);
  const update = useCallback(
    (change: Partial<UiState>) => {
      setState((current) => ({ ...current, ...change }));
      report(save(change));
    },
    [report],
  );
  return { state, loaded, update };
}
