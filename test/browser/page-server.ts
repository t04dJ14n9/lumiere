import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function servePage(page: Page, html: string): Promise<void> {
  await page.route("http://editor.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") {
      await route.fulfill({ contentType: "text/html", body: html });
      return;
    }
    const target = path.resolve("." + decodeURIComponent(url.pathname));
    const allowed = ["dist", "artifacts", "test/fixtures", "examples"].some(
      (folder) => target.startsWith(path.resolve(folder) + "/"),
    );
    if (!allowed) {
      await route.abort();
      return;
    }
    const types: Record<string, string> = {
      ".css": "text/css",
      ".js": "text/javascript",
      ".mjs": "text/javascript",
      ".pdf": "application/pdf",
      ".svg": "image/svg+xml",
      ".wasm": "application/wasm",
      ".png": "image/png",
      ".wav": "audio/wav",
      ".webm": "video/webm",
    };
    let body: Buffer;
    try {
      body = await readFile(target);
    } catch {
      await route.fulfill({ status: 404, body: "Fixture not found" });
      return;
    }
    {
      const contentType =
        types[path.extname(target)] ?? "application/octet-stream";
      const range = /^bytes=(\d+)-(\d*)$/.exec(
        route.request().headers().range ?? "",
      );
      if (range) {
        const start = Number(range[1]);
        const end = Math.min(
          body.length - 1,
          range[2] ? Number(range[2]) : body.length - 1,
        );
        await route.fulfill({
          status: 206,
          contentType,
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${start}-${end}/${body.length}`,
          },
          body: body.subarray(start, end + 1),
        });
      } else {
        await route.fulfill({
          contentType,
          headers: { "Accept-Ranges": "bytes" },
          body,
        });
      }
    }
  });
  await page.goto("http://editor.test/");
}
