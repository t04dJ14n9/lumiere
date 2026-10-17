import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CAPS } from "../../src/ide-context/caps";
import { renderMarkdown, serializeJson } from "../../src/ide-context/render";

function baseMw() {
  return {
    version: 1 as const,
    collectedAt: "2026-10-16T00:00:00.000Z",
    product: "markdownWorkshop" as const,
    markdown: { editorKind: "livePreview" as const },
    active: { uri: "file:///n.md", languageId: "markdown" },
    tabs: { visible: ["file:///n.md"], open: [], truncated: false },
    diagnostics: { uri: "file:///n.md", items: [], truncated: false },
    warnings: [] as string[],
    caps: DEFAULT_CAPS,
  };
}

test("renderMarkdown stays within maxClipboardChars", () => {
  const md = renderMarkdown({
    ...baseMw(),
    active: {
      uri: "file:///n.md",
      selection: {
        from: 0,
        to: 100000,
        startLine: 1,
        endLine: 500,
        text: "z".repeat(100_000),
        truncated: false,
      },
    },
  });
  assert.ok(md.length <= DEFAULT_CAPS.maxClipboardChars);
  assert.match(md, /# IDE context \(markdownWorkshop\) v1/);
});

test("serializeJson stays within maxJsonChars and remains parseable", () => {
  const raw = serializeJson({
    ...baseMw(),
    product: "pdfWorkshop",
    markdown: undefined as never,
    pdf: {
      uri: "file:///a.pdf",
      selection: {
        kind: "region",
        rects: [{ page: 1, x: 0, y: 0, w: 10, h: 10 }],
        rectsTruncated: false,
      },
    },
    active: { uri: "file:///a.pdf" },
    diagnostics: { uri: "file:///a.pdf", items: [], truncated: false },
  });
  assert.ok(raw.length <= DEFAULT_CAPS.maxJsonChars);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.pdf.selection.kind, "region");
  assert.equal(parsed.markdown, undefined);
});

const SECRET_SNIPPETS = [
  "secret-token",
  "Bearer abcdef",
  "sk-SECRETVALUE",
  "ghp_SECRETVALUE",
  "access_token=leak",
];

function assertNoSecrets(
  label: string,
  md: string,
  raw: string,
  extras: string[] = [],
) {
  for (const s of [...SECRET_SNIPPETS, ...extras]) {
    assert.equal(md.includes(s), false, `${label} markdown leaked: ${s}`);
    assert.equal(raw.includes(s), false, `${label} json leaked: ${s}`);
  }
}

test("MW dirty packet: renderMarkdown + serializeJson omit Task-2 secrets via shared scrubPacket", () => {
  const dirtyMw = {
    ...baseMw(),
    active: {
      uri: "file:///n.md?token=secret-token&page=1",
      languageId: "markdown",
    },
    tabs: {
      visible: [
        "file:///n.md?token=secret-token&page=1",
        "file:///other.md?access_token=leak",
      ],
      open: [],
      truncated: false,
    },
    diagnostics: {
      uri: "file:///n.md?token=secret-token&page=1",
      items: [
        {
          severity: "error" as const,
          message: "failed auth Bearer abcdef sk-SECRETVALUE ghp_SECRETVALUE",
          startLine: 1,
          startCharacter: 0,
        },
      ],
      truncated: false,
    },
  };
  assertNoSecrets("MW", renderMarkdown(dirtyMw), serializeJson(dirtyMw));
});

test("PDF dirty packet: renderMarkdown + serializeJson omit secrets incl. pdf.uri via shared scrubPacket", () => {
  const dirtyPdf = {
    version: 1 as const,
    collectedAt: "2026-10-16T00:00:00.000Z",
    product: "pdfWorkshop" as const,
    pdf: {
      uri: "file:///a.pdf?token=secret-token&page=1",
      selection: {
        kind: "region" as const,
        rects: [{ page: 1, x: 0, y: 0, w: 10, h: 10 }],
        rectsTruncated: false,
      },
    },
    active: { uri: "file:///a.pdf?token=secret-token&page=1" },
    tabs: {
      visible: [
        "file:///a.pdf?token=secret-token&page=1",
        "file:///b.pdf?access_token=leak",
      ],
      open: [],
      truncated: false,
    },
    diagnostics: {
      uri: "file:///a.pdf?token=secret-token&page=1",
      items: [
        {
          severity: "error" as const,
          message: "failed auth Bearer abcdef sk-SECRETVALUE ghp_SECRETVALUE",
          startLine: 1,
          startCharacter: 0,
        },
      ],
      truncated: false,
    },
    warnings: [] as string[],
    caps: DEFAULT_CAPS,
  };
  const md = renderMarkdown(dirtyPdf);
  const raw = serializeJson(dirtyPdf);
  assertNoSecrets("PDF", md, raw, ["token=secret-token"]);
  assert.equal(JSON.parse(raw).pdf.uri.includes("secret-token"), false);
});

function makeLongUri(i: number, targetLen: number): string {
  const prefix = `file:///workspace/project/module-${i}/`;
  const pad = "a".repeat(Math.max(0, targetLen - prefix.length - 4));
  return prefix + pad + ".md";
}

