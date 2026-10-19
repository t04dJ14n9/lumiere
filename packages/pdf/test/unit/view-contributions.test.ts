import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAGE_LAYOUTS,
  SCROLL_DIRECTIONS,
  SCROLL_MODES,
} from "../../src/shared/view-options";
import { pdfContributes } from "./support/manifest";

const contributes = pdfContributes<{
  commands: { command: string; enablement?: string }[];
  menus: Record<string, { command: string; when?: string }[]>;
  configuration: { properties: Record<string, { default: unknown }> };
}>();

test("every view choice has a PDF command, scoped menus and a contributed default setting", () => {
  const names = [
    "actualSize",
    "selectView",
    ...[...PAGE_LAYOUTS, ...SCROLL_MODES, ...SCROLL_DIRECTIONS].map(
      (item) => item.command,
    ),
  ];
  for (const name of names) {
    const command = `lumiere.pdf.${name}`;
    assert.equal(
      contributes.commands.find((item) => item.command === command)?.enablement,
      "lumiere.pdf.pdfActive",
    );
    for (const menu of ["commandPalette", "editor/title", "webview/context"]) {
      assert.ok(
        contributes.menus[menu]?.some(
          (item) =>
            item.command === command &&
            item.when?.includes("lumiere.pdf.viewer"),
        ),
        `${menu}: ${command}`,
      );
    }
  }
  for (const [name, value] of Object.entries({
    defaultZoom: "fitWidth",
    pageLayout: "single",
    scrollMode: "continuous",
    scrollDirection: "vertical",
    smoothScrolling: null,
  })) {
    assert.equal(
      contributes.configuration.properties[`lumiere.pdf.view.${name}`]?.default,
      value,
    );
  }
});
