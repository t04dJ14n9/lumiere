/**
 * The Settings tab, as VS Code's Settings editor: a search field, the groups
 * on the left, and every setting with its control. Lumière's settings come
 * from host-node; Color Theme is the window's own.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SettingItem } from "@workshop/host-node/settings";
import type { UiStateHandle } from "../ui-state";
import type { ColorTheme } from "../../shared/ui-state";
import { settings } from "../settings";
import {
  COLOR_THEME_KEY,
  colorThemeItem,
  groupSettings,
} from "../settings-view";
import { SettingRow } from "./SettingRow";

export interface SettingsEditorProps {
  readonly visible: boolean;
  readonly ui: UiStateHandle;
  readonly report: (work: Promise<unknown>) => void;
}

export function SettingsEditor({ visible, ui, report }: SettingsEditorProps) {
  const { items, problems, change, reset } = useSettings(visible, ui, report);
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupSettings(items, query), [items, query]);
  const found = groups.reduce((total, group) => total + group.items.length, 0);
  const scrollTo = (category: string) =>
    list.current
      ?.querySelector(`[data-group="${CSS.escape(category)}"]`)
      ?.scrollIntoView({ block: "start" });
  return (
    <div className="settings-editor" hidden={!visible}>
      <SettingsSearch
        visible={visible}
        query={query}
        found={found}
        onQuery={setQuery}
      />
      <div className="settings-body">
        <nav className="settings-toc" aria-label="Setting groups">
          {groups.map((group) => (
            <button
              key={group.category}
              type="button"
              onClick={() => scrollTo(group.category)}
            >
              {group.category}
            </button>
          ))}
        </nav>
        <div className="settings-list" ref={list}>
          {groups.map((group) => (
            <section key={group.category} data-group={group.category}>
              <h2>{group.category}</h2>
              {group.items.map((item) => (
                <SettingRow
                  key={item.key}
                  item={item}
                  problem={problems[item.key]}
                  onChange={(value) => change(item, value)}
                  onReset={() => reset(item)}
                />
              ))}
            </section>
          ))}
          {groups.length === 0 && (
            <p className="settings-none">No settings found.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** The search field, focused whenever the tab shows; Escape clears it. */
function SettingsSearch({
  visible,
  query,
  found,
  onQuery,
}: {
  readonly visible: boolean;
  readonly query: string;
  readonly found: number;
  readonly onQuery: (query: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (visible) {
      input.current?.focus();
    }
  }, [visible]);
  return (
    <header className="settings-search">
      <input
        ref={input}
        type="search"
        placeholder="Search settings"
        aria-label="Search settings"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && onQuery("")}
      />
      {query && (
        <span className="settings-count">
          {found === 1 ? "1 Setting Found" : `${found} Settings Found`}
        </span>
      )}
    </header>
  );
}

/** Lumière's settings, read whenever the tab shows, and the window's Color Theme. */
function useSettings(
  visible: boolean,
  ui: UiStateHandle,
  report: (work: Promise<unknown>) => void,
) {
  const [lumiere, setLumiere] = useState<readonly SettingItem[]>([]);
  const [problems, setProblems] = useState<Readonly<Record<string, string>>>(
    {},
  );
  useEffect(() => {
    if (visible) {
      report(settings.list().then(setLumiere));
    }
  }, [visible, report]);
  const items = useMemo(
    () => [colorThemeItem(ui.state.theme), ...lumiere],
    [ui.state.theme, lumiere],
  );
  const apply = useCallback(
    (item: SettingItem, change: { value: unknown } | { reset: true }) => {
      if (item.key === COLOR_THEME_KEY) {
        ui.update({
          theme: "reset" in change ? "system" : (change.value as ColorTheme),
        });
        return;
      }
      settings.change({ key: item.key, ...change }).then(
        (updated) => {
          setLumiere((current) =>
            current.map((other) =>
              other.key === updated.key ? updated : other,
            ),
          );
          setProblems(({ [item.key]: _, ...rest }) => rest);
        },
        (error: unknown) =>
          setProblems((current) => ({
            ...current,
            [item.key]: error instanceof Error ? error.message : String(error),
          })),
      );
    },
    [ui],
  );
  return {
    items,
    problems,
    change: (item: SettingItem, value: unknown) => apply(item, { value }),
    reset: (item: SettingItem) => apply(item, { reset: true }),
  };
}
