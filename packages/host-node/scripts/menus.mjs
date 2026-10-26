// What `menus.json` holds: Lumière's items of VS Code's `webview/context`
// menu in package.json, each with its command's title and short title. A
// submenu (`contributes.submenus`) brings its label and its own items.
// host-node's `parseMenus` reads it.

const PREFIX = "lumiere.markdown.";
const MAX_SUBMENU_DEPTH = 4;

/**
 * @param {{ commands: { command: string, title: string, shortTitle?: string }[],
 *   submenus?: { id: string, label: string }[],
 *   menus?: Record<string, { command?: string, submenu?: string }[]> }} contributes
 */
export function lumiereMenus(contributes) {
  const commands = new Map(
    contributes.commands.map((command) => [command.command, command]),
  );
  const labels = new Map(
    (contributes.submenus ?? []).map((submenu) => [submenu.id, submenu.label]),
  );
  const menu = (id, depth) =>
    (contributes.menus?.[id] ?? [])
      .filter((item) => (item.command ?? item.submenu ?? "").startsWith(PREFIX))
      .map((item) =>
        item.submenu
          ? {
              ...item,
              title: labels.get(item.submenu) ?? item.submenu,
              items:
                depth < MAX_SUBMENU_DEPTH ? menu(item.submenu, depth + 1) : [],
            }
          : withTitles(item, commands.get(item.command)),
      );
  return menu("webview/context", 0);
}

function withTitles(item, command) {
  return {
    ...item,
    title: command?.title ?? item.command,
    ...(command?.shortTitle ? { shortTitle: command.shortTitle } : {}),
  };
}
