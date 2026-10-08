import { test, expect } from "@playwright/test";
import { build } from "esbuild";
test("the unchanged pure kernel runs and disposes in Chromium", async ({ page }) => {
  const bundle = await build({
    stdin: {
      contents: `
    import { Context } from './src/kernel';
    const root = Context.create();
    const order = [];
    root.plugin({ name: 'browser', apply(ctx) {
      ctx.effect(() => () => order.push('disposed'));
      order.push('active');
    } });
    await root.settled(); await root.dispose();
    document.body.textContent = JSON.stringify(order);
  `,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "chrome120",
  });
  await page.setContent("<body></body>");
  await page.addScriptTag({ type: "module", content: bundle.outputFiles[0]!.text });
  await expect(page.locator("body")).toHaveText('["active","disposed"]');
});
