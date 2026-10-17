import assert from "node:assert/strict";
import test from "node:test";
import {
  createVsCodeIdeContextHost,
  mapVsCodeDiagnostic,
} from "../../../src/shared/ide-context/host-apis";

const uri = (value: string) => ({ toString: () => value });
const tab = (value: string, viewType?: string, isActive = false) => ({
  input: { uri: uri(value), viewType },
  isActive,
});
function facade() {
  return {
    window: {
      tabGroups: {
        all: [
          {
            isActive: false,
            tabs: [
              tab("file:///other", undefined, true),
              tab("file:///hidden"),
              tab("output:channel"),
              tab("vscode-terminal:/1"),
              tab("file:///unknown", "unknown"),
              {
                input: { viewType: "markdownWorkshop.editor" },
                isActive: false,
              },
              { input: { terminal: {} }, isActive: false },
              {
                input: {
                  original: uri("file:///old"),
                  modified: uri("file:///new"),
                },
                isActive: false,
              },
            ],
          },
          {
            isActive: true,
            tabs: [
              tab("file:///text", undefined, true),
              tab("file:///md", "markdownWorkshop.editor"),
              tab("file:///pdf", "pdfWorkshop.viewer"),
              tab("file:///text"),
            ],
          },
          { isActive: false, tabs: [tab("file:///text", undefined, true)] },
        ],
      },
      activeTextEditor: {
        document: {
          uri: uri("file:///text"),
          languageId: "markdown",
          isDirty: true,
        },
        selection: { active: { line: 3, character: 4 } },
      },
    },
    Uri: { parse: (value: string) => ({ canonical: value }) },
    languages: {
      getDiagnostics: (value: { canonical: string }) => {
        assert.equal(value.canonical, "file:///text");
        return [0, 1].map((severity) => ({
          severity,
          message: "issue",
          range: {
            start: { line: 1, character: 2 },
            end: { line: 3, character: 4 },
          },
          source: "lint",
          code: { value: "rule" },
        }));
      },
    },
    workspace: { name: "notes", workspaceFolders: [{}] },
  };
}
test("tabs include workshop inputs, dedupe and put active group first", () => {
  const tabs = createVsCodeIdeContextHost(facade()).listTabs();
  assert.deepEqual(tabs.open, [
    "file:///other",
    "file:///hidden",
    "file:///text",
    "file:///md",
    "file:///pdf",
  ]);
  assert.deepEqual(tabs.visible, ["file:///text", "file:///other"]);
});
test("custom view allowlist extends defaults", () => {
  assert.ok(
    createVsCodeIdeContextHost(facade(), { customViewTypes: ["unknown"] })
      .listTabs()
      .open.includes("file:///unknown"),
  );
});
test("diagnostics parse canonical URI and map ranges, severities and codes", () => {
  assert.deepEqual(
    createVsCodeIdeContextHost(facade()).getDiagnostics("file:///text"),
    ["error", "warning"].map((severity) => ({
      severity,
      message: "issue",
      startLine: 1,
      startCharacter: 2,
      endLine: 3,
      endCharacter: 4,
      source: "lint",
      code: "rule",
    })),
  );
});
test("diagnostic and tab enumeration failures return empty results", () => {
  const mock = facade();
  mock.languages.getDiagnostics = () => {
    throw new Error("unavailable");
  };
  Object.defineProperty(mock.window.tabGroups, "all", {
    get() {
      throw new Error("unavailable");
    },
  });
  const host = createVsCodeIdeContextHost(mock);
  assert.deepEqual(host.getDiagnostics("bad"), []);
  assert.deepEqual(host.listTabs(), { visible: [], open: [] });
});
test("host snapshots active editor and workspace", () => {
  const host = createVsCodeIdeContextHost(facade());
  assert.deepEqual(host.activeTextEditor, {
    uri: "file:///text",
    languageId: "markdown",
    isDirty: true,
    caret: { line: 3, character: 4 },
  });
  assert.deepEqual(host.workspace, { name: "notes", folderCount: 1 });
});

test("gather survives a throwing host tab API and records a warning", async () => {
  const { gatherIdeContext } =
    await import("../../../src/shared/ide-context/gather");
  const host = createVsCodeIdeContextHost(facade());
  host.listTabs = () => {
    throw new Error("unavailable");
  };
  const packet = gatherIdeContext(host, {
    product: "markdownWorkshop",
    uri: "file:///text",
    markdown: { editorKind: "text" },
  });
  assert.deepEqual(packet.tabs, { visible: [], open: [], truncated: false });
  assert.ok(packet.warnings.includes("tab enumeration unavailable"));
});

test("diagnostic mapping handles hint, information, unknown severity and scalar codes", () => {
  for (const [severity, expected] of [
    [2, "information"],
    [3, "hint"],
    [99, "information"],
  ] as const) {
    const mapped = mapVsCodeDiagnostic({
      severity,
      message: "",
      code: 42,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    });
    assert.equal(mapped.severity, expected);
    assert.equal(mapped.code, 42);
    assert.equal(mapped.message, "");
  }
});
