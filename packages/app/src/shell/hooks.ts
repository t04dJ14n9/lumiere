/** The shell's state hooks: theme, vaults and files, server events, menu. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type FileEntry, type ServerEvent } from "./api";
import { onMenuCommand, type MenuCommand } from "./tauri";
import { applyShellTheme, onThemeChange } from "./theme";

export function useShellTheme(): void {
  useEffect(() => {
    applyShellTheme();
    return onThemeChange(applyShellTheme);
  }, []);
}

export interface Errors {
  readonly message: string | undefined;
  /** Show the error if `work` fails; the shell's sink for work it does not await. */
  report(work: Promise<unknown>): void;
  dismiss(): void;
}

export function useErrors(): Errors {
  const [message, setMessage] = useState<string>();
  const report = useCallback((work: Promise<unknown>) => {
    work.catch((error: unknown) =>
      setMessage(error instanceof Error ? error.message : String(error)),
    );
  }, []);
  const dismiss = useCallback(() => setMessage(undefined), []);
  return useMemo(
    () => ({ message, report, dismiss }),
    [message, report, dismiss],
  );
}

export interface VaultState {
  readonly open: readonly string[];
  readonly recent: readonly string[];
  readonly current: string | undefined;
  readonly files: readonly FileEntry[];
  select(vault: string): void;
  /** Read the vault list again (a vault opened or closed). */
  reload(): Promise<void>;
  /** List the current vault's files again (they changed on disk). */
  refreshFiles(): void;
}

export function useVaults(report: Errors["report"]): VaultState {
  const [open, setOpen] = useState<readonly string[]>([]);
  const [recent, setRecent] = useState<readonly string[]>([]);
  const [current, setCurrent] = useState<string>();
  const [files, setFiles] = useState<readonly FileEntry[]>([]);
  const [generation, setGeneration] = useState(0);

  const reload = useCallback(async () => {
    const list = await api.vaults();
    setOpen(list.open);
    setRecent(list.recent);
    setCurrent((shown) =>
      shown && list.open.includes(shown) ? shown : list.open.at(-1),
    );
  }, []);
  useEffect(() => report(reload()), [reload, report]);
  useEffect(() => {
    if (!current) {
      setFiles([]);
      return;
    }
    let live = true;
    report(api.files(current).then((listed) => live && setFiles(listed)));
    return () => {
      live = false;
    };
  }, [current, generation, report]);
  // Files created outside the app appear when the window comes back.
  useEffect(() => {
    const refresh = () => setGeneration((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const refreshFiles = useCallback(
    () => setGeneration((value) => value + 1),
    [],
  );
  return useMemo(
    () => ({
      open,
      recent,
      current,
      files,
      select: setCurrent,
      reload,
      refreshFiles,
    }),
    [open, recent, current, files, reload, refreshFiles],
  );
}

/** One event stream for the window; `listener` may change between renders. */
export function useServerEvents(listener: (event: ServerEvent) => void): void {
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => api.events((event) => latest.current(event)), []);
}

export function useMenuCommands(
  handlers: Readonly<Record<MenuCommand, () => void>>,
): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => onMenuCommand((command) => latest.current[command]()), []);
}
