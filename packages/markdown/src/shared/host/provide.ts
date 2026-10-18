import type { BaseContext } from "@workshop/core";
import type { HostServices } from "./index";

/** Every host service name, in the order the interface lists them. */
export const HOST_SERVICE_NAMES = [
  "hostDocuments",
  "hostCommands",
  "clipboard",
  "dialogs",
  "views",
  "activeEditor",
  "settings",
  "workspace",
  "storage",
  "extensions",
  "navigation",
  "customEditors",
  "agentHost",
  "git",
  "diffViews",
] as const satisfies readonly (keyof HostServices)[];

/**
 * Publish every host service in a plugin tree: the extension's, and each
 * editor panel's (panels are separate trees, wired by the composition root).
 * One the host lacks (Git in a browser) stays absent, so the plugins that
 * need it do not start.
 */
export function provideHostServices(
  root: BaseContext,
  services: HostServices,
): void {
  for (const name of HOST_SERVICE_NAMES) {
    if (services[name] !== undefined) {
      root.provide(name, services[name] as never);
    }
  }
}
