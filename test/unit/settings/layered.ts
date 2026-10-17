import { readFileSync } from "node:fs";
import { createRoot } from "@workshop/core";
import { settingsHost } from "../../../src/plugins/settings/host";
import type {
  ContributedSetting,
  PickItem,
  SettingsAccess,
  SettingTarget,
} from "../../../src/shared/runtime";
import { checkWrite, contributionId } from "../../../src/shared/setting-schema";
import { fakeViews, workbenchWith } from "../views/fakes";

/** The contributed settings exactly as the generated package.json lists them. */
export const contributed: readonly ContributedSetting[] = Object.entries(
  (
    JSON.parse(readFileSync("package.json", "utf8")) as {
      contributes: {
        configuration: {
          properties: Record<string, ContributedSetting["schema"]>;
        };
      };
    }
  ).contributes.configuration.properties,
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
  const views = {
    ...fake.views,
    pick: async (options: { items(query: string): PickItem<unknown>[] }) => {
      const items = options.items("");
      picks.push(items);
      const chosen = answers.pick?.(items);
      return chosen === undefined
        ? undefined
        : { item: items.find((item) => item.value === chosen), query: "" };
    },
    input: async (options: {
      value: string;
      validate(text: string): string | undefined;
    }) => {
      asked.push(options);
      return answers.input;
    },
  } as never;
  const workshop = workbenchWith(views);
  workshop.settings = store.access;
  const informed: string[] = [];
  const errors: string[] = [];
  workshop.inform = (message) => informed.push(message);
  workshop.error = (message) => errors.push(message);
  const root = createRoot({});
  root.provide("workshop", workshop);
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
