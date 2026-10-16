import type { IdeContextCaps } from "./types";

export const DEFAULT_CAPS: Readonly<IdeContextCaps> = Object.freeze({
  maxSelectedChars: 8_000,
  maxDiagnosticItems: 50,
  maxDiagnosticMessageChars: 300,
  maxTabUris: 20,
  maxClipboardChars: 32_000,
  maxJsonChars: 64_000,
  maxUriChars: 2_048,
  maxWorkspaceNameChars: 200,
  maxDiagnosticSourceChars: 120,
  maxDiagnosticCodeChars: 64,
  maxCiteMarkdownChars: 1_000,
  maxTempPathChars: 512,
  maxWarningChars: 240,
  maxWarnings: 20,
  maxPdfSelectedChars: 8_000,
  maxPdfSelectionRects: 32,
});
