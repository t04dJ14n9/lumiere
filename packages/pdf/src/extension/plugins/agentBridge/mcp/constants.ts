import * as os from "node:os";
import * as path from "node:path";

export const SERVER_NAME = "agent-pdf-viewer";
export const PROVIDER_ID = "pdfWorkshop.agentBridge";
/** Where running bridges announce themselves for the stdio shim. */
export const DISCOVERY_DIR = path.join(
  os.homedir(),
  ".agent-pdf-viewer",
  "bridges",
);

export interface BridgeInfo {
  url: string;
  token: string;
  pid: number;
  appName: string;
  workspaceFolders: string[];
  startedAt: string;
}
