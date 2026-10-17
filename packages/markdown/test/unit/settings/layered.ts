import { provideHostServices } from "../../../src/shared/host";
import { contributedProperties } from "../../support/manifest";
import { createRoot } from "@workshop/core";
import { settingsHost } from "../../../src/plugins/settings/host";
import type {
  ContributedSetting,
  Dialogs,
  PickItem,
  SettingsAccess,
  SettingTarget,
} from "../../../src/shared/host";
import { checkWrite, contributionId } from "../../../src/shared/setting-schema";
import { fakeViews, hostWith } from "../views/fakes";
import { withHost } from "../../support/vscode-fake";

/** The contributed settings exactly as the generated package.json lists them. */
export const contributed: readonly ContributedSetting[] = Object.entries(
  contributedProperties<ContributedSetting["schema"]>(),
).map(([key, schema]) => ({ key, schema }));

export const contributedSetting = (key: string) =>
  contributed.find((setting) => setting.key === `markdownWorkshop.${key}`)!;

/**
 * Layered settings, the workspace over the user's as in VS Code. `update` is
 * gated like the host's: only the extension's own keys and values its schema
 * allows are written (the host calls the same `checkWrite`).
 */
export function layered(
  list: readonly ContributedSetting[] = contributed,
  defaults: Record<string, unknown> = Object.fromEntries(
    list.map((setting) => [
      setting.key.replace("markdownWorkshop.", ""),
      setting.schema?.default,
    ]),
  ),
) {
  const user = new Map<string, unknown>();
  const workspace = new Map<string, unknown>();
  const opened: string[] = [];
  const locate = (key: string): SettingTarget =>
    workspace.has(key) ? "workspace" : "user";
  const access: SettingsAccess = {
    inspect: (key) => ({
      target: locate(key),
      value: workspace.get(key) ?? user.get(key) ?? defaults[key],
    }),
    async update(key, value) {
      const checked = checkWrite(list, key, value);
      if ("problem" in checked) {
        throw new Error(checked.problem);
      }
      const target = locate(key);
      (target === "workspace" ? workspace : user).set(key, value);
      return target;
    },
    searchFilter: "@ext:test.workshop",
    contributed: () => list,
    async openUi(query) {
      opened.push(query);
    },
  };
  return { access, user, workspace, opened };
}

/** The settings plugin running against `store`, with scripted answers. */
export async function run(
  store: ReturnType<typeof layered>,
  answers: {
    pick?: (items: readonly PickItem<unknown>[]) => unknown;
    input?: string | undefined;
  } = {},
) {
  const fake = fakeViews();
  const asked: { value: string; validate(text: string): string | undefined }[] =
    [];
  const picks: PickItem<unknown>[][] = [];
  const informed: string[] = [];
  const errors: string[] = [];
  const host = withHost(hostWith(fake), {
    settings: { access: store.access },
    dialogs: {
      pick: (async (options: {
        items(query: string): readonly PickItem<unknown>[];
      }) => {
        const items = options.items("");
        picks.push([...items]);
        const chosen = answers.pick?.(items);
        return chosen === undefined
          ? undefined
          : { item: items.find((item) => item.value === chosen), query: "" };
      }) as Dialogs["pick"],
      input: async (options) => {
        asked.push(options);
        return answers.input;
      },
      inform: (message) => void informed.push(message),
      error: (message) => void errors.push(message),
    },
  });
  const root = createRoot({});
  provideHostServices(root, host);
  root.plugin(settingsHost);
  await root.settled();
  const command = (id: string) => {
    const run = fake.commands.get(contributionId(id));
    if (!run) {
      throw new Error(`No command ${id}`);
    }
    return run;
  };
  return { fake, root, command, asked, picks, informed, errors };
}
