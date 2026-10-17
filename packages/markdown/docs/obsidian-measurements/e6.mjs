import { session } from "./pk.mjs";
const s = await session(
  "---\nt1: hello world\nt2: 3\nt3: true\nt4: 2026-10-08\nt5:\n  - a\n  - b\nt6: a, b\nt7:\nt8: 2026-10-08T14:30\n---\nbody\n",
);
const { page } = s;
const R = (k) =>
  `.workspace-leaf.mod-active .metadata-property[data-property-key="${k}"]`;
const setType = async (k, type) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.click(R(k) + " .metadata-property-icon");
  await page.waitForTimeout(200);
  await page.hover(".menu .menu-item >> text=Property type");
  await page.waitForTimeout(350);
  await page
    .locator(".menu")
    .last()
    .locator(".menu-item-title")
    .filter({ hasText: type })
    .last()
    .click();
  await page.waitForTimeout(500);
};
const show = async (l) => {
  console.log(
    l.padEnd(30),
    JSON.stringify((await s.fm()).split("\n").filter((x) => true)),
    (await s.rows()).join(" "),
  );
};
if (
  await page.evaluate(() =>
    document
      .querySelector(".workspace-leaf.mod-active .metadata-container")
      .classList.contains("is-collapsed"),
  )
) {
  await page.click(".workspace-leaf.mod-active .metadata-properties-heading");
  await page.waitForTimeout(400);
}
const steps = [
  ["t1", "List"],
  ["t1", "Number"],
  ["t1", "Text"],
  ["t1", "Checkbox"],
  ["t2", "Text"],
  ["t2", "Checkbox"],
  ["t2", "List"],
  ["t3", "Text"],
  ["t3", "Number"],
  ["t3", "Checkbox"],
  ["t4", "Text"],
  ["t4", "Date & time"],
  ["t4", "Date"],
  ["t5", "Text"],
  ["t5", "List"],
  ["t5", "Number"],
  ["t6", "List"],
  ["t7", "Checkbox"],
  ["t7", "Number"],
  ["t7", "List"],
  ["t8", "Date"],
  ["t8", "Text"],
];
for (const [k, ty] of steps) {
  await setType(k, ty);
  await show(`${k}->${ty}`);
}
await s.browser.close();
