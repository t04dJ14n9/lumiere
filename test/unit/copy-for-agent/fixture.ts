import { fakeDocument, fakeWorkbench } from "../../support/vscode-fake";
import { fakeViews } from "../views/fakes";
import { rpcPair } from "../../support/rpc-pair";
import { Session } from "../../../src/plugins/document/session";
import { SelectionSnapshots } from "../../../src/plugins/editor/selection";
import type { EditorPanel, Editors } from "../../../src/plugins/editor/api";
import { protocol } from "../../../src/plugins/editor/protocol";
import { AgentReferences } from "../../../src/plugins/copyForAgent/agent";
export function fixture() {
  const state = {
    text: "one\r\ntwo\r\nthree",
    dirty: false,
    version: 1,
    from: 0,
    to: 8,
    closed: false,
    enabled: true,
    choice: "Cancel",
    forged: false,
  };
  const pair = rpcPair();
  const copied: string[] = [];
  let changed = () => {};
  let beforeCapture = () => {};
  let beforeSave = () => {};
  const document = {
    ...fakeDocument(),
    uri: "file:///vault/Note.md",
    eol: "\r\n" as const,
    getText: () => state.text,
    get version() {
      return state.version;
    },
    get isDirty() {
      return state.dirty;
    },
    save: async () => {
      state.dirty = false;
      return true;
    },
  };
  const views = fakeViews().views;
  views.ask = async () => state.choice;
  const workbench = fakeWorkbench({
    views,
    workspaceFolders: () => ["file:///vault"],
    clipboard: {
      read: async () => "",
      write: async (text) => {
        copied.push(text);
      },
    },
    config: () => ({
      preset: "obsidian",
      mode: "livePreview",
      features: { copyForAgent: { enabled: state.enabled, config: {} } },
    }),
    onConfiguration: (listener) => {
      changed = listener;
      return () => {};
    },
  });
  const session = new Session(document, workbench);
  const panel: EditorPanel = {
    id: "panel",
    document,
    session,
    rpc: pair.host,
    active: () => true,
    reveal() {},
    dispose() {},
  };
  const editors: Editors = {
    all: () => (state.closed ? [] : [panel]),
    active: () => panel,
    capture: async () => {
      throw new Error("unused");
    },
    restore: async () => {},
  };
  pair.client.handle(protocol, "captureSelection", () => {
    beforeCapture();
    return {
      from: state.from,
      to: state.to,
      version: session.version,
      text: state.forged ? "forged" : session.text.slice(state.from, state.to),
    };
  });
  const selections = new SelectionSnapshots(
    (id) => editors.all().find((item) => item.id === id),
    workbench,
  );
  const agent = new AgentReferences({
    editors,
    selections,
    workbench,
    beforeSave: async () => {
      beforeSave();
    },
  });
  return {
    state,
    copied,
    pair,
    panel,
    editors,
    selections,
    agent,
    workbench,
    changeConfig: () => changed(),
    beforeCapture: (run: () => void) => {
      beforeCapture = run;
    },
    beforeSave: (run: () => void) => {
      beforeSave = run;
    },
  };
}