test("clipboard: JSON under 64K but Markdown over 32K uses structured truncation (no mid-URI hard slice)", () => {
  // ChatGPT review A trigger: 20 visible + 20 open ~900-char URIs + 20×250-char diagnostics
  const visible = Array.from({ length: 20 }, (_, i) => makeLongUri(i, 900));
  const open = Array.from({ length: 20 }, (_, i) => makeLongUri(100 + i, 900));
  const packet = {
    ...baseMw(),
    active: { uri: visible[0]!, languageId: "markdown" },
    tabs: { visible, open, truncated: false },
    diagnostics: {
      uri: visible[0]!,
      items: Array.from({ length: 20 }, (_, i) => ({
        severity: "warning" as const,
        message: "diag-message-" + "x".repeat(236),
        startLine: i + 1,
        startCharacter: 0,
      })),
      truncated: false,
    },
  };

  const json = serializeJson(packet);
  assert.ok(
    json.length <= DEFAULT_CAPS.maxJsonChars,
    `JSON ${json.length} should be under 64K`,
  );
  assert.ok(
    json.length > 32_000,
    `precondition: JSON ${json.length} should still be large`,
  );

  const md = renderMarkdown(packet);
  assert.ok(
    md.length <= DEFAULT_CAPS.maxClipboardChars,
    `markdown ${md.length} exceeds maxClipboardChars`,
  );
  assert.ok(/budget|truncat/i.test(md), "expected explicit budget warning");

  // Hard-slice fallback appends Warnings: last — checking only the last line misses a
  // mid-URI/mid-token cut on the content line immediately before Warnings:.
  const mdLines = md.split("\n");
  const warningsIdx = mdLines.findIndex((l) => l === "Warnings:");
  assert.ok(
    warningsIdx > 0,
    "expected Warnings: section from budget truncation",
  );
  const lineBeforeWarnings = mdLines[warningsIdx - 1] ?? "";
  const contentBeforeWarnings =
    lineBeforeWarnings === ""
      ? (mdLines[warningsIdx - 2] ?? "")
      : lineBeforeWarnings;
  const hardCutBeforeWarnings =
    (contentBeforeWarnings.startsWith("- file://") &&
      !contentBeforeWarnings.endsWith(".md")) ||
    // mid-diagnostic / mid-token residue (e.g. hard-sliced "xxxx..." body)
    /^x{20,}$/.test(contentBeforeWarnings.trim()) ||
    (contentBeforeWarnings.includes("file://") &&
      !contentBeforeWarnings.endsWith(".md") &&
      !/budget|truncat|…truncated/i.test(contentBeforeWarnings));
  assert.equal(
    hardCutBeforeWarnings,
    false,
    `must not hard-cut content immediately before Warnings: ${JSON.stringify(contentBeforeWarnings.slice(-100))}`,
  );

  // Prefer dropping lower-priority sections (diagnostics) over hard-slicing tab URIs
  const diagItemLines = md
    .split("\n")
    .filter((l) => /^- (error|warning|information|hint) /.test(l));
  assert.ok(
    diagItemLines.length < 20 ||
      !md.includes("file:///workspace/project/module-100/"),
    "structured truncate should drop diagnostics and/or lower-priority open tabs rather than hard-slice",
  );
});

test("clipboard: budget warning crossing cap continues structured truncate (no hard-slice before Warnings:)", () => {
  // r2 Finding 1: underBudget measured renderBody *before* pushBudgetWarning(); a packet that
  // lands just under the cap without the warning can go over after it is appended, and
  // renderMarkdown then falls through to md.slice (mid-token cut before Warnings:).
  const visible = Array.from({ length: 5 }, (_, i) => makeLongUri(i, 900));
  const open = Array.from({ length: 20 }, (_, i) => makeLongUri(100 + i, 900));
  const maxClipboardChars = 24_000;
  const caps = { ...DEFAULT_CAPS, maxClipboardChars };
  const packet = {
    ...baseMw(),
    caps,
    active: { uri: visible[0]!, languageId: "markdown" },
    tabs: { visible, open, truncated: false },
    diagnostics: {
      uri: visible[0]!,
      items: Array.from({ length: 10 }, (_, i) => ({
        severity: "warning" as const,
        message: "diag-message-" + "x".repeat(236),
        startLine: i + 1,
        startCharacter: 0,
      })),
      truncated: false,
    },
  };

  const md = renderMarkdown(packet);
  assert.ok(
    md.length <= maxClipboardChars,
    `markdown ${md.length} exceeds maxClipboardChars ${maxClipboardChars}`,
  );
  // Exact equality to the cap is the hard-slice fingerprint (bodyBudget + notice === max).
  assert.ok(
    md.length < maxClipboardChars,
    `hard-slice fingerprint: md.length === max (${md.length})`,
  );
  assert.ok(/budget|truncat/i.test(md), "expected explicit budget warning");

  const mdLines = md.split("\n");
  const warningsIdx = mdLines.findIndex((l) => l === "Warnings:");
  assert.ok(warningsIdx > 0, "expected Warnings: section");
  const lineBeforeWarnings = mdLines[warningsIdx - 1] ?? "";
  const contentBeforeWarnings =
    lineBeforeWarnings === ""
      ? (mdLines[warningsIdx - 2] ?? "")
      : lineBeforeWarnings;
  assert.equal(
    contentBeforeWarnings.startsWith("- file://") &&
      !contentBeforeWarnings.endsWith(".md"),
    false,
    `mid-URI hard-cut before Warnings: ${JSON.stringify(contentBeforeWarnings.slice(-80))}`,
  );
  assert.equal(
    /^x{20,}$/.test(contentBeforeWarnings.trim()),
    false,
    `mid-token hard-cut before Warnings: ${JSON.stringify(contentBeforeWarnings.slice(-80))}`,
  );

  // Structured drop must have removed lower-priority fields (open tabs and/or diagnostics).
  const openTabLines = mdLines.filter((l) =>
    /^- file:\/\/workspace\/project\/module-1\d+\//.test(l),
  );
  const diagItemLines = mdLines.filter((l) =>
    /^- (error|warning|information|hint) /.test(l),
  );
  assert.ok(
    openTabLines.length < 20 || diagItemLines.length < 10,
    "structured truncate should drop open tabs and/or diagnostics rather than hard-slice",
  );
});
