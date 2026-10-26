// The iPad's menu bar, keys and edit menu send the window the commands it
// knows: Swift's names (LumiereNative) are the window's (tauri.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MENU_COMMANDS, parseAppCommand } from "@workshop/app/shell";

const native = new URL(
  "../../ios/LumiereNative/Sources/LumiereNative/",
  import.meta.url,
);

async function swift(file: string): Promise<string> {
  return readFile(new URL(file, native), "utf8");
}

test("the menu bar's commands are the window's, in the same order", async () => {
  const source = await swift("WindowCommands.swift");
  const enumBody = /enum WindowCommand[^{]*\{([\s\S]*?)\n\s*var title/.exec(
    source,
  )?.[1];
  assert.ok(enumBody, "WindowCommand's cases");
  const names = [...enumBody.matchAll(/case \w+ = "([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(names, [...MENU_COMMANDS]);
});

test("More… in the edit menu asks for the shown note's own menu", async () => {
  const source = await swift("WindowCommandsPlugin.swift");
  const pageMenu = /static let pageMenu = "([^"]+)"/.exec(source)?.[1];
  assert.equal(pageMenu, "page-menu");
  assert.equal(parseAppCommand(pageMenu), "page-menu");
});
