import test from "node:test";
import assert from "node:assert/strict";
import { propertyMarkup } from "./sheet";
import { createPropertyRenderers } from "./renderers";
import type { PropertyContext } from "./context";

test("the first property paint includes a custom renderer", () => {
  const context = {
    source: "current",
    copy() {},
    openMenu: () => () => {},
    renderProperty: (key: string) =>
      key === "citations"
        ? "<button data-source-open>../raw/paper.pdf</button>"
        : undefined,
  } as PropertyContext;
  const html = propertyMarkup(
    "---\ncitations:\n  - resource: ../raw/paper.pdf\n---\n",
    context,
    false,
  );
  assert.match(html, /data-source-open/);
  assert.match(html, /\.\.\/raw\/paper\.pdf/);
});

test("registering and unregistering a renderer notifies mounted sheets", () => {
  let notifications = 0;
  const renderers = createPropertyRenderers(() => {
    notifications += 1;
  });
  const stop = renderers.register({
    key: "sources",
    render: () => "<p>sources</p>",
  });
  assert.equal(notifications, 1);
  assert.match(renderers.render("sources", [], {}) ?? "", /sources/);
  stop();
  assert.equal(notifications, 2);
  assert.equal(renderers.render("sources", [], {}), undefined);
});
