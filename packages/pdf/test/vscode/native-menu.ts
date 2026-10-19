/**
 * Cursor on macOS draws every context menu natively, whatever
 * `window.menuStyle` says, so the menu a right-click opens is out of the
 * tests' reach. The workbench hands that menu its items in one function, the
 * only one that sends `vscode:contextmenu` to the main process. A breakpoint
 * on that send which never pauses keeps the items for the test and empties
 * the list, so no menu is drawn; choosing an item runs its click handler, as
 * the native menu would.
 */
import type { CDPSession, Page } from "@playwright/test";

const CHANNEL = '"vscode:contextmenu"';
const WORKBENCH_SCRIPT = /workbench\.desktop\.main\.js$/u;
const KEEP = "__lumiereNativeMenu";

export interface NativeMenuItem {
  label?: string | undefined;
  type?: string | undefined;
  enabled?: boolean | undefined;
  submenu?: NativeMenuItem[] | undefined;
  click?: ((event: object) => void) | undefined;
}

/** Where the workbench script sends the menu: found once per Cursor build. */
let sendLocation:
  | Promise<{ url: string; lineNumber: number; columnNumber: number }>
  | undefined;

async function findSend(session: CDPSession) {
  const scripts = new Map<string, string>();
  session.on("Debugger.scriptParsed", ({ scriptId, url }) => {
    if (WORKBENCH_SCRIPT.test(url)) {
      scripts.set(scriptId, url);
    }
  });
  await session.send("Debugger.enable");
  const [scriptId, url] = [...scripts][0] ?? [];
  if (!scriptId || !url) {
    throw new Error("No workbench script to break in");
  }
  const { scriptSource } = await session.send("Debugger.getScriptSource", {
    scriptId,
  });
  const channel = new RegExp(
    `([\\w$]+)=${CHANNEL.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`,
    "u",
  ).exec(scriptSource)?.[1];
  const send = channel ? scriptSource.indexOf(`.send(${channel},`) : -1;
  if (send < 0) {
    throw new Error("No native context menu send to break on");
  }
  const lineStart = scriptSource.lastIndexOf("\n", send) + 1;
  return {
    url,
    lineNumber: scriptSource.slice(0, lineStart).split("\n").length - 1,
    columnNumber: send - lineStart,
  };
}

/** Right-click at a point and return the items of the native menu it opens. */
export async function nativeContextMenu(
  page: Page,
  rightClick: () => Promise<void>,
): Promise<NativeMenuItem[]> {
  const session = await page.context().newCDPSession(page);
  try {
    sendLocation ??= findSend(session);
    const { url, ...at } = await sendLocation;
    await session.send("Debugger.enable");
    const { breakpointId } = await session.send("Debugger.setBreakpointByUrl", {
      url,
      ...at,
      // The send is in the function that takes the items as its first argument.
      condition: `(globalThis.${KEEP} = arguments[0].slice(), arguments[0].length = 0, false)`,
    });
    await page.evaluate((key) => {
      delete (globalThis as Record<string, unknown>)[key];
    }, KEEP);
    await rightClick();
    await page.waitForFunction(
      (key) => (globalThis as Record<string, unknown>)[key],
      KEEP,
    );
    await session.send("Debugger.removeBreakpoint", { breakpointId });
    return await page.evaluate((key) => {
      const plain = (items: NativeMenuItem[]): NativeMenuItem[] =>
        items.map(({ label, type, enabled, submenu }) => ({
          label,
          type,
          enabled,
          ...(Array.isArray(submenu) ? { submenu: plain(submenu) } : {}),
        }));
      return plain(
        (globalThis as unknown as Record<string, NativeMenuItem[]>)[key]!,
      );
    }, KEEP);
  } finally {
    await session.send("Debugger.disable").catch(() => undefined);
    await session.detach().catch(() => undefined);
  }
}

/** The labels of a native menu's items, separators and submenus left out. */
export function labels(items: NativeMenuItem[]): string[] {
  return items.flatMap((item) =>
    item.type === "separator" || !item.label
      ? []
      : [item.label.replace(/&&?/gu, "")],
  );
}

/** Run a native menu item's click handler, as choosing it would. */
export async function chooseNativeItem(
  page: Page,
  label: string,
): Promise<void> {
  await page.evaluate(
    ({ key, label }) => {
      const items = (globalThis as unknown as Record<string, NativeMenuItem[]>)[
        key
      ];
      const item = items?.find(
        (entry) => entry.label?.replace(/&&?/gu, "") === label,
      );
      if (!item?.click) {
        throw new Error(`No "${label}" in the context menu`);
      }
      item.click({});
    },
    { key: KEEP, label },
  );
}
