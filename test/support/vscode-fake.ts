import type { HostDocument, Workbench } from "../../src/shared/runtime";
export function fakeWorkbench(overrides: Partial<Workbench> = {}): Workbench {
  return {
    fingerprint: (text) => text,
    apply: async () => false,
    onChange: () => () => {},
    onSave: () => () => {},
    onWillSave: () => () => {},
    command: () => () => {},
    execute: async () => {},
    clipboard: { read: async () => "", write: async () => {} },
    error() {},
    registerEditor: () => () => {},
    config: () => ({ preset: "minimal", mode: "source" }),
    read: async () => new Uint8Array(),
    stat: async () => ({ mtime: 0, symbolicLink: false }),
    ...overrides,
  };
}
export function fakeDocument(
  overrides: Partial<HostDocument> = {},
): HostDocument {
  return {
    id: "fixture",
    uri: "file:///fixture/Note.md",
    version: 1,
    isDirty: true,
    isUntitled: false,
    eol: "\n",
    getText: () => "note",
    save: async () => true,
    ...overrides,
  };
}
