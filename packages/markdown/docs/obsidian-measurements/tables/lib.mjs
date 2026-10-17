// Connects to a running Obsidian started with --remote-debugging-port=9333.
import { chromium } from "@playwright/test";
export async function connect() {
  const browser = await chromium.connectOverCDP("http://localhost:9333");
  const page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes("app://"));
  return { browser, page };
}
