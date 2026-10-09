import test from "node:test";
import assert from "node:assert/strict";
import { hostCli } from "../../vscode/host-cli";

test("the native tests find Cursor's bin/cursor and fall back to bin/code", () => {
  const files = new Set(["/opt/cursor/bin/cursor", "/opt/code/bin/code"]);
  const exists = (file: string) => files.has(file);
  assert.equal(
    hostCli({
      app: "/opt/cursor",
      resources: "/opt/cursor/resources/app",
      platform: "linux",
      applicationName: "cursor",
      exists,
    }),
    "/opt/cursor/bin/cursor",
  );
  assert.equal(
    hostCli({
      app: "/opt/code",
      resources: "/opt/code/resources/app",
      platform: "linux",
      applicationName: "code-oss",
      exists,
    }),
    "/opt/code/bin/code",
  );
  assert.equal(
    hostCli({
      app: "/A",
      resources: "/A/Contents/Resources/app",
      platform: "darwin",
      exists: () => false,
    }),
    "/A/Contents/Resources/app/bin/code",
  );
});
