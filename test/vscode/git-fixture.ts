/**
 * A git repository inside the test workspace for the git diff plugins: a
 * committed note and a working-tree edit with a heading, paragraph edits, a
 * changed table row, a changed code block and a removed paragraph.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import { paths } from "./state";

export const REPO = "git-notes";
export const NOTE = `${REPO}/Gross margin.md`;
export const notePath = () => path.join(paths.workspace, NOTE);

export const BASE = `---
type: Metric
status: draft
---
# Gross margin

Gross margin is revenue minus the cost of goods sold, shown as a percentage. Report it monthly.

## By region

| Region | Q2 | Q3 |
| --- | --- | --- |
| APAC | 31% | 33% |
| EMEA | 27% | 26% |
| AMER | 35% | 34% |

Margins below 20% must be escalated to the finance lead within one week of the close.

## Computation

\`\`\`js
export function margin(rev, cost) {
  return (rev - cost) / rev * 100;
}
\`\`\`
`;

export const NOW = `---
type: Metric
status: reviewed
---
# Gross margin

Gross margin is revenue minus the cost of goods sold, expressed as a ratio of revenue. Report it per region every quarter.

## By region

| Region | Q2 | Q3 |
| --- | --- | --- |
| APAC | 31% | 33% |
| EMEA | 28% | 29% |
| AMER | 35% | 34% |

## Computation

\`\`\`js
export function margin(rev, cost) {
  if (rev === 0) return 0;
  return (rev - cost) / rev; // ratio, not %
}
\`\`\`

See also the margin standard policy for rounding rules.
`;

const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: path.join(paths.workspace, REPO),
    encoding: "utf8",
  });

/** A fresh repository with BASE committed and NOW in the working tree. */
export function createRepository(): void {
  const root = path.join(paths.workspace, REPO);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(notePath(), BASE);
  git("add", ".");
  git("commit", "-q", "-m", "Gross margin");
  writeFileSync(notePath(), NOW);
}

export const commitAll = () => {
  git("add", ".");
  git("commit", "-q", "-m", "update");
};
export const stagedNames = () => git("diff", "--cached", "--name-only").trim();
export const readGitNote = () => readFileSync(notePath(), "utf8");

const userSettings = () => path.join(paths.userData, "User", "settings.json");

/** Edit the throwaway profile's user settings (theme, plugin switches). */
export function setUserSettings(values: Record<string, unknown>): void {
  const current = JSON.parse(readFileSync(userSettings(), "utf8")) as Record<
    string,
    unknown
  >;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete current[key];
    } else {
      current[key] = value;
    }
  }
  writeFileSync(userSettings(), JSON.stringify(current, null, 2));
}

export const THEMES = {
  dark: "Default Dark Modern",
  light: "Default Light Modern",
} as const;

export async function useTheme(
  page: Page,
  theme: keyof typeof THEMES,
): Promise<void> {
  setUserSettings({ "workbench.colorTheme": THEMES[theme] });
  await expect(page.locator(".monaco-workbench")).toHaveClass(
    theme === "dark" ? /vs-dark/ : /\bvs\b/,
    { timeout: 15000 },
  );
}

/** The frame holding the Markdown Workbench editor that shows `selector`. */
export async function frameWith(
  page: Page,
  selector: string,
  timeout = 20000,
): Promise<Frame> {
  let found: Frame | undefined;
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          if (
            await frame
              .locator(selector)
              .count()
              .catch(() => 0)
          ) {
            found = frame;
            return true;
          }
        }
        return false;
      },
      { timeout },
    )
    .toBe(true);
  return found!;
}

export const SCREENSHOTS = process.env.MARKDOWN_WORKBENCH_SCREENSHOTS;

/** Save the editor area to SCREENSHOTS/gitdiff-impl-<name>.png when asked to. */
export async function shoot(page: Page, name: string): Promise<void> {
  if (!SCREENSHOTS) {
    return;
  }
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.waitForTimeout(400);
  await page.locator(".part.editor").screenshot({
    path: path.join(SCREENSHOTS, `gitdiff-impl-${name}.png`),
  });
}
