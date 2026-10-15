import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const gateScript = path.join(repoRoot, "scripts/check-identity-rename.sh");

/** Build old package tokens at runtime so this file itself stays B1-clean. */
function oldPackageName(): string {
  return ["vscode", "markdown", "workbench"].join("-");
}

function runGate(
  fixtureDir: string,
  allowlistPath: string,
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync("bash", [gateScript, allowlistPath], {
    cwd: fixtureDir,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function initFixture(
  lines: Record<string, string>,
  allowRows: string[],
): {
  dir: string;
  allowlist: string;
} {
  const root = mkdtempSync(path.join(tmpdir(), "b1-occurrence-"));
  const dir = path.join(root, "repo");
  mkdirSync(dir);
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "b1@test"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "b1"], { cwd: dir });
  for (const [rel, content] of Object.entries(lines)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content.endsWith("\n") ? content : `${content}\n`);
  }
  // Keep the allowlist outside the fixture git tree so its rows are not hits.
  const allowlist = path.join(root, "allow.txt");
  writeFileSync(allowlist, allowRows.map((row) => `${row}\n`).join(""));
  spawnSync("git", ["add", "-A"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "fixture"], {
    cwd: dir,
    encoding: "utf8",
  });
  return { dir, allowlist };
}

test("B1 rejects same-line old token beside allowlisted GitHub URL (false-green regression)", () => {
  const pkg = oldPackageName();
  const url = `https://github.com/t04dJ14n9/${pkg}`;
  // One approved URL occurrence and one unapproved occurrence of the same token.
  const poisoned = JSON.stringify({
    repository: { url },
    stale: pkg,
  });
  const { dir, allowlist } = initFixture({ "package.json": poisoned }, [
    `package.json\t${url}`,
  ]);

  const result = runGate(dir, allowlist);
  assert.notEqual(
    result.status,
    0,
    `expected B1 failure for same-line stale token; stdout=${result.stdout} stderr=${result.stderr}`,
  );
  assert.match(result.stdout, /B1 HIT: package\.json:/);
});

test("B1 still allows a line whose only old token lies inside the approved URL", () => {
  const pkg = oldPackageName();
  const url = `https://github.com/t04dJ14n9/${pkg}`;
  const clean = JSON.stringify({ repository: { url } });
  const { dir, allowlist } = initFixture({ "package.json": clean }, [
    `package.json\t${url}`,
  ]);

  const result = runGate(dir, allowlist);
  assert.equal(
    result.status,
    0,
    `expected B1 clean for URL-only line; stdout=${result.stdout} stderr=${result.stderr}`,
  );
  assert.doesNotMatch(result.stdout, /B1 HIT:/);
});

test("B1 bare-token allowlist row still requires an exact line match", () => {
  const pkg = oldPackageName();
  const { dir, allowlist } = initFixture(
    { "notes.txt": `prefix ${pkg} suffix` },
    [`notes.txt\t${pkg}`],
  );

  const result = runGate(dir, allowlist);
  assert.notEqual(
    result.status,
    0,
    `expected bare-token row to reject longer line; stdout=${result.stdout}`,
  );
  assert.match(result.stdout, /B1 HIT: notes\.txt:/);
});

test("B1 bare-token allowlist row accepts an exact line", () => {
  const pkg = oldPackageName();
  const { dir, allowlist } = initFixture({ "notes.txt": pkg }, [
    `notes.txt\t${pkg}`,
  ]);

  const result = runGate(dir, allowlist);
  assert.equal(
    result.status,
    0,
    `expected bare-token exact line to pass; stdout=${result.stdout} stderr=${result.stderr}`,
  );
});
