import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { paths } from "../state";
import {
  command,
  contextMenu,
  expect,
  fitPage,
  openFile,
  pagePoint,
  pdfViewer,
  selectText,
  test,
} from "../workbench";

interface TrustReport {
  trusted: boolean;
  extensionActive: boolean;
  bridgeEnabled: boolean;
  target: string;
  clipboard: string;
  agentCalls: unknown[];
}

test("Restricted Mode renders PDFs and ignores workspace agent settings", async ({
  workbench: page,
}) => {
  await openFile(page, "docs/outline.pdf");
  const viewer = await pdfViewer(page);
  await fitPage(page, viewer);
  await expect(viewer.locator('.page[data-page-index="0"] img')).toBeVisible();
  const at = await pagePoint(viewer, 1);
  await selectText(page, viewer, at(74, 94), at(205, 94));
  await contextMenu(page, at(100, 94), "Copy Link for Agent");

  const reportFile = path.join(paths.workspace, "trust-state.json");
  await expect
    .poll(async () => {
      await command(page, "PDF Test: Report Workspace Trust");
      if (!existsSync(reportFile)) {
        return "";
      }
      return (JSON.parse(readFileSync(reportFile, "utf8")) as TrustReport)
        .clipboard;
    })
    .toContain("docs/outline.pdf#page=1&viewrect=");
  const report = JSON.parse(readFileSync(reportFile, "utf8")) as TrustReport;
  expect(report.trusted).toBe(false);
  expect(report.extensionActive).toBe(true);
  expect(report.bridgeEnabled).toBe(false);
  expect(report.target).toBe("clipboard");
  expect(report.agentCalls).toEqual([]);
  const workspace = JSON.parse(
    readFileSync(
      path.join(paths.workspace, ".vscode", "settings.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
  expect(workspace["pdfWorkshop.agentBridge.enabled"]).toBe(true);
  expect(workspace["pdfWorkshop.copyLinkForAgent.target"]).toBe("claudeCode");
  const discovery = path.join(paths.home, ".agent-pdf-viewer", "bridges");
  expect(
    existsSync(discovery)
      ? readdirSync(discovery).filter((file) => file.endsWith(".json"))
      : [],
  ).toEqual([]);
});
