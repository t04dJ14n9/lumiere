// Checks on the built extension (scripts/build.mjs), apart so tests can run
// them on samples of both builds: `pnpm build` writes readable code and
// `pnpm package` minified code, and a check must hold for both.

/**
 * Whether Follow Link still creates notes from basename Markdown links
 * (`create: request.wiki || …`), which a wrong `@workshop/markdown`
 * resolution or a stale worktree drops.
 * @param {string} extensionJs
 */
export function keepsBasenameCreate(extensionJs) {
  return /create:\s*[\w$]+\.wiki\s*\|\|/.test(extensionJs);
}
