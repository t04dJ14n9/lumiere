import assert from "node:assert/strict";
import { test } from "node:test";
import { settingTarget } from "../../src/shared/settings-target";

test("a setting is saved in the workspace when the workspace sets it, else in the user settings", () => {
  assert.equal(settingTarget(undefined), "user");
  assert.equal(settingTarget({}), "user");
  assert.equal(settingTarget({ workspaceValue: undefined }), "user");
  assert.equal(settingTarget({ workspaceValue: false }), "workspace");
  assert.equal(settingTarget({ workspaceValue: null }), "workspace");
  assert.equal(settingTarget({ workspaceFolderValue: "paged" }), "workspace");
});
